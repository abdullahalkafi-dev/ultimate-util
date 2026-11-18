import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';
import { safeReturnPath } from '../src/modules/auth/auth.routes.js';

const base = { MONGO_URI: 'mongodb://x', JWT_SECRET: 'x'.repeat(32) };

describe('env', () => {
  it('blocks mock login in production', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', AUTH_MODE: 'mock' })).toThrow(/Mock login/);
  });
  it('requires google credentials in google mode', () => {
    expect(() => loadEnv({ ...base, AUTH_MODE: 'google' })).toThrow(/GOOGLE_CLIENT_ID/);
  });
  it('rejects a short secret', () => {
    expect(() => loadEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });
});

describe('safeReturnPath', () => {
  it('allows relative paths only', () => {
    expect(safeReturnPath('/tools/jwt')).toBe('/tools/jwt');
    expect(safeReturnPath('//evil.com')).toBe('/');
    expect(safeReturnPath('https://evil.com')).toBe('/');
    expect(safeReturnPath(undefined)).toBe('/');
  });
});
