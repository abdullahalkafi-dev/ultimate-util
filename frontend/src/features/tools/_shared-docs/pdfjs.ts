export type PdfJs = typeof import('pdfjs-dist');

let cached: Promise<PdfJs> | null = null;

/** Loads pdf.js lazily with the worker served from our own origin. */
export function loadPdfJs(): Promise<PdfJs> {
  cached ??= import('pdfjs-dist').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    return pdfjs;
  });
  return cached;
}
