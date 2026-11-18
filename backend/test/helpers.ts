import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/core/db/connection.js';

export const TEST_MONGO =
  process.env.TEST_MONGO_URI ?? 'mongodb://localhost:27017/ultimate-util-test?directConnection=true';

export async function startApp(): Promise<FastifyInstance> {
  const env = loadEnv({
    NODE_ENV: 'test',
    MONGO_URI: TEST_MONGO,
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
    AUTH_MODE: 'mock',
  });
  const app = await buildApp(env);
  await connectDb(env.MONGO_URI);
  await app.ready();
  return app;
}

export async function stopApp(app: FastifyInstance) {
  await app.close();
  await disconnectDb();
}

export interface Session {
  cookie: string;
  headers: Record<string, string>;
}

/** Logs in through the mock endpoint and returns headers for authenticated calls. */
export async function login(app: FastifyInstance, email: string, name = 'Test User'): Promise<Session> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/mock-login', payload: { email, name } });
  const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const session = setCookie.find((c) => c.startsWith('uu_session='));
  if (!session) throw new Error(`Login failed: ${res.body}`);
  const cookie = session.split(';')[0] ?? '';
  return { cookie, headers: { cookie, 'x-uu-csrf': '1' } };
}
