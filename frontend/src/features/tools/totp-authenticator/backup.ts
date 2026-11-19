import { fromBase64, toBase64 } from '@/lib/crypto/encoding';
import type { TotpEntry } from './core';

/** .uubackup envelope: PBKDF2-SHA256 (600k) then AES-256-GCM over the JSON list. */
const ITER = 600_000;
const subtle = () => crypto.subtle;

async function deriveKey(pass: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const m = await subtle().importKey('raw', new TextEncoder().encode(pass.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, m, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export interface BackupFile {
  app: 'ultimate-util-2fa';
  v: 1;
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

export async function createBackup(entries: TotpEntry[], passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const k = await deriveKey(passphrase, salt, ITER);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(JSON.stringify(entries))));
  const file: BackupFile = { app: 'ultimate-util-2fa', v: 1, iter: ITER, salt: toBase64(salt), iv: toBase64(iv), ct: toBase64(ct) };
  return JSON.stringify(file);
}

export async function readBackup(text: string, passphrase: string): Promise<TotpEntry[]> {
  let f: BackupFile;
  try {
    f = JSON.parse(text) as BackupFile;
  } catch {
    throw new Error('This is not a backup file.');
  }
  if (f.app !== 'ultimate-util-2fa' || f.v !== 1 || !f.salt || !f.iv || !f.ct || !(f.iter >= 100_000 && f.iter <= 5_000_000)) {
    throw new Error('This is not a backup file.');
  }
  try {
    const k = await deriveKey(passphrase, fromBase64(f.salt), f.iter);
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64(f.iv) }, k, fromBase64(f.ct));
    const list = JSON.parse(new TextDecoder().decode(plain)) as TotpEntry[];
    if (!Array.isArray(list)) throw new Error('bad');
    return list;
  } catch {
    throw new Error('Wrong passphrase or damaged file.');
  }
}
