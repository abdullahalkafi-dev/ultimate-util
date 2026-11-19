import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  lightColor,
  parsePresets,
  sanitizeSettings,
  stageStyle,
  stepBrightness,
  stepKelvin,
  type SoftboxSettings,
} from './softbox';

const base: SoftboxSettings = { ...DEFAULT_SETTINGS, mode: 'color', color: '#ff0000', brightness: 100 };

describe('lightColor', () => {
  it('color mode without warmth is the plain color', () => {
    expect(lightColor(base)).toEqual({ r: 255, g: 0, b: 0 });
  });
  it('scales by brightness', () => {
    expect(lightColor({ ...base, brightness: 50 }).r).toBeCloseTo(127.5);
  });
  it('warm mode starts from white and applies only kelvin', () => {
    const c = lightColor({ ...DEFAULT_SETTINGS, mode: 'warm', kelvin: 2700, brightness: 100 });
    expect(c.r).toBe(255);
    expect(c.b).toBeLessThan(c.g);
    expect(c.g).toBeLessThan(c.r);
  });
  it('applyWarmth multiplies the base color', () => {
    const c = lightColor({ ...base, color: '#ffffff', applyWarmth: true, kelvin: 2000 });
    expect(c.b).toBeLessThan(100);
  });
});

describe('stageStyle', () => {
  it('flat is a solid color', () => {
    expect(stageStyle({ ...base, shape: 'flat' }).background).toBe('rgb(255 0 0)');
  });
  it('vignette never has a hard edge (at least 10 points of falloff, within 100%)', () => {
    for (const softness of [0, 10, 50, 100]) {
      for (const size of [20, 60, 100]) {
        const css = stageStyle({ ...base, shape: 'vignette', softness, size }).background;
        const stops = [...(css.split('at 50% 50%,')[1] ?? '').matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]));
        const inner = stops[1] ?? 0; // stops: 0%, inner%, outer%
        const outer = stops[2] ?? 0;
        expect(outer - inner).toBeGreaterThanOrEqual(10 - 1e-9);
        expect(outer).toBeLessThanOrEqual(100);
      }
    }
  });
  it('ring has monotonic stops', () => {
    const css = stageStyle({ ...base, shape: 'ring', size: 80, softness: 30 }).background;
    const stops = [...(css.split('at 50% 50%,')[1] ?? '').matchAll(/(-?\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]));
    expect(stops).toEqual([...stops].sort((a, b) => a - b));
    expect(stops[0]).toBeGreaterThanOrEqual(0);
  });
  it('panel returns an element description on a dark background', () => {
    const s = stageStyle({ ...base, shape: 'panel', size: 60 });
    expect(s.background).toBe('#0b0b0b');
    expect(s.panel?.inset).toBe('20%');
  });
});

describe('sanitize and presets', () => {
  it('clamps and defaults bad values', () => {
    const s = sanitizeSettings({ kelvin: 99999, brightness: 0, shape: 'nope', color: 'banana', softness: 1 });
    expect(s.kelvin).toBe(10000);
    expect(s.brightness).toBe(5);
    expect(s.shape).toBe(DEFAULT_SETTINGS.shape);
    expect(s.color).toBe(DEFAULT_SETTINGS.color);
    expect(s.softness).toBe(10);
  });
  it('survives non-objects', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parsePresets('x')).toEqual([]);
    expect(parsePresets([{ id: 1 }, { id: 'a', name: 'Warm', settings: { kelvin: 3000 } }])).toHaveLength(1);
  });
  it('steps stay in range', () => {
    expect(stepBrightness(98, 5)).toBe(100);
    expect(stepBrightness(6, -5)).toBe(5);
    expect(stepKelvin(1050, -100)).toBe(1000);
    expect(stepKelvin(9950, 100)).toBe(10000);
  });
});
