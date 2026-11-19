import { sniffType } from '@/lib/files';
import { scanZip, ZipError, type ZipLimits } from './zip';

export type DocxCheck = { ok: true; entries: string[] } | { ok: false; message: string; detected?: string };

export const DOCX_SOFT_LIMIT = 50 * 1024 * 1024;
export const DOCX_HARD_LIMIT = 150 * 1024 * 1024;

/** Validates by magic bytes and package layout, never by extension. */
export function checkDocxBytes(bytes: Uint8Array, name = '', limits?: ZipLimits): DocxCheck {
  if (bytes.length === 0) return { ok: false, message: 'This file is empty.' };
  if (bytes.length > DOCX_HARD_LIMIT) return { ok: false, message: 'This file is too large to open in the browser (limit 150 MB).' };
  const type = sniffType(bytes);
  if (type === 'ole') {
    const legacy = /\.doc$/i.test(name);
    return {
      ok: false,
      detected: 'ole',
      message: legacy
        ? 'Legacy .doc files are not supported. Open it in Word or LibreOffice and choose Save As .docx.'
        : 'This file is password protected or in the old Word format. Remove the password in Word, or save it as .docx, then try again.',
    };
  }
  if (type === 'pdf') return { ok: false, detected: 'pdf', message: 'This is a PDF, not a Word document. Use the PDF to DOCX converter instead.' };
  if (type !== 'zip' && type !== 'docx') {
    return { ok: false, detected: type, message: type === 'unknown' ? 'This is not a .docx file.' : `This looks like a ${type.toUpperCase()} file, not a .docx document.` };
  }
  try {
    const { entries } = scanZip(bytes, limits);
    if (!entries.includes('[Content_Types].xml') || !entries.some((e) => e.startsWith('word/'))) {
      return { ok: false, detected: 'zip', message: 'This ZIP file is not a Word document (no word/ content found).' };
    }
    if (entries.includes('word/vbaProject.bin')) {
      return { ok: true, entries };
    }
    return { ok: true, entries };
  } catch (e) {
    if (e instanceof ZipError) return { ok: false, detected: 'zip', message: e.message };
    return { ok: false, message: 'The file could not be read.' };
  }
}
