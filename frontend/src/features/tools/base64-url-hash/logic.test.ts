import { describe, expect, it } from 'vitest';
import { bytesToText, decodeBase64, encodeBytes, toDataUri, utf8, type EncodeOptions } from './base64';
import { decodeUrl, encodeUrl, parseUrl } from './url';
import { compareDigest, formatDigest, hashBytes, hmacBytes, parseExpected, secretBytes } from './digest';
import { checkPassword, hashPassword, validateBcryptHash, verifyPassword } from './bcrypt';

const std: EncodeOptions = { alphabet: 'standard', padding: true, wrap: 0, newline: '\n' };
const hex = (b: Uint8Array) => formatDigest(b, 'hex');

describe('base64', () => {
  it('round-trips non-Latin1 text', () => {
    const text = 'héllo 😀 বাংলা مرحبا';
    const enc = encodeBytes(utf8(text), std);
    const dec = decodeBase64(enc);
    expect(dec.ok && bytesToText(dec.bytes)).toBe(text);
  });
  it('matches known vectors', () => {
    expect(encodeBytes(utf8('Man'), std)).toBe('TWFu');
    expect(encodeBytes(utf8('Ma'), std)).toBe('TWE=');
    expect(encodeBytes(utf8('M'), std)).toBe('TQ==');
    expect(encodeBytes(utf8(''), std)).toBe('');
  });
  it('url-safe output without padding', () => {
    const bytes = Uint8Array.from([0xfb, 0xff, 0xfe, 0x01]);
    expect(encodeBytes(bytes, { ...std, alphabet: 'url', padding: false })).toBe('-__-AQ');
    expect(encodeBytes(bytes, std)).toBe('+//+AQ==');
  });
  it('decodes unpadded base64url and notes it', () => {
    const r = decodeBase64('-__-AQ');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Array.from(r.bytes)).toEqual([0xfb, 0xff, 0xfe, 1]);
      expect(r.alphabet).toBe('url');
      expect(r.notes.join(' ')).toMatch(/padding/);
    }
  });
  it('accepts wrapped input and data URIs', () => {
    const wrapped = encodeBytes(utf8('x'.repeat(100)), { ...std, wrap: 76, newline: '\r\n' });
    expect(wrapped.split('\r\n')[0]).toHaveLength(76);
    const r = decodeBase64(wrapped);
    expect(r.ok && bytesToText(r.bytes)).toBe('x'.repeat(100));
    const uri = decodeBase64(toDataUri('text/plain', utf8('hi')));
    expect(uri.ok && uri.mime).toBe('text/plain');
    expect(uri.ok && bytesToText(uri.bytes)).toBe('hi');
  });
  it('reports invalid character positions and can strip', () => {
    const r = decodeBase64('TWFu!TWFu');
    expect(r).toMatchObject({ ok: false, position: 4 });
    const s = decodeBase64('TWFu!TWFu', { stripInvalid: true });
    expect(s.ok && bytesToText(s.bytes)).toBe('ManMan');
  });
  it('rejects mixed alphabets and impossible lengths', () => {
    expect(decodeBase64('a+b-').ok).toBe(false);
    expect(decodeBase64('abcde').ok).toBe(false);
  });
  it('empty decodes to empty without error', () => {
    const r = decodeBase64('');
    expect(r.ok && r.bytes.length).toBe(0);
  });
  it('invalid UTF-8 yields null text', () => {
    expect(bytesToText(Uint8Array.from([0xff, 0xfe]))).toBeNull();
  });
});

