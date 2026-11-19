import { describe, expect, it } from 'vitest';
import { parseRanges, planAtStarts, planBySize, planEveryN } from './ranges';

describe('parseRanges', () => {
  it('parses lists, ranges, open ends and last', () => {
    const r = parseRanges('1-3, 5, 8-', 10);
    expect(r.errors).toEqual([]);
    expect(r.pages).toEqual([1, 2, 3, 5, 8, 9, 10]);
    expect(parseRanges('LAST', 4).pages).toEqual([4]);
    expect(parseRanges('2-last', 4).pages).toEqual([2, 3, 4]);
    expect(parseRanges('-2', 5).pages).toEqual([1, 2]);
  });

  it('tolerates whitespace and trailing commas', () => {
    expect(parseRanges('  1 -  2 ,, 4 , ', 5).pages).toEqual([1, 2, 4]);
  });

  it('highlights the exact offending token', () => {
    const input = '1-3, x7, 5';
    const r = parseRanges(input, 10);
    expect(r.errors).toHaveLength(1);
    const e = r.errors[0]!;
    expect(input.slice(e.start, e.end)).toBe('x7');
  });

  it('rejects reversed ranges, zero, dash-only and extra dashes', () => {
    expect(parseRanges('5-3', 9).errors).toHaveLength(1);
    expect(parseRanges('0', 9).errors).toHaveLength(1);
    expect(parseRanges('-', 9).errors).toHaveLength(1);
    expect(parseRanges('1-2-3', 9).errors).toHaveLength(1);
  });

  it('clamps an end beyond the page count with a message', () => {
    const r = parseRanges('1-999', 12);
    expect(r.errors).toEqual([]);
    expect(r.pages).toHaveLength(12);
    expect(r.warnings[0]).toContain('Document has 12 pages');
  });

  it('errors when the start is beyond the page count', () => {
    const r = parseRanges('20', 12);
    expect(r.errors[0]?.message).toContain('12 pages');
    expect(r.pages).toEqual([]);
  });

  it('keeps duplicates and warns', () => {
    const r = parseRanges('1-2, 2', 5);
    expect(r.pages).toEqual([1, 2, 2]);
    expect(r.warnings.join(' ')).toContain('more than once');
  });

  it('handles absurd numbers without throwing', () => {
    expect(parseRanges('99999999999999999999', 5).errors).toHaveLength(1);
  });
});

describe('split planners', () => {
  it('every N', () => {
    expect(planEveryN(7, 3).map((g) => [g.from, g.to])).toEqual([[1, 3], [4, 6], [7, 7]]);
    expect(planEveryN(2, 0).map((g) => [g.from, g.to])).toEqual([[1, 1], [2, 2]]);
  });

  it('by size, with an oversized single page on its own', () => {
    const parts = planBySize([100, 100, 100, 500, 100], 250).map((g) => [g.from, g.to]);
    expect(parts).toEqual([[1, 2], [3, 3], [4, 4], [5, 5]]);
  });

  it('at starts always begins at page 1', () => {
    expect(planAtStarts(10, [4, 8, 4, 99]).map((g) => [g.from, g.to])).toEqual([[1, 3], [4, 7], [8, 10]]);
  });
});
