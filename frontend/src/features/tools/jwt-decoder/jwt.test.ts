import { describe, expect, it } from 'vitest';
import {
  b64urlDecode,
  b64urlEncode,
  claimTimes,
  cleanToken,
  decodeToken,
  derToRawEcdsa,
  pkcs1ToSpki,
  relativeTime,
  tokenWarnings,
  verifySignature,
  weakSecretReason,
  type DecodedToken,
} from './jwt';

// The canonical jwt.io example (HS256, secret "your-256-bit-secret").
const JWT_IO =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

function tok(raw: string): DecodedToken {
  const r = decodeToken(raw);
  if (!r.ok) throw new Error(r.message);
  return r.token;
}

const enc = (o: unknown) => b64urlEncode(new TextEncoder().encode(JSON.stringify(o)));

describe('decodeToken', () => {
  it('decodes the jwt.io example', () => {
    const t = tok(JWT_IO);
    expect(t.header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(t.payload).toEqual({ sub: '1234567890', name: 'John Doe', iat: 1516239022 });
    expect(t.alg).toBe('HS256');
  });

  it('cleans Bearer prefix, whitespace, quotes and line breaks', () => {
    const wrapped = `Authorization: Bearer "${JWT_IO.slice(0, 40)}\n  ${JWT_IO.slice(40)}"`;
    expect(cleanToken(wrapped)).toBe(JWT_IO);
    expect(decodeToken(wrapped).ok).toBe(true);
  });

  it('accepts padded base64url', () => {
    const [h, p, s] = JWT_IO.split('.');
    const pad = (x: string) => x + '='.repeat((4 - (x.length % 4)) % 4);
    expect(decodeToken(`${pad(h!)}.${pad(p!)}.${s}`).ok).toBe(true);
  });

  it('rejects wrong part counts and non-JSON headers', () => {
    expect(decodeToken('abc.def').ok).toBe(false);
    expect(decodeToken('!!!.e30.sig').ok).toBe(false);
    expect(decodeToken('').ok).toBe(false);
  });

  it('detects JWE', () => {
    const t = tok(`${enc({ alg: 'RSA-OAEP', enc: 'A128GCM' })}.a.b.c.d`);
    expect(t.kind).toBe('jwe');
    expect(tokenWarnings(t, 0)[0]?.id).toBe('jwe');
  });

  it('keeps big integer claims exact in the pretty payload', () => {
    const raw = `${enc({ alg: 'none' })}.${b64urlEncode(new TextEncoder().encode('{"id":9007199254740993}'))}.`;
    expect(tok(raw).payloadJson).toContain('9007199254740993');
  });

  it('shows non-JSON payloads as text', () => {
    const t = tok(`${enc({ alg: 'HS256' })}.${b64urlEncode(new TextEncoder().encode('hello'))}.sig`);
    expect(t.payloadText).toBe('hello');
  });
});

describe('claims and warnings', () => {
  it('formats exp relative to now, in a given zone', () => {
    const now = 1_700_000_000;
    const c = claimTimes({ exp: now + 7200, iat: now - 86_400, nbf: now + 60 }, now, 'UTC');
    const exp = c.find((x) => x.claim === 'exp')!;
    expect(exp.relative).toBe('in 2 hours');
    expect(exp.state).toBe('valid');
    expect(c.find((x) => x.claim === 'iat')!.relative).toBe('yesterday');
    expect(c.find((x) => x.claim === 'nbf')!.state).toBe('future');
    expect(exp.utc).toContain('2023');
  });

  it('flags expired and millisecond timestamps', () => {
    expect(relativeTime(100, 200)).toMatch(/ago/);
    const c = claimTimes({ exp: 1_700_000_000_000 }, 1_800_000_000, 'UTC')[0]!;
    expect(c.note).toMatch(/milliseconds/);
    expect(c.state).toBe('expired');
  });

  it('warns on alg none, empty signature and header key injection', () => {
    const t = tok(`${enc({ alg: 'none', jku: 'http://evil' })}.${enc({ a: 1 })}.`);
    const ids = tokenWarnings(t, 0).map((w) => w.id);
    expect(ids).toContain('none');
    expect(ids).toContain('jku');
    expect(ids).toContain('noexp');
  });
});

describe('weak secrets', () => {
  it('flags common and short secrets', () => {
    expect(weakSecretReason('your-256-bit-secret', 'HS256')).toMatch(/common/);
    expect(weakSecretReason('abc', 'HS256')).toMatch(/Shorter/);
    expect(weakSecretReason('x7Vq9!mPz2Lk8#Rt4Wn6Yb1Dc3Gh5Jf0', 'HS256')).toBeNull();
  });
});

describe('verifySignature', () => {
  it('verifies the jwt.io known-answer vector', async () => {
    const ok = await verifySignature({ token: tok(JWT_IO), key: 'your-256-bit-secret' });
    expect(ok.status).toBe('valid');
    const bad = await verifySignature({ token: tok(JWT_IO), key: 'wrong' });
    expect(bad.status).toBe('invalid');
  });

  it('detects a tampered payload', async () => {
    const [h, , s] = JWT_IO.split('.');
    const forged = `${h}.${enc({ sub: 'admin' })}.${s}`;
    expect((await verifySignature({ token: tok(forged), key: 'your-256-bit-secret' })).status).toBe('invalid');
  });

  it('verifies RS256 and PS256 with a PEM public key and a JWK', async () => {
    for (const [alg, name, saltLength] of [['RS256', 'RSASSA-PKCS1-v1_5', undefined], ['PS256', 'RSA-PSS', 32]] as const) {
      const pair = await crypto.subtle.generateKey({ name, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
      const input = `${enc({ alg })}.${enc({ sub: 'x' })}`;
      const sig = new Uint8Array(await crypto.subtle.sign(saltLength ? { name, saltLength } : name, pair.privateKey, new TextEncoder().encode(input)));
      const token = tok(`${input}.${b64urlEncode(sig)}`);
      const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
      const pem = `-----BEGIN PUBLIC KEY-----\n${btoa(String.fromCharCode(...spki))}\n-----END PUBLIC KEY-----`;
      expect((await verifySignature({ token, key: pem })).status).toBe('valid');
      const jwk = JSON.stringify({ keys: [await crypto.subtle.exportKey('jwk', pair.publicKey)] });
      expect((await verifySignature({ token, key: jwk })).status).toBe('valid');
    }
  });

  it('verifies ES256 raw r||s signatures and converts DER ones', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const input = `${enc({ alg: 'ES256' })}.${enc({ sub: 'x' })}`;
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(input)));
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
    const pem = `-----BEGIN PUBLIC KEY-----\n${btoa(String.fromCharCode(...spki))}\n-----END PUBLIC KEY-----`;
    expect((await verifySignature({ token: tok(`${input}.${b64urlEncode(raw)}`), key: pem })).status).toBe('valid');

    // Build the DER form of the same signature.
    const int = (b: Uint8Array) => {
      let v = Array.from(b);
      while (v.length > 1 && v[0] === 0) v = v.slice(1);
      if (v[0]! & 0x80) v = [0, ...v];
      return [0x02, v.length, ...v];
    };
    const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))];
    const der = Uint8Array.from([0x30, body.length, ...body]);
    expect(derToRawEcdsa(der, 32)).toEqual(raw);
    const viaDer = await verifySignature({ token: tok(`${input}.${b64urlEncode(der)}`), key: pem });
    expect(viaDer.status).toBe('valid');
  });

  it('wraps PKCS#1 public keys into SPKI', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
    // SPKI for RSA 2048: 24-byte header (incl. BIT STRING and unused-bits byte) wraps the PKCS#1 key.
    const pkcs1 = spki.slice(24);
    expect(pkcs1ToSpki(pkcs1)).toEqual(spki);
  });

  it('rejects private keys and reports a clear error without a key', async () => {
    expect((await verifySignature({ token: tok(JWT_IO), key: '' })).status).toBe('error');
    const t = tok(`${enc({ alg: 'RS256' })}.${enc({})}.AAAA`);
    const r = await verifySignature({ token: t, key: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----' });
    expect(r.message).toMatch(/private key/);
  });

  it('warns about algorithm confusion when a PEM is used as an HMAC secret', async () => {
    const r = await verifySignature({ token: tok(JWT_IO), key: '-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----' });
    expect(r.warnings.join(' ')).toMatch(/algorithm confusion/);
  });

  it('b64url round-trips', () => {
    const bytes = Uint8Array.from([251, 255, 254, 0, 1]);
    expect(b64urlDecode(b64urlEncode(bytes))).toEqual(bytes);
  });
});
