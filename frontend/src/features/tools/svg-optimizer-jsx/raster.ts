import { diffPixels } from './outputs';

export function svgBlobUrl(svg: string): string {
  return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
}

/** Aspect ratio from viewBox, falling back to width/height, then 1. */
export function aspectOf(svg: string): number {
  const vb = /viewBox=["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg);
  if (vb && Number(vb[1]) > 0 && Number(vb[2]) > 0) return Number(vb[1]) / Number(vb[2]);
  const w = /<svg\b[^>]*\swidth=["']([\d.]+)/.exec(svg);
  const h = /<svg\b[^>]*\sheight=["']([\d.]+)/.exec(svg);
  if (w && h && Number(w[1]) > 0 && Number(h[1]) > 0) return Number(w[1]) / Number(h[1]);
  return 1;
}

async function rasterize(svg: string, w: number, h: number): Promise<ImageData> {
  const url = svgBlobUrl(svg);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas is not available.');
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface VisualDiff {
  differing: number;
  total: number;
  size: number;
  /** Red-highlighted overlay, or null when identical. */
  overlay: string | null;
}

/** Renders both SVGs at `size` px on the long side and compares them pixel by pixel. */
export async function visualDiff(before: string, after: string, size = 512): Promise<VisualDiff> {
  const ratio = aspectOf(before);
  const w = ratio >= 1 ? size : Math.max(1, Math.round(size * ratio));
  const h = ratio >= 1 ? Math.max(1, Math.round(size / ratio)) : size;
  const [a, b] = await Promise.all([rasterize(before, w, h), rasterize(after, w, h)]);
  const { differing, total } = diffPixels(a.data, b.data);
  let overlay: string | null = null;
  if (differing > 0) {
    const out = new ImageData(w, h);
    for (let i = 0; i < a.data.length; i += 4) {
      const d = Math.max(
        Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0)),
        Math.abs((a.data[i + 1] ?? 0) - (b.data[i + 1] ?? 0)),
        Math.abs((a.data[i + 2] ?? 0) - (b.data[i + 2] ?? 0)),
        Math.abs((a.data[i + 3] ?? 0) - (b.data[i + 3] ?? 0)),
      );
      if (d > 8) {
        out.data[i] = 255;
        out.data[i + 3] = 255;
      } else {
        out.data[i + 3] = 40;
        out.data[i] = out.data[i + 1] = out.data[i + 2] = 128;
      }
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')?.putImageData(out, 0, 0);
    overlay = c.toDataURL('image/png');
  }
  return { differing, total, size, overlay };
}
