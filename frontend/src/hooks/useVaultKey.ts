'use client';

import { getVaultKey } from '@/lib/crypto/session';
import { useAppSelector } from '@/store/hooks';

/** The unlocked data key, or null while the vault is locked. Re-renders when the vault locks or unlocks. */
export function useVaultKey(): CryptoKey | null {
  const unlocked = useAppSelector((s) => s.ui.vaultUnlocked);
  return unlocked ? getVaultKey() : null;
}
