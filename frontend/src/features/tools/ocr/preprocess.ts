export interface PreprocessOptions {
  grayscale: boolean;
  contrast: number; // 0 (none) to 100
  invert: boolean;
  rotateDeg: 0 | 90 | 180 | 270;
}

export const DEFAULT_PREPROCESS: PreprocessOptions = {
  grayscale: true,
  contrast: 20,
  invert: false,
  rotateDeg: 0,
};

export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const clampByte = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : Math.round(n));

export function applyColorTransforms(
  src: Uint8ClampedArray,
  opts: Pick<PreprocessOptions, 'grayscale' | 'contrast' | 'invert'>,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const c = Math.max(0, Math.min(100, opts.contrast));
  const factor = (259 * (c + 255)) / (255 * (259 - c));

  for (let i = 0; i < src.length; i += 4) {
    let r = src[i] ?? 0;
    let g = src[i + 1] ?? 0;
    let b = src[i + 2] ?? 0;
    const a = src[i + 3] ?? 255;

    if (opts.grayscale) {
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      r = g = b = lum;
    }
    if (c > 0) {
      r = clampByte(factor * (r - 128) + 128);
      g = clampByte(factor * (g - 128) + 128);
      b = clampByte(factor * (b - 128) + 128);
    }
    if (opts.invert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = a;
  }
  return out;
}

export function rotatePixels(buf: PixelBuffer, deg: 0 | 90 | 180 | 270): PixelBuffer {
  if (deg === 0) return buf;
  const { width: w, height: h, data } = buf;
  const outW = deg === 180 ? w : h;
  const outH = deg === 180 ? h : w;
  const out = new Uint8ClampedArray(outW * outH * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      let dx = x;
      let dy = y;
      if (deg === 90) {
        dx = h - 1 - y;
        dy = x;
      } else if (deg === 180) {
        dx = w - 1 - x;
        dy = h - 1 - y;
      } else if (deg === 270) {
        dx = y;
        dy = w - 1 - x;
      }
      const di = (dy * outW + dx) * 4;
      out[di] = data[si] ?? 0;
      out[di + 1] = data[si + 1] ?? 0;
      out[di + 2] = data[si + 2] ?? 0;
      out[di + 3] = data[si + 3] ?? 255;
    }
  }
  return { width: outW, height: outH, data: out };
}

export function preprocessBuffer(buf: PixelBuffer, opts: PreprocessOptions): PixelBuffer {
  const transformed = applyColorTransforms(buf.data, opts);
  return rotatePixels({ width: buf.width, height: buf.height, data: transformed }, opts.rotateDeg);
}

/** Joins soft line wraps inside paragraphs while preserving blank-line paragraph breaks. */
export function joinParagraphLines(text: string): string {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return blocks
    .map((block) =>
      block
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' '),
    )
    .filter(Boolean)
    .join('\n\n');
}

export interface WordBox {
  text: string;
  confidence: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function averageConfidence(words: Pick<WordBox, 'confidence'>[]): number {
  if (words.length === 0) return 0;
  const sum = words.reduce((s, w) => s + w.confidence, 0);
  return Math.round(sum / words.length);
}
