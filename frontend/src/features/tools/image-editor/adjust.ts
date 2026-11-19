/** Pixel adjustment math (brightness, contrast, exposure, levels, curves, saturation, warmth, filters). */

export interface CurvePoint { x: number; y: number }
export type FilterId = 'none' | 'grayscale' | 'sepia' | 'vintage' | 'cool' | 'warm' | 'vivid' | 'fade' | 'noir' | 'invert';

export interface AdjustParams {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  warmth: number; // -100..100
  exposure: number; // -3..3 (stops, applied in sRGB space as an approximation)
  levels: { black: number; white: number; gamma: number }; // 0..255, 0..255, 0.1..3
  curve: CurvePoint[]; // master curve, points in 0..255
  filter: FilterId;
  filterAmount: number; // 0..100
}

export const IDENTITY_CURVE: CurvePoint[] = [{ x: 0, y: 0 }, { x: 255, y: 255 }];

export function defaultParams(): AdjustParams {
  return {
    brightness: 0, contrast: 0, saturation: 0, warmth: 0, exposure: 0,
    levels: { black: 0, white: 255, gamma: 1 },
    curve: IDENTITY_CURVE.map((p) => ({ ...p })),
    filter: 'none', filterAmount: 100,
  };
}

export const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'none', label: 'Original' }, { id: 'grayscale', label: 'Grayscale' }, { id: 'sepia', label: 'Sepia' },
  { id: 'vintage', label: 'Vintage' }, { id: 'cool', label: 'Cool' }, { id: 'warm', label: 'Warm' },
  { id: 'vivid', label: 'Vivid' }, { id: 'fade', label: 'Fade' }, { id: 'noir', label: 'Noir' }, { id: 'invert', label: 'Invert' },
];

export function isIdentity(p: AdjustParams): boolean {
  const curveFlat = p.curve.length === 2 && p.curve[0]?.x === 0 && p.curve[0]?.y === 0 && p.curve[1]?.x === 255 && p.curve[1]?.y === 255;
  return (
    p.brightness === 0 && p.contrast === 0 && p.saturation === 0 && p.warmth === 0 && p.exposure === 0 &&
    p.levels.black === 0 && p.levels.white === 255 && p.levels.gamma === 1 && curveFlat &&
    (p.filter === 'none' || p.filterAmount === 0)
  );
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * 256-entry lookup table through the given control points, using a monotone cubic (Fritsch-Carlson)
 * spline so the curve never overshoots between points. Points are sorted and de-duplicated by x.
 */
export function curveLut(points: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  const pts = [...points].sort((a, b) => a.x - b.x).filter((p, i, a) => i === 0 || p.x !== a[i - 1]?.x);
  if (pts.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  const n = pts.length;
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i] as CurvePoint, b = pts[i + 1] as CurvePoint;
    dx.push(b.x - a.x);
    m.push((b.y - a.y) / (b.x - a.x));
  }
  const t: number[] = [m[0] as number];
  for (let i = 1; i < n - 1; i++) {
    const m0 = m[i - 1] as number, m1 = m[i] as number;
    t.push(m0 * m1 <= 0 ? 0 : (m0 + m1) / 2);
  }
  t.push(m[n - 2] as number);
  for (let i = 0; i < n - 1; i++) {
    const mi = m[i] as number;
    if (mi === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = (t[i] as number) / mi, b = (t[i + 1] as number) / mi;
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * mi;
      t[i + 1] = k * b * mi;
    }
  }
  let seg = 0;
  for (let x = 0; x < 256; x++) {
    if (x <= (pts[0] as CurvePoint).x) { lut[x] = clamp255(Math.round((pts[0] as CurvePoint).y)); continue; }
    if (x >= (pts[n - 1] as CurvePoint).x) { lut[x] = clamp255(Math.round((pts[n - 1] as CurvePoint).y)); continue; }
    while (seg < n - 2 && x > (pts[seg + 1] as CurvePoint).x) seg++;
    const p0 = pts[seg] as CurvePoint, p1 = pts[seg + 1] as CurvePoint;
    const h = dx[seg] as number;
    const s = (x - p0.x) / h;
    const s2 = s * s, s3 = s2 * s;
    const y = (2 * s3 - 3 * s2 + 1) * p0.y + (s3 - 2 * s2 + s) * h * (t[seg] as number) + (-2 * s3 + 3 * s2) * p1.y + (s3 - s2) * h * (t[seg + 1] as number);
    lut[x] = clamp255(Math.round(y));
  }
  return lut;
}