describe('url', () => {
  it('modes differ for a b&c=d+e', () => {
    const v = (m: 'component' | 'full' | 'form') => {
      const r = encodeUrl('a b&c=d+e', m);
      return r.ok ? r.value : '';
    };
    expect(v('component')).toBe('a%20b%26c%3Dd%2Be');
    expect(v('full')).toBe('a%20b&c=d+e');
    expect(v('form')).toBe('a+b%26c%3Dd%2Be');
  });
  it('form decode turns + into space, component keeps +', () => {
    expect(decodeUrl('a+b', 'form')).toMatchObject({ ok: true, value: 'a b' });
    expect(decodeUrl('a+b', 'component')).toMatchObject({ ok: true, value: 'a+b' });
  });
  it('reports malformed sequences with position and lenient mode', () => {
    const r = decodeUrl('ab%E0%A4%A', 'component');
    expect(r.ok).toBe(false);
    const l = decodeUrl('ab%E0%A4%A', 'component', { lenient: true });
    expect(l.ok).toBe(true);
  });
  it('offers Latin-1 for %E9', () => {
    const r = decodeUrl('caf%E9', 'component');
    expect(r).toMatchObject({ ok: false, canLatin1: true });
    expect(decodeUrl('caf%E9', 'component', { latin1: true })).toMatchObject({ ok: true, value: 'café' });
  });
  it('rejects lone surrogates and hints at double encoding', () => {
    expect(encodeUrl('\ud800', 'component').ok).toBe(false);
    const r = encodeUrl('100%25', 'component');
    expect(r.ok && r.hints.length).toBe(1);
  });
  it('parses url parts', () => {
    expect(parseUrl('https://example.com:8080/p?a=1&b=2#x')).toMatchObject({ host: 'example.com', port: '8080', query: [{ key: 'a', value: '1' }, { key: 'b', value: '2' }] });
    expect(parseUrl('not a url')).toBeNull();
  });
});

describe('hashes', () => {
  it('empty string known answers', async () => {
    expect(hex(await hashBytes('md5', new Uint8Array()))).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(hex(await hashBytes('sha256', new Uint8Array()))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('SHA-256("abc") and SHA-1("abc")', async () => {
    expect(hex(await hashBytes('sha256', utf8('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hex(await hashBytes('sha1', utf8('abc')))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });
  it('RFC 4231 test case 2 HMAC-SHA256', async () => {
    const mac = await hmacBytes('sha256', utf8('Jefe'), utf8('what do ya want for nothing?'));
    expect(hex(mac)).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });
  it('empty HMAC key does not throw', async () => {
    const mac = await hmacBytes('sha256', new Uint8Array(), new Uint8Array());
    expect(hex(mac)).toBe('b613679a0814d9ec772f95d778c35fc5ff1697c493715653c6c712144292c5ad');
  });
  it('secret parsing', () => {
    expect(secretBytes('0a ff', 'hex')).toMatchObject({ ok: true });
    expect(secretBytes('abc', 'hex').ok).toBe(false);
    expect(secretBytes('AQID', 'base64')).toMatchObject({ ok: true, bytes: Uint8Array.from([1, 2, 3]) });
  });
  it('compare normalizes spaces, case, colons and base64', async () => {
    const bytes = await hashBytes('md5', new Uint8Array());
    const results = [{ algo: 'md5' as const, bytes }];
    expect(compareDigest('D4:1D 8C D9 8F 00 B2 04 E9 80 09 98 EC F8 42 7E', results).matched).toEqual(['md5']);
    expect(compareDigest(formatDigest(bytes, 'base64'), results).matched).toEqual(['md5']);
    expect(compareDigest('d41d8cd98f00b204e9800998ecf8427f', results)).toMatchObject({ valid: true, matched: [], lengthFits: ['md5'] });
    expect(compareDigest('zz!', results).valid).toBe(false);
    expect(parseExpected('')).toBeNull();
  });
});

describe('bcrypt', () => {
  it('verifies a known $2a$ vector', async () => {
    const h = '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW';
    expect(validateBcryptHash(h)).toBeNull();
    expect(await verifyPassword('U*U', h)).toBe(true);
    expect(await verifyPassword('U*V', h)).toBe(false);
  });
  it('hash/verify round trip yields $2b$ and fresh salts', async () => {
    const a = await hashPassword('pässwörd', 4);
    const b = await hashPassword('pässwörd', 4);
    expect(a).toMatch(/^\$2b\$04\$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword('pässwörd', a)).toBe(true);
  });
  it('flags 73 bytes, multibyte and NUL', () => {
    expect(checkPassword('a'.repeat(72)).tooLong).toBe(false);
    expect(checkPassword('a'.repeat(73)).tooLong).toBe(true);
    expect(checkPassword('😀'.repeat(19)).bytes).toBe(76);
    expect(checkPassword('a\0b').hasNul).toBe(true);
  });
  it('rejects malformed hashes', () => {
    expect(validateBcryptHash('$2b$12$short')).toMatch(/Not a bcrypt hash/);
  });
});
