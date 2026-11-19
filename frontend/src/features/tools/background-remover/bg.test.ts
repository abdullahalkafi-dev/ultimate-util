import { describe, expect, it } from 'vitest';
import { classicalMask, decontaminate, sampleBackground } from './classical';
import { applyMask, flattenOnColor, hexToRgb, maskToRgba } from './composite';
import { finishMask, maskCoverage, replayStrokes, shiftEdge } from './mask';
import { contrastMask, isOnnxHeader, modelInputSize, NORMALIZATIONS, outputToMask, toNchw, upscaleMask } from './model';

function makeSolidWithSubject(w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inside = x >= 4 && x < w - 4 && y >= 4 && y < h - 4;
      out[i] = inside ? 220 : 25;
      out[i + 1] = inside ? 60 : 180;
      out[i + 2] = inside ? 40 : 240;
      out[i + 3] = 255;
    }
  }
  return out;
}

describe('background-remover core algorithms', () => {
  it('samples backdrop and separates centered foreground cleanly in classical mode', () => {
    const w = 16;
    const h = 16;
    const rgba = makeSolidWithSubject(w, h);
    const sampled = sampleBackground(rgba, w, h);
    expect(sampled.color).toEqual({ r: 25, g: 180, b: 240 });
    expect(sampled.confidence).toBeGreaterThan(0.9);

    const contiguous = classicalMask(rgba, w, h, { tolerance: 35, softness: 0.25, mode: 'contiguous' });
    expect(contiguous.mask[0]).toBe(0);
    expect(contiguous.mask[8 * w + 8]).toBe(255);

    const global = classicalMask(rgba, w, h, { tolerance: 35, softness: 0.25, mode: 'global', bg: sampled.color });
    expect(global.mask[0]).toBe(0);
    expect(global.mask[8 * w + 8]).toBe(255);

    const decontam = decontaminate(rgba, contiguous.mask, sampled.color, 1);
    expect(decontam.length).toBe(rgba.length);
  });

  it('composites masks onto transparency and solid color backdrops', () => {
    const rgba = new Uint8ClampedArray([200, 100, 50, 255, 200, 100, 50, 255]);
    const mask = new Uint8Array([255, 0]);
    const masked = applyMask(rgba, mask);
    expect(masked[3]).toBe(255);
    expect(masked[7]).toBe(0);

    const rgb = hexToRgb('#102030');
    expect(rgb).toEqual({ r: 16, g: 32, b: 48 });

    const flattened = flattenOnColor(masked, rgb);
    expect(flattened[0]).toBe(200);
    expect(flattened[4]).toBe(16);
    expect(flattened[5]).toBe(32);
    expect(flattened[6]).toBe(48);
    expect(flattened[7]).toBe(255);

    const maskVis = maskToRgba(mask);
    expect(maskVis[0]).toBe(255);
    expect(maskVis[4]).toBe(0);
  });

  it('replays keep/erase strokes and applies edge shift, feathering and coverage', () => {
    const w = 12;
    const h = 12;
    const base = new Uint8Array(w * h);
    base[6 * w + 6] = 255;

    const replayed = replayStrokes(base, w, h, [
      { mode: 'keep', radius: 2, hardness: 1, points: [[2, 2]] },
      { mode: 'erase', radius: 1, hardness: 1, points: [[6, 6]] },
    ]);
    expect(replayed[2 * w + 2]).toBe(255);
    expect(replayed[6 * w + 6]).toBe(0);

    const grown = shiftEdge(base, w, h, 1);
    expect(grown[6 * w + 5]).toBe(255);
    expect(maskCoverage(grown)).toBeGreaterThan(maskCoverage(base));

    const finished = finishMask(base, w, h, { shift: 1, feather: 1 });
    expect(finished.length).toBe(base.length);
    expect(maskCoverage(finished)).toBeGreaterThan(0);
  });

  it('handles ONNX tensor preprocessing, upscaling and magic-byte header validation', () => {
    const rgba = new Uint8ClampedArray([255, 0, 128, 255, 0, 255, 0, 255]);
    const nchw = toNchw(rgba, 2, 1, NORMALIZATIONS.unit!);
    expect(nchw.length).toBe(6);
    expect(nchw[0]).toBeCloseTo(1, 4);
    expect(nchw[1]).toBeCloseTo(0, 4);

    expect(modelInputSize([1, 3, 512, 512], 320)).toEqual({ w: 512, h: 512 });
    expect(modelInputSize(['batch', 3, 'h', 'w'], 320)).toEqual({ w: 320, h: 320 });

    const out = outputToMask(new Float32Array([0, 0.5, 1]));
    expect(Array.from(out)).toEqual([0, 128, 255]);

    const up = upscaleMask(new Uint8Array([0, 255, 0, 255]), 2, 2, 4, 4);
    expect(up.length).toBe(16);
    expect(up[3]).toBeGreaterThan(200);

    const contrasted = contrastMask(new Uint8Array([10, 240]), 0.8);
    expect(contrasted[0]).toBeLessThan(10);
    expect(contrasted[1]).toBeGreaterThan(240);

    expect(isOnnxHeader(new Uint8Array([0x08, 0x07, 0x12, 0x04, 0x74, 0x65, 0x73, 0x74, 0x00]))).toBe(true);
    expect(isOnnxHeader(new Uint8Array([0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45]))).toBe(false);
  });
});