/** Combined per-channel table for exposure, brightness, contrast, levels and the master curve. */
export function toneLut(p: AdjustParams): Uint8Array {
  const curve = curveLut(p.curve);
  const lut = new Uint8Array(256);
  const expo = Math.pow(2, p.exposure);
  const c = p.contrast * 2.55;
  const cf = (259 * (c + 255)) / (255 * (259 - c));
  const black = Math.min(p.levels.black, p.levels.white - 1);
  const range = Math.max(1, p.levels.white - black);
  const invGamma = 1 / Math.max(0.1, p.levels.gamma);
  for (let i = 0; i < 256; i++) {
    let v = clamp255(i * expo);
    v = clamp255(v + p.brightness * 2.55);
    v = clamp255(cf * (v - 128) + 128);
    v = 255 * Math.pow(clamp255(((v - black) / range) * 255) / 255, invGamma);
    lut[i] = curve[Math.round(clamp255(v))] as number;
  }
  return lut;
}

function filterPixel(id: FilterId, r: number, g: number, b: number): [number, number, number] {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  switch (id) {
    case 'grayscale': return [lum, lum, lum];
    case 'noir': { const v = clamp255((lum - 128) * 1.4 + 120); return [v, v, v]; }
    case 'sepia': return [0.393 * r + 0.769 * g + 0.189 * b, 0.349 * r + 0.686 * g + 0.168 * b, 0.272 * r + 0.534 * g + 0.131 * b];
    case 'vintage': return [0.5 * r + 0.5 * lum + 25, 0.5 * g + 0.5 * lum + 8, 0.45 * b + 0.4 * lum - 5];
    case 'cool': return [r * 0.92, g, b * 1.1 + 8];
    case 'warm': return [r * 1.08 + 8, g * 1.02, b * 0.9];
    case 'vivid': return [lum + (r - lum) * 1.5, lum + (g - lum) * 1.5, lum + (b - lum) * 1.5];
    case 'fade': return [r * 0.85 + 38, g * 0.85 + 38, b * 0.85 + 40];
    case 'invert': return [255 - r, 255 - g, 255 - b];
    default: return [r, g, b];
  }
}

/** Applies the adjustments to RGBA data in place. Alpha is never changed. */
export function applyAdjust(data: Uint8ClampedArray, p: AdjustParams): void {
  if (isIdentity(p)) return;
  const lut = toneLut(p);
  const sat = 1 + p.saturation / 100;
  const warm = p.warmth / 100;
  const filterMix = p.filter === 'none' ? 0 : p.filterAmount / 100;
  const doColor = sat !== 1 || warm !== 0;
  for (let i = 0; i < data.length; i += 4) {
    let r = lut[data[i] as number] as number;
    let g = lut[data[i + 1] as number] as number;
    let b = lut[data[i + 2] as number] as number;
    if (doColor) {
      if (sat !== 1) {
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        r = lum + (r - lum) * sat;
        g = lum + (g - lum) * sat;
        b = lum + (b - lum) * sat;
      }
      if (warm !== 0) {
        r += warm * 30;
        b -= warm * 30;
      }
    }
    if (filterMix > 0) {
      const f = filterPixel(p.filter, clamp255(r), clamp255(g), clamp255(b));
      r += (f[0] - r) * filterMix;
      g += (f[1] - g) * filterMix;
      b += (f[2] - b) * filterMix;
    }
    data[i] = clamp255(r);
    data[i + 1] = clamp255(g);
    data[i + 2] = clamp255(b);
  }
}

/** Auto-levels: black/white points at the given percentile clip of the luminance histogram. */
export function autoLevels(data: Uint8ClampedArray, clipPercent = 0.5): { black: number; white: number } {
  const hist = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] as number) === 0) continue;
    hist[Math.round(0.299 * (data[i] as number) + 0.587 * (data[i + 1] as number) + 0.114 * (data[i + 2] as number))]!++;
    total++;
  }
  if (!total) return { black: 0, white: 255 };
  const clip = (total * clipPercent) / 100;
  let acc = 0, black = 0, white = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v] as number; if (acc > clip) { black = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v] as number; if (acc > clip) { white = v; break; } }
  if (white <= black) return { black: 0, white: 255 };
  return { black, white };
}
