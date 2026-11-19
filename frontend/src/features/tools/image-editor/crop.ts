/** Crop, resize and aspect-ratio math. Pure, integer pixel results. */
export interface Rect { x: number; y: number; w: number; h: number }

export const ASPECT_PRESETS: { id: string; label: string; ratio: number | null }[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: '1:1', label: '1:1 Square', ratio: 1 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16 Story', ratio: 9 / 16 },
  { id: '4:5', label: '4:5 Portrait', ratio: 4 / 5 },
  { id: '1.91:1', label: '1.91:1 Link preview', ratio: 1.91 },
  { id: '3:1', label: '3:1 Banner', ratio: 3 },
];

export function clampRect(r: Rect, imgW: number, imgH: number, minSize = 1): Rect {
  const w = Math.max(minSize, Math.min(imgW, Math.round(r.w)));
  const h = Math.max(minSize, Math.min(imgH, Math.round(r.h)));
  const x = Math.max(0, Math.min(imgW - w, Math.round(r.x)));
  const y = Math.max(0, Math.min(imgH - h, Math.round(r.y)));
  return { x, y, w, h };
}

/** Largest centered rect of the given ratio (w/h) that fits inside the image. */
export function centeredRect(ratio: number | null, imgW: number, imgH: number): Rect {
  if (!ratio) return { x: 0, y: 0, w: imgW, h: imgH };
  let w = imgW;
  let h = Math.round(w / ratio);
  if (h > imgH) { h = imgH; w = Math.round(h * ratio); }
  return clampRect({ x: (imgW - w) / 2, y: (imgH - h) / 2, w, h }, imgW, imgH);
}

/** Keeps the rect's width and adjusts its height to the ratio, shrinking if it would leave the image. */
export function applyRatio(r: Rect, ratio: number | null, imgW: number, imgH: number): Rect {
  if (!ratio) return clampRect(r, imgW, imgH);
  let w = Math.min(r.w, imgW);
  let h = Math.round(w / ratio);
  if (h > imgH) { h = imgH; w = Math.round(h * ratio); }
  return clampRect({ x: r.x, y: r.y, w, h }, imgW, imgH);
}

/** Rect spanned by a drag between two points, optionally locked to a ratio, clamped to the image. */
export function rectFromDrag(ax: number, ay: number, bx: number, by: number, ratio: number | null, imgW: number, imgH: number): Rect {
  let dx = bx - ax;
  let dy = by - ay;
  if (ratio) {
    const size = Math.max(Math.abs(dx), Math.abs(dy) * ratio);
    dx = Math.sign(dx || 1) * size;
    dy = Math.sign(dy || 1) * (size / ratio);
  }
  const x1 = Math.max(0, Math.min(imgW, ax));
  const y1 = Math.max(0, Math.min(imgH, ay));
  const x2 = Math.max(0, Math.min(imgW, ax + dx));
  const y2 = Math.max(0, Math.min(imgH, ay + dy));
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

/** Dimensions after resizing; with lock, the missing side follows the aspect ratio. */
export function resizeDims(w: number, h: number, want: { w?: number; h?: number }, lock = true): { w: number; h: number } {
  const clean = (n: number | undefined) => (n && Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n)) : undefined);
  const tw = clean(want.w);
  const th = clean(want.h);
  if (!lock) return { w: tw ?? w, h: th ?? h };
  if (tw) return { w: tw, h: Math.max(1, Math.round((tw * h) / w)) };
  if (th) return { w: Math.max(1, Math.round((th * w) / h)), h: th };
  return { w, h };
}

/** Scale factor (<=1) that brings an image under a pixel budget. */
export function fitToPixelBudget(w: number, h: number, maxPixels: number): number {
  const px = w * h;
  return px <= maxPixels ? 1 : Math.sqrt(maxPixels / px);
}

/** Canvas limits differ per browser; 16384 per side is the common safe ceiling. */
export const MAX_SIDE = 16384;
export function exceedsCanvasLimit(w: number, h: number): boolean {
  return w > MAX_SIDE || h > MAX_SIDE;
}

/** Longest-side scale for the on-screen preview proxy. */
export function previewScale(w: number, h: number, maxSide = 2048): number {
  return Math.min(1, maxSide / Math.max(w, h));
}
