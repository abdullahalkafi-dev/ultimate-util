import { describe, expect, it } from 'vitest';
import { smartLadder, paletteSizeForQuality } from './codecs';
import { computeLayout, emptyResize, svgBaseSize } from './geometry';
import { readImageInfo } from './imageInfo';
import { dedupeNames, renderName, sanitizeFileName, validatePattern } from './naming';
import { countColors, quantizeRgba } from './quantize';
import type { ResizeSpec } from './types';

const box = (over: Partial<ResizeSpec>): ResizeSpec => ({ ...emptyResize(), mode: 'box', ...over });

describe('computeLayout', () => {
  it('keeps the size with mode none', () => {
    expect(computeLayout(800, 600, emptyResize())).toMatchObject({ outW: 800, outH: 600 });
  });

  it('computes the missing side from the aspect ratio', () => {
    expect(computeLayout(4000, 3000, box({ width: 1200 }))).toMatchObject({ outW: 1200, outH: 900 });
    expect(computeLayout(4000, 3000, box({ height: 600 }))).toMatchObject({ outW: 800, outH: 600 });
  });

  it('does not enlarge by default and says so', () => {
    const l = computeLayout(500, 400, box({ width: 1000 }));
    expect(l).toMatchObject({ outW: 500, outH: 400, notEnlarged: true });
    const big = computeLayout(500, 400, box({ width: 1000, doNotEnlarge: false }));
    expect(big).toMatchObject({ outW: 1000, outH: 800 });
  });

  it('fit inside keeps ratio within the box', () => {
    expect(computeLayout(4000, 2000, box({ width: 1000, height: 1000, fit: 'inside' }))).toMatchObject({ outW: 1000, outH: 500 });
  });

  it('fill outputs exactly the box and crops around the anchor', () => {
    const l = computeLayout(4000, 2000, box({ width: 1000, height: 1000, fit: 'cover', anchor: { x: 0, y: 0.5 } }));
    expect(l).toMatchObject({ outW: 1000, outH: 1000, sx: 0, sw: 2000, sh: 2000 });
    const right = computeLayout(4000, 2000, box({ width: 1000, height: 1000, fit: 'cover', anchor: { x: 1, y: 0.5 } }));
    expect(right.sx).toBe(2000);
  });

  it('pad outputs exactly the box with the image centered', () => {
    const l = computeLayout(4000, 2000, box({ width: 1000, height: 1000, fit: 'pad' }));
    expect(l).toMatchObject({ outW: 1000, outH: 1000, dw: 1000, dh: 500, dx: 0, dy: 250 });
  });

  it('shrinks the whole box for fill/pad when enlarging is off, never exceeding the source', () => {
    const l = computeLayout(500, 400, box({ width: 1000, height: 1000, fit: 'cover' }));
    expect(l.outW).toBeLessThanOrEqual(500);
    expect(l.outH).toBeLessThanOrEqual(400);
    expect(l.notEnlarged).toBe(true);
    expect(l.outW).toBe(l.outH);
  });

  it('supports percent and long edge', () => {
    expect(computeLayout(1000, 500, { ...emptyResize(), mode: 'percent', percent: 50 })).toMatchObject({ outW: 500, outH: 250 });
    expect(computeLayout(1000, 500, { ...emptyResize(), mode: 'longEdge', longEdge: 200 })).toMatchObject({ outW: 200, outH: 100 });
    expect(computeLayout(1000, 500, { ...emptyResize(), mode: 'percent', percent: 0.01 })).toMatchObject({ outW: 1, outH: 1 });
  });

  it('clamps to the canvas limit', () => {
    const l = computeLayout(1000, 1000, { ...emptyResize(), mode: 'percent', percent: 5000, doNotEnlarge: false });
    expect(l.clamped).toBe(true);
    expect(l.outW).toBe(16384);
  });
});

describe('svgBaseSize', () => {
  it('reads width/height, viewBox, or returns null', () => {
    expect(svgBaseSize('<svg width="100" height="50"></svg>')).toEqual({ width: 100, height: 50 });
    expect(svgBaseSize('<svg viewBox="0 0 24 12"></svg>')).toEqual({ width: 24, height: 12 });
    expect(svgBaseSize('<svg width="200" viewBox="0 0 24 12"></svg>')).toEqual({ width: 200, height: 100 });
    expect(svgBaseSize('<svg width="100%"></svg>')).toBeNull();
  });
});

describe('naming', () => {
  it('renders tokens and keeps unicode', () => {
    expect(renderName('{name}-{w}x{h}', { name: 'photo', w: 800, h: 600, n: 1 })).toBe('photo-800x600');
    expect(renderName('{n}_{name}@{scale}', { name: 'ロゴ🙂', w: 1, h: 1, n: 7, scale: '2x' })).toBe('007_ロゴ🙂@2x');
  });
  it('sanitizes illegal characters', () => {
    expect(sanitizeFileName('a/b:c?.png')).toBe('a_b_c_.png');
  });
  it('validates patterns', () => {
    expect(validatePattern('')).toMatch(/empty/);
    expect(validatePattern('{nope}')).toMatch(/Unknown token/);
    expect(validatePattern('{preset}')).toBeNull();
    expect(validatePattern('...')).toMatch(/blank/);
  });
  it('dedupes with (2) suffixes', () => {
    expect(dedupeNames(['a.png', 'A.png', 'b/a.png', 'a.png'])).toEqual(['a.png', 'A (2).png', 'b/a.png', 'a (3).png']);
  });
});

describe('readImageInfo', () => {
  it('reads PNG, GIF and WebP headers', () => {
    const png = new Uint8Array(33);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0, 0, 0, 0, 200]);
    expect(readImageInfo(png, 'png')).toEqual({ width: 256, height: 200, animated: false });
    const gif = new Uint8Array(40);
    gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 10, 0, 20, 0]);
    gif.set([0x21, 0xf9, 0, 0, 0x21, 0xf9], 20);
    expect(readImageInfo(gif, 'gif')).toEqual({ width: 10, height: 20, animated: true });
    const webp = new Uint8Array(30);
    webp.set([...'RIFF'].map((c) => c.charCodeAt(0)));
    webp.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8);
    webp.set([...'VP8X'].map((c) => c.charCodeAt(0)), 12);
    webp[20] = 0x02;
    webp.set([99, 0, 0], 24);
    webp.set([49, 0, 0], 27);
    expect(readImageInfo(webp, 'webp')).toEqual({ width: 100, height: 50, animated: true });
  });

  it('reads JPEG SOF dimensions past other segments', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x01, 0x2c, 0x02, 0x58, 3, 0, 0]);
    expect(readImageInfo(jpeg, 'jpeg')).toEqual({ width: 600, height: 300, animated: false });
  });
});

describe('quantizeRgba', () => {
  it('reduces a gradient to the requested number of colors', () => {
    const px = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) px.set([i, 255 - i, (i * 7) % 256, 255], i * 4);
    expect(countColors(px)).toBe(256);
    const q = quantizeRgba(px, 16);
    expect(countColors(q)).toBeLessThanOrEqual(16);
    expect(q.length).toBe(px.length);
  });
  it('keeps images with few colors exactly', () => {
    const px = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255]);
    expect(Array.from(quantizeRgba(px, 8))).toEqual(Array.from(px));
  });
  it('maps quality to palette size and a quality ladder', () => {
    expect(paletteSizeForQuality(100)).toBe(256);
    expect(paletteSizeForQuality(10)).toBeLessThan(paletteSizeForQuality(80));
    expect(smartLadder(80)).toEqual([80, 65, 50]);
    expect(smartLadder(20)).toEqual([20, 10]);
  });
});
