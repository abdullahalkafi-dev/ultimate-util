import { MAX_DIMENSION, type Layout, type ResizeSpec } from './types';

export const DEFAULT_ANCHOR = { x: 0.5, y: 0.5 };

const clampInt = (n: number) => Math.max(1, Math.round(n));

export function emptyResize(): ResizeSpec {
  return { mode: 'none', fit: 'inside', anchor: DEFAULT_ANCHOR, doNotEnlarge: true };
}

/** Works out output size and the draw rectangles for one source and one resize rule. */
export function computeLayout(srcW: number, srcH: number, spec: ResizeSpec): Layout {
  let notEnlarged = false;
  let clamped = false;
  const full = (outW: number, outH: number): Layout => ({
    outW, outH, sx: 0, sy: 0, sw: srcW, sh: srcH, dx: 0, dy: 0, dw: outW, dh: outH, notEnlarged, clamped,
  });

  const limit = (w: number, h: number): [number, number] => {
    const big = Math.max(w, h);
    if (big <= MAX_DIMENSION) return [w, h];
    clamped = true;
    const k = MAX_DIMENSION / big;
    return [clampInt(w * k), clampInt(h * k)];
  };

  const scaled = (scale: number): Layout => {
    let s = scale;
    if (spec.doNotEnlarge && s > 1) {
      s = 1;
      notEnlarged = true;
    }
    const [w, h] = limit(clampInt(srcW * s), clampInt(srcH * s));
    return full(w, h);
  };

  if (spec.mode === 'none') return full(srcW, srcH);
  if (spec.mode === 'percent') return scaled((spec.percent ?? 100) / 100);
  if (spec.mode === 'longEdge') {
    const edge = Math.max(1, spec.longEdge ?? Math.max(srcW, srcH));
    return scaled(edge / Math.max(srcW, srcH));
  }

  const w = spec.width && spec.width > 0 ? spec.width : undefined;
  const h = spec.height && spec.height > 0 ? spec.height : undefined;
  if (!w && !h) return full(srcW, srcH);
  if (!w || !h) return scaled(w ? w / srcW : (h as number) / srcH);

  // Both dimensions set. When enlarging is off, shrink the whole box so the image is never upscaled.
  let bw = w;
  let bh = h;
  if (spec.doNotEnlarge) {
    if (spec.fit === 'inside') {
      if (Math.min(bw / srcW, bh / srcH) > 1) notEnlarged = true;
    } else {
      const k = Math.min(1, srcW / bw, srcH / bh);
      if (k < 1) {
        bw = clampInt(bw * k);
        bh = clampInt(bh * k);
        notEnlarged = true;
      }
    }
  }
  [bw, bh] = limit(bw, bh);

  if (spec.fit === 'stretch') return full(bw, bh);

  if (spec.fit === 'inside') {
    let s = Math.min(bw / srcW, bh / srcH);
    if (spec.doNotEnlarge) s = Math.min(1, s);
    const [ow, oh] = limit(clampInt(srcW * s), clampInt(srcH * s));
    return full(ow, oh);
  }

  if (spec.fit === 'cover') {
    const s = Math.max(bw / srcW, bh / srcH);
    const sw = Math.min(srcW, bw / s);
    const sh = Math.min(srcH, bh / s);
    return {
      outW: bw, outH: bh,
      sx: (srcW - sw) * spec.anchor.x, sy: (srcH - sh) * spec.anchor.y, sw, sh,
      dx: 0, dy: 0, dw: bw, dh: bh, notEnlarged, clamped,
    };
  }

  // pad: fit inside the box, then place on a canvas of the box size
  const s = Math.min(bw / srcW, bh / srcH);
  const dw = Math.min(bw, clampInt(srcW * s));
  const dh = Math.min(bh, clampInt(srcH * s));
  return {
    outW: bw, outH: bh, sx: 0, sy: 0, sw: srcW, sh: srcH,
    dx: Math.round((bw - dw) * spec.anchor.x), dy: Math.round((bh - dh) * spec.anchor.y), dw, dh,
    notEnlarged, clamped,
  };
}

/** Size an SVG should be rasterized at, from its width/height or viewBox. Null when it has neither. */
export function svgBaseSize(svgText: string): { width: number; height: number } | null {
  const tag = /<svg\b[^>]*>/i.exec(svgText)?.[0];
  if (!tag) return null;
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag)?.[1];
  const num = (v: string | undefined) => {
    if (!v || v.trim().endsWith('%')) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const w = num(attr('width'));
  const h = num(attr('height'));
  const vb = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const vbOk = vb && vb.length === 4 && vb[2]! > 0 && vb[3]! > 0;
  if (w && h) return { width: w, height: h };
  if (vbOk) {
    const ratio = vb[2]! / vb[3]!;
    if (w) return { width: w, height: w / ratio };
    if (h) return { width: h * ratio, height: h };
    return { width: vb[2]!, height: vb[3]! };
  }
  return null;
}
