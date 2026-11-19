import { describe, expect, it, vi } from 'vitest';
import { RandomStream, cryptoSource, type Uint32Source } from './random';
import {
  AMBIGUOUS,
  DEFAULT_SYMBOLS,
  OptionsError,
  generatePassphrase,
  generatePassword,
  generatePin,
  isObviousPin,
  passphraseEntropyBits,
  passwordEntropyBits,
  pinEntropyBits,
  strengthLabel,
  type PasswordOptions,
} from './generate';
import { WORDLIST } from './wordlist';

const base: PasswordOptions = {
  length: 20, lower: true, upper: true, digit: true, symbol: true,
  symbolSet: DEFAULT_SYMBOLS, exclude: '', requireEach: false,
};
const rng = () => new RandomStream();

describe('random source', () => {
  it('uses crypto.getRandomValues', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    new RandomStream().int(10);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it('chunks large requests under 65,536 bytes per call', () => {
    const sizes: number[] = [];
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((a: Uint32Array) => {
      sizes.push(a.byteLength);
      return a;
    }) as never);
    cryptoSource(40000);
    spy.mockRestore();
    expect(Math.max(...sizes)).toBeLessThanOrEqual(65536);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(160000);
  });
  it('rejects values in the biased tail', () => {
    // 2^32 - 1 is above the largest multiple of 94 below 2^32, so it must be skipped.
    const feed = [0xffffffff, 5];
    const src: Uint32Source = (n) => Uint32Array.from({ length: n }, () => feed.shift() ?? 7);
    expect(new RandomStream(src, 1).int(94)).toBe(5);
  });
  it('has no modulo bias on a pool of 94 (chi-square, 1,000,000 draws)', () => {
    const r = rng();
    const counts = new Array<number>(94).fill(0);
    const N = 1_000_000;
    for (let i = 0; i < N; i++) counts[r.int(94)]!++;
    const expected = N / 94;
    const chi = counts.reduce((s, c) => s + (c - expected) ** 2 / expected, 0);
    // 93 degrees of freedom: p = 0.001 critical value is about 135.
    expect(chi).toBeLessThan(135);
  });
  it('refuses to generate without crypto', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(() => cryptoSource(1)).toThrow(/secure randomness/);
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
    }
  });
});

describe('password', () => {
  it('matches length x log2(pool) when unconstrained', () => {
    const bits = passwordEntropyBits(base);
    const pool = 26 + 26 + 10 + new Set(DEFAULT_SYMBOLS).size;
    expect(bits).toBeCloseTo(20 * Math.log2(pool), 6);
  });
  it('lowers entropy honestly when classes are required', () => {
    const free = passwordEntropyBits({ ...base, length: 8 });
    const req = passwordEntropyBits({ ...base, length: 8, requireEach: true });
    expect(req).toBeLessThan(free);
    expect(req).toBeGreaterThan(free - 2);
  });
  it('always satisfies per-site rules in 10,000 samples', () => {
    const o: PasswordOptions = { ...base, length: 12, exclude: '&<>', requireEach: true, minCounts: { digit: 2, symbol: 2 }, firstIsLetter: true };
    const r = rng();
    for (let i = 0; i < 10000; i++) {
      const p = generatePassword(o, r);
      expect(p).toHaveLength(12);
      expect(p).toMatch(/^[A-Za-z]/);
      expect(p.match(/[0-9]/g)!.length).toBeGreaterThanOrEqual(2);
      expect(p.match(/[^A-Za-z0-9]/g)!.length).toBeGreaterThanOrEqual(2);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).not.toMatch(/[&<>]/);
    }
  });
  it('avoids ambiguous characters when excluded', () => {
    const r = rng();
    for (let i = 0; i < 500; i++) {
      expect(generatePassword({ ...base, length: 64, exclude: AMBIGUOUS }, r)).not.toMatch(/[O0ol1I|]/);
    }
  });
  it('reports conflicts instead of relaxing', () => {
    expect(() => generatePassword({ ...base, length: 2, requireEach: true }, rng())).toThrow(OptionsError);
    expect(() => generatePassword({ ...base, lower: false, upper: false, digit: false, symbol: false }, rng())).toThrow(/at least one/);
    expect(() => generatePassword({ ...base, exclude: '0123456789' }, rng())).toThrow(/digit/);
  });
  it('supports length 128 and bulk of 100 quickly', () => {
    const r = rng();
    const t = performance.now();
    for (let i = 0; i < 100; i++) expect(generatePassword({ ...base, length: 128 }, r)).toHaveLength(128);
    expect(performance.now() - t).toBeLessThan(1000);
  });
  it('entropy DP matches brute force on a tiny alphabet', () => {
    const o: PasswordOptions = {
      length: 4, lower: true, upper: false, digit: true, symbol: false, symbolSet: '',
      exclude: 'cdefghijklmnopqrstuvwxyz456789', requireEach: true,
    };
    let valid = 0;
    const alpha = ['a', 'b', '0', '1', '2', '3'];
    for (let i = 0; i < 6 ** 4; i++) {
      const s = [0, 1, 2, 3].map((k) => alpha[Math.floor(i / 6 ** k) % 6]!);
      if (s.some((c) => /[ab]/.test(c)) && s.some((c) => /\d/.test(c))) valid++;
    }
    expect(passwordEntropyBits(o)).toBeCloseTo(Math.log2(valid), 9);
  });
});

describe('labels', () => {
  it('maps bits to labels', () => {
    expect([39.9, 40, 59.9, 60, 79.9, 80].map(strengthLabel)).toEqual(['Weak', 'Fair', 'Fair', 'Strong', 'Strong', 'Very strong']);
  });
});

describe('pin', () => {
  it('flags obvious pins', () => {
    for (const p of ['1111', '1212', '1234', '4321', '121212', '0000', '56789']) expect(isObviousPin(p)).toBe(true);
    for (const p of ['1357', '2580', '1123', '9081']) expect(isObviousPin(p)).toBe(false);
  });
  it('never generates obvious pins when asked', () => {
    const r = rng();
    for (let i = 0; i < 3000; i++) expect(isObviousPin(generatePin({ length: 4, avoidObvious: true }, r))).toBe(false);
  });
  it('closed form matches enumeration at length 6', () => {
    const all = 10 ** 6;
    let rejected = 0;
    for (let v = 0; v < all; v++) if (isObviousPin(String(v).padStart(6, '0'))) rejected++;
    expect(rejected).toBe(100 + 2 * (11 - 6));
    expect(pinEntropyBits({ length: 6, avoidObvious: true })).toBeCloseTo(Math.log2(all - rejected), 9);
  });
});

describe('passphrase', () => {
  it('ships 7,776 unique words', () => {
    expect(WORDLIST).toHaveLength(7776);
    expect(new Set(WORDLIST).size).toBe(7776);
  });
  it('computes bits per word', () => {
    expect(passphraseEntropyBits({ words: 6, separator: '-', capitalize: false, addNumber: false })).toBeCloseTo(6 * 12.925, 2);
    expect(passphraseEntropyBits({ words: 6, separator: '-', capitalize: false, addNumber: true })).toBeCloseTo(6 * 12.925 + Math.log2(60), 2);
  });
  it('formats words', () => {
    const s = generatePassphrase({ words: 4, separator: ' ', capitalize: true, addNumber: false }, rng());
    expect(s.split(' ')).toHaveLength(4);
    expect(s).toMatch(/^([A-Z][a-z]+ ?){4}$/);
  });
});
