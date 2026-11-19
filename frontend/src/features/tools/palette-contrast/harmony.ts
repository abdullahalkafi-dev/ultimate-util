import {
  clamp,
  hslToRgb,
  mod360,
  oklchToRgb,
  rgbToHex,
  rgbToHsl,
  rgbToOklch,
  type OKLCH,
  type RGB,
} from '../_shared-color/convert';

export type Harmony = 'analogous' | 'complementary' | 'triadic' | 'tetradic' | 'split' | 'monochrome';
export type HarmonySpace = 'oklch' | 'hsl';

export const HARMONIES: { id: Harmony; label: string }[] = [
  { id: 'analogous', label: 'Analogous' },
  { id: 'complementary', label: 'Complementary' },
  { id: 'triadic', label: 'Triadic' },
  { id: 'tetradic', label: 'Tetradic' },
  { id: 'split', label: 'Split' },
  { id: 'monochrome', label: 'Monochrome' },
];

export const MIN_COLORS = 3;
export const MAX_COLORS = 10;

export interface Generated {
  rgb: RGB;
  hex: string;
  /** Target OKLCH before gamut mapping and 8-bit rounding (used to verify hue offsets). */
  lch: OKLCH;
  clipped: boolean;
}

const FIXED_OFFSETS: Record<Exclude<Harmony, 'analogous' | 'monochrome'>, number[]> = {
  complementary: [0, 180],
  triadic: [0, 120, 240],
  tetradic: [0, 90, 180, 270],
  split: [0, 150, 210],
};

/** Hue offsets (degrees) from the base hue for each of `count` swatches. Monochrome keeps the hue. */
export function hueOffsets(harmony: Harmony, count: number): number[] {
  if (harmony === 'monochrome') return Array.from({ length: count }, () => 0);
  if (harmony === 'analogous') {
    // Always contains 0 and spreads by 30 degrees: 3 -> -30, 0, 30.
    const start = -Math.floor((count - 1) / 2) * 30;
    return Array.from({ length: count }, (_, i) => start + i * 30);
  }
  const base = FIXED_OFFSETS[harmony];
  return Array.from({ length: count }, (_, i) => base[i % base.length] ?? 0);
}

export function generatePalette(
  baseRgb: RGB,
  harmony: Harmony,
  count: number,
  space: HarmonySpace = 'oklch',
): Generated[] {
  const n = clamp(Math.round(count), 1, MAX_COLORS);
  const base = rgbToOklch(baseRgb);
  const offsets = hueOffsets(harmony, n);

  if (harmony === 'monochrome') {
    return offsets.map((_, i) => {
      const t = n === 1 ? 0 : i / (n - 1);
      const lch: OKLCH = {
        l: clamp(0.95 - 0.7 * t, 0.05, 0.97),
        c: base.c * (1 - 0.5 * (2 * t - 1) ** 2),
        h: base.h,
      };
      return fromLch(lch);
    });
  }

  const cycle = harmony === 'analogous' ? n : FIXED_OFFSETS[harmony].length;
  return offsets.map((offset, i) => {
    if (i === 0 && harmony !== 'analogous') return fromRgb(baseRgb, base);
    const round = Math.floor(i / cycle);
    // Extra rounds reuse the hues at alternating lighter and darker steps.
    const shift = round === 0 ? 0 : (round % 2 === 1 ? 1 : -1) * 0.1 * Math.ceil(round / 2);
    if (space === 'hsl') {
      const hsl = rgbToHsl(baseRgb);
      const rgb = hslToRgb({ h: hsl.h + offset, s: hsl.s, l: clamp(hsl.l + shift * 100, 8, 95) });
      return { rgb, hex: rgbToHex(rgb), lch: rgbToOklch(rgb), clipped: false };
    }
    return fromLch({ l: clamp(base.l + shift, 0.2, 0.95), c: base.c, h: mod360(base.h + offset) });
  });
}

function fromRgb(rgb: RGB, lch: OKLCH): Generated {
  return { rgb, hex: rgbToHex(rgb), lch, clipped: false };
}

function fromLch(lch: OKLCH): Generated {
  const { rgb, clipped } = oklchToRgb(lch);
  return { rgb, hex: rgbToHex(rgb), lch, clipped };
}

export interface Swatch {
  hex: string;
  locked: boolean;
  /** Optional user-given name, used as the export key. */
  name?: string;
}

/** A random pleasant base color: mid lightness, moderate chroma. */
export function randomBase(rng: () => number = Math.random): RGB {
  return oklchToRgb({ l: 0.55 + rng() * 0.25, c: 0.08 + rng() * 0.12, h: rng() * 360 }).rgb;
}

/** Fits swatches to `count`, dropping unlocked ones from the end first. */
export function fitCount(items: Swatch[], count: number): Swatch[] {
  const out = [...items];
  for (let i = out.length - 1; i >= 0 && out.length > count; i--) {
    if (!out[i]?.locked) out.splice(i, 1);
  }
  return out.slice(0, Math.max(count, out.filter((s) => s.locked).length));
}

/** Replaces unlocked swatches with a fresh palette; locked ones never change. */
export function applyGenerated(items: Swatch[], generated: Generated[], count: number): Swatch[] {
  const fitted = fitCount(items, count);
  const out: Swatch[] = [];
  const length = Math.max(count, fitted.length);
  for (let i = 0; i < length; i++) {
    const existing = fitted[i];
    if (existing?.locked) out.push(existing);
    else out.push({ hex: generated[i % generated.length]?.hex ?? '#808080', locked: false, name: existing?.name });
  }
  return out;
}

export function shuffle(
  items: Swatch[],
  harmony: Harmony,
  count: number,
  space: HarmonySpace,
  rng: () => number = Math.random,
): Swatch[] {
  return applyGenerated(items, generatePalette(randomBase(rng), harmony, count, space), count);
}

/** Tailwind-style 50..900 scale where the given color sits at 500. */
export const SHADE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

export function shadeScale(rgb: RGB): { step: number; hex: string }[] {
  const base = rgbToOklch(rgb);
  const top = 0.97, bottom = 0.25;
  return SHADE_STEPS.map((step, i) => {
    if (step === 500) return { step, hex: rgbToHex(rgb) };
    const l =
      i < 5
        ? top - ((top - base.l) * i) / 5
        : base.l - ((base.l - bottom) * (i - 5)) / 4;
    const mapped = oklchToRgb({ l: clamp(l, 0.05, 0.97), c: base.c, h: base.h });
    return { step, hex: rgbToHex(mapped.rgb) };
  });
}
