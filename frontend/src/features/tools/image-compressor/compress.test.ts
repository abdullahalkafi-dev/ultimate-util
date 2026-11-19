import { describe, expect, it } from 'vitest';
import { compressedName, decideOutcome, outputFormatFor, savedPercent, totals } from './compress';

describe('compress helpers', () => {
  it('keeps the input format where possible', () => {
    expect(outputFormatFor('jpeg', 'keep')).toBe('jpeg');
    expect(outputFormatFor('webp', 'keep')).toBe('webp');
    expect(outputFormatFor('gif', 'keep')).toBe('png');
    expect(outputFormatFor('heic', 'keep')).toBe('jpeg');
    expect(outputFormatFor('png', 'avif')).toBe('avif');
  });

  it('never accepts an output that is not smaller', () => {
    expect(decideOutcome(1000, 999)).toBe('compressed');
    expect(decideOutcome(1000, 1000)).toBe('already-optimized');
    expect(decideOutcome(1000, 1500)).toBe('already-optimized');
  });

  it('computes savings and totals', () => {
    expect(savedPercent(1000, 380)).toBe(62);
    expect(savedPercent(0, 0)).toBe(0);
    expect(totals([{ before: 1000, after: 500 }, { before: 1000, after: 1000 }])).toMatchObject({ saved: 500, percent: 25, files: 2 });
  });

  it('builds output names and keeps unicode', () => {
    expect(compressedName('IMG 001.JPG', 'jpeg')).toBe('IMG 001-compressed.jpg');
    expect(compressedName('写真🙂.png', 'webp')).toBe('写真🙂-compressed.webp');
    expect(compressedName('a/b.png', 'png')).toBe('a_b-compressed.png');
  });
});
