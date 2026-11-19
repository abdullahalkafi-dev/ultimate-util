import { ParseError, normalizeSecret, type Algorithm, type TotpEntry } from './core';
import { toBase32 } from '@/lib/crypto/encoding';

/**
 * Google Authenticator export: otpauth-migration://offline?data=<base64 protobuf MigrationPayload>.
 * Field layout (public export format; VERIFY against a real export):
 *  MigrationPayload: 1 = repeated OtpParameters, 2 version, 3 batch_size, 4 batch_index, 5 batch_id
 *  OtpParameters: 1 secret(bytes) 2 name 3 issuer 4 algorithm(1=SHA1,2=SHA256,3=SHA512,4=MD5) 5 digits(1=6,2=8) 6 type(1=HOTP,2=TOTP) 7 counter
 */
export interface MigrationResult {
  entries: TotpEntry[];
  batchSize: number;
  batchIndex: number;
  batchId: number;
  skipped: number;
}

interface Field {
  num: number;
  wire: number;
  varint?: number;
  bytes?: Uint8Array;
}

function readVarint(buf: Uint8Array, start: number): [number, number] {
  let pos = start;
  let result = 0;
  let shift = 0;
  for (;;) {
    if (pos >= buf.length) throw new ParseError('The migration data is truncated.');
    const b = buf[pos++] ?? 0;
    result += (b & 0x7f) * 2 ** shift;
    if (!(b & 0x80)) break;
    shift += 7;
    if (shift > 63) throw new ParseError('The migration data is malformed.');
  }
  return [result, pos];
}

export function decodeFields(buf: Uint8Array): Field[] {
  const out: Field[] = [];
  let pos = 0;
  while (pos < buf.length) {
    let tag: number;
    [tag, pos] = readVarint(buf, pos);
    const num = Math.floor(tag / 8);
    const wire = tag % 8;
    if (wire === 0) {
      let v: number;
      [v, pos] = readVarint(buf, pos);
      out.push({ num, wire, varint: v });
    } else if (wire === 2) {
      let len: number;
      [len, pos] = readVarint(buf, pos);
      if (pos + len > buf.length) throw new ParseError('The migration data is truncated.');
      out.push({ num, wire, bytes: buf.subarray(pos, pos + len) });
      pos += len;
    } else if (wire === 1) pos += 8;
    else if (wire === 5) pos += 4;
    else throw new ParseError('The migration data is malformed.');
  }
  return out;
}

const text = (b?: Uint8Array) => (b ? new TextDecoder().decode(b) : '');

export function decodeMigration(uri: string): MigrationResult {
  let data: string | null;
  try {
    data = new URL(uri.trim()).searchParams.get('data');
  } catch {
    throw new ParseError('That is not a valid migration link.');
  }
  if (!data) throw new ParseError('The migration link has no data.');
  let bytes: Uint8Array;
  try {
    const b64 = data.replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    throw new ParseError('The migration data is not valid base64.');
  }
  const root = decodeFields(bytes);
  const entries: TotpEntry[] = [];
  let skipped = 0;
  for (const f of root.filter((x) => x.num === 1 && x.bytes)) {
    const p = decodeFields(f.bytes!);
    const get = (n: number) => p.find((x) => x.num === n);
    const secretBytes = get(1)?.bytes;
    const algo = get(4)?.varint ?? 1;
    const digits = get(5)?.varint ?? 1;
    const type = get(6)?.varint ?? 2;
    const algorithm: Algorithm | null = algo === 1 ? 'SHA1' : algo === 2 ? 'SHA256' : algo === 3 ? 'SHA512' : null;
    if (!secretBytes || !algorithm || (digits !== 1 && digits !== 2)) {
      skipped++;
      continue;
    }
    const name = text(get(2)?.bytes);
    const issuer = text(get(3)?.bytes);
    const colon = name.indexOf(':');
    const account = colon >= 0 && (!issuer || name.startsWith(`${issuer}:`)) ? name.slice(colon + 1) : name;
    entries.push({
      type: type === 1 ? 'hotp' : 'totp',
      issuer: (issuer || (colon >= 0 ? name.slice(0, colon) : '')).trim().normalize('NFC'),
      account: account.trim().normalize('NFC'),
      secret: normalizeSecret(toBase32(secretBytes)).secret,
      algorithm,
      digits: digits === 2 ? 8 : 6,
      period: 30,
      counter: get(7)?.varint ?? 0,
      folder: '',
      notes: '',
    });
  }
  return {
    entries,
    skipped,
    batchSize: root.find((x) => x.num === 3)?.varint ?? 1,
    batchIndex: root.find((x) => x.num === 4)?.varint ?? 0,
    batchId: root.find((x) => x.num === 5)?.varint ?? 0,
  };
}
