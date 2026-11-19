import type { RandomStream } from './random';
import { WORDLIST } from './wordlist';

export const LOWER = 'abcdefghijklmnopqrstuvwxyz';
export const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const DIGITS = '0123456789';
export const DEFAULT_SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?';
export const AMBIGUOUS = 'O0ol1I|';

export type ClassId = 'lower' | 'upper' | 'digit' | 'symbol';

export interface PasswordOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digit: boolean;
  symbol: boolean;
  symbolSet: string;
  /** Characters never used (user list, plus the ambiguous set when the caller enables it). */
  exclude: string;
  /** At least one character from every selected class. */
  requireEach: boolean;
  /** Per-site minimums; a larger value overrides requireEach for that class. */
  minCounts?: Partial<Record<ClassId, number>>;
  firstIsLetter?: boolean;
}

export class OptionsError extends Error {}

export interface ResolvedClass {
  id: ClassId;
  chars: string[];
  min: number;
}

export function resolveClasses(o: PasswordOptions): ResolvedClass[] {
  const banned = new Set([...o.exclude]);
  const seen = new Set<string>();
  const defs: [ClassId, boolean, string][] = [
    ['lower', o.lower, LOWER],
    ['upper', o.upper, UPPER],
    ['digit', o.digit, DIGITS],
    ['symbol', o.symbol, o.symbolSet],
  ];
  const out: ResolvedClass[] = [];
  for (const [id, on, set] of defs) {
    if (!on) continue;
    // Classes are kept disjoint so every character belongs to exactly one.
    const chars = [...new Set([...set])].filter((c) => !banned.has(c) && !seen.has(c));
    chars.forEach((c) => seen.add(c));
    const min = Math.max(o.requireEach ? 1 : 0, o.minCounts?.[id] ?? 0);
    out.push({ id, chars, min });
  }
  return out;
}

/** Throws OptionsError naming the conflict; returns the usable classes otherwise. */
export function validateOptions(o: PasswordOptions): ResolvedClass[] {
  const classes = resolveClasses(o);
  if (classes.length === 0) throw new OptionsError('Select at least one character type.');
  const empty = classes.find((c) => c.chars.length === 0);
  if (empty) throw new OptionsError(`The exclude list removes every ${empty.id} character. Turn that type off or shorten the list.`);
  const minTotal = classes.reduce((s, c) => s + c.min, 0);
  if (minTotal > o.length) throw new OptionsError(`The rules need at least ${minTotal} characters but the length is ${o.length}.`);
  if (o.firstIsLetter && !classes.some((c) => c.id === 'lower' || c.id === 'upper')) {
    throw new OptionsError('"First character is a letter" needs lowercase or uppercase letters enabled.');
  }
  return classes;
}

function isValid(chars: string[], classes: ResolvedClass[], o: PasswordOptions): boolean {
  if (o.firstIsLetter) {
    const first = chars[0]!;
    if (!classes.some((c) => (c.id === 'lower' || c.id === 'upper') && c.chars.includes(first))) return false;
  }
  return classes.every((c) => {
    if (c.min === 0) return true;
    let n = 0;
    for (const ch of chars) if (c.chars.includes(ch)) n++;
    return n >= c.min;
  });
}

/**
 * Uniform over all strings that satisfy the rules: draw from the full pool and reject
 * strings that break a rule. That keeps the entropy figure exact (see passwordEntropyBits).
 */
export function generatePassword(o: PasswordOptions, rng: RandomStream): string {
  const classes = validateOptions(o);
  const pool = classes.flatMap((c) => c.chars);
  const letters = classes.filter((c) => c.id === 'lower' || c.id === 'upper').flatMap((c) => c.chars);
  for (let attempt = 0; attempt < 20000; attempt++) {
    const chars: string[] = [];
    for (let i = 0; i < o.length; i++) chars.push(rng.pick(i === 0 && o.firstIsLetter ? letters : pool));
    // First-letter strings are drawn from letters only, so they satisfy that rule by construction.
    if (isValid(chars, classes, { ...o, firstIsLetter: false })) return chars.join('');
  }
  throw new OptionsError('These rules are too strict to satisfy at this length. Increase the length or relax a rule.');
}

