/**
 * Irreversible redaction on raw RGBA pixels. Solid fill is the only method that cannot be partly reversed;
 * pixelate and blur are enforced to a minimum strength so ordinary text becomes unreadable.
 */
import type { Rect } from './crop';

export interface Pixels { data: Uint8ClampedArray; width: number; height: number }
export type RedactKind = 'solid' | 'pixelate' | 'blur';

/** Minimum pixelate block size in pixels for an image of this size. */
export function minBlock(imgW: number, imgH: number): number {
  return Math.max(8, Math.round(Math.max(imgW, imgH) / 80));
}
/** Minimum blur radius in pixels for an image of this size. */
export function minBlurRadius(imgW: number, imgH: number): number {
  return Math.max(12, Math.round(Math.max(imgW, imgH) / 60));
}

function clipRect(img: Pixels, r: Rect): Rect | null {
  const x = Math.max(0, Math.floor(r.x));
  const y = Math.max(0, Math.floor(r.y));
  const x2 = Math.min(img.width, Math.ceil(r.x + r.w));
  const y2 = Math.min(img.height, Math.ceil(r.y + r.h));
  return x2 > x && y2 > y ? { x, y, w: x2 - x, h: y2 - y } : null;
}

export function fillRect(img: Pixels, rect: Rect, rgba: [number, number, number, number] = [0, 0, 0, 255]): void {
  const r = clipRect(img, rect);
  if (!r) return;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = rgba[0]; img.data[i + 1] = rgba[1]; img.data[i + 2] = rgba[2]; img.data[i + 3] = rgba[3];
    }
  }
}

/** Replaces each block (aligned to the region's top-left) with its mean colour. */
export function pixelate(img: Pixels, rect: Rect, block: number): void {
  const r = clipRect(img, rect);
  if (!r) return;
  const size = Math.max(1, Math.round(block));
  for (let by = r.y; by < r.y + r.h; by += size) {
    for (let bx = r.x; bx < r.x + r.w; bx += size) {
      const x2 = Math.min(r.x + r.w, bx + size), y2 = Math.min(r.y + r.h, by + size);
      let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
      for (let y = by; y < y2; y++) for (let x = bx; x < x2; x++) {
        const i = (y * img.width + x) * 4;
        sr += img.data[i] as number; sg += img.data[i + 1] as number; sb += img.data[i + 2] as number; sa += img.data[i + 3] as number; n++;
      }
      const mr = Math.round(sr / n), mg = Math.round(sg / n), mb = Math.round(sb / n), ma = Math.round(sa / n);
      for (let y = by; y < y2; y++) for (let x = bx; x < x2; x++) {
        const i = (y * img.width + x) * 4;
        img.data[i] = mr; img.data[i + 1] = mg; img.data[i + 2] = mb; img.data[i + 3] = ma;
      }
    }
  }
}

/** Three-pass box blur (approximates a Gaussian) restricted to the region; pixels outside are only read. */
export function blur(img: Pixels, rect: Rect, radius: number): void {
  const r = clipRect(img, rect);
  if (!r) return;
  const rad = Math.max(1, Math.round(radius / 2));
  const w = r.w, h = r.h;
  let src = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((r.y + y) * img.width + r.x + x) * 4, o = (y * w + x) * 4;
    for (let c = 0; c < 4; c++) src[o + c] = img.data[i + c] as number;
  }
  let dst = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) boxLine(src, dst, y * w * 4, 4, w, rad);
    [src, dst] = [dst, src];
    for (let x = 0; x < w; x++) boxLine(src, dst, x * 4, w * 4, h, rad);
    [src, dst] = [dst, src];
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((r.y + y) * img.width + r.x + x) * 4, o = (y * w + x) * 4;
    for (let c = 0; c < 4; c++) img.data[i + c] = Math.round(src[o + c] as number);
  }
}

function boxLine(src: Float32Array, dst: Float32Array, start: number, stride: number, len: number, rad: number): void {
  for (let c = 0; c < 4; c++) {
    let sum = 0;
    // Clamp-to-edge window sum
    for (let k = -rad; k <= rad; k++) sum += src[start + Math.min(len - 1, Math.max(0, k)) * stride + c] as number;
    const div = rad * 2 + 1;
    for (let i = 0; i < len; i++) {
      dst[start + i * stride + c] = sum / div;
      const add = Math.min(len - 1, i + rad + 1), sub = Math.max(0, i - rad);
      sum += (src[start + add * stride + c] as number) - (src[start + sub * stride + c] as number);
    }
  }
}

/** Applies a redaction with the enforced minimum strength. Returns the strength actually used. */
export function redact(img: Pixels, rect: Rect, kind: RedactKind, strength: number, color: [number, number, number, number] = [0, 0, 0, 255]): number {
  if (kind === 'solid') { fillRect(img, rect, color); return 0; }
  if (kind === 'pixelate') {
    const b = Math.max(strength, minBlock(img.width, img.height));
    pixelate(img, rect, b);
    return b;
  }
  const rad = Math.max(strength, minBlurRadius(img.width, img.height));
  blur(img, rect, rad);
  return rad;
}
