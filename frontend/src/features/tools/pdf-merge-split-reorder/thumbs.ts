import type { PDFDocumentProxy } from 'pdfjs-dist';
import { renderPageToCanvas } from '../_pdf-shared/pdfjs';

const THUMB_WIDTH = 220;
const MAX_PARALLEL = 2;

const cache = new Map<string, Promise<string>>();
let running = 0;
const waiting: (() => void)[] = [];

async function slot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await task();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

/** Renders a small thumbnail once per (file, page) and returns an object URL. At most two render at a time. */
export function thumbnail(fileId: string, doc: PDFDocumentProxy, index: number, pageWidth: number): Promise<string> {
  const key = `${fileId}:${index}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = slot(async () => {
      const canvas = await renderPageToCanvas(doc, index + 1, Math.min(2, THUMB_WIDTH / Math.max(1, pageWidth)));
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      canvas.width = canvas.height = 0;
      if (!blob) throw new Error('Thumbnail failed');
      return URL.createObjectURL(blob);
    });
    cache.set(key, hit);
    hit.catch(() => cache.delete(key));
  }
  return hit;
}

/** Frees the thumbnails of one file (when it is removed). */
export function dropThumbnails(fileId: string) {
  for (const [key, value] of cache) {
    if (key.startsWith(`${fileId}:`)) {
      cache.delete(key);
      void value.then((url) => URL.revokeObjectURL(url)).catch(() => {});
    }
  }
}

/** 1-based start pages of the top-level bookmarks of a document, in ascending order. */
export async function outlineStarts(doc: PDFDocumentProxy): Promise<number[]> {
  const outline = await doc.getOutline();
  if (!outline) return [];
  const starts: number[] = [];
  for (const item of outline) {
    try {
      const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest;
      const ref = dest?.[0];
      if (ref === undefined || ref === null) continue;
      starts.push(typeof ref === 'number' ? ref + 1 : (await doc.getPageIndex(ref)) + 1);
    } catch {
      // A bookmark with a broken destination is skipped.
    }
  }
  return [...new Set(starts)].sort((a, b) => a - b);
}
