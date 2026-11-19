import { describe, expect, it } from 'vitest';
import { looksPdfA, looksSigned } from './detect';

const enc = (s: string) => new TextEncoder().encode(s);

describe('detect', () => {
  it('finds signatures and PDF/A markers', () => {
    expect(looksSigned(enc('xx /ByteRange [0 1 2 3]'))).toBe(true);
    expect(looksSigned(enc('xx /ByteRang'))).toBe(false);
    expect(looksPdfA(enc('<pdfaid:part>1</pdfaid:part>'))).toBe(true);
    expect(looksPdfA(enc(''))).toBe(false);
  });
});
