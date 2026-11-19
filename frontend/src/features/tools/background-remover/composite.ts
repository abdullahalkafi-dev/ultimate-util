/** Alpha compositing on raw RGBA. */
import type { RGB } from './classical';

/** Returns RGBA where alpha = mask * source alpha. */
export function applyMask(rgba: Uint8ClampedArray, mask: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  for (let p = 0; p < mask.length; p++) out[p * 4 + 3] = Math.round(((rgba[p * 4 + 3] as number) * (mask[p] as number)) / 255);
  return out;
}

/** Source-over composite of `fg` on an opaque colour; result is fully opaque. */
export function flattenOnColor(fg: Uint8ClampedArray, bg: RGB): Uint8ClampedArray {
  const out = new Uint8ClampedArray(fg.length);
  for (let i = 0; i < fg.length; i += 4) {
    const a = (fg[i + 3] as number) / 255;
    out[i] = (fg[i] as number) * a + bg.r * (1 - a);
    out[i + 1] = (fg[i + 1] as number) * a + bg.g * (1 - a);
    out[i + 2] = (fg[i + 2] as number) * a + bg.b * (1 - a);
    out[i + 3] = 255;
  }
  return out;
}

/** Grey-scale RGBA image of the mask, for the optional "download mask" output. */
export function maskToRgba(mask: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(mask.length * 4);
  for (let p = 0; p < mask.length; p++) { const v = mask[p] as number; out[p * 4] = v; out[p * 4 + 1] = v; out[p * 4 + 2] = v; out[p * 4 + 3] = 255; }
  return out;
}

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 255, g: 255, b: 255 };
  const n = parseInt(m[1] as string, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
