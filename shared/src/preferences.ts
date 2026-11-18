import { z } from 'zod';

export const MAX_BOOKMARKS = 24;
export const MAX_RECENTS = 10;

export const preferencesSchema = z.object({
  bookmarks: z.array(z.string().max(80)).max(MAX_BOOKMARKS),
  recents: z.array(z.string().max(80)).max(MAX_RECENTS),
  theme: z.enum(['system', 'light', 'dark']),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const mergePreferencesSchema = preferencesSchema.partial();
export type MergePreferencesBody = z.infer<typeof mergePreferencesSchema>;
