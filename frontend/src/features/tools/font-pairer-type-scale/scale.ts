export const RATIO_PRESETS = [
  { id: 'minor-second', label: 'Minor second', value: 1.067 },
  { id: 'major-second', label: 'Major second', value: 1.125 },
  { id: 'minor-third', label: 'Minor third', value: 1.2 },
  { id: 'major-third', label: 'Major third', value: 1.25 },
  { id: 'perfect-fourth', label: 'Perfect fourth', value: 1.333 },
  { id: 'augmented-fourth', label: 'Augmented fourth', value: 1.414 },
  { id: 'perfect-fifth', label: 'Perfect fifth', value: 1.5 },
  { id: 'golden', label: 'Golden ratio', value: 1.618 },
] as const;

export const ROOT_PX = 16;

export interface FluidInput {
  minViewport: number;
  maxViewport: number;
  /** Base size at the smallest viewport. */
  minBase: number;
  /** Base size at the largest viewport. */
  maxBase: number;
  minRatio: number;
  maxRatio: number;
}

export interface ScaleInput {
  base: number;
  ratio: number;
  minStep: number;
  maxStep: number;
  roundToPixel: boolean;
  fluid: FluidInput | null;
}

export interface ScaleStep {
  step: number;
  px: number;
  rem: number;
  /** Unitless line height suggestion. */
  lineHeight: number;
  /** Only in fluid mode. */
  minPx?: number;
  maxPx?: number;
  clamp?: string;
  /** Value to put in CSS: `1.25rem` or `clamp(...)`. */
  css: string;
}

export const DEFAULT_SCALE: ScaleInput = {
  base: 16,
  ratio: 1.25,
  minStep: -2,
  maxStep: 6,
  roundToPixel: false,
  fluid: null,
};

export const DEFAULT_FLUID: FluidInput = {
  minViewport: 320,
  maxViewport: 1240,
  minBase: 16,
  maxBase: 20,
  minRatio: 1.2,
  maxRatio: 1.25,
};

/** Rounds to at most `digits` decimals and drops trailing zeros. */
export function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export const fmt = (n: number, digits = 3) => String(round(n, digits));

/** Returns a list of human-readable problems; empty when the input is valid. */
export function validateScale(i: ScaleInput): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(i.base) || i.base < 10 || i.base > 32) errors.push('Base size must be between 10 and 32 px.');
  if (!Number.isFinite(i.ratio) || i.ratio < 1.01 || i.ratio > 2) errors.push('Ratio must be between 1.01 and 2.');
  if (!Number.isInteger(i.minStep) || !Number.isInteger(i.maxStep) || i.minStep > i.maxStep) errors.push('The first step must not be above the last step.');
  if (i.minStep < -6 || i.maxStep > 12) errors.push('Steps must stay between -6 and 12.');
  if (i.fluid) {
    const f = i.fluid;
    if (!(f.minViewport > 0) || !(f.maxViewport > 0)) errors.push('Viewport widths must be positive.');
    else if (f.minViewport >= f.maxViewport) errors.push('Minimum viewport must be smaller than the maximum viewport (try swapping them).');
    for (const r of [f.minRatio, f.maxRatio]) if (!Number.isFinite(r) || r < 1.01 || r > 2) errors.push('Fluid ratios must be between 1.01 and 2.');
    for (const b of [f.minBase, f.maxBase]) if (!Number.isFinite(b) || b < 10 || b > 32) errors.push('Fluid base sizes must be between 10 and 32 px.');
  }
  return [...new Set(errors)];
}

/** Body text gets 1.5, large display text tightens toward 1.1 (linear between 16 and 64 px). */
export function lineHeightFor(px: number): number {
  if (px <= 16) return 1.5;
  if (px >= 64) return 1.1;
  return round(1.5 - ((px - 16) / 48) * 0.4, 2);
}

/** `clamp(min, intercept + slope*vw, max)`; the rem term keeps text zoomable (WCAG 1.4.4). */
export function fluidClamp(minPx: number, maxPx: number, f: Pick<FluidInput, 'minViewport' | 'maxViewport'>): string {
  const minRem = minPx / ROOT_PX;
  const maxRem = maxPx / ROOT_PX;
  if (Math.abs(maxPx - minPx) < 0.0005) return `${fmt(minRem)}rem`;
  const slope = (maxPx - minPx) / (f.maxViewport - f.minViewport);
  const interceptPx = minPx - slope * f.minViewport;
  const lo = Math.min(minRem, maxRem);
  const hi = Math.max(minRem, maxRem);
  const sign = interceptPx < 0 ? '-' : '+';
  return `clamp(${fmt(lo)}rem, ${fmt(Math.abs(interceptPx) / ROOT_PX)}rem ${sign} ${fmt(slope * 100)}vw, ${fmt(hi)}rem)`;
}

