import type { FastifyInstance } from 'fastify';
import type { Model } from 'mongoose';
import type { ZodType, ZodTypeDef } from 'zod';
import { listQuerySchema } from '@uu/shared';
import { AppError } from '../errors/app-error.js';
import { toDto, ok } from '../http/dto.js';
import { authenticate } from '../middleware/authenticate.js';

const OBJECT_ID = /^[a-f0-9]{24}$/;

export interface OwnedCrudOptions<Body> {
  basePath: string;
  model: Model<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  bodySchema: ZodType<Body, ZodTypeDef, unknown>;
  /** Fixed fields that scope this resource inside a shared collection (e.g. resource: 'totp'). */
  scope?: Record<string, unknown>;
  quota?: { max: number; message: string };
  /** Extra checks after schema validation. Throw AppError to reject. */
  check?: (body: Body) => void;
}

/**
 * Registers list/create/update/soft-delete/restore routes for a resource owned by
 * the signed-in user. Every query is filtered by owner, so users never see each other's data.
 */
export function registerOwnedCrud<Body extends object>(app: FastifyInstance, opts: OwnedCrudOptions<Body>) {
  const { basePath, model, bodySchema, scope = {}, quota, check } = opts;
  const base = { preHandler: authenticate };

  const parseId = (value: unknown): string => {
    if (typeof value !== 'string' || !OBJECT_ID.test(value)) throw AppError.notFound();
    return value;
  };

  app.get(basePath, base, async (request) => {
    const query = listQuerySchema.parse(request.query);
    const filter: Record<string, unknown> = { owner: request.userId, ...scope };
    if (query.includeDeleted !== 'true') filter.deletedAt = null;
    if (query.updatedSince) filter.updatedAt = { $gte: new Date(query.updatedSince) };
    const docs = await model.find(filter).sort({ updatedAt: -1 }).limit(query.limit);
    return ok(docs.map((d) => toDto(d)));
  });

  app.post(basePath, base, async (request, reply) => {
    const body = bodySchema.parse(request.body);
    check?.(body);
    if (quota) {
      const count = await model.countDocuments({ owner: request.userId, ...scope, deletedAt: null });
      if (count >= quota.max) throw AppError.quota(quota.message);
    }
    const doc = await model.create({ ...body, ...scope, owner: request.userId, deletedAt: null });
    return reply.status(201).send(ok(toDto(doc)));
  });

  app.put<{ Params: { id: string } }>(`${basePath}/:id`, base, async (request) => {
    const id = parseId(request.params.id);
    const body = bodySchema.parse(request.body);
    check?.(body);
    const doc = await model.findOneAndUpdate(
      { _id: id, owner: request.userId, ...scope, deletedAt: null },
      { $set: body },
      { returnDocument: 'after' },
    );
    if (!doc) throw AppError.notFound();
    return ok(toDto(doc));
  });

  app.delete<{ Params: { id: string } }>(`${basePath}/:id`, base, async (request) => {
    const id = parseId(request.params.id);
    const doc = await model.findOneAndUpdate(
      { _id: id, owner: request.userId, ...scope, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!doc) throw AppError.notFound();
    return ok({ id });
  });

  app.post<{ Params: { id: string } }>(`${basePath}/:id/restore`, base, async (request) => {
    const id = parseId(request.params.id);
    const doc = await model.findOneAndUpdate(
      { _id: id, owner: request.userId, ...scope, deletedAt: { $ne: null } },
      { $set: { deletedAt: null } },
      { returnDocument: 'after' },
    );
    if (!doc) throw AppError.notFound();
    return ok(toDto(doc));
  });
}
