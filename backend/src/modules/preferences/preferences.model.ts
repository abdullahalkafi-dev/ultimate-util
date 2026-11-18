import { Schema, model, type Types } from 'mongoose';

export interface PreferencesDoc {
  owner: Types.ObjectId;
  bookmarks: string[];
  recents: string[];
  theme: 'system' | 'light' | 'dark';
}

const preferencesSchema = new Schema<PreferencesDoc>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    bookmarks: { type: [String], default: [] },
    recents: { type: [String], default: [] },
    theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
  },
  { timestamps: true },
);

export const PreferencesModel = model<PreferencesDoc>('Preferences', preferencesSchema);
