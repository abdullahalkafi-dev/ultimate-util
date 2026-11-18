import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Env } from './config/env.js';
import './core/http/fastify-types.js';
import { errorHandler } from './core/errors/error-handler.js';
import { AppError } from './core/errors/app-error.js';
import { accountRoutes } from './modules/account/account.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { clipboardRoutes } from './modules/clipboard/clipboard.routes.js';
import { encryptedRoutes } from './modules/encrypted/encrypted.routes.js';
import { focusRoutes } from './modules/focus/focus.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { paletteRoutes } from './modules/palettes/palettes.routes.js';
import { preferencesRoutes } from './modules/preferences/preferences.routes.js';
import { snippetRoutes } from './modules/snippets/snippets.routes.js';
import { vaultRoutes } from './modules/vault/vault.routes.js';

export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
      // Never write credentials or opaque secrets to logs.
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    },
    bodyLimit: 16 * 1024 * 1024,
    trustProxy: true,
  });
  app.decorate('env', env);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((_req, reply) => {
    const err = AppError.notFound('Route not found');
    reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
  });

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(accountRoutes);
      await api.register(preferencesRoutes);
      await api.register(vaultRoutes);
      await api.register(encryptedRoutes);
      await api.register(snippetRoutes);
      await api.register(paletteRoutes);
      await api.register(focusRoutes);
      await api.register(clipboardRoutes);
    },
    { prefix: '/api/v1' },
  );

  return app;
}