export function computeScale(i: ScaleInput): ScaleStep[] {
  const steps: ScaleStep[] = [];
  for (let n = i.minStep; n <= i.maxStep; n++) {
    let px = i.base * i.ratio ** n;
    if (i.roundToPixel) px = Math.round(px);
    const rem = px / ROOT_PX;
    const step: ScaleStep = { step: n, px: round(px), rem: round(rem), lineHeight: lineHeightFor(px), css: `${fmt(rem)}rem` };
    if (i.fluid) {
      const f = i.fluid;
      let lo = f.minBase * f.minRatio ** n;
      let hi = f.maxBase * f.maxRatio ** n;
      if (i.roundToPixel) {
        lo = Math.round(lo);
        hi = Math.round(hi);
      }
      step.minPx = round(lo);
      step.maxPx = round(hi);
      step.clamp = fluidClamp(lo, hi, f);
      step.css = step.clamp;
      step.px = round(hi);
      step.rem = round(hi / ROOT_PX);
      step.lineHeight = lineHeightFor(hi);
    }
    steps.push(step);
  }
  return steps;
}

/** Fluid size at a given viewport width, in px (used by tests and the preview). */
export function fluidSizeAt(minPx: number, maxPx: number, f: Pick<FluidInput, 'minViewport' | 'maxViewport'>, viewport: number): number {
  const slope = (maxPx - minPx) / (f.maxViewport - f.minViewport);
  const v = minPx + slope * (viewport - f.minViewport);
  return Math.min(Math.max(v, Math.min(minPx, maxPx)), Math.max(minPx, maxPx));
}

const TSHIRT: Record<number, string> = { [-3]: '2xs', [-2]: 'xs', [-1]: 'sm', 0: 'base', 1: 'lg', 2: 'xl', 3: '2xl', 4: '3xl', 5: '4xl', 6: '5xl', 7: '6xl', 8: '7xl', 9: '8xl', 10: '9xl' };

export type Naming = 'step' | 'tshirt';

export function stepName(step: number, naming: Naming): string {
  if (naming === 'tshirt') return TSHIRT[step] ?? `step-${step}`;
  return `step-${step}`;
}

export type ScaleFormat = 'css-vars' | 'plain-css' | 'tailwind-v4' | 'tailwind-v3' | 'json';

export interface ExportOptions {
  format: ScaleFormat;
  naming: Naming;
  /** Prefix for CSS variable names, default "step" style: --step-0. */
  prefix: string;
}

const lh = (s: ScaleStep) => fmt(s.lineHeight, 2);

export function exportScale(steps: ScaleStep[], o: ExportOptions): string {
  const name = (s: ScaleStep) => stepName(s.step, o.naming);
  switch (o.format) {
    case 'css-vars': {
      const p = o.prefix ? `${o.prefix}-` : '';
      const lines = steps.flatMap((s) => [`  --${p}${name(s)}: ${s.css};`, `  --${p}${name(s)}-lh: ${lh(s)};`]);
      return `:root {\n${lines.join('\n')}\n}\n`;
    }
    case 'plain-css':
      return steps.map((s) => `.text-${name(s)} {\n  font-size: ${s.css};\n  line-height: ${lh(s)};\n}`).join('\n\n') + '\n';
    case 'tailwind-v4': {
      const lines = steps.flatMap((s) => [`  --text-${name(s)}: ${s.css};`, `  --text-${name(s)}--line-height: ${lh(s)};`]);
      return `@theme {\n${lines.join('\n')}\n}\n`;
    }
    case 'tailwind-v3': {
      const body = steps.map((s) => `        '${name(s)}': ['${s.css}', { lineHeight: '${lh(s)}' }],`).join('\n');
      return `// tailwind.config.js\nmodule.exports = {\n  theme: {\n    extend: {\n      fontSize: {\n${body}\n      },\n    },\n  },\n};\n`;
    }
    case 'json':
      return JSON.stringify(Object.fromEntries(steps.map((s) => [name(s), { size: s.css, lineHeight: s.lineHeight }])), null, 2) + '\n';
  }
}
