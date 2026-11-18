import type { FastifyInstance } from 'fastify';
import { QUOTAS, focusSessionBodySchema, habitBodySchema } from '@uu/shared';
import { registerOwnedCrud } from '../../core/crud/owned-crud.js';
import { FocusSessionModel, HabitModel } from './focus.model.js';

export async function focusRoutes(app: FastifyInstance) {
  registerOwnedCrud(app, {
    basePath: '/focus/sessions',
    model: FocusSessionModel,
    bodySchema: focusSessionBodySchema,
  });
  registerOwnedCrud(app, {
    basePath: '/focus/habits',
    model: HabitModel,
    bodySchema: habitBodySchema,
    quota: { max: QUOTAS.focusHabits, message: 'You have reached the limit of 100 habits.' },
  });
}
