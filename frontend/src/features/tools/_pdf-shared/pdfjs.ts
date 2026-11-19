import type { PDFDocumentProxy } from 'pdfjs-dist';

export class PdfPasswordError extends Error {
  constructor(readonly wrong: boolean) {
    super(wrong ? 'Incorrect password.' : 'This PDF needs a password.');
  }
}

let ready: Promise<typeof import('pdfjs-dist')> | null = null;

/** Loads pdf.js on first use; its worker is served from our own origin. */
export function loadPdfjs() {
  ready ??= import('pdfjs-dist').then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    return lib;
  });
  return ready;
}

/** Opens a PDF. pdf.js transfers the buffer, so a copy is passed. Throws PdfPasswordError when locked. */
export async function openPdf(bytes: Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  const lib = await loadPdfjs();
  try {
    return await lib.getDocument({ data: bytes.slice(), password }).promise;
  } catch (err) {
    const e = err as { name?: string; code?: number };
    if (e?.name === 'PasswordException') throw new PdfPasswordError(e.code === lib.PasswordResponses.INCORRECT_PASSWORD);
    throw err;
  }
}

/** Renders one page (1-based) into a new canvas at the given scale. */
export async function renderPageToCanvas(doc: PDFDocumentProxy, pageNumber: number, scale: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
  return canvas;
}
