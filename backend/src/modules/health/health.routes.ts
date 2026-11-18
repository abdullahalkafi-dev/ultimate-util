import type { FastifyInstance } from 'fastify';
import { isDbReady } from '../../core/db/connection.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (_request, reply) => {
    const db = isDbReady();
    return reply.status(db ? 200 : 503).send({ status: db ? 'ok' : 'degraded', db });
  });
}
