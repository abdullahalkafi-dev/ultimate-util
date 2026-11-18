import { z } from 'zod';
import { cipherSchema, syncMetaSchema } from './common.js';

/** Class A resources: the server only ever sees ciphertext. */
export const encryptedItemBodySchema = z.object({
  payload: cipherSchema,
  sortOrder: z.number().int().min(0).max(100000).default(0),
});
export type EncryptedItemBody = z.infer<typeof encryptedItemBodySchema>;

export const encryptedItemSchema = syncMetaSchema.merge(encryptedItemBodySchema);
export type EncryptedItemDto = z.infer<typeof encryptedItemSchema>;
