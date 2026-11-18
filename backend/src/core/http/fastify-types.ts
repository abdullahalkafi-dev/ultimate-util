import type { Env } from '../../config/env.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the authenticate hook. */
    userId: string;
  }
  interface FastifyInstance {
    env: Env;
  }
}

export {};
