import { Schema, model, type Types } from 'mongoose';
import type { Cipher } from '@uu/shared';

export interface EncryptedItemDoc {
  owner: Types.ObjectId;
  /** Which tool owns the record. Both share one collection of opaque blobs. */
  resource: 'totp' | 'note';
  payload: Cipher;
  sortOrder: number;
  deletedAt: Date | null;
}

const encryptedItemSchema = new Schema<EncryptedItemDoc>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    resource: { type: String, enum: ['totp', 'note'], required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    sortOrder: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
encryptedItemSchema.index({ owner: 1, resource: 1, updatedAt: -1 });

export const EncryptedItemModel = model<EncryptedItemDoc>('EncryptedItem', encryptedItemSchema);
