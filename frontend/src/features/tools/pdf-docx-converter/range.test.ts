import { describe, expect, it } from 'vitest';
import { parsePageRange } from './range';

describe('parsePageRange', () => {
  it('defaults to all pages', () => expect(parsePageRange('', 3).pages).toEqual([1, 2, 3]));
  it('handles lists, ranges and open ends', () => {
    expect(parsePageRange('1-2, 5', 10).pages).toEqual([1, 2, 5]);
    expect(parsePageRange('8-', 10).pages).toEqual([8, 9, 10]);
    expect(parsePageRange('-2', 10).pages).toEqual([1, 2]);
    expect(parsePageRange('3, 3, 1', 10).pages).toEqual([1, 3]);
  });
  it('rejects bad input', () => {
    expect(parsePageRange('abc', 5).error).toBeTruthy();
    expect(parsePageRange('9', 5).error).toBeTruthy();
    expect(parsePageRange('4-2', 5).error).toBeTruthy();
  });
  it('clamps a range end to the page count', () => expect(parsePageRange('4-99', 5).pages).toEqual([4, 5]));
});
