import { describe, expect, it } from 'vitest';
import {
  formatHsl,
  formatOklch,
  formatRgb,
  hslToRgb,
  oklchToRgb,
  parseColor,
  rgbToHex,
  rgbToHsl,
  rgbToOklch,
} from './convert';
import { compositeOver, contrastRatio, formatRatio, isLargeText, passes, suggestFixes } from './contrast';
import { kelvinToRgb } from './kelvin';

const hex = (h: string) => {
  const p = parseColor(h);
  if (!p.ok) throw new Error(h);
  return p.rgb;
};

describe('parseColor', () => {
  it('accepts 3, 4, 6 and 8 digit hex, with or without #', () => {
    expect(rgbToHex(hex('#f60'))).toBe('#ff6600');
    expect(rgbToHex(hex('ff9a3c'))).toBe('#ff9a3c');
    const p = parseColor('#f608');
    expect(p.ok && Math.round(p.alpha * 100)).toBe(53);
    expect(parseColor('#ff9a3c80').ok).toBe(true);
  });
  it('trims and ignores case', () => {
    expect(rgbToHex(hex(' RGB(1 2 3) '))).toBe('#010203');
    expect(rgbToHex(hex('  #FF9A3C '))).toBe('#ff9a3c');
  });
  it('rejects bad input and full-width characters', () => {
    for (const bad of ['#12', 'banana', '#gg0000', 'rgb(1,2)', '＃FF9A3C', '']) expect(parseColor(bad).ok).toBe(false);
  });
  it('clamps out-of-range rgb and flags it', () => {
    const p = parseColor('rgb(300, 0, 0)');
    expect(p.ok && p.rgb.r).toBe(255);
    expect(p.ok && p.adjusted).toBe(true);
  });
  it('resolves names and hsl', () => {
    expect(rgbToHex(hex('rebeccapurple'))).toBe('#663399');
    expect(rgbToHex(hex('hsl(0, 100%, 50%)'))).toBe('#ff0000');
  });
  it('gamut-maps out-of-gamut oklch', () => {
    const p = parseColor('oklch(70% 0.4 150)');
    expect(p.ok && p.adjusted).toBe(true);
  });
});

describe('conversions', () => {
  it('round-trips hsl and oklch within rounding', () => {
    for (const h of ['#ff9a3c', '#3a7bd5', '#123456', '#ffffff', '#000000', '#808080']) {
      const c = hex(h);
      expect(rgbToHex(hslToRgb(rgbToHsl(c)))).toBe(h);
      expect(rgbToHex(oklchToRgb(rgbToOklch(c)).rgb)).toBe(h);
    }
  });
  it('matches known oklch of white and red', () => {
    expect(rgbToOklch(hex('#fff')).l).toBeCloseTo(1, 3);
    const red = rgbToOklch(hex('#f00'));
    expect(red.l).toBeCloseTo(0.628, 2);
    expect(red.c).toBeCloseTo(0.2577, 2);
    expect(red.h).toBeCloseTo(29.2, 0);
  });
  it('formats strings', () => {
    const c = hex('#ff9a3c');
    expect(formatRgb(c)).toBe('rgb(255, 154, 60)');
    expect(formatHsl(c)).toBe('hsl(29, 100%, 62%)');
    expect(formatOklch(c)).toMatch(/^oklch\(\d+(\.\d)?% 0\.\d+ \d+(\.\d)?\)$/);
    expect(formatRgb(c, 0.5)).toBe('rgb(255 154 60 / 0.5)');
  });
});

describe('kelvinToRgb', () => {
  it('2700 K is warm orange within tolerance', () => {
    const c = kelvinToRgb(2700);
    expect(Math.abs(c.r - 255)).toBeLessThanOrEqual(6);
    expect(Math.abs(c.g - 167)).toBeLessThanOrEqual(6);
    expect(Math.abs(c.b - 87)).toBeLessThanOrEqual(6);
  });
  it('6500 K is near white', () => {
    const c = kelvinToRgb(6500);
    for (const v of [c.r, c.g, c.b]) expect(Math.abs(v - 255)).toBeLessThanOrEqual(6);
  });
  it('blue is monotonic from 1000 to 10000 K', () => {
    let prev = -1;
    for (let k = 1000; k <= 10000; k += 100) {
      const b = kelvinToRgb(k).b;
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
  });
  it('clamps out-of-range input', () => {
    expect(kelvinToRgb(-5)).toEqual(kelvinToRgb(1000));
  });
});

describe('contrast', () => {
  const white = hex('#fff');
  it('black on white is 21:1', () => {
    expect(formatRatio(contrastRatio(hex('#000'), white))).toBe('21.00');
  });
  it('#767676 passes AA on white, #777777 fails', () => {
    const a = contrastRatio(hex('#767676'), white);
    const b = contrastRatio(hex('#777777'), white);
    expect(formatRatio(a)).toBe('4.54');
    expect(passes(a, 'normal', 'AA')).toBe(true);
    expect(formatRatio(b)).toBe('4.47');
    expect(passes(b, 'normal', 'AA')).toBe(false);
  });
  it('truncates rather than rounds, and verdict uses the raw value', () => {
    expect(formatRatio(4.499)).toBe('4.49');
    expect(formatRatio(4.5)).toBe('4.50');
    expect(passes(4.499, 'normal', 'AA')).toBe(false);
    expect(passes(4.5, 'normal', 'AA')).toBe(true);
    // A real constructed pair just under 4.5.
    let found: number | null = null;
    for (let b = 0; b < 256 && found === null; b++) {
      const r = contrastRatio({ r: 119, g: 119, b }, white);
      if (r < 4.5 && r >= 4.49) found = r;
    }
    expect(found).not.toBeNull();
    expect(Number(formatRatio(found as number))).toBeLessThan(4.5);
    expect(passes(found as number, 'normal', 'AA')).toBe(false);
  });
  it('large text boundaries', () => {
    expect(isLargeText(24, false)).toBe(true);
    expect(isLargeText(23.9, false)).toBe(false);
    expect(isLargeText(18.66, true)).toBe(true);
    expect(isLargeText(18.6, true)).toBe(false);
  });
  it('thresholds by kind and level', () => {
    expect(passes(3, 'large', 'AA')).toBe(true);
    expect(passes(4.4, 'large', 'AAA')).toBe(false);
    expect(passes(7, 'normal', 'AAA')).toBe(true);
    expect(passes(21, 'ui', 'AAA')).toBeNull();
  });
  it('identical colors give 1:1', () => {
    expect(contrastRatio(hex('#336699'), hex('#336699'))).toBe(1);
  });
  it('composites alpha', () => {
    expect(compositeOver({ r: 0, g: 0, b: 0 }, 0.5, white).r).toBeCloseTo(127.5);
  });
  it('suggestions always meet the threshold', () => {
    for (const [fg, bg, need] of [['#999999', '#ffffff', 4.5], ['#3a7bd5', '#ffffff', 7], ['#ff0000', '#ff0001', 4.5]] as const) {
      const list = suggestFixes(hex(fg), hex(bg), need);
      expect(list.length).toBeGreaterThan(0);
      for (const s of list) expect(s.ratio).toBeGreaterThanOrEqual(need);
    }
  });
});
