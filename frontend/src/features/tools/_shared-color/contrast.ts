import { clamp, oklchToRgb, rgbToOklch, type RGB } from './convert';

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x relative luminance of an opaque sRGB color. */
export function relativeLuminance({ r, g, b }: RGB): number {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, 1..21, unrounded. */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Truncates (never rounds) to 2 decimals so a displayed value cannot imply a pass: 4.499 -> "4.49". */
export function formatRatio(ratio: number): string {
  return (Math.floor(ratio * 100 + 1e-9) / 100).toFixed(2);
}

export type TextKind = 'normal' | 'large' | 'ui';
export type Level = 'AA' | 'AAA';

/** Large text: 24 px regular or 18.66 px (14 pt) bold and up. */
export function isLargeText(px: number, bold: boolean): boolean {
  return px >= 24 || (bold && px >= 18.66);
}

/** Required ratio, or null where WCAG 2.x defines no such level (no AAA for UI components). */
export function requiredRatio(kind: TextKind, level: Level): number | null {
  if (kind === 'ui') return level === 'AA' ? 3 : null;
  if (kind === 'large') return level === 'AA' ? 3 : 4.5;
  return level === 'AA' ? 4.5 : 7;
}

/** Pass/fail uses the unrounded ratio. */
export function passes(ratio: number, kind: TextKind, level: Level): boolean | null {
  const need = requiredRatio(kind, level);
  return need === null ? null : ratio >= need;
}

/** Composites a translucent color over an opaque backdrop. */
export function compositeOver(fg: RGB, alpha: number, bg: RGB): RGB {
  const a = clamp(alpha, 0, 1);
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) };
}

export interface Suggestion {
  rgb: RGB;
  ratio: number;
  /** Gamut mapping reduced chroma to reach this color. */
  chromaReduced: boolean;
  /** Black or white fallback because no lightness at this hue passes. */
  fallback: boolean;
}

const rounded = (c: RGB): RGB => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) });

/**
 * Nearest passing foregrounds: keeps hue and chroma, walks OKLCH lightness up and down in
 * small steps and re-checks the real WCAG ratio on the final 8-bit color.
 */
export function suggestFixes(fg: RGB, bg: RGB, threshold: number): Suggestion[] {
  const start = rgbToOklch(fg);
  const out: Suggestion[] = [];
  for (const dir of [1, -1]) {
    for (let step = 1; step <= 220; step++) {
      const l = start.l + dir * step * 0.005;
      if (l < 0 || l > 1) break;
      const mapped = oklchToRgb({ ...start, l });
      const rgb = rounded(mapped.rgb);
      const ratio = contrastRatio(rgb, bg);
      if (ratio >= threshold) {
        out.push({ rgb, ratio, chromaReduced: mapped.clipped, fallback: false });
        break;
      }
    }
  }
  if (out.length === 0) {
    for (const rgb of [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }]) {
      const ratio = contrastRatio(rgb, bg);
      if (ratio >= threshold) out.push({ rgb, ratio, chromaReduced: false, fallback: true });
    }
  }
  const dist = (c: RGB) => Math.abs(rgbToOklch(c).l - start.l);
  return out.sort((a, b) => dist(a.rgb) - dist(b.rgb));
}
