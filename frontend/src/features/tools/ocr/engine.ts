import type { Block } from 'tesseract.js';
import { loadPdfJs } from '../_shared-docs/pdfjs';
import { preprocessBuffer, type PreprocessOptions, type WordBox } from './preprocess';

export interface OcrLanguage {
  code: string;
  label: string;
  sizeMb: string;
  bundled: boolean;
}

export const OCR_LANGUAGES: OcrLanguage[] = [
  { code: 'eng', label: 'English (LSTM)', sizeMb: '2.8 MB', bundled: true },
];

export interface OcrPageResult {
  pageNumber: number;
  width: number;
  height: number;
  text: string;
  confidence: number;
  words: WordBox[];
  previewUrl: string;
  imageBytes: Uint8Array;
}

export function extractWordsFromBlocks(blocks: Block[] | null | undefined): WordBox[] {
  if (!blocks) return [];
  const words: WordBox[] = [];
  for (const block of blocks) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const w of line.words ?? []) {
          if (!w.text.trim()) continue;
          words.push({
            text: w.text,
            confidence: w.confidence,
            x0: w.bbox.x0,
            y0: w.bbox.y0,
            x1: w.bbox.x1,
            y1: w.bbox.y1,
          });
        }
      }
    }
  }
  return words;
}

/** Checks if a PDF already contains selectable embedded text so OCR can be skipped. */
export async function inspectPdfText(bytes: Uint8Array, password?: string): Promise<{ numPages: number; hasText: boolean; sampleText: string }> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: bytes.slice(), password });
  const doc = await task.promise;
  try {
    const checkPages = Math.min(doc.numPages, 3);
    const chunks: string[] = [];
    for (let p = 1; p <= checkPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const s = tc.items.map((i) => ('str' in i ? i.str : '')).join(' ').trim();
      if (s) chunks.push(s);
      page.cleanup();
    }
    const combined = chunks.join('\n\n').trim();
    return { numPages: doc.numPages, hasText: combined.length > 20, sampleText: combined };
  } finally {
    void task.destroy();
  }
}

export async function extractAllPdfText(bytes: Uint8Array, fromPage: number, toPage: number, password?: string): Promise<string> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: bytes.slice(), password });
  const doc = await task.promise;
  try {
    const start = Math.max(1, fromPage);
    const end = Math.min(doc.numPages, toPage);
    const pages: string[] = [];
    for (let p = start; p <= end; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const s = tc.items.map((i) => ('str' in i ? i.str : '')).join(' ').replace(/\s+/g, ' ').trim();
      pages.push(s);
      page.cleanup();
    }
    return pages.join('\n\n');
  } finally {
    void task.destroy();
  }
}

export async function rasterizePdfPage(bytes: Uint8Array, pageNumber: number, scale = 2.2, password?: string): Promise<HTMLCanvasElement> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: bytes.slice(), password });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    await page.render({ canvas, viewport }).promise;
    page.cleanup();
    return canvas;
  } finally {
    void task.destroy();
  }
}

export async function prepareCanvasFromBlob(
  blob: Blob,
  opts: PreprocessOptions,
  maxSide = 4000,
): Promise<{ canvas: HTMLCanvasElement; pngBytes: Uint8Array }> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sCtx = src.getContext('2d', { willReadFrequently: true });
  if (!sCtx) throw new Error('Canvas unavailable');
  sCtx.drawImage(bmp, 0, 0, w, h);
  bmp.close();

  const imgData = sCtx.getImageData(0, 0, w, h);
  const processed = preprocessBuffer({ width: w, height: h, data: imgData.data }, opts);
  const out = document.createElement('canvas');
  out.width = processed.width;
  out.height = processed.height;
  const oCtx = out.getContext('2d');
  if (!oCtx) throw new Error('Canvas unavailable');
  oCtx.putImageData(new ImageData(new Uint8ClampedArray(processed.data), processed.width, processed.height), 0, 0);
  src.width = src.height = 0;

  const pngBlob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/png'));
  const pngBytes = pngBlob ? new Uint8Array(await pngBlob.arrayBuffer()) : new Uint8Array(0);
  return { canvas: out, pngBytes };
}

export async function prepareCanvasFromElement(
  source: HTMLCanvasElement,
  opts: PreprocessOptions,
): Promise<{ canvas: HTMLCanvasElement; pngBytes: Uint8Array }> {
  const sCtx = source.getContext('2d', { willReadFrequently: true });
  if (!sCtx) throw new Error('Canvas unavailable');
  const imgData = sCtx.getImageData(0, 0, source.width, source.height);
  const processed = preprocessBuffer({ width: source.width, height: source.height, data: imgData.data }, opts);
  const out = document.createElement('canvas');
  out.width = processed.width;
  out.height = processed.height;
  out.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(processed.data), processed.width, processed.height), 0, 0);
  const pngBlob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/png'));
  const pngBytes = pngBlob ? new Uint8Array(await pngBlob.arrayBuffer()) : new Uint8Array(0);
  return { canvas: out, pngBytes };
}

export async function createLocalOcrWorker(lang: string, onProgress?: (p: number, status: string) => void) {
  const { createWorker, OEM } = await import('tesseract.js');
  return createWorker(lang, OEM.LSTM_ONLY, {
    workerPath: '/vendor/tesseract/worker.min.js',
    corePath: '/vendor/tesseract/core',
    langPath: '/vendor/tesseract/lang',
    gzip: true,
    workerBlobURL: false,
    logger: (m) => {
      if (onProgress && typeof m.progress === 'number') onProgress(m.progress * 100, m.status);
    },
  });
}
