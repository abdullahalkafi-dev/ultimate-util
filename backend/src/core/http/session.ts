import { SignJWT, jwtVerify } from 'jose';
import type { FastifyReply } from 'fastify';
import type { Env } from '../../config/env.js';

export const SESSION_COOKIE = 'uu_session';
/** Readable by JS so the UI knows a session probably exists. It carries no secret. */
export const SESSION_FLAG_COOKIE = 'uu_has_session';
const SESSION_DAYS = 30;

const key = (env: Env) => new TextEncoder().encode(env.JWT_SECRET);

export async function signSession(env: Env, userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key(env));
}

export async function verifySession(env: Env, token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(env), { algorithms: ['HS256'] });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function setSessionCookies(env: Env, reply: FastifyReply, token: string): void {
  const secure = env.NODE_ENV === 'production';
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge,
  });
  reply.setCookie(SESSION_FLAG_COOKIE, '1', { httpOnly: false, sameSite: 'lax', secure, path: '/', maxAge });
}

export function clearSessionCookies(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
  reply.clearCookie(SESSION_FLAG_COOKIE, { path: '/' });
}
