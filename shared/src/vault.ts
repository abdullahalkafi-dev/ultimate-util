import { z } from 'zod';
import { cipherSchema } from './common.js';

export const kdfSchema = z.object({
  name: z.enum(['pbkdf2-sha256', 'argon2id']),
  salt: z.string().min(8).max(128),
  params: z.record(z.union([z.number(), z.string()])),
});

export const vaultSetupSchema = z.object({
  kdf: kdfSchema,
  /** Data key wrapped by the passphrase-derived key. */
  wrappedKey: cipherSchema,
  /** Same data key wrapped by the recovery key. */
  recoveryWrappedKey: cipherSchema,
  /** Small known plaintext encrypted with the data key, used to check a passphrase. */
  verifier: cipherSchema,
});
export type VaultSetupBody = z.infer<typeof vaultSetupSchema>;

export const vaultRewrapSchema = z.object({
  kdf: kdfSchema,
  wrappedKey: cipherSchema,
});
export type VaultRewrapBody = z.infer<typeof vaultRewrapSchema>;

export type VaultDto = VaultSetupBody & { updatedAt: string };
