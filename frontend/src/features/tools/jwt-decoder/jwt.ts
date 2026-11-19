/** Pure JWT helpers: tolerant decoding, claim times, warnings and WebCrypto signature verification. */

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

export function cleanToken(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^authorization\s*:\s*/i, '');
  t = t.replace(/^bearer\s+/i, '');
  t = t.replace(/^["'`]+|["'`]+$/g, '');
  return t.replace(/\s+/g, '');
}

/** Decodes base64url with or without padding; also tolerates standard base64 characters. */
export function b64urlDecode(input: string): Uint8Array {
  const s = input.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*$/.test(s) || s.length % 4 === 1) throw new Error('not valid base64url');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type JsonObject = Record<string, unknown>;

export interface DecodedToken {
  kind: 'jws' | 'jwe';
  header: JsonObject;
  /** Parsed payload when it is a JSON object; otherwise undefined and `payloadText` holds the raw text. */
  payload?: JsonObject;
  payloadText?: string;
  headerJson: string;
  payloadJson: string;
  signature: string;
  signingInput: string;
  alg: string;
  parts: string[];
}

export type DecodeResult = { ok: true; token: DecodedToken } | { ok: false; message: string; hint?: string };

/** Pretty JSON that keeps big integer text intact by re-emitting the original number tokens. */
function prettyKeepingNumbers(text: string, value: unknown): string {
  const pretty = JSON.stringify(value, null, 2);
  const bigs = text.match(/-?\d{16,}/g);
  if (!bigs) return pretty;
  // Replace rounded numbers with their original digits where the rounded form appears verbatim.
  return bigs.reduce((acc, big) => {
    const rounded = String(Number(big));
    return rounded !== big && !rounded.includes('e') ? acc.replace(new RegExp(`(?<![\\d.])${rounded}(?![\\d.])`), big) : acc;
  }, pretty);
}

function decodeJsonPart(part: string, label: string): { ok: true; text: string; value: unknown } | { ok: false; message: string } {
  let bytes: Uint8Array;
  try {
    bytes = b64urlDecode(part);
  } catch {
    return { ok: false, message: `The ${label} is not valid base64url.` };
  }
  const text = decoder.decode(bytes);
  try {
    return { ok: true, text, value: JSON.parse(text) };
  } catch {
    return { ok: false, message: `The ${label} decoded, but it is not valid JSON.` };
  }
}

export function decodeToken(raw: string): DecodeResult {
  const cleaned = cleanToken(raw);
  if (!cleaned) return { ok: false, message: 'Paste a token to decode it.' };
  const parts = cleaned.split('.');
  if (parts.length !== 3 && parts.length !== 5) {
    return {
      ok: false,
      message: `A JWT has three dot-separated parts (JWE has five); this one has ${parts.length}.`,
      hint: parts.length < 3 ? 'The token may be cut off. Copy it again including everything after the second dot.' : 'Remove anything extra around the token.',
    };
  }
  const head = decodeJsonPart(parts[0]!, 'header');
  if (!head.ok) return { ok: false, message: head.message, hint: 'This does not look like a JWT. The first part must be base64url JSON.' };
  if (head.value === null || typeof head.value !== 'object' || Array.isArray(head.value)) {
    return { ok: false, message: 'The header is JSON but not an object.' };
  }
  const header = head.value as JsonObject;
  const alg = typeof header.alg === 'string' ? header.alg : '';

  if (parts.length === 5) {
    if (typeof header.enc !== 'string') return { ok: false, message: 'Five parts but the header has no "enc": this is not a valid JWE.' };
    return {
      ok: true,
      token: { kind: 'jwe', header, headerJson: prettyKeepingNumbers(head.text, header), payloadJson: '', signature: '', signingInput: '', alg, parts },
    };
  }

  const body = decodeJsonPart(parts[1]!, 'payload');
  let payload: JsonObject | undefined;
  let payloadText: string | undefined;
  let payloadJson: string;
  if (body.ok && body.value !== null && typeof body.value === 'object' && !Array.isArray(body.value)) {
    payload = body.value as JsonObject;
    payloadJson = prettyKeepingNumbers(body.text, payload);
  } else {
    // Some tokens carry a plain string or non-JSON payload; show it as text instead of failing.
    try {
      payloadText = decoder.decode(b64urlDecode(parts[1]!));
    } catch {
      return { ok: false, message: 'The payload is not valid base64url.' };
    }
    payloadJson = payloadText;
  }
  if (parts[2] !== '') {
    try {
      b64urlDecode(parts[2]!);
    } catch {
      return { ok: false, message: 'The signature is not valid base64url.' };
    }
  }
  return {
    ok: true,
    token: { kind: 'jws', header, payload, payloadText, headerJson: prettyKeepingNumbers(head.text, header), payloadJson, signature: parts[2]!, signingInput: `${parts[0]}.${parts[1]}`, alg, parts },
  };
}

/* ---------- Claim times ---------- */

export interface ClaimTime {
  claim: 'exp' | 'iat' | 'nbf';
  label: string;
  seconds: number;
  utc: string;
  local: string;
  relative: string;
  /** Machine-readable state; the UI also prints it as text. */
  state: 'expired' | 'valid' | 'future' | 'past';
  note?: string;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_557_600],
  ['month', 2_629_800],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

export function relativeTime(targetSec: number, nowSec: number): string {
  const diff = targetSec - nowSec;
  const abs = Math.abs(diff);
  if (abs < 1) return 'now';
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (abs >= size) return rtf.format(Math.trunc(diff / size), unit);
  }
  return rtf.format(Math.trunc(diff), 'second');
}

