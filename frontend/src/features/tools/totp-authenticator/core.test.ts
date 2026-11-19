import { describe, expect, it } from 'vitest';
import { buildOtpauthUri, generateCode, normalizeSecret, parseOtpauthUri, ParseError, type TotpEntry } from './core';
import { decodeMigration } from './migration';
import { createBackup, readBackup } from './backup';
import { toBase32 } from '@/lib/crypto/encoding';

const seed = (s: string) => toBase32(new TextEncoder().encode(s));
const base = (secret: string, algorithm: TotpEntry['algorithm']): TotpEntry => ({
  type: 'totp', issuer: '', account: '', secret, algorithm, digits: 8, period: 30, counter: 0, folder: '', notes: '',
});
const S1 = seed('12345678901234567890');
const S256 = seed('12345678901234567890123456789012');
const S512 = seed('1234567890123456789012345678901234567890123456789012345678901234');
const t = (s: number) => s * 1000;

describe('RFC 6238 Appendix B', () => {
  it('SHA1', () => {
    expect(generateCode(base(S1, 'SHA1'), t(59))).toBe('94287082');
    expect(generateCode(base(S1, 'SHA1'), t(1111111109))).toBe('07081804');
    expect(generateCode(base(S1, 'SHA1'), t(20000000000))).toBe('65353130');
  });
  it('SHA256', () => {
    expect(generateCode(base(S256, 'SHA256'), t(59))).toBe('46119246');
    expect(generateCode(base(S256, 'SHA256'), t(1111111109))).toBe('68084774');
  });
  it('SHA512', () => {
    expect(generateCode(base(S512, 'SHA512'), t(59))).toBe('90693936');
    expect(generateCode(base(S512, 'SHA512'), t(1111111109))).toBe('25091201');
  });
  it('HOTP RFC 4226', () => {
    const e = { ...base(S1, 'SHA1'), type: 'hotp' as const, digits: 6 as const };
    expect(generateCode(e, 0, 0)).toBe('755224');
    expect(generateCode(e, 0, 9)).toBe('520489');
  });
});

describe('secret normalization', () => {
  it('strips spaces, uppercases, drops padding', () => {
    expect(normalizeSecret('jbsw y3dp-ehpk 3pxp====').secret).toBe('JBSWY3DPEHPK3PXP');
  });
  it('points at the bad character', () => {
    expect(() => normalizeSecret('JBSW1')).toThrow(/Character 5/);
  });
  it('warns on short secrets', () => {
    expect(normalizeSecret('JBSWY3DPEHPK3PXP').warning).toBeTruthy();
  });
});

describe('otpauth URI', () => {
  it('parses with defaults and issuer precedence', () => {
    const e = parseOtpauthUri('otpauth://totp/Old:alice%40x.com?secret=jbswy3dpehpk3pxp&issuer=GitHub');
    expect(e).toMatchObject({ issuer: 'GitHub', account: 'alice@x.com', algorithm: 'SHA1', digits: 6, period: 30, type: 'totp' });
  });
  it('rejects bad input', () => {
    expect(() => parseOtpauthUri('otpauth://hotp/a?secret=JBSWY3DP')).toThrow(ParseError);
    expect(() => parseOtpauthUri('otpauth://steam/a?secret=JBSWY3DP')).toThrow(/Unsupported type/);
    expect(() => parseOtpauthUri('otpauth://totp/a?secret=JBSWY3DP&digits=7')).toThrow(/digits/);
    expect(() => parseOtpauthUri('otpauth://totp/a?secret=JBSWY3DP&period=5')).toThrow(/Period/);
    expect(() => parseOtpauthUri('nope')).toThrow(ParseError);
  });
  it('round-trips', () => {
    const e = parseOtpauthUri('otpauth://totp/Acme:bob?secret=JBSWY3DPEHPK3PXP&digits=8&algorithm=SHA256&period=60');
    expect(parseOtpauthUri(buildOtpauthUri(e))).toEqual(e);
  });
});

describe('migration decoder', () => {
  it('decodes a hand-built payload', () => {
    const enc = new TextEncoder();
    const field = (n: number, b: number[]) => [(n << 3) | 2, b.length, ...b];
    const sec = [72, 101, 108, 108, 111, 33, 222, 173, 190, 239];
    const param = [...field(1, sec), ...field(2, [...enc.encode('alice')]), ...field(3, [...enc.encode('GitHub')]), 0x20, 1, 0x28, 1, 0x30, 2];
    const payload = [...field(1, param), 0x18, 1, 0x20, 0, 0x28, 7];
    const uri = `otpauth-migration://offline?data=${encodeURIComponent(btoa(String.fromCharCode(...payload)))}`;
    const r = decodeMigration(uri);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]!).toMatchObject({ issuer: 'GitHub', account: 'alice', algorithm: 'SHA1', digits: 6, type: 'totp' });
    expect(r.entries[0]!.secret).toBe(toBase32(new Uint8Array(sec)));
    expect(r).toMatchObject({ batchSize: 1, batchIndex: 0, batchId: 7 });
  });
  it('rejects truncated data', () => {
    expect(() => decodeMigration('otpauth-migration://offline?data=CgoK')).toThrow(ParseError);
  });
});

describe('backup', () => {
  it('round-trips and rejects wrong passphrase', async () => {
    const list = [parseOtpauthUri('otpauth://totp/a:b?secret=JBSWY3DPEHPK3PXP')];
    const file = await createBackup(list, 'correct horse battery');
    expect(file).not.toContain('JBSWY3DP');
    expect(await readBackup(file, 'correct horse battery')).toEqual(list);
    await expect(readBackup(file, 'wrong')).rejects.toThrow(/Wrong passphrase/);
  }, 30000);
});
