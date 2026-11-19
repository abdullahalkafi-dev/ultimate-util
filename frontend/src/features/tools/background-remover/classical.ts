/** Model-free background removal: estimate the backdrop colour, flood-fill from the edges, grade the edge alpha. */

export interface RGB { r: number; g: number; b: number }

export interface ClassicalOptions {
  /** Colour distance (0..200, Euclidean RGB) treated as fully background. */
  tolerance: number;
  /** Width of the soft ramp beyond the tolerance, as a fraction of it (0..1). */
  softness: number;
  /** contiguous: only background connected to the image edge. global: every matching pixel (also holes). */
  mode: 'contiguous' | 'global';
  /** Use this colour instead of sampling the edges. */
  bg?: RGB;
}

export const DEFAULT_CLASSICAL: ClassicalOptions = { tolerance: 40, softness: 0.5, mode: 'contiguous' };

export const dist = (r: number, g: number, b: number, c: RGB) => Math.hypot(r - c.r, g - c.g, b - c.b);

/**
 * Dominant colour of the image border: edge pixels are bucketed into 16 levels per channel and the busiest
 * bucket's mean is returned. `confidence` is the share of border pixels in that bucket.
 */
export function sampleBackground(data: Uint8ClampedArray, w: number, h: number, ring = 2): { color: RGB; confidence: number } {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if ((data[i + 3] as number) < 16) return;
    const r = data[i] as number, g = data[i + 1] as number, b = data[i + 2] as number;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
    total++;
  };
  const t = Math.min(ring, Math.ceil(Math.min(w, h) / 2));
  for (let y = 0; y < h; y++) {
    if (y < t || y >= h - t) for (let x = 0; x < w; x++) add(x, y);
    else for (let k = 0; k < t; k++) { add(k, y); add(w - 1 - k, y); }
  }
  let best: { n: number; r: number; g: number; b: number } | undefined;
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
  if (!best || !total) return { color: { r: 255, g: 255, b: 255 }, confidence: 0 };
  return { color: { r: Math.round(best.r / best.n), g: Math.round(best.g / best.n), b: Math.round(best.b / best.n) }, confidence: best.n / total };
}

/**
 * Returns an alpha mask (255 = keep, 0 = background). Pixels within `tolerance` of the backdrop are removed;
 * between tolerance and tolerance*(1+softness) alpha ramps up, giving anti-aliased edges.
 */
export function classicalMask(data: Uint8ClampedArray, w: number, h: number, opts: ClassicalOptions): { mask: Uint8Array; bg: RGB } {
  const bg = opts.bg ?? sampleBackground(data, w, h).color;
  const lo = Math.max(0, opts.tolerance);
  const hi = lo * (1 + Math.max(0, opts.softness)) + 0.0001;
  const mask = new Uint8Array(w * h).fill(255);
  const d = (p: number) => dist(data[p * 4] as number, data[p * 4 + 1] as number, data[p * 4 + 2] as number, bg);
  const alphaFor = (dd: number) => (dd <= lo ? 0 : Math.round(((dd - lo) / (hi - lo)) * 255));

  if (opts.mode === 'global') {
    for (let p = 0; p < w * h; p++) {
      const dd = d(p);
      if (dd <= hi && (data[p * 4 + 3] as number) > 0) mask[p] = alphaFor(dd);
      if ((data[p * 4 + 3] as number) === 0) mask[p] = 0;
    }
    return { mask, bg };
  }

  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (p: number) => {
    if (!visited[p] && d(p) <= hi) { visited[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop() as number;
    mask[p] = alphaFor(d(p));
    // Only keep spreading through clearly-background pixels so the soft ramp does not leak into the subject.
    if (d(p) > lo) continue;
    const x = p % w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (p >= w) seed(p - w);
    if (p < w * (h - 1)) seed(p + w);
  }
  for (let p = 0; p < w * h; p++) if ((data[p * 4 + 3] as number) === 0) mask[p] = 0;
  return { mask, bg };
}

/**
 * Removes the backdrop colour that bleeds into semi-transparent edge pixels: p = a*f + (1-a)*bg  =>  f = (p - (1-a)*bg) / a.
 * Returns a new RGBA array with alpha taken from the mask.
 */
export function decontaminate(data: Uint8ClampedArray, mask: Uint8Array, bg: RGB, strength = 1): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  for (let p = 0; p < mask.length; p++) {
    const a = (mask[p] as number) / 255;
    const i = p * 4;
    let r = data[i] as number, g = data[i + 1] as number, b = data[i + 2] as number;
    if (a > 0 && a < 1 && strength > 0) {
      const fr = (r - (1 - a) * bg.r) / a, fg = (g - (1 - a) * bg.g) / a, fb = (b - (1 - a) * bg.b) / a;
      r += (fr - r) * strength; g += (fg - g) * strength; b += (fb - b) * strength;
    }
    out[i] = r; out[i + 1] = g; out[i + 2] = b;
    out[i + 3] = Math.round(a * 255 * ((data[i + 3] as number) / 255));
  }
  return out;
}
