/** Thin canvas layer: draws the layer model. Browser only (never imported at module level by server code). */
import { applyAdjust } from './adjust';
import type { Doc, Layer, ShapeLayer, TextLayer } from './layers';

export type Bitmaps = Map<string, HTMLCanvasElement>;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function arrowHead(ctx: CanvasRenderingContext2D, l: ShapeLayer, s: number) {
  const len = Math.max(l.strokeWidth * 4, 12) * s;
  const ang = Math.atan2(l.h, l.w);
  const x = l.w * s, y = l.h * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - len * Math.cos(ang - Math.PI / 7), y - len * Math.sin(ang - Math.PI / 7));
  ctx.lineTo(x - len * Math.cos(ang + Math.PI / 7), y - len * Math.sin(ang + Math.PI / 7));
  ctx.closePath();
  ctx.fillStyle = l.stroke;
  ctx.fill();
}

export function fontFor(l: TextLayer, s: number): string {
  return `${l.italic ? 'italic ' : ''}${l.bold ? 'bold ' : ''}${l.fontSize * s}px ${l.fontFamily}`;
}

function drawLayer(ctx: CanvasRenderingContext2D, l: Layer, bitmaps: Bitmaps, s: number) {
  ctx.save();
  ctx.globalAlpha = l.opacity;
  ctx.globalCompositeOperation = l.blend;
  ctx.translate(l.x * s, l.y * s);
  switch (l.kind) {
    case 'image': {
      const bmp = bitmaps.get(l.bitmapId);
      if (bmp) ctx.drawImage(bmp, 0, 0, l.w * s, l.h * s);
      break;
    }
    case 'text': {
      ctx.font = fontFor(l, s);
      ctx.fillStyle = l.color;
      ctx.textBaseline = 'top';
      ctx.direction = l.rtl ? 'rtl' : 'ltr';
      ctx.textAlign = l.align;
      l.text.split('\n').forEach((line, i) => ctx.fillText(line, 0, i * l.fontSize * 1.25 * s));
      break;
    }
    case 'shape': {
      ctx.lineWidth = l.strokeWidth * s;
      ctx.strokeStyle = l.stroke;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (l.shape === 'rect') {
        if (l.fill) { ctx.fillStyle = l.fill; ctx.fillRect(0, 0, l.w * s, l.h * s); }
        if (l.strokeWidth > 0) ctx.strokeRect(0, 0, l.w * s, l.h * s);
      } else if (l.shape === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse((l.w / 2) * s, (l.h / 2) * s, Math.abs(l.w / 2) * s, Math.abs(l.h / 2) * s, 0, 0, Math.PI * 2);
        if (l.fill) { ctx.fillStyle = l.fill; ctx.fill(); }
        if (l.strokeWidth > 0) ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(l.w * s, l.h * s);
        ctx.stroke();
        if (l.shape === 'arrow') arrowHead(ctx, l, s);
      }
      break;
    }
    case 'pen': {
      if (l.points.length < 2) break;
      ctx.strokeStyle = l.color;
      ctx.lineWidth = l.size * s;
      ctx.lineCap = l.highlight ? 'butt' : 'round';
      ctx.lineJoin = 'round';
      if (l.highlight) ctx.globalCompositeOperation = 'multiply';
      ctx.beginPath();
      ctx.moveTo((l.points[0] as number) * s, (l.points[1] as number) * s);
      if (l.points.length === 2) ctx.lineTo((l.points[0] as number) * s + 0.01, (l.points[1] as number) * s);
      for (let i = 2; i < l.points.length; i += 2) ctx.lineTo((l.points[i] as number) * s, (l.points[i + 1] as number) * s);
      ctx.stroke();
      break;
    }
    case 'step': {
      ctx.beginPath();
      ctx.arc(0, 0, l.radius * s, 0, Math.PI * 2);
      ctx.fillStyle = l.color;
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${l.radius * 1.2 * s}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(l.n), 0, 0.05 * l.radius * s);
      break;
    }
    case 'adjust':
      break;
  }
  ctx.restore();
}

/** Draws the document at scale `s` (1 = full size). Adjustment layers act on everything below them. */
export function renderDoc(ctx: CanvasRenderingContext2D, doc: Doc, bitmaps: Bitmaps, s: number): void {
  const w = Math.max(1, Math.round(doc.width * s)), h = Math.max(1, Math.round(doc.height * s));
  ctx.clearRect(0, 0, w, h);
  if (doc.background) {
    ctx.fillStyle = doc.background;
    ctx.fillRect(0, 0, w, h);
  }
  for (const l of doc.layers) {
    if (!l.visible) continue;
    if (l.kind === 'adjust') {
      if (l.opacity <= 0) continue;
      const img = ctx.getImageData(0, 0, w, h);
      if (l.opacity >= 1) {
        applyAdjust(img.data, l.params);
        ctx.putImageData(img, 0, 0);
      } else {
        const adjusted = new ImageData(new Uint8ClampedArray(img.data), w, h);
        applyAdjust(adjusted.data, l.params);
        const tmp = makeCanvas(w, h);
        tmp.getContext('2d')?.putImageData(adjusted, 0, 0);
        ctx.save();
        ctx.globalAlpha = l.opacity;
        ctx.drawImage(tmp, 0, 0);
        ctx.restore();
      }
      continue;
    }
    drawLayer(ctx, l, bitmaps, s);
  }
}

export function canvasToBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('The browser could not encode this image.'))), type, quality);
  });
}

export function canvasToDataUrl(c: HTMLCanvasElement): string {
  return c.toDataURL('image/png');
}

export async function loadDataUrl(url: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = makeCanvas(img.naturalWidth, img.naturalHeight);
  c.getContext('2d')?.drawImage(img, 0, 0);
  return c;
}

/** Decodes a file to a canvas, honouring EXIF orientation. SVG goes through an <img>. */
export async function decodeToCanvas(file: Blob, isSvg: boolean): Promise<HTMLCanvasElement> {
  if (isSvg) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const w = img.naturalWidth || 1024, h = img.naturalHeight || 1024;
      const c = makeCanvas(w, h);
      c.getContext('2d')?.drawImage(img, 0, 0, w, h);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const c = makeCanvas(bmp.width, bmp.height);
  c.getContext('2d')?.drawImage(bmp, 0, 0);
  bmp.close();
  return c;
}
