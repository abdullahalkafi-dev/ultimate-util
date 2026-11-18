import { Schema, model, type Types } from 'mongoose';
import type { FocusSessionBody, HabitBody } from '@uu/shared';

export interface FocusSessionDoc extends Omit<FocusSessionBody, 'startedAt' | 'endedAt'> {
  owner: Types.ObjectId;
  startedAt: Date;
  endedAt: Date;
  deletedAt: Date | null;
}

const focusSessionSchema = new Schema<FocusSessionDoc>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['focus', 'short-break', 'long-break'], required: true },
    label: { type: String, default: '' },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    plannedSeconds: { type: Number, required: true },
    actualSeconds: { type: Number, required: true },
    completed: { type: Boolean, required: true },
    timezone: { type: String, default: 'UTC' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
focusSessionSchema.index({ owner: 1, startedAt: -1 });

export const FocusSessionModel = model<FocusSessionDoc>('FocusSession', focusSessionSchema);

export interface HabitDoc extends HabitBody {
  owner: Types.ObjectId;
  deletedAt: Date | null;
}

const habitSchema = new Schema<HabitDoc>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    targetPerWeek: { type: Number, default: 7 },
    checkins: { type: [String], default: [] },
    archived: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
habitSchema.index({ owner: 1, updatedAt: -1 });

export const HabitModel = model<HabitDoc>('Habit', habitSchema);