/**
 * log2 of the number of strings the generator can produce, counted exactly with a DP over
 * positions and capped per-class counts. This is the true entropy of the rejection sampler.
 */
export function passwordEntropyBits(o: PasswordOptions): number {
  const classes = validateOptions(o);
  const k = classes.length;
  const radix = classes.map((c) => c.min + 1);
  const states = radix.reduce((a, b) => a * b, 1);
  const encode = (counts: number[]) => counts.reduce((acc, n, i) => acc * radix[i]! + n, 0);
  const decode = (s: number) => {
    const counts = new Array<number>(k);
    for (let i = k - 1; i >= 0; i--) {
      counts[i] = s % radix[i]!;
      s = Math.floor(s / radix[i]!);
    }
    return counts;
  };
  let cur = new Float64Array(states);
  cur[0] = 1;
  const isLetterClass = classes.map((c) => c.id === 'lower' || c.id === 'upper');
  for (let pos = 0; pos < o.length; pos++) {
    const next = new Float64Array(states);
    for (let s = 0; s < states; s++) {
      const ways = cur[s]!;
      if (ways === 0) continue;
      const counts = decode(s);
      for (let ci = 0; ci < k; ci++) {
        if (pos === 0 && o.firstIsLetter && !isLetterClass[ci]) continue;
        const nc = counts.slice();
        nc[ci] = Math.min(classes[ci]!.min, nc[ci]! + 1);
        next[encode(nc)]! += ways * classes[ci]!.chars.length;
      }
    }
    cur = next;
  }
  return Math.log2(cur[states - 1]!);
}

export function strengthLabel(bits: number): 'Weak' | 'Fair' | 'Strong' | 'Very strong' {
  if (bits < 40) return 'Weak';
  if (bits < 60) return 'Fair';
  if (bits < 80) return 'Strong';
  return 'Very strong';
}

// ---------- PIN ----------

export interface PinOptions {
  length: number;
  avoidObvious: boolean;
}

export function isObviousPin(pin: string): boolean {
  const n = pin.length;
  if (n < 2) return false;
  const d = [...pin].map(Number);
  // repeating unit of one or two digits (1111, 1212, 121212)
  for (const period of [1, 2]) {
    if (n > period && d.every((v, i) => v === d[i % period])) return true;
  }
  if (n >= 3) {
    if (d.every((v, i) => i === 0 || v === d[i - 1]! + 1)) return true;
    if (d.every((v, i) => i === 0 || v === d[i - 1]! - 1)) return true;
  }
  return false;
}

export function generatePin(o: PinOptions, rng: RandomStream): string {
  for (;;) {
    let pin = '';
    for (let i = 0; i < o.length; i++) pin += rng.int(10);
    if (!o.avoidObvious || !isObviousPin(pin)) return pin;
  }
}

/** Exact for lengths up to 6 (enumeration); closed form above, where the filter removes a tiny set. */
export function pinEntropyBits(o: PinOptions): number {
  const all = 10 ** o.length;
  if (!o.avoidObvious) return Math.log2(all);
  let rejected = 0;
  if (o.length <= 6) {
    for (let v = 0; v < all; v++) if (isObviousPin(String(v).padStart(o.length, '0'))) rejected++;
  } else {
    rejected = 100 + 2 * Math.max(0, 11 - o.length);
  }
  return Math.log2(all - rejected);
}

// ---------- Passphrase ----------

export interface PassphraseOptions {
  words: number;
  separator: string;
  capitalize: boolean;
  addNumber: boolean;
}

export function generatePassphrase(o: PassphraseOptions, rng: RandomStream, list: readonly string[] = WORDLIST): string {
  const picked = Array.from({ length: o.words }, () => rng.pick(list));
  if (o.addNumber) picked[rng.int(o.words)] += String(rng.int(10));
  return picked.map((w) => (o.capitalize ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(o.separator);
}

export function passphraseEntropyBits(o: PassphraseOptions, listSize: number = WORDLIST.length): number {
  let bits = o.words * Math.log2(listSize);
  if (o.addNumber) bits += Math.log2(o.words * 10);
  return bits;
}
