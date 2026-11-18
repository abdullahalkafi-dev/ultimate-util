import { Schema, model, type Types } from 'mongoose';
import type { PaletteBody } from '@uu/shared';

export interface PaletteDoc extends PaletteBody {
  owner: Types.ObjectId;
  deletedAt: Date | null;
}

const paletteSchema = new Schema<PaletteDoc>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['palette', 'gradient', 'softbox'], required: true },
    name: { type: String, required: true },
    tags: { type: [String], default: [] },
    data: { type: Schema.Types.Mixed, required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
paletteSchema.index({ owner: 1, updatedAt: -1 });

export const PaletteModel = model<PaletteDoc>('Palette', paletteSchema);
