import type { FastifyInstance } from 'fastify';
import { QUOTAS, dropBodySchema, type DropDto } from '@uu/shared';
import { AppError } from '../../core/errors/app-error.js';
import { ok, toDto } from '../../core/http/dto.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { hub } from '../../core/realtime/hub.js';
import { DropModel } from './drop.model.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const OBJECT_ID = /^[a-f0-9]{24}$/;
const sizeOf = (text?: string, fileData?: string, encrypted?: { ct: string }) =>
  (text ? Buffer.byteLength(text) : 0) +
  (fileData ? Math.floor((fileData.length * 3) / 4) : 0) +
  (encrypted ? Math.floor((encrypted.ct.length * 3) / 4) : 0);

// fileData is a big string, so it is not part of the public shape.
const publicDrop = (doc: Parameters<typeof toDto>[0]) => toDto<DropDto>(doc, ['fileData']);

export async function clipboardRoutes(app: FastifyInstance) {
  const base = { preHandler: authenticate };
  const live = (userId: string) => ({ owner: userId, deletedAt: null, expiresAt: { $gt: new Date() } });

  app.get('/clipboard', base, async (request) => {
    const docs = await DropModel.find(live(request.userId)).sort({ pinned: -1, createdAt: -1 }).limit(QUOTAS.clipboardItems);
    return ok(docs.map(publicDrop));
  });

  app.post('/clipboard', base, async (request, reply) => {
    const body = dropBodySchema.parse(request.body);
    if (body.kind === 'file' && !body.fileData && !body.encrypted) {
      throw AppError.badRequest('Add a file to send.');
    }
    if (body.kind !== 'file' && !body.text && !body.encrypted) {
      throw AppError.badRequest('Add some text or a link to send.');
    }
    const size = sizeOf(body.text, body.fileData, body.encrypted);
    if (size > QUOTAS.clipboardFileBytes) {
      throw AppError.quota('This item is larger than 10 MB. Send a smaller file.');
    }
    const active = await DropModel.find(live(request.userId)).select('size');
    if (active.length >= QUOTAS.clipboardItems) {
      throw AppError.quota('Your clipboard is full (100 items). Delete some items first.');
    }
    const used = active.reduce((sum, d) => sum + d.size, 0);
    if (used + size > QUOTAS.clipboardTotalBytes) {
      throw AppError.quota('Your clipboard storage is full (100 MB). Delete some items first.');
    }
    const { expiresInDays, ...rest } = body;
    const doc = await DropModel.create({
      ...rest,
      size,
      owner: request.userId,
      expiresAt: new Date(Date.now() + expiresInDays * DAY_MS),
      deletedAt: null,
    });
    const dto = publicDrop(doc);
    hub.publish(request.userId, 'drop', { id: dto.id, kind: dto.kind });
    return reply.status(201).send(ok(dto));
  });

  app.get<{ Params: { id: string } }>('/clipboard/:id/file', base, async (request, reply) => {
    if (!OBJECT_ID.test(request.params.id)) throw AppError.notFound();
    const doc = await DropModel.findOne({ _id: request.params.id, ...live(request.userId) });
    if (!doc || !doc.fileData) throw AppError.notFound();
    return reply
      .header('content-type', 'application/octet-stream')
      .header('content-disposition', `attachment; filename="${encodeURIComponent(doc.fileName ?? 'file')}"`)
      .header('x-content-type-options', 'nosniff')
      .send(Buffer.from(doc.fileData, 'base64'));
  });

  app.patch<{ Params: { id: string } }>('/clipboard/:id/pin', base, async (request) => {
    if (!OBJECT_ID.test(request.params.id)) throw AppError.notFound();
    const body = (request.body ?? {}) as { pinned?: boolean };
    const doc = await DropModel.findOneAndUpdate(
      { _id: request.params.id, ...live(request.userId) },
      { $set: { pinned: body.pinned ?? true } },
      { returnDocument: 'after' },
    );
    if (!doc) throw AppError.notFound();
    return ok(publicDrop(doc));
  });

  app.delete<{ Params: { id: string } }>('/clipboard/:id', base, async (request) => {
    if (!OBJECT_ID.test(request.params.id)) throw AppError.notFound();
    const res = await DropModel.deleteOne({ _id: request.params.id, owner: request.userId });
    if (res.deletedCount === 0) throw AppError.notFound();
    hub.publish(request.userId, 'removed', { id: request.params.id });
    return ok({ id: request.params.id });
  });

  app.delete('/clipboard', base, async (request) => {
    const res = await DropModel.deleteMany({ owner: request.userId, pinned: false });
    hub.publish(request.userId, 'cleared', {});
    return ok({ removed: res.deletedCount });
  });

  // Server-sent events so a phone and a PC see new items instantly.
  app.get('/clipboard/stream', base, async (request, reply) => {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    reply.raw.write('event: ready\ndata: {}\n\n');
    const unsubscribe = hub.subscribe(request.userId, reply);
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    request.raw.on('close', () => {
      clearInterval(ping);
      unsubscribe();
    });
    return reply;
  });
}
