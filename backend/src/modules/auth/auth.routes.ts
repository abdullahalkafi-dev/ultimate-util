import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { mockLoginSchema } from '@uu/shared';
import { AppError } from '../../core/errors/app-error.js';
import { ok } from '../../core/http/dto.js';
import {
  clearSessionCookies,
  setSessionCookies,
  signSession,
} from '../../core/http/session.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { findUserById, toUserDto, upsertUser } from '../users/users.service.js';

const OAUTH_COOKIE = 'uu_oauth';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const b64url = (buf: Buffer) => buf.toString('base64url');

/** Only same-site relative paths are allowed as a return target (no open redirect). */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  return value;
}

export async function authRoutes(app: FastifyInstance) {
  const { env } = app;
  const strict = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  app.get('/auth/config', async () => ok({ mode: env.AUTH_MODE }));

  // Dev-only stand-in for Google login. Disabled unless AUTH_MODE=mock (never in production).
  app.post('/auth/mock-login', strict, async (request, reply) => {
    if (env.AUTH_MODE !== 'mock') throw AppError.notFound();
    const body = mockLoginSchema.parse(request.body);
    const user = await upsertUser({ email: body.email, name: body.name, avatarUrl: null });
    setSessionCookies(env, reply, await signSession(env, String(user._id)));
    return ok(toUserDto(user));
  });

  app.get('/auth/me', { preHandler: authenticate }, async (request) => {
    const user = await findUserById(request.userId);
    if (!user) throw AppError.unauthorized();
    return ok(toUserDto(user));
  });

  app.post('/auth/logout', async (_request, reply) => {
    clearSessionCookies(reply);
    return ok({ signedOut: true });
  });

  app.get('/auth/google', strict, async (request, reply) => {
    if (env.AUTH_MODE !== 'google') throw AppError.notFound();
    const { returnTo } = request.query as { returnTo?: string };
    const state = b64url(randomBytes(24));
    const verifier = b64url(randomBytes(48));
    const challenge = b64url(createHash('sha256').update(verifier).digest());
    reply.setCookie(OAUTH_COOKIE, JSON.stringify({ state, verifier, returnTo: safeReturnPath(returnTo) }), {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      maxAge: 600,
    });
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: `${env.APP_URL}/api/v1/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return reply.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
  });

  app.get('/auth/google/callback', strict, async (request, reply) => {
    if (env.AUTH_MODE !== 'google') throw AppError.notFound();
    const { code, state } = request.query as { code?: string; state?: string };
    const raw = request.cookies[OAUTH_COOKIE];
    reply.clearCookie(OAUTH_COOKIE, { path: '/' });
    if (!code || !state || !raw) throw AppError.badRequest('Login was cancelled or expired. Try again.');
    let saved: { state: string; verifier: string; returnTo: string };
    try {
      saved = JSON.parse(raw);
    } catch {
      throw AppError.badRequest('Login session is invalid. Try again.');
    }
    if (saved.state !== state) throw AppError.badRequest('Login session did not match. Try again.');

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID ?? '',
        client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri: `${env.APP_URL}/api/v1/auth/google/callback`,
        grant_type: 'authorization_code',
        code_verifier: saved.verifier,
      }),
    });
    if (!tokenRes.ok) throw AppError.badRequest('Google did not accept the login. Try again.');
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) throw AppError.badRequest('Google did not return a token. Try again.');

    const infoRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (!infoRes.ok) throw AppError.badRequest('Could not read your Google profile.');
    const info = (await infoRes.json()) as {
      sub: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };
    if (!info.email || !info.email_verified) throw AppError.forbidden('Your Google email is not verified.');

    const user = await upsertUser({
      email: info.email,
      name: info.name ?? info.email,
      avatarUrl: info.picture ?? null,
      googleId: info.sub,
    });
    setSessionCookies(env, reply, await signSession(env, String(user._id)));
    return reply.redirect(`${env.APP_URL}${safeReturnPath(saved.returnTo)}`);
  });
}
