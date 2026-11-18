import { z } from 'zod';
import { cipherSchema } from './common.js';

export const dropBodySchema = z.object({
  kind: z.enum(['text', 'link', 'file']),
  text: z.string().max(50_000).optional(),
  fileName: z.string().max(255).optional(),
  mimeType: z.string().max(120).optional(),
  /** Base64 file content for small files. */
  fileData: z.string().max(14_000_000).optional(),
  /** When set, text/fileData hold nothing readable and this carries the ciphertext. */
  encrypted: cipherSchema.optional(),
  deviceName: z.string().max(80).default('Unknown device'),
  pinned: z.boolean().default(false),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});
export type DropBody = z.infer<typeof dropBodySchema>;

export interface DropDto {
  id: string;
  kind: 'text' | 'link' | 'file';
  text?: string;
  fileName?: string;
  mimeType?: string;
  size: number;
  encrypted?: z.infer<typeof cipherSchema>;
  deviceName: string;
  pinned: boolean;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
