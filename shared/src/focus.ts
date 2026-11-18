import { z } from 'zod';
import { syncMetaSchema } from './common.js';

export const focusSessionBodySchema = z.object({
  kind: z.enum(['focus', 'short-break', 'long-break']),
  label: z.string().max(120).default(''),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  plannedSeconds: z.number().int().min(1).max(86400),
  actualSeconds: z.number().int().min(0).max(86400),
  completed: z.boolean(),
  timezone: z.string().max(64).default('UTC'),
});
export type FocusSessionBody = z.infer<typeof focusSessionBodySchema>;
export const focusSessionSchema = syncMetaSchema.merge(focusSessionBodySchema);
export type FocusSessionDto = z.infer<typeof focusSessionSchema>;

export const habitBodySchema = z.object({
  name: z.string().min(1).max(120),
  targetPerWeek: z.number().int().min(1).max(7).default(7),
  checkins: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .max(5000)
    .default([]),
  archived: z.boolean().default(false),
});
export type HabitBody = z.infer<typeof habitBodySchema>;
export const habitSchema = syncMetaSchema.merge(habitBodySchema);
export type HabitDto = z.infer<typeof habitSchema>;
