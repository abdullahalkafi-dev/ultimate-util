import type { HydratedDocument } from 'mongoose';
import type { UserDto } from '@uu/shared';
import { UserModel, type UserDoc } from './user.model.js';

export const toUserDto = (user: HydratedDocument<UserDoc>): UserDto => ({
  id: String(user._id),
  email: user.email,
  name: user.name,
  avatarUrl: user.avatarUrl,
});

export interface Profile {
  email: string;
  name: string;
  avatarUrl?: string | null;
  googleId?: string | null;
}

/** Creates the user on first login, otherwise refreshes the profile fields. */
export async function upsertUser(profile: Profile) {
  const email = profile.email.toLowerCase().trim();
  const update: Partial<UserDoc> = { name: profile.name, lastLoginAt: new Date() };
  if (profile.avatarUrl !== undefined) update.avatarUrl = profile.avatarUrl;
  if (profile.googleId) update.googleId = profile.googleId;
  return UserModel.findOneAndUpdate({ email }, { $set: update, $setOnInsert: { email } }, { returnDocument: 'after', upsert: true });
}

export const findUserById = (id: string) => UserModel.findById(id);
