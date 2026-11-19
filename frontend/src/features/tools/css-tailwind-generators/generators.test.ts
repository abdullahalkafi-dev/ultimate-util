import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CSS_STATE,
  MAX_IMPORT_BYTES,
  MAX_SHADOW_BLUR,
  MAX_SHADOW_LAYERS,
  generateFlex,
  generateGlass,
  generateGradient,
  generateGrid,
  generateRadius,
  generateShadow,
  importBoxShadowCss,
  importGradientCss,
  type ShadowLayer,
} from './generators';

describe('css-tailwind-generators', () => {
  it('keeps 3-layer shadow order in CSS and Tailwind output', () => {
    const layers: ShadowLayer[] = [
      { id: 1, x: 1, y: 2, blur: 3, spread: 0, color: '#111111', alpha: 0.5, inset: false },
      { id: 2, x: 4, y: 5, blur: 6, spread: -2, color: '#222222', alpha: 1, inset: true },
      { id: 3, x: 7, y: 8, blur: 9, spread: 1, color: '#333333', alpha: 0.25, inset: false },
    ];
    const out = generateShadow(layers, 'px');
    expect(out.css).toContain('1px 2px 3px rgb(17 17 17 / 0.5), inset 4px 5px 6px -2px rgb(34 34 34 / 1), 7px 8px 9px 1px rgb(51 51 51 / 0.25)');
    const i1 = out.tailwind.indexOf('1px_2px_3px');
    const i2 = out.tailwind.indexOf('inset_4px_5px_6px');
    const i3 = out.tailwind.indexOf('7px_8px_9px');
    expect(i1).toBeGreaterThan(-1);
    expect(i1).toBeLessThan(i2);
    expect(i2).toBeLessThan(i3);
  });

  it('uses standard Tailwind classes when exact and arbitrary values with notes otherwise', () => {
    const exactGrid = generateGrid(DEFAULT_CSS_STATE.grid, 'px');
    expect(exactGrid.tailwind).toContain('grid-cols-3');
    expect(exactGrid.tailwind).toContain('gap-4');

    const customGrid = generateGrid({ ...DEFAULT_CSS_STATE.grid, gapPx: 13 }, 'px');
    expect(customGrid.tailwind).toContain('gap-[13px]');
    expect(customGrid.notes.some((n) => n.includes('13px'))).toBe(true);
  });

  it('includes @supports fallback for glassmorphism', () => {
    const out = generateGlass(DEFAULT_CSS_STATE.glass, 'px');
    expect(out.css).toContain('-webkit-backdrop-filter:');
    expect(out.css).toContain('backdrop-filter:');
    expect(out.css).toContain('@supports not (backdrop-filter: blur(1px))');
  });

  it('clamps oversized blur and layer count', () => {
    const many: ShadowLayer[] = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      x: 0,
      y: i,
      blur: 9999,
      spread: 0,
      color: '#000000',
      alpha: 0.2,
      inset: false,
    }));
    const out = generateShadow(many, 'px');
    expect(out.css.split(',')).toHaveLength(MAX_SHADOW_LAYERS);
    expect(out.css).toContain(`${MAX_SHADOW_BLUR}px`);
  });

  it('imports multi-layer box-shadow and gradients without loss and rejects >100KB', () => {
    const s = importBoxShadowCss('box-shadow: 0 4px 12px -2px rgba(10, 20, 30, 0.4), inset 0 1px 0 #ffffff;');
    expect(s.ok).toBe(true);
    if (s.ok) {
      expect(s.value).toHaveLength(2);
      expect(s.value[0]?.spread).toBe(-2);
      expect(s.value[1]?.inset).toBe(true);
    }

    const g = importGradientCss('background-image: linear-gradient(45deg, #2446f0 0%, #d6246e 100%);');
    expect(g.ok).toBe(true);
    if (g.ok) {
      expect(g.value.kind).toBe('linear');
      expect(g.value.angle).toBe(45);
      expect(g.value.stops).toHaveLength(2);
    }

    expect(importBoxShadowCss('0 1px 2px #000 '.repeat(10000)).ok).toBe(false);
    expect(MAX_IMPORT_BYTES).toBe(102_400);
  });

  it('builds flex, gradient and radius outputs cleanly', () => {
    expect(generateFlex(DEFAULT_CSS_STATE.flex, 'rem').css).toContain('gap: 1rem;');
    expect(generateGradient(DEFAULT_CSS_STATE.gradient).tailwind).toContain('bg-[image:');
    expect(generateRadius({ ...DEFAULT_CSS_STATE.radius, clipPreset: 'triangle' }, 'px').css).toContain('clip-path: polygon');
  });
});
