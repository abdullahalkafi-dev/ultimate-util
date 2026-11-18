import { describe, expect, it } from 'vitest';
import { fromBase32, toBase32 } from './encoding';
import {
  VaultError,
  createVault,
  decryptJson,
  encryptJson,
  rewrapWithPassphrase,
  strongEnoughPassphrase,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from './vault';

// Low iteration count keeps tests fast; production uses 600,000.
const FAST = 100_000;

describe('base32', () => {
  it('round-trips and tolerates spacing and case', () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251, 252, 0, 99]);
    const text = toBase32(bytes);
    expect(Array.from(fromBase32(text.toLowerCase().replace(/(.{4})/g, '$1 '))!)).toEqual(Array.from(bytes));
  });
  it('rejects invalid characters', () => {
    expect(fromBase32('abc1')).toBeNull();
  });
});

describe('vault', () => {
  it('creates, unlocks and encrypts records', async () => {
    const created = await createVault('correct horse battery staple', FAST);
    const vault = { ...created.body, updatedAt: new Date().toISOString() };
    const key = await unlockWithPassphrase(vault, 'correct horse battery staple');
    const cipher = await encryptJson(key, { issuer: 'GitHub', secret: 'JBSWY3DPEHPK3PXP' });
    expect(cipher.ct).not.toContain('JBSWY3');
    expect(await decryptJson(key, cipher)).toEqual({ issuer: 'GitHub', secret: 'JBSWY3DPEHPK3PXP' });
    // the original data key reads the same record
    expect(await decryptJson(created.dataKey, cipher)).toEqual({ issuer: 'GitHub', secret: 'JBSWY3DPEHPK3PXP' });
  });

  it('rejects a wrong passphrase', async () => {
    const created = await createVault('correct horse battery staple', FAST);
    const vault = { ...created.body, updatedAt: '' };
    await expect(unlockWithPassphrase(vault, 'wrong passphrase here')).rejects.toMatchObject({ code: 'WRONG_PASSPHRASE' });
  });

  it('unlocks with the recovery key', async () => {
    const created = await createVault('correct horse battery staple', FAST);
    const vault = { ...created.body, updatedAt: '' };
    const key = await unlockWithRecoveryKey(vault, created.recoveryKey.toLowerCase());
    const cipher = await encryptJson(created.dataKey, 'hello');
    expect(await decryptJson(key, cipher)).toBe('hello');
    await expect(unlockWithRecoveryKey(vault, 'AAAA-BBBB')).rejects.toBeInstanceOf(VaultError);
  });

  it('changes the passphrase without re-encrypting records', async () => {
    const created = await createVault('old passphrase value 1', FAST);
    const cipher = await encryptJson(created.dataKey, { note: 'secret' });
    const rewrap = await rewrapWithPassphrase(created.dataKey, 'new passphrase value 2', FAST);
    const vault = { ...created.body, ...rewrap, updatedAt: '' };
    await expect(unlockWithPassphrase(vault, 'old passphrase value 1')).rejects.toBeInstanceOf(VaultError);
    const key = await unlockWithPassphrase(vault, 'new passphrase value 2');
    expect(await decryptJson(key, cipher)).toEqual({ note: 'secret' });
  });

  it('reports corrupt ciphertext', async () => {
    const created = await createVault('correct horse battery staple', FAST);
    const cipher = await encryptJson(created.dataKey, 'x');
    await expect(decryptJson(created.dataKey, { ...cipher, ct: 'AAAA' })).rejects.toMatchObject({ code: 'CORRUPT' });
  });
});

describe('strongEnoughPassphrase', () => {
  it('requires length or variety', () => {
    expect(strongEnoughPassphrase('short').ok).toBe(false);
    expect(strongEnoughPassphrase('alllowercaseonly').ok).toBe(true);
    expect(strongEnoughPassphrase('abcdefghij').ok).toBe(false);
    expect(strongEnoughPassphrase('Abcdef12!x').ok).toBe(true);
  });
});
