import type { FastifyInstance } from 'fastify';
import { vaultRewrapSchema, vaultSetupSchema, type VaultDto } from '@uu/shared';
import { AppError } from '../../core/errors/app-error.js';
import { ok } from '../../core/http/dto.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { VaultModel, type VaultDoc } from './vault.model.js';

type VaultRecord = VaultDoc & { updatedAt: Date };

const toVaultDto = (doc: VaultRecord): VaultDto => ({
  kdf: doc.kdf,
  wrappedKey: doc.wrappedKey,
  recoveryWrappedKey: doc.recoveryWrappedKey,
  verifier: doc.verifier,
  updatedAt: doc.updatedAt.toISOString(),
});

export async function vaultRoutes(app: FastifyInstance) {
  const base = { preHandler: authenticate };

  app.get('/vault', base, async (request) => {
    const vault = await VaultModel.findOne({ owner: request.userId });
    return ok(vault ? toVaultDto(vault as unknown as VaultRecord) : null);
  });

  app.post('/vault', base, async (request, reply) => {
    const body = vaultSetupSchema.parse(request.body);
    const existing = await VaultModel.exists({ owner: request.userId });
    if (existing) throw AppError.conflict('A vault already exists for this account');
    const vault = await VaultModel.create({ ...body, owner: request.userId });
    return reply.status(201).send(ok(toVaultDto(vault as unknown as VaultRecord)));
  });

  // Passphrase change: only the wrapped data key and KDF parameters change. Records are not re-encrypted.
  app.put('/vault/rewrap', base, async (request) => {
    const body = vaultRewrapSchema.parse(request.body);
    const vault = await VaultModel.findOneAndUpdate(
      { owner: request.userId },
      { $set: { kdf: body.kdf, wrappedKey: body.wrappedKey } },
      { returnDocument: 'after' },
    );
    if (!vault) throw AppError.notFound('No vault set up yet');
    return ok(toVaultDto(vault as unknown as VaultRecord));
  });
}
