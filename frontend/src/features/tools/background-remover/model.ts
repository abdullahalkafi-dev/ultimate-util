/** Pre and post-processing for a segmentation ONNX model (salient-object style: image in, mask out). */

export interface Normalization { mean: [number, number, number]; std: [number, number, number] }
export const NORMALIZATIONS: Record<string, Normalization & { label: string }> = {
  imagenet: { label: 'ImageNet (U2-Net, ISNet)', mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
  unit: { label: '0 to 1 (MODNet style)', mean: [0, 0, 0], std: [1, 1, 1] },
  signed: { label: '-1 to 1', mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] },
};

/** RGBA bytes (already resized to the model size) to a planar CHW float tensor buffer. */
export function toNchw(rgba: Uint8ClampedArray, w: number, h: number, norm: Normalization): Float32Array {
  const plane = w * h;
  const out = new Float32Array(plane * 3);
  for (let p = 0; p < plane; p++) {
    for (let c = 0; c < 3; c++) {
      out[c * plane + p] = ((rgba[p * 4 + c] as number) / 255 - norm.mean[c]!) / norm.std[c]!;
    }
  }
  return out;
}

/** Fraction-preserving contain-fit used when a model needs a specific input size. */
export function modelInputSize(shape: readonly (number | string)[] | undefined, fallback: number): { w: number; h: number } {
  const h = typeof shape?.[2] === 'number' && shape[2] > 0 ? shape[2] : fallback;
  const w = typeof shape?.[3] === 'number' && shape[3] > 0 ? shape[3] : fallback;
  return { w, h };
}

/**
 * Raw model output to a 0..255 mask. Models differ: some already apply a sigmoid (0..1), some return logits.
 * Logits (values outside 0..1) are squashed with a sigmoid; then the range is min-max normalised, as the
 * U2-Net reference does.
 */
export function outputToMask(values: ArrayLike<number>): Uint8Array {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < values.length; i++) { const v = values[i] as number; if (v < min) min = v; if (v > max) max = v; }
  const logits = min < -0.01 || max > 1.01;
  const out = new Uint8Array(values.length);
  let lo = Infinity, hi = -Infinity;
  const tmp = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = logits ? 1 / (1 + Math.exp(-(values[i] as number))) : (values[i] as number);
    tmp[i] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const range = hi - lo;
  for (let i = 0; i < tmp.length; i++) out[i] = range > 1e-6 ? Math.round((((tmp[i] as number) - lo) / range) * 255) : 0;
  return out;
}

/** Bilinear upscale of a mask (the model output is small; the image is large). */
export function upscaleMask(mask: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh);
  const xr = sw > 1 ? (sw - 1) / Math.max(1, dw - 1) : 0;
  const yr = sh > 1 ? (sh - 1) / Math.max(1, dh - 1) : 0;
  for (let y = 0; y < dh; y++) {
    const fy = y * yr, y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = x * xr, x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
      const a = mask[y0 * sw + x0] as number, b = mask[y0 * sw + x1] as number;
      const c = mask[y1 * sw + x0] as number, d = mask[y1 * sw + x1] as number;
      out[y * dw + x] = Math.round(a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty);
    }
  }
  return out;
}

/** Sharpens a soft mask around 0.5 so hard-edged subjects are not left semi-transparent. */
export function contrastMask(mask: Uint8Array, amount: number): Uint8Array {
  if (amount <= 0) return mask.slice();
  const k = 1 + amount * 6;
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    const v = (mask[i] as number) / 255;
    out[i] = Math.round(Math.min(1, Math.max(0, 0.5 + (v - 0.5) * k)) * 255);
  }
  return out;
}

export function isOnnxHeader(bytes: Uint8Array): boolean {
  // ONNX files are protobuf: the first field is ir_version (tag 0x08) in practically all exporters.
  return bytes.length > 8 && bytes[0] === 0x08;
}
