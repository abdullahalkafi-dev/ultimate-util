import { HARD_FILE_BYTES, MAX_DIMENSION, MAX_PIXELS } from './types';
import { readImageInfo } from './imageInfo';
import { readFirstBytes, sniffType, type SniffedType } from '@/lib/files';

export type RasterType = 'png' | 'jpeg' | 'webp' | 'avif' | 'gif' | 'bmp';

export interface PreparedImage {
  /** Bytes the pipeline works on (HEIC is converted to PNG here). */
  blob: Blob;
  type: RasterType | 'svg';
  width: number | null;
  height: number | null;
  animated: boolean;
  /** True when the bytes above were converted from a HEIC/HEIF file. */
  fromHeic?: boolean;
  /** Plain-language notes shown on the item, such as "Converted from HEIC". */
  notes: string[];
}

export type PrepareResult = { ok: true; image: PreparedImage } | { ok: false; error: string };

const REJECT: Partial<Record<SniffedType, string>> = {
  pdf: 'This looks like a PDF, not an image. Use the PDF tools instead.',
  zip: 'This looks like a ZIP or Office file, not an image.',
  docx: 'This looks like a document, not an image.',
  ole: 'This looks like an Office document, not an image.',
  mp4: 'This looks like a video, not an image.',
  webm: 'This looks like a video, not an image.',
};

/** Validates by magic bytes, converts HEIC, and reads header info. Never touches the original file. */
export async function prepareInput(file: File, options: { allowSvg: boolean }): Promise<PrepareResult> {
  if (file.size === 0) return { ok: false, error: 'File is empty.' };
  if (file.size > HARD_FILE_BYTES) return { ok: false, error: 'File is larger than the 100 MB limit.' };
  const head = await readFirstBytes(file, 512);
  const type = sniffType(head);
  const rejected = REJECT[type];
  if (rejected) return { ok: false, error: rejected };
  if (type === 'svg') {
    if (!options.allowSvg) return { ok: false, error: 'SVG is a vector format. Use the Bulk Resizer & Converter to rasterize it, or an SVG optimizer to shrink it.' };
    return { ok: true, image: { blob: file, type: 'svg', width: null, height: null, animated: false, notes: [] } };
  }
  if (type === 'heic') {
    try {
      const { heicTo } = await import('heic-to');
      const png = await heicTo({ blob: file, type: 'image/png' });
      const info = readImageInfo(new Uint8Array(await png.slice(0, 64).arrayBuffer()), 'png');
      return {
        ok: true,
        image: {
          blob: png,
          type: 'png',
          width: info?.width ?? null,
          height: info?.height ?? null,
          animated: false,
          fromHeic: true,
          notes: ['Converted from HEIC. HDR or gain-map photos may look flatter than on the phone.'],
        },
      };
    } catch {
      return { ok: false, error: 'This HEIC variant could not be decoded. Export it as JPG from your phone and try again.' };
    }
  }
  if (type === 'png' || type === 'jpeg' || type === 'webp' || type === 'avif' || type === 'gif' || type === 'bmp') {
    const info = readImageInfo(new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer()), type);
    if (info && info.width * info.height > MAX_PIXELS) {
      return { ok: false, error: `This image is ${Math.round((info.width * info.height) / 1e6)} megapixels, above the 100 megapixel limit.` };
    }
    return {
      ok: true,
      image: { blob: file, type, width: info?.width ?? null, height: info?.height ?? null, animated: info?.animated ?? false, notes: [] },
    };
  }
  return { ok: false, error: 'This file is not a supported image (PNG, JPG, WebP, AVIF, GIF, BMP, HEIC).' };
}

/** Things in an SVG that will not render in a sandboxed raster, so the user can be told. */
export function svgWarnings(svgText: string): string[] {
  const warnings: string[] = [];
  if (/<script\b/i.test(svgText)) warnings.push('Scripts inside the SVG were not run.');
  if (/<foreignObject\b/i.test(svgText)) warnings.push('Some content (foreignObject) may not be rendered.');
  if (/(?:xlink:)?href\s*=\s*["']\s*(?:https?:)?\/\//i.test(svgText) || /url\(\s*["']?\s*https?:/i.test(svgText)) {
    warnings.push('Linked external images or fonts were not loaded.');
  }
  if (/<text\b/i.test(svgText)) warnings.push('Text uses system fonts and may look different. Convert text to paths for exact results.');
  return warnings;
}

/** Draws an SVG at an exact pixel size through an <img>, which never fetches external resources. */
export async function rasterizeSvg(svgText: string, width: number, height: number): Promise<Blob> {
  const w = Math.round(width);
  const h = Math.round(height);
  if (w < 1 || h < 1 || w > MAX_DIMENSION || h > MAX_DIMENSION || w * h > MAX_PIXELS) {
    throw new Error('That size is above the canvas limit.');
  }
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('This SVG could not be rendered.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The canvas could not be exported.'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
