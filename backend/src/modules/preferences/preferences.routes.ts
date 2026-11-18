import type { FastifyInstance } from 'fastify';
import { mergePreferencesSchema, preferencesSchema } from '@uu/shared';
import { ok } from '../../core/http/dto.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { getPreferences, mergeGuestPreferences, replacePreferences } from './preferences.service.js';

export async function preferencesRoutes(app: FastifyInstance) {
  const base = { preHandler: authenticate };

  app.get('/preferences', base, async (request) => ok(await getPreferences(request.userId)));

  app.put('/preferences', base, async (request) => {
    const body = preferencesSchema.parse(request.body);
    return ok(await replacePreferences(request.userId, body));
  });

  app.post('/preferences/merge', base, async (request) => {
    const body = mergePreferencesSchema.parse(request.body);
    return ok(await mergeGuestPreferences(request.userId, body));
  });
}
