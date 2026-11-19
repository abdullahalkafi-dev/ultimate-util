import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLUID,
  DEFAULT_SCALE,
  computeScale,
  exportScale,
  fluidClamp,
  fluidSizeAt,
  lineHeightFor,
  stepName,
  validateScale,
} from './scale';

describe('computeScale', () => {
  it('matches 16px at 1.25: 16, 20, 25, 31.25, 39.0625', () => {
    const s = computeScale({ ...DEFAULT_SCALE, minStep: 0, maxStep: 4 });
    expect(s.map((x) => x.px)).toEqual([16, 20, 25, 31.25, 39.063]);
    expect(s[1]?.rem).toBe(1.25);
    expect(s[0]?.css).toBe('1rem');
  });
  it('supports negative steps', () => {
    const s = computeScale({ ...DEFAULT_SCALE, minStep: -2, maxStep: 0 });
    expect(s[0]?.px).toBe(10.24);
    expect(s).toHaveLength(3);
  });
  it('rounds to whole pixels on request', () => {
    const s = computeScale({ ...DEFAULT_SCALE, minStep: 0, maxStep: 3, roundToPixel: true });
    expect(s.map((x) => x.px)).toEqual([16, 20, 25, 31]);
  });
});

describe('fluid', () => {
  const f = { minViewport: 320, maxViewport: 1240 };
  it('uses clamp with a rem term and matches both endpoints', () => {
    const c = fluidClamp(16, 20, f);
    expect(c).toMatch(/^clamp\(1rem, .*rem [+-] .*vw, 1\.25rem\)$/);
    expect(fluidSizeAt(16, 20, f, 320)).toBeCloseTo(16);
    expect(fluidSizeAt(16, 20, f, 1240)).toBeCloseTo(20);
    expect(fluidSizeAt(16, 20, f, 100)).toBe(16);
    expect(fluidSizeAt(16, 20, f, 3000)).toBe(20);
  });
  it('computes intercept and slope correctly', () => {
    // slope = 4/920 px per px = 0.4348vw, intercept = 16 - 320*4/920 = 14.6087px = 0.913rem
    expect(fluidClamp(16, 20, f)).toBe('clamp(1rem, 0.913rem + 0.435vw, 1.25rem)');
  });
  it('collapses to a static value when min equals max', () => {
    expect(fluidClamp(16, 16, f)).toBe('1rem');
  });
  it('orders clamp bounds when the size shrinks with width', () => {
    expect(fluidClamp(20, 16, f)).toMatch(/^clamp\(1rem, .*, 1\.25rem\)$/);
  });
  it('produces per-step clamps', () => {
    const s = computeScale({ ...DEFAULT_SCALE, minStep: 0, maxStep: 1, fluid: DEFAULT_FLUID });
    expect(s[0]?.clamp).toContain('clamp(');
    expect(s[1]?.minPx).toBe(19.2);
    expect(s[1]?.maxPx).toBe(25);
  });
});

describe('validateScale', () => {
  it('accepts defaults and rejects bad values', () => {
    expect(validateScale(DEFAULT_SCALE)).toEqual([]);
    expect(validateScale({ ...DEFAULT_SCALE, base: 0 })).not.toEqual([]);
    expect(validateScale({ ...DEFAULT_SCALE, ratio: 1 })).not.toEqual([]);
    expect(validateScale({ ...DEFAULT_SCALE, ratio: Number.NaN })).not.toEqual([]);
    expect(validateScale({ ...DEFAULT_SCALE, minStep: 3, maxStep: 1 })).not.toEqual([]);
  });
  it('flags a fluid min viewport above the max', () => {
    const e = validateScale({ ...DEFAULT_SCALE, fluid: { ...DEFAULT_FLUID, minViewport: 1300, maxViewport: 400 } });
    expect(e.join(' ')).toMatch(/swapping/);
  });
});

describe('line height', () => {
  it('tightens with size', () => {
    expect(lineHeightFor(16)).toBe(1.5);
    expect(lineHeightFor(40)).toBe(1.3);
    expect(lineHeightFor(100)).toBe(1.1);
  });
});

describe('export', () => {
  const steps = computeScale({ ...DEFAULT_SCALE, minStep: 0, maxStep: 1 });
  it('writes css variables', () => {
    const css = exportScale(steps, { format: 'css-vars', naming: 'step', prefix: '' });
    expect(css).toContain('--step-0: 1rem;');
    expect(css).toContain('--step-1: 1.25rem;');
    expect(css.startsWith(':root {')).toBe(true);
  });
  it('writes tailwind v4 and v3', () => {
    expect(exportScale(steps, { format: 'tailwind-v4', naming: 'tshirt', prefix: '' })).toContain('--text-lg: 1.25rem;');
    const v3 = exportScale(steps, { format: 'tailwind-v3', naming: 'step', prefix: '' });
    expect(v3).toContain("'step-1': ['1.25rem', { lineHeight: '1.47' }]");
    expect(() => new Function(`const module = {}; ${v3}`)).not.toThrow();
  });
  it('writes valid json', () => {
    const j = JSON.parse(exportScale(steps, { format: 'json', naming: 'tshirt', prefix: '' })) as Record<string, { size: string }>;
    expect(j.base?.size).toBe('1rem');
  });
  it('names steps', () => {
    expect(stepName(-2, 'tshirt')).toBe('xs');
    expect(stepName(11, 'tshirt')).toBe('step-11');
  });
});
