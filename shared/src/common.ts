import { z } from 'zod';

export const DataClass = { A: 'A', B: 'B', C: 'C' } as const;
export type DataClass = (typeof DataClass)[keyof typeof DataClass];

export const idSchema = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');

/** Versioned AES-GCM envelope. The server stores it as opaque text. */
export const cipherSchema = z.object({
  v: z.number().int().min(1),
  iv: z.string().min(8).max(64),
  ct: z.string().min(1).max(400_000),
});
export type Cipher = z.infer<typeof cipherSchema>;

export const syncMetaSchema = z.object({
  id: idSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type SyncMeta = z.infer<typeof syncMetaSchema>;

export const listQuerySchema = z.object({
  updatedSince: z.string().datetime().optional(),
  includeDeleted: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
export interface ApiOk<T> {
  data: T;
}

export const QUOTAS = {
  snippets: 1000,
  notes: 500,
  noteBytes: 50_000,
  totp: 200,
  library: 100,
  clipboardItems: 100,
  clipboardFileBytes: 10 * 1024 * 1024,
  clipboardTotalBytes: 100 * 1024 * 1024,
  focusHabits: 100,
} as const;
