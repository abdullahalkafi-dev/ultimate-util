import type { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { login, startApp, stopApp, type Session } from './helpers.js';

let app: FastifyInstance;
let alice: Session;
let bob: Session;
const api = (path: string) => `/api/v1${path}`;

beforeAll(async () => {
  app = await startApp();
  await mongoose.connection.dropDatabase();
  alice = await login(app, 'alice@example.com', 'Alice');
  bob = await login(app, 'bob@example.com', 'Bob');
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await stopApp(app);
});

describe('auth', () => {
  it('reports the auth mode', async () => {
    const res = await app.inject({ method: 'GET', url: api('/auth/config') });
    expect(res.json()).toEqual({ data: { mode: 'mock' } });
  });

  it('rejects anonymous requests', async () => {
    const res = await app.inject({ method: 'GET', url: api('/snippets') });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('returns the signed in user', async () => {
    const res = await app.inject({ method: 'GET', url: api('/auth/me'), headers: alice.headers });
    expect(res.json().data.email).toBe('alice@example.com');
  });

  it('requires the CSRF header for writes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: api('/snippets'),
      headers: { cookie: alice.cookie },
      payload: { title: 't', body: 'b' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('validates the mock login body', async () => {
    const res = await app.inject({ method: 'POST', url: api('/auth/mock-login'), payload: { email: 'nope' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });
});

describe('preferences', () => {
  it('merges guest bookmarks into the account without duplicates', async () => {
    await app.inject({
      method: 'PUT',
      url: api('/preferences'),
      headers: alice.headers,
      payload: { bookmarks: ['F-001', 'F-012'], recents: [], theme: 'dark' },
    });
    const res = await app.inject({
      method: 'POST',
      url: api('/preferences/merge'),
      headers: alice.headers,
      payload: { bookmarks: ['F-012', 'F-018'], recents: ['F-018'], theme: 'light' },
    });
    const data = res.json().data;
    expect(data.bookmarks).toEqual(['F-001', 'F-012', 'F-018']);
    expect(data.recents).toEqual(['F-018']);
    expect(data.theme).toBe('dark');
  });
});

describe('snippets', () => {
  it('creates, updates, lists and soft-deletes', async () => {
    const created = await app.inject({
      method: 'POST',
      url: api('/snippets'),
      headers: alice.headers,
      payload: { title: 'List files', kind: 'command', body: 'ls -la', tags: ['shell'] },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().data.id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: api(`/snippets/${id}`),
      headers: alice.headers,
      payload: { title: 'List all files', kind: 'command', body: 'ls -la', tags: ['shell'] },
    });
    expect(updated.json().data.title).toBe('List all files');

    const list = await app.inject({ method: 'GET', url: api('/snippets'), headers: alice.headers });
    expect(list.json().data).toHaveLength(1);

    await app.inject({ method: 'DELETE', url: api(`/snippets/${id}`), headers: alice.headers });
    const after = await app.inject({ method: 'GET', url: api('/snippets'), headers: alice.headers });
    expect(after.json().data).toHaveLength(0);

    const restored = await app.inject({
      method: 'POST',
      url: api(`/snippets/${id}/restore`),
      headers: alice.headers,
    });
    expect(restored.json().data.deletedAt).toBeNull();
  });

  it('does not show one user data to another', async () => {
    const list = await app.inject({ method: 'GET', url: api('/snippets'), headers: bob.headers });
    expect(list.json().data).toHaveLength(0);
    const mine = await app.inject({ method: 'GET', url: api('/snippets'), headers: alice.headers });
    const id = mine.json().data[0].id as string;
    const steal = await app.inject({
      method: 'PUT',
      url: api(`/snippets/${id}`),
      headers: bob.headers,
      payload: { title: 'x', body: 'y' },
    });
    expect(steal.statusCode).toBe(404);
  });

  it('rejects invalid bodies and ids', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: api('/snippets'),
      headers: alice.headers,
      payload: { body: 'x' },
    });
    expect(bad.statusCode).toBe(400);
    const badId = await app.inject({ method: 'DELETE', url: api('/snippets/not-an-id'), headers: alice.headers });
    expect(badId.statusCode).toBe(404);
  });
});

describe('vault and encrypted items', () => {
  const cipher = { v: 1, iv: 'AAAAAAAAAAAAAAAA', ct: 'ZW5jcnlwdGVk' };
  const setup = {
    kdf: { name: 'pbkdf2-sha256', salt: 'c2FsdHNhbHRzYWx0', params: { iterations: 600000 } },
    wrappedKey: cipher,
    recoveryWrappedKey: cipher,
    verifier: cipher,
  };

  it('sets up a vault once', async () => {
    const first = await app.inject({ method: 'POST', url: api('/vault'), headers: alice.headers, payload: setup });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: api('/vault'), headers: alice.headers, payload: setup });
    expect(second.statusCode).toBe(409);
    const get = await app.inject({ method: 'GET', url: api('/vault'), headers: alice.headers });
    expect(get.json().data.kdf.name).toBe('pbkdf2-sha256');
  });

  it('stores totp and notes separately as opaque ciphertext', async () => {
    await app.inject({ method: 'POST', url: api('/totp'), headers: alice.headers, payload: { payload: cipher } });
    await app.inject({ method: 'POST', url: api('/notes'), headers: alice.headers, payload: { payload: cipher } });
    const totp = await app.inject({ method: 'GET', url: api('/totp'), headers: alice.headers });
    const notes = await app.inject({ method: 'GET', url: api('/notes'), headers: alice.headers });
    expect(totp.json().data).toHaveLength(1);
    expect(notes.json().data).toHaveLength(1);
    expect(totp.json().data[0].payload).toEqual(cipher);
  });

  it('rejects oversized notes', async () => {
    const big = { v: 1, iv: 'AAAAAAAAAAAAAAAA', ct: 'A'.repeat(80_000) };
    const res = await app.inject({
      method: 'POST',
      url: api('/notes'),
      headers: alice.headers,
      payload: { payload: big },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('clipboard', () => {
  it('sends, lists, pins and deletes drops', async () => {
    const created = await app.inject({
      method: 'POST',
      url: api('/clipboard'),
      headers: alice.headers,
      payload: { kind: 'text', text: 'hello from phone', deviceName: 'Phone' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().data.id as string;
    expect(created.json().data.fileData).toBeUndefined();

    const pinned = await app.inject({
      method: 'PATCH',
      url: api(`/clipboard/${id}/pin`),
      headers: alice.headers,
      payload: { pinned: true },
    });
    expect(pinned.json().data.pinned).toBe(true);

    const list = await app.inject({ method: 'GET', url: api('/clipboard'), headers: alice.headers });
    expect(list.json().data).toHaveLength(1);

    const del = await app.inject({ method: 'DELETE', url: api(`/clipboard/${id}`), headers: alice.headers });
    expect(del.statusCode).toBe(200);
  });

  it('rejects an empty drop', async () => {
    const res = await app.inject({
      method: 'POST',
      url: api('/clipboard'),
      headers: alice.headers,
      payload: { kind: 'text' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('focus and palettes', () => {
  it('logs a focus session and a habit', async () => {
    const session = await app.inject({
      method: 'POST',
      url: api('/focus/sessions'),
      headers: alice.headers,
      payload: {
        kind: 'focus',
        startedAt: '2026-11-19T10:00:00.000Z',
        endedAt: '2026-11-19T10:25:00.000Z',
        plannedSeconds: 1500,
        actualSeconds: 1500,
        completed: true,
      },
    });
    expect(session.statusCode).toBe(201);
    const habit = await app.inject({
      method: 'POST',
      url: api('/focus/habits'),
      headers: alice.headers,
      payload: { name: 'Read', targetPerWeek: 5, checkins: ['2026-11-19'] },
    });
    expect(habit.statusCode).toBe(201);
  });

  it('saves a softbox preset in the shared library', async () => {
    const res = await app.inject({
      method: 'POST',
      url: api('/palettes'),
      headers: alice.headers,
      payload: { kind: 'softbox', name: 'Warm desk', data: { kelvin: 3200, brightness: 80, shape: 'flat' } },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('account', () => {
  it('exports and then deletes everything', async () => {
    const exported = await app.inject({ method: 'GET', url: api('/account/export'), headers: alice.headers });
    expect(exported.json().data.user.email).toBe('alice@example.com');
    expect(exported.json().data.snippets.length).toBeGreaterThan(0);

    const del = await app.inject({ method: 'DELETE', url: api('/account'), headers: alice.headers });
    expect(del.statusCode).toBe(200);
    const me = await app.inject({ method: 'GET', url: api('/auth/me'), headers: alice.headers });
    expect(me.statusCode).toBe(401);
  });
});