export function formatInZone(sec: number, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'long', timeZone }).format(new Date(sec * 1000));
  } catch {
    return new Date(sec * 1000).toString();
  }
}

export function claimTimes(payload: JsonObject | undefined, nowSec: number, timeZone?: string): ClaimTime[] {
  if (!payload) return [];
  const defs: [ClaimTime['claim'], string][] = [
    ['iat', 'Issued at'],
    ['nbf', 'Not before'],
    ['exp', 'Expires'],
  ];
  const out: ClaimTime[] = [];
  for (const [claim, label] of defs) {
    const v = payload[claim];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    let seconds = v;
    let note: string | undefined;
    // 13-digit values are almost certainly milliseconds; JWT NumericDate is seconds.
    if (v > 1e11) {
      seconds = Math.floor(v / 1000);
      note = 'Looks like milliseconds. JWT times are seconds, so other libraries may read this as a date far in the future.';
    }
    if (seconds > 8.64e12 || seconds < -8.64e12) continue;
    const state: ClaimTime['state'] =
      claim === 'exp' ? (seconds <= nowSec ? 'expired' : 'valid') : claim === 'nbf' ? (seconds > nowSec ? 'future' : 'past') : 'past';
    out.push({ claim, label, seconds, utc: formatInZone(seconds, 'UTC'), local: formatInZone(seconds, timeZone), relative: relativeTime(seconds, nowSec), state, note });
  }
  return out;
}

/* ---------- Warnings ---------- */

export interface TokenWarning {
  id: string;
  level: 'danger' | 'warn' | 'info';
  text: string;
}

export function tokenWarnings(t: DecodedToken, nowSec: number): TokenWarning[] {
  const w: TokenWarning[] = [];
  const alg = t.alg;
  if (t.kind === 'jwe') {
    w.push({ id: 'jwe', level: 'info', text: 'This is an encrypted token (JWE). Only the header is readable; the claims need the decryption key.' });
    return w;
  }
  if (!alg) w.push({ id: 'noalg', level: 'warn', text: 'The header has no "alg" claim, so the signature type is unknown.' });
  if (alg.toLowerCase() === 'none') {
    w.push({ id: 'none', level: 'danger', text: 'alg is "none": this token is unsigned and anyone can forge it. A server must never accept it.' });
  } else if (t.signature === '') {
    w.push({ id: 'nosig', level: 'danger', text: 'The signature part is empty, so this token is not signed.' });
  }
  if (typeof t.header.jku === 'string' || typeof t.header.x5u === 'string') {
    w.push({ id: 'jku', level: 'warn', text: 'The header points to a remote key URL (jku / x5u). Servers must not fetch keys from URLs chosen by the token.' });
  }
  if (t.header.jwk && typeof t.header.jwk === 'object') {
    w.push({ id: 'jwk', level: 'warn', text: 'The header embeds its own key (jwk). Trusting it would let an attacker sign with their own key.' });
  }
  if (typeof t.header.crit !== 'undefined') w.push({ id: 'crit', level: 'info', text: 'The header lists critical extensions (crit); verifiers must understand all of them or reject the token.' });
  const p = t.payload;
  if (p) {
    if (typeof p.exp === 'number') {
      const exp = p.exp > 1e11 ? p.exp / 1000 : p.exp;
      if (exp <= nowSec) w.push({ id: 'expired', level: 'danger', text: `Expired ${relativeTime(exp, nowSec)}.` });
    } else {
      w.push({ id: 'noexp', level: 'info', text: 'No "exp" claim: this token never expires.' });
    }
    if (typeof p.nbf === 'number' && p.nbf > nowSec) w.push({ id: 'nbf', level: 'warn', text: `Not valid yet (nbf is ${relativeTime(p.nbf, nowSec)}).` });
    if (typeof p.iat === 'number' && p.iat > nowSec + 300) w.push({ id: 'iat', level: 'warn', text: 'The issue time is in the future, so the issuer clock may be ahead.' });
  }
  return w;
}

