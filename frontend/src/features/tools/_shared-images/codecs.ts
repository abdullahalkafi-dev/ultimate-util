import { quantizeRgba } from './quantize';
import type { EncodeSpec } from './types';

/** Raw RGBA pixels. Structural so it works in workers and in tests. */
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Encoded {
  bytes: Uint8Array;
  /** Quality used; 0 means lossless. */
  quality: number;
}

const asImageData = (p: Pixels) => new ImageData(new Uint8ClampedArray(p.data), p.width, p.height);

/** Number of palette colors for a lossy PNG at a given quality (1 to 100). */
export function paletteSizeForQuality(quality: number): number {
  const q = Math.min(100, Math.max(1, quality)) / 100;
  return Math.max(8, Math.round(256 * q ** 1.5));
}

async function encodePngLossless(p: Pixels): Promise<Uint8Array> {
  const { default: optimise } = await import('@jsquash/oxipng/optimise');
  return new Uint8Array(await optimise(asImageData(p), { level: 2, interlace: false, optimiseAlpha: true }));
}

async function encodePngLossy(p: Pixels, quality: number): Promise<Uint8Array> {
  const reduced = quantizeRgba(p.data, paletteSizeForQuality(quality));
  return encodePngLossless({ data: reduced, width: p.width, height: p.height });
}

async function encodeJpeg(p: Pixels, quality: number): Promise<Uint8Array> {
  const { default: encode } = await import('@jsquash/jpeg/encode');
  return new Uint8Array(await encode(asImageData(p), { quality }));
}

async function encodeWebp(p: Pixels, quality: number, lossless: boolean): Promise<Uint8Array> {
  const { default: encode } = await import('@jsquash/webp/encode');
  return new Uint8Array(await encode(asImageData(p), lossless ? { lossless: 1, quality: 100 } : { quality }));
}

async function encodeAvif(p: Pixels, quality: number, lossless: boolean): Promise<Uint8Array> {
  const { default: encode } = await import('@jsquash/avif/encode');
  const options = lossless ? { quality: 100, lossless: true, speed: 8 } : { quality, speed: 8 };
  return new Uint8Array(await encode(asImageData(p), options));
}

async function encodeOnce(p: Pixels, spec: EncodeSpec, quality: number, lossless: boolean): Promise<Uint8Array> {
  switch (spec.format) {
    case 'jpeg': return encodeJpeg(p, quality);
    case 'png': return lossless ? encodePngLossless(p) : encodePngLossy(p, quality);
    case 'webp': return encodeWebp(p, quality, lossless);
    case 'avif': return encodeAvif(p, quality, lossless);
  }
}

/** Qualities Smart mode tries, from the user's setting downwards. */
export function smartLadder(quality: number): number[] {
  const ladder = [quality, quality - 15, quality - 30].map((q) => Math.min(100, Math.max(10, Math.round(q))));
  return [...new Set(ladder)];
}

/**
 * Encodes pixels as the requested format. Smart mode tries lossless first (PNG, WebP), then lossy at
 * falling quality, and stops at the first result that is at least 10% under the target size.
 */
export async function encodePixels(p: Pixels, spec: EncodeSpec): Promise<Encoded> {
  if (!spec.smart) {
    const lossless = spec.lossless && spec.format !== 'jpeg';
    const bytes = await encodeOnce(p, spec, spec.quality, lossless);
    return { bytes, quality: lossless ? 0 : spec.quality };
  }

  const goal = (spec.smartTarget ?? Infinity) * 0.9;
  let best: Encoded | null = null;
  const consider = (candidate: Encoded) => {
    if (!best || candidate.bytes.length < best.bytes.length) best = candidate;
    return candidate.bytes.length <= goal;
  };

  if (spec.format === 'png' || spec.format === 'webp') {
    const lossless = await encodeOnce(p, spec, 100, true);
    if (consider({ bytes: lossless, quality: 0 })) return best!;
  }
  for (const q of smartLadder(spec.quality)) {
    const bytes = await encodeOnce(p, spec, q, false);
    if (consider({ bytes, quality: q })) break;
  }
  return best!;
}
