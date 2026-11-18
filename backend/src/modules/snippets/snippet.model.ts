import { Schema, model, type Types } from 'mongoose';
import type { SnippetBody } from '@uu/shared';

export interface SnippetDoc extends SnippetBody {
  owner: Types.ObjectId;
  deletedAt: Date | null;
}

const snippetSchema = new Schema<SnippetDoc>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    kind: { type: String, enum: ['code', 'command', 'prompt'], default: 'code' },
    language: { type: String, default: 'text' },
    description: { type: String, default: '' },
    body: { type: String, required: true },
    tags: { type: [String], default: [] },
    folder: { type: String, default: '' },
    isFavorite: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
snippetSchema.index({ owner: 1, updatedAt: -1 });

export const SnippetModel = model<SnippetDoc>('Snippet', snippetSchema);
