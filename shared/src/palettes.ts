import { z } from 'zod';
import { syncMetaSchema } from './common.js';

export const paletteBodySchema = z.object({
  kind: z.enum(['palette', 'gradient', 'softbox']),
  name: z.string().min(1).max(120),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  /** Tool-specific JSON: colors, stops, kelvin, brightness, shape. */
  data: z.record(z.unknown()),
});
export type PaletteBody = z.infer<typeof paletteBodySchema>;
export const paletteSchema = syncMetaSchema.merge(paletteBodySchema);
export type PaletteDto = z.infer<typeof paletteSchema>;