/* ---------- Weak secrets ---------- */

const COMMON_SECRETS = [
  'secret', 'password', 'changeme', 'admin', 'test', 'jwt', 'jwtsecret', 'jwt_secret', 'jwt-secret', 'your-256-bit-secret', 'your-secret-key',
  'mysecret', 'my-secret', 'supersecret', 'super-secret', 'secretkey', 'secret_key', '123456', '12345678', 'qwerty', 'letmein', 'default',
  'key', 'token', 'hs256', 'shhhhh', 'keyboard cat', 'development', 'dev', 'example', 'private', 'abc123', 'your-512-bit-secret', 'your-384-bit-secret',
];

export function weakSecretReason(secret: string, alg: string): string | null {
  if (!secret) return null;
  if (COMMON_SECRETS.includes(secret.toLowerCase())) return 'This is a very common secret and would be found in seconds by a guessing attack.';
  const need = alg === 'HS512' ? 64 : alg === 'HS384' ? 48 : 32;
  if (secret.length < need) return `Shorter than the hash output (${need} bytes recommended for ${alg || 'HS256'}), so it is easier to brute-force.`;
  if (/^(.)\1+$/.test(secret)) return 'The secret repeats one character.';
  return null;
}

/* ---------- Verification ---------- */

export interface VerifyResult {
  status: 'valid' | 'invalid' | 'error';
  message: string;
  warnings: string[];
}

const HASH: Record<string, 'SHA-256' | 'SHA-384' | 'SHA-512'> = { '256': 'SHA-256', '384': 'SHA-384', '512': 'SHA-512' };
const CURVE: Record<string, string> = { ES256: 'P-256', ES384: 'P-384', ES512: 'P-521' };
const ECDSA_SIG_LEN: Record<string, number> = { ES256: 64, ES384: 96, ES512: 132 };

export function pemToDer(pem: string): { label: string; der: Uint8Array } | null {
  const m = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(pem);
  if (!m) return null;
  try {
    return { label: m[1]!, der: b64urlDecode(m[2]!.replace(/\s+/g, '')) };
  } catch {
    return null;
  }
}

function derLength(n: number): number[] {
  if (n < 128) return [n];
  const bytes: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 255);
  return [0x80 | bytes.length, ...bytes];
}

/** Wraps a PKCS#1 RSAPublicKey into SubjectPublicKeyInfo so WebCrypto can import it. */
export function pkcs1ToSpki(pkcs1: Uint8Array): Uint8Array {
  const algId = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const bits = [0x03, ...derLength(pkcs1.length + 1), 0x00, ...pkcs1];
  const body = [...algId, ...bits];
  return Uint8Array.from([0x30, ...derLength(body.length), ...body]);
}

/** Converts an ASN.1 DER ECDSA signature to the raw r||s form that JWS and WebCrypto use. */
export function derToRawEcdsa(der: Uint8Array, size: number): Uint8Array {
  let i = 2;
  if (der[1]! & 0x80) i += der[1]! & 0x7f;
  const readInt = (): Uint8Array => {
    if (der[i] !== 0x02) throw new Error('bad DER');
    const len = der[i + 1]!;
    let v = der.slice(i + 2, i + 2 + len);
    i += 2 + len;
    while (v.length > size && v[0] === 0) v = v.slice(1);
    const padded = new Uint8Array(size);
    padded.set(v, size - v.length);
    return padded;
  };
  const r = readInt();
  const s = readInt();
  const out = new Uint8Array(size * 2);
  out.set(r);
  out.set(s, size);
  return out;
}

function algParams(alg: string): { importAlg: unknown; verifyAlg: unknown; usage: 'verify' } | null {
  const num = alg.slice(2);
  const hash = HASH[num];
  if (/^HS(256|384|512)$/.test(alg)) return { importAlg: { name: 'HMAC', hash }, verifyAlg: 'HMAC', usage: 'verify' };
  if (/^RS(256|384|512)$/.test(alg)) return { importAlg: { name: 'RSASSA-PKCS1-v1_5', hash }, verifyAlg: 'RSASSA-PKCS1-v1_5', usage: 'verify' };
  if (/^PS(256|384|512)$/.test(alg)) {
    const saltLength = Number(num) / 8;
    return { importAlg: { name: 'RSA-PSS', hash }, verifyAlg: { name: 'RSA-PSS', saltLength }, usage: 'verify' };
  }
  if (/^ES(256|384|512)$/.test(alg)) {
    return { importAlg: { name: 'ECDSA', namedCurve: CURVE[alg] }, verifyAlg: { name: 'ECDSA', hash }, usage: 'verify' };
  }
  if (alg === 'EdDSA') return { importAlg: { name: 'Ed25519' }, verifyAlg: 'Ed25519', usage: 'verify' };
  return null;
}

