import { z } from 'zod';
import { syncMetaSchema } from './common.js';

export const snippetBodySchema = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(['code', 'command', 'prompt']).default('code'),
  language: z.string().max(40).default('text'),
  description: z.string().max(2000).default(''),
  body: z.string().max(100_000),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  folder: z.string().max(80).default(''),
  isFavorite: z.boolean().default(false),
});
export type SnippetBody = z.infer<typeof snippetBodySchema>;
export const snippetSchema = syncMetaSchema.merge(snippetBodySchema);
export type SnippetDto = z.infer<typeof snippetSchema>;
