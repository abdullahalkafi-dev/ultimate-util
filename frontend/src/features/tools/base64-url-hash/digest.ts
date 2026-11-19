/** Hashing and HMAC on top of hash-wasm (loaded lazily). Works in browsers, workers and node. */
import { toHex } from './base64';

export type HashAlgo = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512';
export const HASH_ALGOS: { id: HashAlgo; label: string; weak: boolean }[] = [
  { id: 'md5', label: 'MD5', weak: true },
  { id: 'sha1', label: 'SHA-1', weak: true },
  { id: 'sha256', label: 'SHA-256', weak: false },
  { id: 'sha384', label: 'SHA-384', weak: false },
  { id: 'sha512', label: 'SHA-512', weak: false },
];
export const SECURITY_NOTE =
  'Not safe for passwords or signatures. Fine for checksums of non-hostile data. For passwords use bcrypt or Argon2id.';

export interface Hasher {
  init(): Hasher;
  update(data: Uint8Array | string): Hasher;
  digest(type: 'binary'): Uint8Array;
}

async function factory(algo: HashAlgo) {
  const w = await import('hash-wasm');
  const make = { md5: w.createMD5, sha1: w.createSHA1, sha256: w.createSHA256, sha384: w.createSHA384, sha512: w.createSHA512 }[algo];
  return { w, make };
}

export async function createHasher(algo: HashAlgo): Promise<Hasher> {
  const { make } = await factory(algo);
  return (await make()) as unknown as Hasher;
}

export async function hashBytes(algo: HashAlgo, data: Uint8Array): Promise<Uint8Array> {
  const h = await createHasher(algo);
  h.init();
  h.update(data);
  return h.digest('binary');
}

/** HMAC through hash-wasm so an empty key follows RFC 2104 instead of throwing like some WebCrypto builds. */
export async function hmacBytes(algo: HashAlgo, key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const { w, make } = await factory(algo);
  const h = await w.createHMAC(make(), key);
  h.init();
  h.update(message);
  return h.digest('binary') as Uint8Array;
}

export type DigestFormat = 'hex' | 'HEX' | 'base64';

export function formatDigest(bytes: Uint8Array, format: DigestFormat): string {
  if (format === 'base64') {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }
  return toHex(bytes, format === 'HEX');
}

/** Parses a secret typed as text, hex or Base64. */
export function secretBytes(value: string, kind: 'text' | 'hex' | 'base64'): { ok: true; bytes: Uint8Array } | { ok: false; error: string } {
  if (kind === 'text') return { ok: true, bytes: new TextEncoder().encode(value) };
  if (kind === 'hex') {
    const clean = value.replace(/[\s:]/g, '');
    if (!/^[0-9a-fA-F]*$/.test(clean)) return { ok: false, error: 'Secret is not valid hex.' };
    if (clean.length % 2) return { ok: false, error: 'Hex secret has an odd number of digits.' };
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return { ok: true, bytes: out };
  }
  const clean = value.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) return { ok: false, error: 'Secret is not valid Base64.' };
  const bin = atob(clean + '='.repeat((4 - (clean.length % 4)) % 4));
  return { ok: true, bytes: Uint8Array.from(bin, (c) => c.charCodeAt(0)) };
}

const DIGEST_BYTES: Record<HashAlgo, number> = { md5: 16, sha1: 20, sha256: 32, sha384: 48, sha512: 64 };

/** Normalizes a pasted digest to bytes: strips spaces and colons, auto-detects hex vs Base64. */
export function parseExpected(input: string): Uint8Array | null {
  const t = input.trim();
  const hex = t.replace(/[\s:]/g, '');
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
    const r = secretBytes(hex, 'hex');
    if (r.ok) return r.bytes;
  }
  const b64 = t.replace(/\s/g, '');
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(b64)) {
    const r = secretBytes(b64, 'base64');
    if (r.ok && r.bytes.length > 0) return r.bytes;
  }
  return null;
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export function compareDigest(
  expected: string,
  results: { algo: HashAlgo; bytes: Uint8Array }[],
): { valid: boolean; matched: HashAlgo[]; lengthFits: HashAlgo[] } {
  const parsed = parseExpected(expected);
  if (!parsed) return { valid: false, matched: [], lengthFits: [] };
  const lengthFits = (Object.keys(DIGEST_BYTES) as HashAlgo[]).filter((a) => DIGEST_BYTES[a] === parsed.length);
  const matched = results.filter((r) => constantTimeEqual(r.bytes, parsed)).map((r) => r.algo);
  return { valid: true, matched, lengthFits };
}

export const checksumLine = (hex: string, filename: string): string => `${hex}  ${filename}\n`;
