import type { FastifyInstance } from 'fastify';
import { QUOTAS, paletteBodySchema } from '@uu/shared';
import { registerOwnedCrud } from '../../core/crud/owned-crud.js';
import { PaletteModel } from './palette.model.js';

export async function paletteRoutes(app: FastifyInstance) {
  // Palettes, gradients and softbox presets share one library limit.
  registerOwnedCrud(app, {
    basePath: '/palettes',
    model: PaletteModel,
    bodySchema: paletteBodySchema,
    quota: { max: QUOTAS.library, message: 'Your library is full (100 items). Delete something to add more.' },
  });
}
