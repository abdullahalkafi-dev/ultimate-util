import type { FastifyInstance } from 'fastify';
import type { Model } from 'mongoose';
import { AppError } from '../../core/errors/app-error.js';
import { ok, toDto } from '../../core/http/dto.js';
import { clearSessionCookies } from '../../core/http/session.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { userCollections } from './collections.js';
import { findUserById, toUserDto } from '../users/users.service.js';

type OwnedModel = Model<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function accountRoutes(app: FastifyInstance) {
  const base = { preHandler: authenticate };
  const collections = userCollections;

  // Everything we hold for the signed-in user. Encrypted data is exported as ciphertext.
  app.get('/account/export', base, async (request, reply) => {
    const user = await findUserById(request.userId);
    if (!user) throw AppError.unauthorized();
    const data: Record<string, unknown> = { user: toUserDto(user), exportedAt: new Date().toISOString() };
    for (const [name, model] of Object.entries(collections) as [string, OwnedModel][]) {
      const docs = await model.find({ owner: request.userId });
      data[name] = docs.map((d) => toDto(d, name === 'drops' ? ['fileData'] : []));
    }
    return reply
      .header('content-disposition', 'attachment; filename="ultimate-util-export.json"')
      .send(ok(data));
  });

  // Removes the account and every record immediately.
  app.delete('/account', base, async (request, reply) => {
    for (const model of Object.values(collections) as OwnedModel[]) {
      await model.deleteMany({ owner: request.userId });
    }
    const user = await findUserById(request.userId);
    await user?.deleteOne();
    clearSessionCookies(reply);
    return ok({ deleted: true });
  });
}
