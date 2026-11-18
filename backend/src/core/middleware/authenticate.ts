import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { SESSION_COOKIE, verifySession } from '../http/session.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-uu-csrf';

/**
 * Requires a valid session cookie. State-changing requests must also send the
 * custom CSRF header, which browsers only allow from our own origin.
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!SAFE_METHODS.has(request.method) && request.headers[CSRF_HEADER] !== '1') {
    throw AppError.forbidden('Missing CSRF header');
  }
  const token = request.cookies[SESSION_COOKIE];
  if (!token) throw AppError.unauthorized();
  const userId = await verifySession(request.server.env, token);
  if (!userId) throw AppError.unauthorized('Your session has expired. Sign in again.');
  request.userId = userId;
}
