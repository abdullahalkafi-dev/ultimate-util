import { z } from 'zod';

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
});
export type UserDto = z.infer<typeof userSchema>;

export const mockLoginSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(1).max(100),
});
export type MockLoginBody = z.infer<typeof mockLoginSchema>;

export const authConfigSchema = z.object({ mode: z.enum(['mock', 'google']) });
export type AuthConfig = z.infer<typeof authConfigSchema>;
