import { describe, expect, it } from 'vitest';
import { runMatch } from './engine';
import { explain } from './explain';
import { patternHints } from './hints';
import { buildShareHash, parseShareHash, toConstructor, toLiteral } from './share';

describe('runMatch', () => {
  it('finds matches with named groups and indices', () => {
    const r = runMatch({ pattern: '(?<y>\\d{4})-(?<m>\\d{2})', flags: 'gd', text: 'on 2024-05 and 1999-12' });
    expect(r.total).toBe(2);
    expect(r.matches[0]!.groups.map((g) => g.name)).toEqual(['y', 'm']);
    expect(r.matches[1]!.groups[0]!.value).toBe('1999');
    expect(r.matches[1]!.groups[0]!.range).toEqual([15, 19]);
    expect(r.groupNames).toEqual(['y', 'm']);
  });

  it('terminates on zero-length matches (a* on baaac)', () => {
    const r = runMatch({ pattern: 'a*', flags: 'g', text: 'baaac' });
    expect(r.matches.map((m) => [m.index, m.value])).toEqual([[0, ''], [1, 'aaa'], [4, ''], [5, '']]);
  });

  it('empty-match loop advances by code point with the u flag', () => {
    const r = runMatch({ pattern: '', flags: 'gu', text: '😀' });
    expect(r.total).toBe(0);
    const z = runMatch({ pattern: '(?:)', flags: 'gu', text: '😀a' });
    expect(z.matches.map((m) => m.index)).toEqual([0, 2, 3]);
  });

  it('treats the empty pattern as no matching', () => {
    expect(runMatch({ pattern: '', flags: 'g', text: 'abc' }).matches).toEqual([]);
  });

  it('handles emoji with and without u, and reports code point positions', () => {
    expect(runMatch({ pattern: '.', flags: 'u', text: '😀' }).total).toBe(1);
    expect(runMatch({ pattern: '.', flags: '', text: '😀' }).matches[0]!.value).toBe('\ud83d');
    const r = runMatch({ pattern: 'b', flags: 'g', text: '😀b' });
    expect(r.matches[0]).toMatchObject({ index: 2, charIndex: 1 });
  });

  it('reports invalid patterns with a position', () => {
    const r = runMatch({ pattern: 'ab(c', flags: '', text: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error?.message).toMatch(/Unterminated group at position 2/);
    expect(runMatch({ pattern: '[a-', flags: '', text: '' }).error?.position).toBe(0);
    expect(runMatch({ pattern: '(?<n>a)\\k<x>', flags: 'u', text: '' }).ok).toBe(false);
  });

  it('caps stored matches but keeps counting', () => {
    const r = runMatch({ pattern: 'a', flags: 'g', text: 'a'.repeat(50), maxMatches: 10 });
    expect(r.matches).toHaveLength(10);
    expect(r.total).toBe(50);
    expect(r.truncated).toBe(true);
  });

  it('only finds the first match without g, and honours sticky', () => {
    expect(runMatch({ pattern: 'a', flags: '', text: 'aaa' }).total).toBe(1);
    expect(runMatch({ pattern: 'a', flags: 'gy', text: 'aabaa' }).total).toBe(2);
  });

  it('previews replacements with $1, $<name>, $&', () => {
    const r = runMatch({ pattern: '(?<a>\\w)(\\d)', flags: 'g', text: 'a1 b2', replacement: '$2$<a>[$&]' });
    expect(r.replaced).toBe('1a[a1] 2b[b2]');
    expect(r.replaceIssues).toEqual([]);
  });

  it('flags missing group references in the replacement', () => {
    const r = runMatch({ pattern: '(a)', flags: 'g', text: 'a', replacement: '$3-$<nope>' });
    expect(r.replaceIssues).toHaveLength(2);
    expect(r.replaced).toBe('$3-$<nope>');
  });

  it('survives a catastrophic pattern only because the caller applies a timeout (small input here)', () => {
    const r = runMatch({ pattern: '(a+)+$', flags: '', text: 'aaaaaaaaaaaaaaab' });
    expect(r.total).toBe(0);
  });
});

describe('explain', () => {
  it('describes every token of a date pattern', () => {
    const items = explain('^(?<y>\\d{4})-(?<m>\\d{2})$', '');
    expect(items.map((i) => i.token)).toEqual(['^', '(?<y>', '\\d', '{4}', ')', '-', '(?<m>', '\\d', '{2}', ')', '$']);
    expect(items[1]!.text).toContain('named "y"');
    expect(items[3]!.text).toContain('exactly 4');
    expect(items[2]!.depth).toBe(1);
  });

  it('explains lookaheads, classes and lazy quantifiers', () => {
    const items = explain('^(?=.*\\d)[A-Z]+?.{8,}$', '');
    expect(items.some((i) => i.text.startsWith('Positive lookahead'))).toBe(true);
    expect(items.find((i) => i.token === '[A-Z]')!.text).toContain('"A" to "Z"');
    expect(items.find((i) => i.token === '+?')!.text).toContain('lazy');
    expect(items.find((i) => i.token === '{8,}')!.text).toContain('8 or more');
  });

  it('keeps a quantifier separate from a literal run', () => {
    expect(explain('abc+').map((i) => i.token)).toEqual(['ab', 'c', '+']);
  });

  it('calls out unsupported syntax', () => {
    expect(explain('(?i)a')[0]!.text).toMatch(/not valid JavaScript/);
  });
});

describe('hints', () => {
  it('warns about nested quantifiers and PCRE-only syntax', () => {
    expect(patternHints('(a+)+$', 'g').map((h) => h.id)).toContain('nested');
    expect(patternHints('(?i)abc', 'g').map((h) => h.id)).toContain('inline');
    expect(patternHints('\\Aabc', 'g').map((h) => h.id)).toContain('az');
    expect(patternHints('a++', 'g').map((h) => h.id)).toContain('possessive');
  });

  it('suggests the u flag for emoji and \\p{}', () => {
    expect(patternHints('.', 'g', '😀').map((h) => h.id)).toContain('astral');
    expect(patternHints('\\p{L}', 'g').map((h) => h.id)).toContain('prop');
    expect(patternHints('\\p{L}', 'gu')).toEqual([]);
  });
});

describe('share', () => {
  it('round-trips pattern and flags only', () => {
    const hash = buildShareHash('^a&b=c#$', 'ig');
    expect(hash).not.toMatch(/text/);
    expect(parseShareHash(hash)).toEqual({ pattern: '^a&b=c#$', flags: 'gi', notices: [] });
  });

  it('drops bad flags and rejects overlong patterns', () => {
    const p = parseShareHash('#p=a&f=gxuv', (f) => f !== 'v')!;
    expect(p.flags).toBe('gu');
    expect(p.notices.length).toBe(2);
    expect(parseShareHash(`#p=${'a'.repeat(2001)}`)!.pattern).toBe('');
    expect(parseShareHash('#nothing')).toBeNull();
  });

  it('formats code snippets', () => {
    expect(toLiteral('a/b\\d', 'ig')).toBe('/a\\/b\\d/gi');
    expect(toConstructor('\\d+"', 'g')).toBe('new RegExp("\\\\d+\\"", "g")');
  });
});
