/** Base64 / Base64URL helpers. Everything goes through bytes, never btoa on a JS string. */

export type Alphabet = 'standard' | 'url';

const STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const URL_SAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export interface EncodeOptions {
  alphabet: Alphabet;
  padding: boolean;
  /** 0 = no wrapping. */
  wrap: 0 | 64 | 76;
  newline: '\n' | '\r\n';
}

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

export function encodeBytes(bytes: Uint8Array, opts: EncodeOptions): string {
  const table = opts.alphabet === 'url' ? URL_SAFE : STD;
  const parts: string[] = [];
  const full = bytes.length - (bytes.length % 3);
  for (let i = 0; i < full; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    parts.push(table[(n >> 18) & 63]! + table[(n >> 12) & 63]! + table[(n >> 6) & 63]! + table[n & 63]!);
  }
  const rest = bytes.length - full;
  if (rest === 1) {
    const n = bytes[full]! << 16;
    parts.push(table[(n >> 18) & 63]! + table[(n >> 12) & 63]! + (opts.padding ? '==' : ''));
  } else if (rest === 2) {
    const n = (bytes[full]! << 16) | (bytes[full + 1]! << 8);
    parts.push(table[(n >> 18) & 63]! + table[(n >> 12) & 63]! + table[(n >> 6) & 63]! + (opts.padding ? '=' : ''));
  }
  const out = parts.join('');
  return opts.wrap > 0 ? wrapLines(out, opts.wrap, opts.newline) : out;
}

export function wrapLines(text: string, width: number, newline: string): string {
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += width) lines.push(text.slice(i, i + width));
  return lines.join(newline);
}

export interface DecodeResult {
  ok: true;
  bytes: Uint8Array;
  alphabet: Alphabet | 'none';
  notes: string[];
  mime?: string;
}
export interface DecodeFailure {
  ok: false;
  error: string;
  /** Zero-based index into the original input. */
  position?: number;
  canStrip?: boolean;
}

/** Splits a `data:<mime>;base64,` prefix off. */
export function parseDataUri(input: string): { mime: string; payload: string } | null {
  const m = /^\s*data:([^,;]*)((?:;[^,;]*)*),/i.exec(input);
  if (!m) return null;
  if (!/;base64/i.test(m[2] ?? '')) return null;
  return { mime: m[1] || 'text/plain', payload: input.slice(m[0].length) };
}

export function decodeBase64(input: string, opts: { stripInvalid?: boolean } = {}): DecodeResult | DecodeFailure {
  const notes: string[] = [];
  let mime: string | undefined;
  let text = input;
  const uri = parseDataUri(input);
  if (uri) {
    mime = uri.mime;
    text = uri.payload;
    notes.push(`Data URI prefix read (${uri.mime}).`);
  }
  const base = uri ? input.length - uri.payload.length : 0;
  let hasStd = false;
  let hasUrl = false;
  let clean = '';
  let strippedCount = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (/\s/.test(ch)) continue;
    if (/[A-Za-z0-9+/\-_=]/.test(ch)) {
      if (ch === '+' || ch === '/') hasStd = true;
      else if (ch === '-' || ch === '_') hasUrl = true;
      clean += ch;
    } else if (opts.stripInvalid) {
      strippedCount++;
    } else {
      const code = ch.codePointAt(0)!;
      const shown = code < 32 ? `U+${code.toString(16).toUpperCase().padStart(4, '0')}` : `"${ch}"`;
      return { ok: false, error: `Invalid character ${shown} at position ${base + i + 1}.`, position: base + i, canStrip: true };
    }
  }
  if (strippedCount) notes.push(`Removed ${strippedCount} invalid character(s).`);
  if (hasStd && hasUrl) {
    return { ok: false, error: 'Mixed alphabets: the input has both + / and - _.' };
  }
  const eq = clean.indexOf('=');
  let padLen = 0;
  if (eq !== -1) {
    const tail = clean.slice(eq);
    if (/[^=]/.test(tail)) return { ok: false, error: `"=" padding is only allowed at the end (data character ${eq + 1}).`, position: eq };
    padLen = tail.length;
    clean = clean.slice(0, eq);
  }
  if (clean.length % 4 === 1) {
    return { ok: false, error: `Invalid length: ${clean.length} data characters cannot be Base64 (a trailing single character carries no full byte).` };
  }
  const expectedPad = (4 - (clean.length % 4)) % 4;
  if (padLen > expectedPad) notes.push(`Excess padding ignored (${padLen} "=" found, ${expectedPad} expected).`);
  else if (padLen < expectedPad) notes.push(padLen === 0 ? 'Missing padding was added.' : 'Incomplete padding was fixed.');
  const table = hasUrl ? URL_SAFE : STD;
  const lookup = new Map<string, number>();
  for (let i = 0; i < 64; i++) lookup.set(table[i]!, i);
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = lookup.get(clean[i]!)!;
    const b = lookup.get(clean[i + 1]!)!;
    const c = i + 2 < clean.length ? lookup.get(clean[i + 2]!)! : -1;
    const d = i + 3 < clean.length ? lookup.get(clean[i + 3]!)! : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  const alphabet: DecodeResult['alphabet'] = hasUrl ? 'url' : hasStd ? 'standard' : 'none';
  if (alphabet === 'url') notes.push('URL-safe alphabet detected (- and _).');
  else if (alphabet === 'standard') notes.push('Standard alphabet detected (+ and /).');
  return { ok: true, bytes: out.subarray(0, o), alphabet, notes, mime };
}

/** Strict UTF-8 decode; null when the bytes are not valid UTF-8. */
export function bytesToText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function toDataUri(mime: string, bytes: Uint8Array): string {
  return `data:${mime || 'application/octet-stream'};base64,${encodeBytes(bytes, { alphabet: 'standard', padding: true, wrap: 0, newline: '\n' })}`;
}

export function toHex(bytes: Uint8Array, upper = false): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return upper ? s.toUpperCase() : s;
}

export function hexDump(bytes: Uint8Array, limit = 512): string {
  const lines: string[] = [];
  const n = Math.min(bytes.length, limit);
  for (let i = 0; i < n; i += 16) {
    const slice = bytes.subarray(i, Math.min(i + 16, n));
    const hex = Array.from(slice, (b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(slice, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${i.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${ascii}`);
  }
  if (bytes.length > n) lines.push(`... ${bytes.length - n} more bytes`);
  return lines.join('\n');
}
