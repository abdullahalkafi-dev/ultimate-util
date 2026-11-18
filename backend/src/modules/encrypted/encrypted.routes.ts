import type { FastifyInstance } from 'fastify';
import { QUOTAS, encryptedItemBodySchema, type EncryptedItemBody } from '@uu/shared';
import { registerOwnedCrud } from '../../core/crud/owned-crud.js';
import { AppError } from '../../core/errors/app-error.js';
import { EncryptedItemModel } from './encrypted-item.model.js';

/** Base64 expands data by about a third, so 50 KB of note text becomes roughly 70 KB of ciphertext. */
const MAX_NOTE_CIPHERTEXT = Math.ceil(QUOTAS.noteBytes * 1.4) + 200;

const checkNote = (body: EncryptedItemBody) => {
  if (body.payload.ct.length > MAX_NOTE_CIPHERTEXT) {
    throw AppError.badRequest('This note is larger than 50 KB. Split it into two notes.');
  }
};

export async function encryptedRoutes(app: FastifyInstance) {
  // 2FA entries (class A): the server stores the encrypted secret and never sees it.
  registerOwnedCrud(app, {
    basePath: '/totp',
    model: EncryptedItemModel,
    bodySchema: encryptedItemBodySchema,
    scope: { resource: 'totp' },
    quota: { max: QUOTAS.totp, message: 'You have reached the limit of 200 authenticator entries.' },
  });

  // Secure notes (class A).
  registerOwnedCrud(app, {
    basePath: '/notes',
    model: EncryptedItemModel,
    bodySchema: encryptedItemBodySchema,
    scope: { resource: 'note' },
    quota: { max: QUOTAS.notes, message: 'You have reached the limit of 500 notes.' },
    check: checkNote,
  });
}
