import * as OTPAuth from 'otpauth';

export type Algorithm = 'SHA1' | 'SHA256' | 'SHA512';

/** The plaintext record. It only ever exists in memory or inside an AES-GCM envelope. */
export interface TotpEntry {
  type: 'totp' | 'hotp';
  issuer: string;
  account: string;
  secret: string; // normalized base32, no padding
  algorithm: Algorithm;
  digits: 6 | 8;
  period: number;
  counter: number;
  folder: string;
  notes: string;
}

export const DEFAULTS = { algorithm: 'SHA1' as Algorithm, digits: 6 as const, period: 30, counter: 0 };

export class ParseError extends Error {}

/** Strips spaces/hyphens, uppercases, removes padding. Throws ParseError that points at the bad character. */
export function normalizeSecret(input: string): { secret: string; warning?: string } {
  const clean = input.replace(/[\s-]/g, '').toUpperCase().replace(/=+$/, '');
  if (!clean) throw new ParseError('Enter the secret key.');
  for (let i = 0; i < clean.length; i++) {
    if (!/[A-Z2-7]/.test(clean[i] ?? "")) {
      throw new ParseError(`Character ${i + 1} ("${clean[i]}") is not valid. Secrets use only letters A-Z and digits 2-7.`);
    }
  }
  const r = clean.length % 8;
  if (r === 1 || r === 3 || r === 6) {
    throw new ParseError('This secret has an impossible length. Check that you copied all of it.');
  }
  const bits = Math.floor((clean.length * 5) / 8) * 8;
  return {
    secret: clean,
    warning: bits < 128 ? 'This secret is shorter than 128 bits. Many services still issue these, so it is allowed.' : undefined,
  };
}

export function padBase32(secret: string): string {
  return secret + '='.repeat((8 - (secret.length % 8)) % 8);
}

export function validateEntry(e: TotpEntry): void {
  if (!['SHA1', 'SHA256', 'SHA512'].includes(e.algorithm)) throw new ParseError(`Unsupported algorithm "${e.algorithm}".`);
  if (e.digits !== 6 && e.digits !== 8) throw new ParseError('Digits must be 6 or 8.');
  if (e.type === 'totp' && (!Number.isInteger(e.period) || e.period < 15 || e.period > 120)) {
    throw new ParseError('Period must be between 15 and 120 seconds.');
  }
  normalizeSecret(e.secret);
}

const secretOf = (e: TotpEntry) => OTPAuth.Secret.fromBase32(padBase32(e.secret));

/** RFC 6238 code at `nowMs` (already drift-adjusted) or RFC 4226 code at the stored counter. */
export function generateCode(e: TotpEntry, nowMs: number, counterOverride?: number): string {
  if (e.type === 'hotp') {
    return OTPAuth.HOTP.generate({ secret: secretOf(e), algorithm: e.algorithm, digits: e.digits, counter: counterOverride ?? e.counter });
  }
  return OTPAuth.TOTP.generate({ secret: secretOf(e), algorithm: e.algorithm, digits: e.digits, period: e.period, timestamp: nowMs });
}

/** Seconds left in the current window, with sub-second precision. */
export function remaining(period: number, nowMs: number): number {
  return period - ((nowMs / 1000) % period);
}

export const groupCode = (code: string) =>
  code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : `${code.slice(0, 3)} ${code.slice(3)}`;

/** Parses otpauth://totp|hotp/Issuer:account?secret=... */
export function parseOtpauthUri(uri: string): TotpEntry {
  let url: URL;
  try {
    url = new URL(uri.trim());
  } catch {
    throw new ParseError('That is not a valid link.');
  }
  if (url.protocol !== 'otpauth:') throw new ParseError('The link must start with otpauth://');
  const type = url.hostname.toLowerCase();
  if (type !== 'totp' && type !== 'hotp') {
    throw new ParseError(`Unsupported type "${type}". Only totp and hotp are supported (Steam Guard is not).`);
  }
  let label: string;
  try {
    label = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    throw new ParseError('The account label is malformed.');
  }
  const p = url.searchParams;
  let issuer = '';
  let account = label;
  const colon = label.indexOf(':');
  if (colon >= 0) {
    issuer = label.slice(0, colon).trim();
    account = label.slice(colon + 1).trim();
  }
  if (p.get('issuer')) issuer = p.get('issuer')!.trim();
  const rawSecret = p.get('secret');
  if (!rawSecret) throw new ParseError('The link has no secret.');
  const algo = (p.get('algorithm') ?? 'SHA1').toUpperCase().replace('-', '');
  if (!['SHA1', 'SHA256', 'SHA512'].includes(algo)) throw new ParseError(`Unsupported algorithm "${p.get('algorithm')}".`);
  const digits = Number(p.get('digits') ?? 6);
  if (digits !== 6 && digits !== 8) throw new ParseError(`Unsupported digits "${p.get('digits')}". Use 6 or 8.`);
  const period = Number(p.get('period') ?? 30);
  if (type === 'totp' && (!Number.isInteger(period) || period < 15 || period > 120)) {
    throw new ParseError('Period must be between 15 and 120 seconds.');
  }
  let counter = 0;
  if (type === 'hotp') {
    if (p.get('counter') === null) throw new ParseError('HOTP links need a counter.');
    counter = Number(p.get('counter'));
    if (!Number.isInteger(counter) || counter < 0) throw new ParseError('The counter is not valid.');
  }
  return {
    type,
    issuer: issuer.normalize('NFC'),
    account: account.normalize('NFC'),
    secret: normalizeSecret(rawSecret).secret,
    algorithm: algo as Algorithm,
    digits,
    period: type === 'totp' ? period : 30,
    counter,
    folder: '',
    notes: '',
  };
}

export function buildOtpauthUri(e: TotpEntry): string {
  const label = e.issuer ? `${encodeURIComponent(e.issuer)}:${encodeURIComponent(e.account)}` : encodeURIComponent(e.account);
  const q = new URLSearchParams({ secret: e.secret });
  if (e.issuer) q.set('issuer', e.issuer);
  q.set('algorithm', e.algorithm);
  q.set('digits', String(e.digits));
  if (e.type === 'totp') q.set('period', String(e.period));
  else q.set('counter', String(e.counter));
  return `otpauth://${e.type}/${label}?${q.toString()}`;
}

/** Short one-way fingerprint for duplicate detection and conflict display. */
export async function fingerprint(secret: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(buf).slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const sameAccount = (a: TotpEntry, b: TotpEntry) =>
  a.issuer.toLowerCase() === b.issuer.toLowerCase() && a.account.toLowerCase() === b.account.toLowerCase();
