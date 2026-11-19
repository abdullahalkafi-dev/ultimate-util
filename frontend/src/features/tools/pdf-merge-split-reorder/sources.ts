import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import { readFirstBytes, sniffType } from '@/lib/files';
import { openPdf } from '../_pdf-shared/pdfjs';
import { QpdfError, startQpdf } from '../_pdf-shared/qpdf';
import { decryptArgs } from '../_pdf-shared/qpdf-run';
import { looksSigned } from './build';
import { imageToPdf } from './images';

export interface SourceFile {
  id: string;
  name: string;
  /** Display name, with "(2)" when the same file was added twice. */
  label: string;
  size: number;
  bytes: Uint8Array;
  doc: PDFDocumentProxy;
  pageCount: number;
  /** Displayed page size in points (rotation applied). */
  sizes: { width: number; height: number }[];
  notes: string[];
  signed: boolean;
  isImage: boolean;
}

export type LoadOutcome = { ok: true; file: SourceFile } | { ok: false; name: string; reason: string };

/** Resolves with a password, or null when the user skips the file. */
export type AskPassword = (fileName: string, wasWrong: boolean) => Promise<string | null>;

const IMAGE_TYPES = new Set(['jpeg', 'png', 'webp', 'bmp', 'gif']);

const typeName: Record<string, string> = { zip: 'ZIP/Office', docx: 'Word', svg: 'SVG', mp4: 'video', webm: 'video', ole: 'legacy Office', avif: 'AVIF image' };

function isEncryptedError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'EncryptedPDFError' || /encrypted/i.test(err.message));
}

/** Decrypts with qpdf. Empty password first (owner-restricted files open without one), then asks the user. */
async function decrypt(bytes: Uint8Array, name: string, ask: AskPassword): Promise<{ bytes: Uint8Array; ownerOnly: boolean } | { skipped: true }> {
  try {
    return { bytes: await startQpdf(bytes, decryptArgs('')).promise, ownerOnly: true };
  } catch (err) {
    if (!(err instanceof QpdfError) || (err.reason !== 'wrong-password' && err.reason !== 'password-required')) throw err;
  }
  let wrong = false;
  for (;;) {
    const password = await ask(name, wrong);
    if (password === null) return { skipped: true };
    try {
      return { bytes: await startQpdf(bytes, decryptArgs(password)).promise, ownerOnly: false };
    } catch (err) {
      if (err instanceof QpdfError && err.reason === 'wrong-password') {
        wrong = true;
        continue;
      }
      throw err;
    }
  }
}

export async function loadSource(file: File, id: string, label: string, ask: AskPassword): Promise<LoadOutcome> {
  const fail = (reason: string): LoadOutcome => ({ ok: false, name: file.name, reason });
  if (file.size === 0) return fail('The file is empty (0 bytes).');
  const head = await readFirstBytes(file);
  const kind = sniffType(head);
  const notes: string[] = [];
  let bytes: Uint8Array;
  let isImage = false;

  try {
    if (kind === 'pdf') {
      bytes = new Uint8Array(await file.arrayBuffer());
    } else if (IMAGE_TYPES.has(kind)) {
      const converted = await imageToPdf(file, kind);
      bytes = converted.bytes;
      isImage = true;
      if (converted.downscaled) notes.push('Image was larger than 8000 px and was scaled down.');
    } else if (kind === 'heic') {
      return fail('HEIC images are not read directly. Convert it to JPG first with the HEIC converter.');
    } else {
      return fail(kind === 'unknown' ? 'This is not a PDF or a supported image (the file content does not start with %PDF-).' : `This is a ${typeName[kind] ?? kind} file, not a PDF.`);
    }

    let doc: PDFDocument;
    try {
      doc = await PDFDocument.load(bytes, { updateMetadata: false });
    } catch (err) {
      if (!isEncryptedError(err)) return fail('The PDF is damaged or uses a feature that cannot be read.');
      const result = await decrypt(bytes, file.name, ask);
      if ('skipped' in result) return fail('Skipped: no password was entered.');
      bytes = result.bytes;
      notes.push(
        result.ownerOnly
          ? 'This file had editing restrictions. They are not carried over: the merged output is unrestricted.'
          : 'This file was password protected. The output is not protected; protect it again with PDF Compress & Protect.',
      );
      doc = await PDFDocument.load(bytes, { updateMetadata: false });
    }

    const pages = doc.getPages();
    if (!pages.length) return fail('The PDF has no pages.');
    const sizes = pages.map((p) => {
      const { width, height } = p.getSize();
      return p.getRotation().angle % 180 === 90 ? { width: height, height: width } : { width, height };
    });
    const signed = looksSigned(bytes);
    if (signed) notes.push('This PDF is digitally signed. Merging or splitting invalidates the signature.');
    const pdfjsDoc = await openPdf(bytes);
    return { ok: true, file: { id, name: file.name, label, size: file.size, bytes, doc: pdfjsDoc, pageCount: pages.length, sizes, notes, signed, isImage } };
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'The file could not be opened.');
  }
}
