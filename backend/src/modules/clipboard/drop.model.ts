import { Schema, model, type Types } from 'mongoose';
import type { Cipher } from '@uu/shared';

export interface DropDoc {
  owner: Types.ObjectId;
  kind: 'text' | 'link' | 'file';
  text?: string;
  fileName?: string;
  mimeType?: string;
  fileData?: string;
  encrypted?: Cipher;
  size: number;
  deviceName: string;
  pinned: boolean;
  expiresAt: Date;
  deletedAt: Date | null;
}

const dropSchema = new Schema<DropDoc>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['text', 'link', 'file'], required: true },
    text: String,
    fileName: String,
    mimeType: String,
    fileData: String,
    encrypted: Schema.Types.Mixed,
    size: { type: Number, required: true },
    deviceName: { type: String, default: 'Unknown device' },
    pinned: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
// Mongo removes expired drops automatically.
dropSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DropModel = model<DropDoc>('Drop', dropSchema);
