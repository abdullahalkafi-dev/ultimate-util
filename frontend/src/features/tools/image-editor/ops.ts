/** Canvas-backed operations that produce new bitmaps. Each returns fresh canvases; nothing is mutated in place. */
import type { Rect } from './crop';
import { addLayer, baseLayer, emptyDoc, newId, updateLayer, type Doc, type ImageLayer } from './layers';
import { blur, fillRect, minBlock, minBlurRadius, pixelate, type RedactKind } from './redact';
import { makeCanvas, renderDoc, type Bitmaps } from './render';

const ctx2d = (c: HTMLCanvasElement) => {
  const x = c.getContext('2d', { willReadFrequently: true });
  if (!x) throw new Error('Canvas 2D is not available in this browser.');
  return x;
};

export function registerBitmap(bitmaps: Bitmaps, canvas: HTMLCanvasElement): string {
  const id = newId('b');
  bitmaps.set(id, canvas);
  return id;
}

export function docFromCanvas(canvas: HTMLCanvasElement, bitmaps: Bitmaps, name: string): Doc {
  const layer: ImageLayer = { ...baseLayer(name), kind: 'image', bitmapId: registerBitmap(bitmaps, canvas), w: canvas.width, h: canvas.height };
  return addLayer(emptyDoc(canvas.width, canvas.height, null), layer);
}

/** Renders the whole document at full resolution. */
export function flatten(doc: Doc, bitmaps: Bitmaps, scale = 1): HTMLCanvasElement {
  const c = makeCanvas(doc.width * scale, doc.height * scale);
  renderDoc(ctx2d(c), doc, bitmaps, scale);
  return c;
}

export function rotate90(src: HTMLCanvasElement, clockwise: boolean): HTMLCanvasElement {
  const c = makeCanvas(src.height, src.width);
  const x = ctx2d(c);
  x.translate(c.width / 2, c.height / 2);
  x.rotate((clockwise ? 1 : -1) * (Math.PI / 2));
  x.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

export function flip(src: HTMLCanvasElement, horizontal: boolean): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const x = ctx2d(c);
  if (horizontal) { x.translate(src.width, 0); x.scale(-1, 1); } else { x.translate(0, src.height); x.scale(1, -1); }
  x.drawImage(src, 0, 0);
  return c;
}

/** Rotation by any angle; the canvas grows to the bounding box and the corners stay transparent. */
export function rotateFree(src: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const a = (degrees * Math.PI) / 180;
  const w = Math.ceil(Math.abs(src.width * Math.cos(a)) + Math.abs(src.height * Math.sin(a)));
  const h = Math.ceil(Math.abs(src.width * Math.sin(a)) + Math.abs(src.height * Math.cos(a)));
  const c = makeCanvas(w, h);
  const x = ctx2d(c);
  x.imageSmoothingQuality = 'high';
  x.translate(w / 2, h / 2);
  x.rotate(a);
  x.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

export function resizeCanvas(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const x = ctx2d(c);
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  // Halve repeatedly for large reductions; one big drawImage aliases badly.
  let cur = src;
  while (cur.width / 2 > w && cur.height / 2 > h) {
    const half = makeCanvas(Math.max(1, Math.floor(cur.width / 2)), Math.max(1, Math.floor(cur.height / 2)));
    const hx = ctx2d(half);
    hx.imageSmoothingQuality = 'high';
    hx.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  x.drawImage(cur, 0, 0, w, h);
  return c;
}

export function cropCanvas(src: HTMLCanvasElement, r: Rect): HTMLCanvasElement {
  const c = makeCanvas(r.w, r.h);
  ctx2d(c).drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return c;
}

export function hexToRgba(hex: string): [number, number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0, 255];
  const n = parseInt(m[1] as string, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

/**
 * Destroys the pixels under `rect` on every visible image layer it touches by writing into fresh bitmaps.
 * Returns null when no image layer is hit.
 */
export function redactImageLayers(doc: Doc, bitmaps: Bitmaps, rect: Rect, kind: RedactKind, strength: number, color: string): Doc | null {
  let out = doc;
  let touched = false;
  for (const l of doc.layers) {
    if (l.kind !== 'image' || !l.visible) continue;
    const src = bitmaps.get(l.bitmapId);
    if (!src) continue;
    const x = Math.max(0, Math.floor(rect.x - l.x)), y = Math.max(0, Math.floor(rect.y - l.y));
    const x2 = Math.min(l.w, Math.ceil(rect.x + rect.w - l.x)), y2 = Math.min(l.h, Math.ceil(rect.y + rect.h - l.y));
    if (x2 <= x || y2 <= y) continue;
    const copy = makeCanvas(src.width, src.height);
    const cx = ctx2d(copy);
    cx.drawImage(src, 0, 0);
    const region = cx.getImageData(x, y, x2 - x, y2 - y);
    const px = { data: region.data, width: region.width, height: region.height };
    const full = { x: 0, y: 0, w: px.width, h: px.height };
    if (kind === 'solid') fillRect(px, full, hexToRgba(color));
    else if (kind === 'pixelate') pixelate(px, full, Math.max(strength, minBlock(l.w, l.h)));
    else blur(px, full, Math.max(strength, minBlurRadius(l.w, l.h)));
    cx.putImageData(region, x, y);
    out = updateLayer(out, l.id, { bitmapId: registerBitmap(bitmaps, copy) });
    touched = true;
  }
  return touched ? out : null;
}

export function sampleCanvas(): HTMLCanvasElement {
  const c = makeCanvas(1200, 800);
  const x = ctx2d(c);
  const g = x.createLinearGradient(0, 0, 1200, 800);
  g.addColorStop(0, '#2446f0');
  g.addColorStop(0.55, '#d6246e');
  g.addColorStop(1, '#f5a524');
  x.fillStyle = g;
  x.fillRect(0, 0, 1200, 800);
  x.fillStyle = 'rgba(255,255,255,0.9)';
  x.beginPath();
  x.arc(880, 280, 120, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#0b0f19';
  x.font = 'bold 64px system-ui, sans-serif';
  x.fillText('Sample photo', 80, 640);
  x.font = '32px system-ui, sans-serif';
  x.fillText('account: 4242 4242 4242 4242', 80, 710);
  return c;
}