export interface VerifyInput {
  token: DecodedToken;
  /** HS*: the shared secret. Other algorithms: a PEM public key or a JWK / JWKS JSON. */
  key: string;
  secretEncoding?: 'utf8' | 'base64';
}

function pickJwk(text: string, kid: unknown): JsonObject {
  const parsed = JSON.parse(text) as JsonObject;
  if (Array.isArray(parsed.keys)) {
    const keys = parsed.keys as JsonObject[];
    const match = typeof kid === 'string' ? keys.find((k) => k.kid === kid) : undefined;
    const chosen = match ?? keys[0];
    if (!chosen) throw new Error('The JWKS contains no keys.');
    return chosen;
  }
  return parsed;
}

export async function verifySignature(input: VerifyInput, subtle: SubtleCrypto = globalThis.crypto.subtle): Promise<VerifyResult> {
  const { token } = input;
  const alg = token.alg;
  const warnings: string[] = [];
  if (token.kind === 'jwe') return { status: 'error', message: 'Encrypted tokens (JWE) cannot be verified here.', warnings };
  if (alg.toLowerCase() === 'none') return { status: 'invalid', message: 'alg is "none": there is no signature to verify. Treat this token as untrusted.', warnings };
  const params = algParams(alg);
  if (!params) return { status: 'error', message: `Unsupported algorithm "${alg || 'missing'}".`, warnings };
  if (!input.key.trim()) return { status: 'error', message: alg.startsWith('HS') ? 'Enter the secret to verify the signature.' : 'Paste a public key (PEM or JWK) to verify the signature.', warnings };

  const isPemLike = /-----BEGIN/.test(input.key);
  let key: CryptoKey;
  try {
    if (alg.startsWith('HS')) {
      if (isPemLike) warnings.push('A PEM was pasted as an HMAC secret. Never verify an HS token with a public key: that is the algorithm confusion attack.');
      const raw = input.secretEncoding === 'base64' ? b64urlDecode(input.key.trim()) : encoder.encode(input.key);
      key = await subtle.importKey('raw', raw as BufferSource, params.importAlg as HmacImportParams, false, ['verify']);
    } else if (isPemLike) {
      const pem = pemToDer(input.key);
      if (!pem) return { status: 'error', message: 'Could not read the PEM block. Check the BEGIN and END lines.', warnings };
      if (/PRIVATE KEY/.test(pem.label)) return { status: 'error', message: 'That is a private key. Paste the public key instead; private keys must never be pasted into web pages.', warnings };
      if (pem.label === 'CERTIFICATE') return { status: 'error', message: 'Certificates are not supported. Extract the public key (openssl x509 -pubkey -noout) and paste that.', warnings };
      const der = pem.label === 'RSA PUBLIC KEY' ? pkcs1ToSpki(pem.der) : pem.der;
      key = await subtle.importKey('spki', der as BufferSource, params.importAlg as RsaHashedImportParams, false, ['verify']);
    } else {
      const jwk = pickJwk(input.key, token.header.kid);
      if ('d' in jwk) return { status: 'error', message: 'That JWK contains a private key ("d"). Paste only the public part.', warnings };
      key = await subtle.importKey('jwk', jwk as JsonWebKey, params.importAlg as RsaHashedImportParams, false, ['verify']);
    }
  } catch (e) {
    return { status: 'error', message: `Could not use that key for ${alg}: ${e instanceof Error ? e.message : 'import failed'}.`, warnings };
  }

  let sig = b64urlDecode(token.signature);
  if (alg.startsWith('ES')) {
    const size = ECDSA_SIG_LEN[alg]!;
    if (sig.length !== size && sig[0] === 0x30) {
      try {
        sig = derToRawEcdsa(sig, size / 2);
        warnings.push('The signature was in ASN.1 DER form; it was converted to the raw r||s form JWT requires.');
      } catch {
        return { status: 'invalid', message: 'The ECDSA signature is malformed.', warnings };
      }
    } else if (sig.length !== size) {
      return { status: 'invalid', message: `An ${alg} signature must be ${size} bytes; this one is ${sig.length}.`, warnings };
    }
  }
  try {
    const ok = await subtle.verify(params.verifyAlg as AlgorithmIdentifier, key, sig as BufferSource, encoder.encode(token.signingInput) as BufferSource);
    return ok
      ? { status: 'valid', message: 'Signature verified. The token was signed with this key and has not been altered.', warnings }
      : { status: 'invalid', message: 'Signature does not match. The key is wrong or the token was modified.', warnings };
  } catch (e) {
    return { status: 'error', message: `Verification failed: ${e instanceof Error ? e.message : 'unknown error'}.`, warnings };
  }
}
