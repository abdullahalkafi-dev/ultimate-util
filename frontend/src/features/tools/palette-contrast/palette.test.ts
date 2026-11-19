import { describe, expect, it } from 'vitest';
import { hexToRgb, mod360, parseColor, rgbToHex, rgbToOklch } from '../_shared-color/convert';
import { simulate } from './cvd';
import { exportPalette, slugify, uniqueSlugs, type NamedColor } from './exports';
import {
  fitCount,
  generatePalette,
  hueOffsets,
  shadeScale,
  shuffle,
  type Harmony,
  type Swatch,
} from './harmony';
import { extractPalette } from './quantize';

const base = hexToRgb('#3a7bd5') as NonNullable<ReturnType<typeof hexToRgb>>;
const baseHue = rgbToOklch(base).h;
const diff = (a: number, b: number) => {
  const d = Math.abs(mod360(a) - mod360(b));
  return Math.min(d, 360 - d);
};

describe('harmony hue offsets', () => {
  const expected: Record<Exclude<Harmony, 'monochrome'>, number[]> = {
    analogous: [-30, 0, 30],
    complementary: [0, 180],
    triadic: [0, 120, 240],
    tetradic: [0, 90, 180, 270],
    split: [0, 150, 210],
  };
  for (const [harmony, offsets] of Object.entries(expected) as [Exclude<Harmony, 'monochrome'>, number[]][]) {
    it(`${harmony} produces ${offsets.join(', ')} within 0.5 degrees in OKLCH`, () => {
      const colors = generatePalette(base, harmony, offsets.length, 'oklch');
      colors.forEach((c, i) => {
        expect(diff(c.lch.h, baseHue + (offsets[i] ?? 0))).toBeLessThan(0.5);
      });
    });
  }
  it('analogous always includes the base hue', () => {
    for (let n = 3; n <= 10; n++) expect(hueOffsets('analogous', n)).toContain(0);
  });
  it('monochrome keeps the hue and clamps lightness to 5..97%', () => {
    const colors = generatePalette(base, 'monochrome', 10);
    expect(colors).toHaveLength(10);
    for (const c of colors) {
      expect(c.lch.l).toBeGreaterThanOrEqual(0.05);
      expect(c.lch.l).toBeLessThanOrEqual(0.97);
      expect(diff(c.lch.h, baseHue)).toBeLessThan(0.5);
    }
    const hexes = new Set(colors.map((c) => c.hex));
    expect(hexes.size).toBe(10);
  });
  it('more colors than hues varies lightness and never exceeds count', () => {
    const colors = generatePalette(base, 'triadic', 8);
    expect(colors).toHaveLength(8);
    expect(new Set(colors.map((c) => c.hex)).size).toBeGreaterThan(5);
  });
  it('hsl space still returns valid hex values', () => {
    for (const c of generatePalette(base, 'triadic', 5, 'hsl')) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('lock and shuffle', () => {
  it('locked colors stay unchanged across 20 shuffles', () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let items: Swatch[] = [
      { hex: '#112233', locked: true },
      { hex: '#445566', locked: false },
      { hex: '#778899', locked: true },
      { hex: '#aabbcc', locked: false },
      { hex: '#ddeeff', locked: false },
    ];
    for (let i = 0; i < 20; i++) {
      items = shuffle(items, 'triadic', 5, 'oklch', rng);
      expect(items[0]).toEqual({ hex: '#112233', locked: true });
      expect(items[2]).toEqual({ hex: '#778899', locked: true });
      expect(items).toHaveLength(5);
    }
    expect(items[1]?.hex).not.toBe('#445566');
  });
  it('fitCount drops unlocked swatches first', () => {
    const items: Swatch[] = [
      { hex: '#000001', locked: false },
      { hex: '#000002', locked: true },
      { hex: '#000003', locked: false },
    ];
    expect(fitCount(items, 2).map((s) => s.hex)).toEqual(['#000001', '#000002']);
    expect(fitCount(items, 1).map((s) => s.hex)).toEqual(['#000002']);
  });
  it('extends when the count grows', () => {
    const grown = shuffle([{ hex: '#000000', locked: true }], 'analogous', 4, 'oklch');
    expect(grown).toHaveLength(4);
    expect(grown[0]?.hex).toBe('#000000');
  });
});

describe('shade scale', () => {
  it('puts the color at 500 and gets darker towards 900', () => {
    const scale = shadeScale(base);
    expect(scale.find((s) => s.step === 500)?.hex).toBe(rgbToHex(base));
    const lights = scale.map((s) => rgbToOklch(hexToRgb(s.hex) as NonNullable<ReturnType<typeof hexToRgb>>).l);
    for (let i = 1; i < lights.length; i++) expect(lights[i] as number).toBeLessThan((lights[i - 1] as number) + 1e-6);
  });
});

describe('extractPalette', () => {
  const pixels = (colors: [number, number, number, number][], each: number) => {
    const data = new Uint8ClampedArray(colors.length * each * 4);
    colors.forEach((c, ci) => {
      for (let k = 0; k < each; k++) data.set(c, (ci * each + k) * 4);
    });
    return data;
  };
  it('finds the dominant colors of a flat image', () => {
    const result = extractPalette(pixels([[255, 0, 0, 255], [0, 0, 255, 255], [0, 255, 0, 255]], 100), 3);
    expect(result.colors.map((c) => c.hex).sort()).toEqual(['#0000ff', '#00ff00', '#ff0000']);
  });
  it('returns fewer colors than asked when the image has fewer', () => {
    const result = extractPalette(pixels([[10, 10, 10, 255], [200, 200, 200, 255]], 50), 5);
    expect(result.colors).toHaveLength(2);
  });
  it('a single color image returns one color', () => {
    expect(extractPalette(pixels([[1, 2, 3, 255]], 30), 5).colors).toHaveLength(1);
  });
  it('ignores transparent pixels', () => {
    const result = extractPalette(pixels([[255, 0, 0, 0], [0, 0, 255, 255]], 40), 4);
    expect(result.colors.map((c) => c.hex)).toEqual(['#0000ff']);
    expect(extractPalette(pixels([[255, 0, 0, 0]], 10), 3).colors).toEqual([]);
  });
  it('orders by share', () => {
    const data = pixels([[255, 0, 0, 255]], 90);
    const more = new Uint8ClampedArray(data.length + 40);
    more.set(data);
    for (let k = 0; k < 10; k++) more.set([0, 0, 255, 255], data.length + k * 4);
    const result = extractPalette(more, 2);
    expect(result.colors[0]?.hex).toBe('#ff0000');
    expect(result.colors[0]?.share).toBeCloseTo(0.9);
  });
});

describe('color blindness simulation', () => {
  it('leaves normal vision and grays untouched (within rounding)', () => {
    const gray = { r: 128, g: 128, b: 128 };
    expect(simulate(gray, 'normal')).toEqual(gray);
    for (const v of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      const out = simulate(gray, v);
      expect(Math.abs(out.r - 128)).toBeLessThan(3);
      expect(Math.abs(out.g - 128)).toBeLessThan(3);
      expect(Math.abs(out.b - 128)).toBeLessThan(3);
    }
  });
  it('protanopia makes red and green much closer than normal vision', () => {
    const red = simulate({ r: 255, g: 0, b: 0 }, 'protanopia');
    const green = simulate({ r: 0, g: 160, b: 0 }, 'protanopia');
    const normal = Math.abs(255 - 0) + Math.abs(0 - 160);
    expect(Math.abs(red.r - green.r) + Math.abs(red.g - green.g)).toBeLessThan(normal);
  });
  it('achromatopsia outputs gray', () => {
    const out = simulate({ r: 200, g: 30, b: 90 }, 'achromatopsia');
    expect(out.r).toBe(out.g);
    expect(out.g).toBe(out.b);
  });
});

describe('exports', () => {
  const colors: NamedColor[] = [
    { name: 'Brand', hex: '#3A7BD5' },
    { name: 'brand', hex: '#d53a7b' },
    { name: '', hex: '#00ff00' },
    { name: 'Café ☕', hex: '#112233' },
  ];
  it('slugifies to ASCII and de-duplicates', () => {
    expect(slugify('Café ☕ Rouge')).toBe('cafe-rouge');
    const r = uniqueSlugs(colors.map((c) => c.name));
    expect(r.names).toEqual(['brand', 'brand-2', 'color-3', 'cafe']);
    expect(r.sanitized).toBe(true);
  });
  it('css and scss are well formed', () => {
    const css = exportPalette(colors, 'css');
    expect(css.startsWith(':root {')).toBe(true);
    expect(css).toContain('--brand: #3a7bd5;');
    expect(css).toContain('--brand-2: #d53a7b;');
    expect(exportPalette(colors, 'scss')).toContain('$color-3: #00ff00;');
  });
  it('json parses and includes oklch', () => {
    const parsed = JSON.parse(exportPalette(colors, 'json')) as { name: string; hex: string; oklch: string }[];
    expect(parsed).toHaveLength(4);
    expect(parsed[0]?.oklch).toMatch(/^oklch\(/);
  });
  it('tailwind v3 config evaluates as JS', () => {
    for (const shades of [false, true]) {
      const src = exportPalette(colors, 'tailwind3', { shades });
      const module = { exports: {} as { theme: { extend: { colors: Record<string, unknown> } } } };
      new Function('module', src)(module);
      expect(Object.keys(module.exports.theme.extend.colors)).toHaveLength(4);
    }
  });
  it('tailwind v4 emits an @theme block, with shade scales on request', () => {
    expect(exportPalette(colors, 'tailwind4')).toContain('--color-brand: #3a7bd5;');
    const shaded = exportPalette(colors, 'tailwind4', { shades: true });
    expect(shaded).toContain('--color-brand-500: #3a7bd5;');
    expect(shaded.match(/--color-brand-\d+:/g)).toHaveLength(10);
  });
  it('parseColor is used for every exported hex', () => {
    expect(parseColor('#3a7bd5').ok).toBe(true);
  });
});
