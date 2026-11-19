import { describe, expect, it } from 'vitest';
import { rgbToHex } from '../_shared-color/convert';
import { MAX_CHROMA, nudge, pointToState, resolve, stateFromRgb, stateToPoint, type ColorState } from './wheel';

describe('wheel math', () => {
  const hsl: ColorState = { mode: 'hsl', h: 0, s: 100, l: 50 };

  it('right edge is red, bottom is 90 degrees', () => {
    const s = pointToState(100, 0, 100, hsl);
    expect(s.h).toBeCloseTo(0);
    expect(s.mode === 'hsl' && s.s).toBeCloseTo(100);
    expect(pointToState(0, 100, 100, hsl).h).toBeCloseTo(90);
  });
  it('clamps beyond the rim and keeps lightness', () => {
    const s = pointToState(500, 0, 100, hsl);
    expect(s.mode === 'hsl' && s.s).toBe(100);
    expect(s.mode === 'hsl' && s.l).toBe(50);
  });
  it('center is gray', () => {
    const s = pointToState(0, 0, 100, hsl);
    expect(rgbToHex(resolve(s).rgb)).toBe('#808080');
  });
  it('marker position inverts pointToState', () => {
    const s = pointToState(30, -40, 100, hsl);
    const p = stateToPoint(s);
    expect(p.x).toBeCloseTo(0.3);
    expect(p.y).toBeCloseTo(-0.4);
  });
  it('oklch resolve flags clipped colors', () => {
    expect(resolve({ mode: 'oklch', h: 150, c: MAX_CHROMA, l: 0.9 }).clipped).toBe(true);
    expect(resolve({ mode: 'oklch', h: 150, c: 0.05, l: 0.7 }).clipped).toBe(false);
  });
  it('stateFromRgb keeps previous hue for grays', () => {
    const s = stateFromRgb({ r: 128, g: 128, b: 128 }, 'hsl', 200);
    expect(s.h).toBe(200);
    const o = stateFromRgb({ r: 128, g: 128, b: 128 }, 'oklch', 120);
    expect(o.h).toBe(120);
  });
  it('keyboard nudges wrap hue and clamp the rest', () => {
    const wrapped = nudge({ ...hsl, h: 0 }, 'ArrowLeft', false);
    expect(wrapped?.h).toBe(359);
    const lit = nudge({ ...hsl, l: 99 }, 'PageUp', true);
    expect(lit?.mode === 'hsl' && lit.l).toBe(100);
    expect(nudge(hsl, 'a', false)).toBeNull();
  });
});
