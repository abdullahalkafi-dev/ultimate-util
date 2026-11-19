import { findUnsupportedScripts } from './scripts';

export interface PdfExportOptions {
  pageSize: 'A4' | 'LETTER';
  /** Margin in millimetres. */
  marginMm: number;
  pageNumbers: boolean;
  title?: string;
}

export interface PdfExportResult {
  blob: Blob;
  unsupportedScripts: string[];
}

const MM_TO_PT = 72 / 25.4;

const BREAK_MARK = '@@PAGEBREAK@@';

/** Turns page-break markers into real breaks and keeps images inside the text area. */
export function prepareNodes(node: unknown, maxWidth: number): void {
  if (Array.isArray(node)) {
    node.forEach((n) => prepareNodes(n, maxWidth));
    return;
  }
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  if (n.text === BREAK_MARK) {
    n.text = '';
    n.pageBreak = 'after';
  }
  if (typeof n.image === 'string') n.fit = [maxWidth, 650];
  for (const key of ['text', 'stack', 'ul', 'ol', 'table', 'body', 'columns']) prepareNodes(n[key], maxWidth);
}

/** Removes script/style and remote images: nothing may be fetched during export. */
export function stripUnsafe(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/<img\b[^>]*\bsrc=(["'])(?!data:)[^"']*\1[^>]*>/gi, '<em>[external image not loaded]</em>');
}

/** Builds a PDF with selectable text from HTML. Must run on the main thread (needs a DOM). */
export async function exportHtmlToPdf(html: string, options: PdfExportOptions, onProgress?: (fraction: number) => void): Promise<PdfExportResult> {
  const [pdfMakeMod, vfsMod, h2pMod] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts'), import('html-to-pdfmake')]);
  const pdfMake = ((pdfMakeMod as unknown as { default?: typeof pdfMakeMod }).default ?? pdfMakeMod) as typeof pdfMakeMod;
  const vfs = (vfsMod as { default?: unknown }).default ?? vfsMod;
  pdfMake.addVirtualFileSystem(vfs as never);
  const htmlToPdfmake = (h2pMod as { default?: unknown }).default as (h: string, o?: Record<string, unknown>) => unknown;

  const safe = stripUnsafe(html);
  const text = new DOMParser().parseFromString(safe, 'text/html').body.textContent ?? '';
  const content = htmlToPdfmake(safe.replace(/<div data-page-break[^>]*><\/div>/gi, `<p>${BREAK_MARK}</p>`), {
    window,
    defaultStyles: { a: { color: '#1a56a8', decoration: 'underline' } },
  });
  const margin = Math.round(options.marginMm * MM_TO_PT);
  prepareNodes(content, (options.pageSize === 'A4' ? 595 : 612) - margin * 2);
  pdfMake.setProgressCallback((p: number) => onProgress?.(p));
  const doc = pdfMake.createPdf({
    pageSize: options.pageSize,
    pageMargins: [margin, margin, margin, margin + (options.pageNumbers ? 12 : 0)],
    info: options.title ? { title: options.title } : undefined,
    content: content as never,
    defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.25 },
    footer: options.pageNumbers
      ? (page: number, count: number) => ({ text: `${page} / ${count}`, alignment: 'center', fontSize: 9, color: '#666666', margin: [0, 12, 0, 0] })
      : undefined,
  });
  const blob = await doc.getBlob();
  return { blob, unsupportedScripts: findUnsupportedScripts(text) };
}
