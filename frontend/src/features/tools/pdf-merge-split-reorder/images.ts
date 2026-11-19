import { PDFDocument } from 'pdf-lib';

const MAX_SIDE = 8000;
/** Images are placed 1 pixel = 1 point, but shrunk to fit A4 so they print sensibly. */
const A4 = { w: 595, h: 842 };

function fitToA4(w: number, h: number) {
  const [boxW, boxH] = w > h ? [A4.h, A4.w] : [A4.w, A4.h];
  const scale = Math.min(1, boxW / w, boxH / h);
  return { width: Math.max(1, w * scale), height: Math.max(1, h * scale) };
}

async function canvasToBytes(canvas: HTMLCanvasElement, type: string): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) throw new Error('The image could not be converted.');
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Turns a JPG/PNG/WebP/BMP/GIF into a one-page PDF. Other formats and oversized images go through a canvas,
 * which also normalises CMYK and palette images to RGB and downsizes above 8000 px.
 * Returns the PDF bytes and whether the image was downscaled.
 */
export async function imageToPdf(file: File, type: 'jpeg' | 'png' | string): Promise<{ bytes: Uint8Array; downscaled: boolean }> {
  const original = new Uint8Array(await file.arrayBuffer());
  const bitmap = await createImageBitmap(file);
  const oversized = Math.max(bitmap.width, bitmap.height) > MAX_SIDE;
  const direct = !oversized && (type === 'jpeg' || type === 'png');

  const doc = await PDFDocument.create();
  let width = bitmap.width;
  let height = bitmap.height;
  let image;
  if (direct) {
    try {
      image = type === 'jpeg' ? await doc.embedJpg(original) : await doc.embedPng(original);
    } catch {
      image = undefined; // e.g. an interlaced or unusual PNG: fall back to the canvas path
    }
  }
  if (!image) {
    const k = oversized ? MAX_SIDE / Math.max(bitmap.width, bitmap.height) : 1;
    width = Math.round(bitmap.width * k);
    height = Math.round(bitmap.height * k);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    ctx.drawImage(bitmap, 0, 0, width, height);
    // PNG keeps transparency; photos stay JPEG to keep the file small.
    image = type === 'jpeg' ? await doc.embedJpg(await canvasToBytes(canvas, 'image/jpeg')) : await doc.embedPng(await canvasToBytes(canvas, 'image/png'));
  }
  bitmap.close();
  const size = fitToA4(width, height);
  const page = doc.addPage([size.width, size.height]);
  page.drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });
  return { bytes: new Uint8Array(await doc.save()), downscaled: oversized };
}
