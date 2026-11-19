import { rgbToHex, type RGB } from '../_shared-color/convert';

export interface ExtractedColor {
  rgb: RGB;
  hex: string;
  /** Share of sampled opaque pixels, 0..1. */
  share: number;
}

export interface Extraction {
  colors: ExtractedColor[];
  /** Number of opaque pixels that were sampled. */
  sampled: number;
}

const MAX_SAMPLES = 60_000;

/**
 * Median-cut quantization of RGBA pixel data. Transparent pixels are ignored; images with
 * fewer distinct colors than requested simply return fewer colors.
 */
export function extractPalette(rgba: ArrayLike<number>, count: number): Extraction {
  const total = Math.floor(rgba.length / 4);
  const stride = Math.max(1, Math.floor(total / MAX_SAMPLES));
  const pixels: number[][] = [];
  for (let p = 0; p < total; p += stride) {
    const i = p * 4;
    if ((rgba[i + 3] ?? 0) < 128) continue;
    pixels.push([rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0]);
  }
  if (pixels.length === 0) return { colors: [], sampled: 0 };

  let boxes: number[][][] = [pixels];
  while (boxes.length < count) {
    // Split the box with the widest channel range (weighted by size so big flat areas win).
    let best = -1, bestScore = 0, bestChannel = 0;
    boxes.forEach((box, index) => {
      const { channel, range } = widestChannel(box);
      const score = range * Math.sqrt(box.length);
      if (range > 0 && score > bestScore) {
        best = index;
        bestScore = score;
        bestChannel = channel;
      }
    });
    if (best < 0) break; // every remaining box is a single color
    const box = boxes[best] as number[][];
    box.sort((a, b) => (a[bestChannel] ?? 0) - (b[bestChannel] ?? 0));
    // Split on a value boundary so identical pixels never end up in different boxes.
    const pivot = box[Math.floor(box.length / 2)]?.[bestChannel] ?? 0;
    let mid = box.findIndex((px) => (px[bestChannel] ?? 0) > pivot);
    if (mid < 0) mid = box.findIndex((px) => (px[bestChannel] ?? 0) >= pivot);
    boxes = [...boxes.slice(0, best), box.slice(0, mid), box.slice(mid), ...boxes.slice(best + 1)];
  }

  const colors = boxes
    .filter((b) => b.length > 0)
    .map((box) => {
      const sum = [0, 0, 0];
      for (const px of box) for (let c = 0; c < 3; c++) sum[c] = (sum[c] ?? 0) + (px[c] ?? 0);
      const rgb = { r: Math.round((sum[0] ?? 0) / box.length), g: Math.round((sum[1] ?? 0) / box.length), b: Math.round((sum[2] ?? 0) / box.length) };
      return { rgb, hex: rgbToHex(rgb), share: box.length / pixels.length };
    })
    .sort((a, b) => b.share - a.share);
  return { colors, sampled: pixels.length };
}

function widestChannel(box: number[][]): { channel: number; range: number } {
  const min = [255, 255, 255], max = [0, 0, 0];
  for (const px of box) {
    for (let c = 0; c < 3; c++) {
      const v = px[c] ?? 0;
      if (v < (min[c] ?? 255)) min[c] = v;
      if (v > (max[c] ?? 0)) max[c] = v;
    }
  }
  let channel = 0, range = 0;
  for (let c = 0; c < 3; c++) {
    const r = (max[c] ?? 0) - (min[c] ?? 0);
    if (r > range) {
      range = r;
      channel = c;
    }
  }
  return { channel, range };
}
