import { Schema, model, type Types } from 'mongoose';
import type { VaultSetupBody } from '@uu/shared';

export interface VaultDoc extends VaultSetupBody {
  owner: Types.ObjectId;
}

/**
 * Holds only wrapped keys and public KDF parameters. The server cannot derive the
 * data key from anything stored here.
 */
const vaultSchema = new Schema<VaultDoc>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    kdf: { type: Schema.Types.Mixed, required: true },
    wrappedKey: { type: Schema.Types.Mixed, required: true },
    recoveryWrappedKey: { type: Schema.Types.Mixed, required: true },
    verifier: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

export const VaultModel = model<VaultDoc>('Vault', vaultSchema);
