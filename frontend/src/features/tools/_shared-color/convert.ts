import { parse, rgb as toCuloriRgb } from 'culori';

/** Channels 0..255 (may be fractional while converting; round only for display). */
export interface RGB {
  r: number;
  g: number;
  b: number;
}
export interface HSL {
  h: number; // 0..360
  s: number; // 0..100
  l: number; // 0..100
}
export interface OKLCH {
  l: number; // 0..1
  c: number; // 0..~0.4
  h: number; // 0..360
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const byte = (v: number) => Math.round(clamp(v, 0, 255));
export const mod360 = (h: number) => ((h % 360) + 360) % 360;

export function round(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function rgbToHex(c: RGB, alpha = 1): string {
  const part = (v: number) => byte(v).toString(16).padStart(2, '0');
  const a = alpha < 1 ? part(alpha * 255) : '';
  return `#${part(c.r)}${part(c.g)}${part(c.b)}${a}`;
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: mod360(h * 60), s: clamp(s, 0, 1) * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const S = clamp(s, 0, 100) / 100, L = clamp(l, 0, 100) / 100;
  const k = (n: number) => (n + mod360(h) / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => (L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255;
  return { r: f(0), g: f(8), b: f(4) };
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklch({ r, g, b }: RGB): OKLCH {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(a, bb);
  // Near-achromatic colors have no meaningful hue.
  return { l: L, c: c < 1e-4 ? 0 : c, h: c < 1e-4 ? 0 : mod360((Math.atan2(bb, a) * 180) / Math.PI) };
}

/** Unclamped sRGB channels (0..255) for an OKLCH color; may fall outside the gamut. */
function oklchRaw({ l: L, c, h }: OKLCH): RGB {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad), b = c * Math.sin(rad);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

const EPS = 0.5; // channel tolerance (of 255) before a color counts as out of gamut
const inGamut = (c: RGB) => [c.r, c.g, c.b].every((v) => v >= -EPS && v <= 255 + EPS);

export function clampRgb(c: RGB): RGB {
  return { r: clamp(c.r, 0, 255), g: clamp(c.g, 0, 255), b: clamp(c.b, 0, 255) };
}

export interface GamutResult {
  rgb: RGB;
  /** True when chroma had to be reduced to fit sRGB. */
  clipped: boolean;
}

/** OKLCH to sRGB. Out-of-gamut colors keep lightness and hue and lose chroma (bisection). */
export function oklchToRgb(color: OKLCH): GamutResult {
  const base = { l: clamp(color.l, 0, 1), c: Math.max(0, color.c), h: color.h };
  const raw = oklchRaw(base);
  if (inGamut(raw)) return { rgb: clampRgb(raw), clipped: false };
  let lo = 0, hi = base.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchRaw({ ...base, c: mid }))) lo = mid;
    else hi = mid;
  }
  return { rgb: clampRgb(oklchRaw({ ...base, c: lo })), clipped: true };
}

export const formatRgb = (c: RGB, alpha = 1) =>
  alpha < 1
    ? `rgb(${byte(c.r)} ${byte(c.g)} ${byte(c.b)} / ${round(alpha, 2)})`
    : `rgb(${byte(c.r)}, ${byte(c.g)}, ${byte(c.b)})`;

export function formatHsl(c: RGB, alpha = 1): string {
  const { h, s, l } = rgbToHsl(c);
  const [H, S, L] = [Math.round(h), Math.round(s), Math.round(l)];
  return alpha < 1 ? `hsl(${H} ${S}% ${L}% / ${round(alpha, 2)})` : `hsl(${H}, ${S}%, ${L}%)`;
}

export function formatOklch(c: RGB, alpha = 1): string {
  const { l, c: ch, h } = rgbToOklch(c);
  return `oklch(${round(l * 100, 1)}% ${round(ch, 3)} ${round(h, 1)}${alpha < 1 ? ` / ${round(alpha, 2)}` : ''})`;
}

export interface ParsedColor {
  rgb: RGB;
  alpha: number;
  /** Channels were out of range and clamped, or OKLCH was gamut-mapped. */
  adjusted: boolean;
}
export type ParseResult = ({ ok: true } & ParsedColor) | { ok: false; error: string };

const BARE_HEX = /^[0-9a-f]+$/i;

/** Parses HEX (3/4/6/8, with or without #), rgb(), hsl(), oklch() and CSS names. */
export function parseColor(input: string): ParseResult {
  const text = input.trim();
  if (!text) return { ok: false, error: 'Enter a color, for example #ff9a3c.' };
  if (/[^\x20-\x7e]/.test(text)) return { ok: false, error: 'Use plain ASCII characters only.' };
  const candidate = BARE_HEX.test(text) && [3, 4, 6, 8].includes(text.length) ? `#${text}` : text.toLowerCase();
  const parsed = parse(candidate);
  if (!parsed) return { ok: false, error: 'Not a valid color. Try #ff9a3c, rgb(255, 154, 60) or oklch(75% 0.15 60).' };
  const alpha = clamp(parsed.alpha ?? 1, 0, 1);
  if (parsed.mode === 'oklch') {
    const { rgb, clipped } = oklchToRgb({ l: Number(parsed.l), c: Number(parsed.c ?? 0), h: Number(parsed.h ?? 0) });
    return { ok: true, rgb, alpha, adjusted: clipped };
  }
  const raw = toCuloriRgb(parsed);
  if (!raw || [raw.r, raw.g, raw.b].some((v) => !Number.isFinite(v))) return { ok: false, error: 'Not a valid color.' };
  const scaled = { r: raw.r * 255, g: raw.g * 255, b: raw.b * 255 };
  // Tiny float overshoot from conversions is not a user-visible adjustment.
  const adjusted = [scaled.r, scaled.g, scaled.b].some((v) => v < -0.5 || v > 255.5);
  return { ok: true, rgb: clampRgb(scaled), alpha, adjusted };
}

/** Convenience for places that already hold a valid color string. */
export function hexToRgb(hex: string): RGB | null {
  const p = parseColor(hex);
  return p.ok ? p.rgb : null;
}

/** Cheap gamut test used when painting the OKLCH wheel (no chroma search). */
export function oklchInGamut(color: OKLCH): boolean {
  return inGamut(oklchRaw(color));
}
