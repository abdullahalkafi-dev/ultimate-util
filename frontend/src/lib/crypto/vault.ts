import type { Cipher, VaultDto, VaultRewrapBody, VaultSetupBody } from '@uu/shared';
import { fromBase32, fromBase64, toBase32, toBase64 } from './encoding';

/**
 * Client-side vault. The passphrase never leaves the device. The server stores only
 * a data key wrapped by the passphrase and a copy wrapped by the recovery key.
 */
export const PBKDF2_ITERATIONS = 600_000;
const VERIFIER_TEXT = 'uu-vault-v1';
const subtle = () => globalThis.crypto.subtle;
const random = (n: number): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(n));
  globalThis.crypto.getRandomValues(out);
  return out;
};

export class VaultError extends Error {
  constructor(
    public readonly code: 'WRONG_PASSPHRASE' | 'WRONG_RECOVERY_KEY' | 'UNSUPPORTED' | 'CORRUPT',
    message: string,
  ) {
    super(message);
    this.name = 'VaultError';
  }
}

async function deriveWrappingKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await subtle().importKey('raw', new TextEncoder().encode(passphrase.normalize('NFKC')), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptBytes(key: CryptoKey, data: Uint8Array<ArrayBuffer>): Promise<Cipher> {
  const iv = random(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, data));
  return { v: 1, iv: toBase64(iv), ct: toBase64(ct) };
}

async function decryptBytes(key: CryptoKey, cipher: Cipher): Promise<Uint8Array> {
  const plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64(cipher.iv) }, key, fromBase64(cipher.ct));
  return new Uint8Array(plain);
}

const importDataKey = (raw: Uint8Array<ArrayBuffer>) =>
  subtle().importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

export interface NewVault {
  body: VaultSetupBody;
  /** Shown to the user exactly once. Not stored anywhere. */
  recoveryKey: string;
  dataKey: CryptoKey;
}

export function strongEnoughPassphrase(passphrase: string): { ok: boolean; message: string } {
  if (passphrase.length < 10) return { ok: false, message: 'Use at least 10 characters.' };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(passphrase)).length;
  if (passphrase.length < 16 && classes < 3) {
    return { ok: false, message: 'Use 16 or more characters, or mix letters, numbers and symbols.' };
  }
  return { ok: true, message: 'Good passphrase.' };
}

export async function createVault(passphrase: string, iterations = PBKDF2_ITERATIONS): Promise<NewVault> {
  const salt = random(16);
  const wrappingKey = await deriveWrappingKey(passphrase, salt, iterations);
  const rawData = random(32);
  const dataKey = await importDataKey(rawData);

  const recoveryBytes = random(32);
  const recoveryKey = await subtle().importKey('raw', recoveryBytes, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

  const body: VaultSetupBody = {
    kdf: { name: 'pbkdf2-sha256', salt: toBase64(salt), params: { iterations } },
    wrappedKey: await encryptBytes(wrappingKey, rawData),
    recoveryWrappedKey: await encryptBytes(recoveryKey, rawData),
    verifier: await encryptBytes(dataKey, new TextEncoder().encode(VERIFIER_TEXT)),
  };
  const grouped = toBase32(recoveryBytes).match(/.{1,4}/g)?.join('-') ?? '';
  return { body, recoveryKey: grouped, dataKey };
}

async function checkVerifier(vault: Pick<VaultDto, 'verifier'>, key: CryptoKey) {
  const text = new TextDecoder().decode(await decryptBytes(key, vault.verifier));
  if (text !== VERIFIER_TEXT) throw new VaultError('CORRUPT', 'This vault could not be verified.');
}

export async function unlockWithPassphrase(vault: VaultDto, passphrase: string): Promise<CryptoKey> {
  if (vault.kdf.name !== 'pbkdf2-sha256') throw new VaultError('UNSUPPORTED', 'This vault uses a newer format.');
  const iterations = Number(vault.kdf.params.iterations);
  if (!Number.isFinite(iterations) || iterations < 100_000) throw new VaultError('CORRUPT', 'Vault settings are invalid.');
  const wrappingKey = await deriveWrappingKey(passphrase, fromBase64(vault.kdf.salt), iterations);
  let raw: Uint8Array;
  try {
    raw = await decryptBytes(wrappingKey, vault.wrappedKey);
  } catch {
    throw new VaultError('WRONG_PASSPHRASE', 'That passphrase is not right.');
  }
  const key = await importDataKey(new Uint8Array(raw));
  await checkVerifier(vault, key);
  return key;
}

export async function unlockWithRecoveryKey(vault: VaultDto, recoveryKeyText: string): Promise<CryptoKey> {
  const bytes = fromBase32(recoveryKeyText);
  if (!bytes || bytes.length !== 32) throw new VaultError('WRONG_RECOVERY_KEY', 'That recovery key is not valid.');
  const recoveryKey = await subtle().importKey('raw', bytes, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  let raw: Uint8Array;
  try {
    raw = await decryptBytes(recoveryKey, vault.recoveryWrappedKey);
  } catch {
    throw new VaultError('WRONG_RECOVERY_KEY', 'That recovery key is not right.');
  }
  const key = await importDataKey(new Uint8Array(raw));
  await checkVerifier(vault, key);
  return key;
}

/** New passphrase: only the wrapped data key changes. Stored records stay as they are. */
export async function rewrapWithPassphrase(
  dataKey: CryptoKey,
  passphrase: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<VaultRewrapBody> {
  const raw = new Uint8Array(await subtle().exportKey('raw', dataKey));
  const salt = random(16);
  const wrappingKey = await deriveWrappingKey(passphrase, salt, iterations);
  return {
    kdf: { name: 'pbkdf2-sha256', salt: toBase64(salt), params: { iterations } },
    wrappedKey: await encryptBytes(wrappingKey, new Uint8Array(raw.buffer.slice(0) as ArrayBuffer)),
  };
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<Cipher> {
  return encryptBytes(key, new TextEncoder().encode(JSON.stringify(value)) as Uint8Array<ArrayBuffer>);
}

export async function decryptJson<T>(key: CryptoKey, cipher: Cipher): Promise<T> {
  try {
    return JSON.parse(new TextDecoder().decode(await decryptBytes(key, cipher))) as T;
  } catch {
    throw new VaultError('CORRUPT', 'This item could not be decrypted.');
  }
}
