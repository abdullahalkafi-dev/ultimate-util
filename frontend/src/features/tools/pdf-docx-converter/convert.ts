import { exportHtmlToPdf } from '../_shared-docs/htmlToPdf';
import { loadPdfJs } from '../_shared-docs/pdfjs';
import { docxToHtml } from '../_shared-docs/docxToHtml';
import { checkDocxBytes } from '../_shared-docs/docxFile';
import { analyzePage, documentBodySize, type PageInput, type PageResult, type TextRun } from './layout';
import { parsePageRange } from './range';
import { buildDocxBlob, buildReport, type FidelityReport } from './toDocx';

export class PasswordNeeded extends Error {
  constructor(readonly wrong: boolean) {
    super(wrong ? 'The password is incorrect.' : 'This PDF is password protected.');
  }
}
export class Cancelled extends Error {
  constructor() {
    super('Cancelled');
  }
}

export interface Control {
  cancelled: boolean;
}

export interface PdfOptions {
  pageRange: string;
  detectStructure: boolean;
  password?: string;
}

export interface DocxOptions {
  pageSize: 'A4' | 'LETTER';
  marginMm: number;
}

export interface PdfToDocxResult {
  blob: Blob | null;
  report: FidelityReport;
  /** Every page was scanned: no file was produced. */
  allScanned: boolean;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Converts on the main thread, one page at a time, yielding between pages so Cancel stays responsive. */
export async function pdfToDocx(
  bytes: Uint8Array,
  options: PdfOptions,
  control: Control,
  onProgress: (fraction: number, label: string) => void,
): Promise<PdfToDocxResult> {
  const pdfjs = await loadPdfJs();
  // pdf.js transfers the buffer to its worker, so hand it a copy and keep the source intact.
  const task = pdfjs.getDocument({ data: bytes.slice(), password: options.password });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err.name === 'PasswordException') throw new PasswordNeeded(err.code === 2);
    throw new Error('This PDF is damaged and could not be read.');
  }
  try {
    const range = parsePageRange(options.pageRange, doc.numPages);
    if (range.error) throw new Error(range.error);
    const inputs: { pageNumber: number; page: PageInput }[] = [];
    for (let i = 0; i < range.pages.length; i++) {
      if (control.cancelled) throw new Cancelled();
      const n = range.pages[i] as number;
      onProgress((i / range.pages.length) * 0.7, `Reading page ${n} of ${doc.numPages}`);
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const runs: TextRun[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = item.transform as number[];
        const size = item.height > 0 ? item.height : Math.hypot(c, d) || Math.hypot(a, b);
        runs.push({ str: item.str, x: e, y: f, width: item.width, size });
      }
      inputs.push({ pageNumber: n, page: { width: viewport.width, height: viewport.height, runs } });
      page.cleanup();
      await tick();
    }
    const bodySize = documentBodySize(inputs.map((p) => p.page));
    const results: { pageNumber: number; result: PageResult }[] = [];
    inputs.forEach(({ pageNumber, page }, i) => {
      results.push({ pageNumber, result: analyzePage(page, { detectStructure: options.detectStructure, bodySize }) });
      if (i % 10 === 0) onProgress(0.7 + (i / inputs.length) * 0.2, 'Analyzing layout');
    });
    if (control.cancelled) throw new Cancelled();
    const report = buildReport(results, doc.numPages);
    if (results.every((r) => r.result.scanned)) return { allScanned: true, report, blob: null };
    onProgress(0.95, 'Building the DOCX file');
    const blob = await buildDocxBlob(results);
    return { blob, report, allScanned: false };
  } finally {
    void task.destroy();
  }
}

export interface DocxToPdfResult {
  blob: Blob;
  pages: number;
  unsupportedScripts: string[];
  notes: string[];
}

export async function docxToPdf(bytes: Uint8Array, options: DocxOptions, control: Control, onProgress: (fraction: number, label: string) => void): Promise<DocxToPdfResult> {
  const check = checkDocxBytes(bytes);
  if (!check.ok) throw new Error(check.message);
  onProgress(0.1, 'Reading the document');
  const { html, warnings } = await docxToHtml(bytes);
  if (control.cancelled) throw new Cancelled();
  onProgress(0.4, 'Laying out pages');
  const { blob, unsupportedScripts } = await exportHtmlToPdf(html, { ...options, pageNumbers: true }, (p) => onProgress(0.4 + p * 0.55, 'Writing the PDF'));
  if (control.cancelled) throw new Cancelled();
  let pages = 0;
  try {
    const pdfjs = await loadPdfJs();
    const out = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    pages = out.numPages;
  } catch {
    pages = 0;
  }
  const notes = ['Macros and external links are ignored; hyperlinks keep their text only where the converter could read them.', ...Array.from(new Set(warnings)).slice(0, 5)];
  return { blob, pages, unsupportedScripts, notes };
}
