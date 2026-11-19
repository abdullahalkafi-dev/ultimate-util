/** Source of random 32-bit words. Injectable so tests can prove which source is used. */
export type Uint32Source = (count: number) => Uint32Array;

// getRandomValues accepts at most 65,536 bytes per call: 16,384 words.
const CHUNK_WORDS = 16384;

export function hasSecureRandom(): boolean {
  return typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function';
}

export const cryptoSource: Uint32Source = (count) => {
  if (!hasSecureRandom()) throw new Error('This browser cannot generate secure randomness.');
  const out = new Uint32Array(count);
  for (let i = 0; i < count; i += CHUNK_WORDS) {
    globalThis.crypto.getRandomValues(out.subarray(i, Math.min(count, i + CHUNK_WORDS)));
  }
  return out;
};

/** Pulls words from a source in batches so single draws stay cheap. */
export class RandomStream {
  private buf: Uint32Array = new Uint32Array(0);
  private pos = 0;
  constructor(
    private readonly source: Uint32Source = cryptoSource,
    private readonly batch = 256,
  ) {}

  private next(): number {
    if (this.pos >= this.buf.length) {
      this.buf = this.source(this.batch);
      this.pos = 0;
    }
    return this.buf[this.pos++]!;
  }

  /** Uniform integer in [0, max) using rejection sampling: no modulo bias. */
  int(max: number): number {
    if (!Number.isInteger(max) || max < 1 || max > 2 ** 32) throw new RangeError('max must be an integer in 1..2^32');
    if (max === 1) return 0;
    const space = 2 ** 32;
    const limit = space - (space % max); // largest multiple of max not above 2^32
    for (;;) {
      const v = this.next();
      if (v < limit) return v % max;
    }
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]!;
  }

  /** Fisher-Yates with the unbiased sampler. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }
}
