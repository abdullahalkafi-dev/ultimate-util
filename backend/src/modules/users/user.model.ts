import { Schema, model } from 'mongoose';

export interface UserDoc {
  email: string;
  name: string;
  avatarUrl: string | null;
  googleId: string | null;
  lastLoginAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: null },
    googleId: { type: String, default: null, index: true },
    lastLoginAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

export const UserModel = model<UserDoc>('User', userSchema);
