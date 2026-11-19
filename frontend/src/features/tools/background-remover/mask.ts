/** Mask post-processing and brush edits. Masks are Uint8Array alpha (255 = keep subject). */

export interface Stroke {
  mode: 'keep' | 'erase';
  /** Brush radius in full-resolution pixels. */
  radius: number;
  /** 0 = soft falloff from the centre, 1 = hard edge. */
  hardness: number;
  /** Points in full-resolution pixel coordinates. */
  points: [number, number][];
}

/** Applies a dab at (cx, cy). Soft brushes blend towards the target value, never past it. */
export function paintDab(mask: Uint8Array, w: number, h: number, cx: number, cy: number, radius: number, hardness: number, target: 0 | 255): void {
  const r = Math.max(0.5, radius);
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
  const inner = r * Math.min(1, Math.max(0, hardness));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > r) continue;
      const k = d <= inner ? 1 : 1 - (d - inner) / Math.max(0.0001, r - inner);
      const i = y * w + x;
      const cur = mask[i] as number;
      mask[i] = Math.round(cur + (target - cur) * k);
    }
  }
}

/** Paints a stroke, interpolating dabs so fast pointer moves leave no gaps. `scale` maps full-res to this mask. */
export function applyStroke(mask: Uint8Array, w: number, h: number, s: Stroke, scale = 1): void {
  const target = s.mode === 'keep' ? 255 : 0;
  const radius = s.radius * scale;
  const step = Math.max(0.5, radius * 0.25);
  let prev: [number, number] | null = null;
  for (const [px, py] of s.points) {
    const x = px * scale, y = py * scale;
    if (!prev) paintDab(mask, w, h, x, y, radius, s.hardness, target);
    else {
      const len = Math.hypot(x - prev[0], y - prev[1]);
      const n = Math.max(1, Math.ceil(len / step));
      for (let k = 1; k <= n; k++) paintDab(mask, w, h, prev[0] + ((x - prev[0]) * k) / n, prev[1] + ((y - prev[1]) * k) / n, radius, s.hardness, target);
    }
    prev = [x, y];
  }
}

/** Fresh copy of `base` with every stroke applied in order. Undo = replay without the last stroke. */
export function replayStrokes(base: Uint8Array, w: number, h: number, strokes: Stroke[], scale = 1): Uint8Array {
  const out = base.slice();
  for (const s of strokes) applyStroke(out, w, h, s, scale);
  return out;
}

/** Separable box blur on a mask (two passes ~ soft edge). */
export function featherMask(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const r = Math.round(radius);
  if (r <= 0) return mask.slice();
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);
  const div = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += mask[y * w + Math.min(w - 1, Math.max(0, k))] as number;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / div;
      sum += (mask[y * w + Math.min(w - 1, x + r + 1)] as number) - (mask[y * w + Math.max(0, x - r)] as number);
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x] as number;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = Math.round(sum / div);
      sum += (tmp[Math.min(h - 1, y + r + 1) * w + x] as number) - (tmp[Math.max(0, y - r) * w + x] as number);
    }
  }
  return out;
}

/** Grows (positive) or shrinks (negative) the subject by `px` pixels using a square min/max filter. */
export function shiftEdge(mask: Uint8Array, w: number, h: number, px: number): Uint8Array {
  const n = Math.abs(Math.round(px));
  if (n === 0) return mask.slice();
  const grow = px > 0;
  const pick = grow ? Math.max : Math.min;
  const pass = (src: Uint8Array, horizontal: boolean): Uint8Array => {
    const dst = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = src[y * w + x] as number;
      for (let k = 1; k <= n; k++) {
        const a = horizontal ? (x - k >= 0 ? (src[y * w + x - k] as number) : v) : y - k >= 0 ? (src[(y - k) * w + x] as number) : v;
        const b = horizontal ? (x + k < w ? (src[y * w + x + k] as number) : v) : y + k < h ? (src[(y + k) * w + x] as number) : v;
        v = pick(v, a, b);
      }
      dst[y * w + x] = v;
    }
    return dst;
  };
  return pass(pass(mask, true), false);
}

/** Effective mask used for output: edge shift first, then feather. */
export function finishMask(base: Uint8Array, w: number, h: number, opts: { shift: number; feather: number }): Uint8Array {
  return featherMask(shiftEdge(base, w, h, opts.shift), w, h, opts.feather);
}

/** Downsamples a mask by averaging (box) to dw x dh. */
export function resizeMaskBox(mask: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor((y * sh) / dh), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor((x * sw) / dw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / dw));
      let s = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { s += mask[yy * sw + xx] as number; n++; }
      out[y * dw + x] = Math.round(s / n);
    }
  }
  return out;
}

export function maskCoverage(mask: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < mask.length; i++) s += mask[i] as number;
  return s / (255 * Math.max(1, mask.length));
}
