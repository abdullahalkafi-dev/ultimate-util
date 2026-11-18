/**
 * Holds the unlocked data key in memory only. It is never written to storage.
 * The key is cleared on lock, on inactivity and when the tab is closed.
 */
type Listener = (unlocked: boolean) => void;

const DEFAULT_AUTO_LOCK_MS = 5 * 60 * 1000;

let key: CryptoKey | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let autoLockMs = DEFAULT_AUTO_LOCK_MS;
const listeners = new Set<Listener>();

const notify = () => listeners.forEach((l) => l(key !== null));

function arm() {
  if (timer) clearTimeout(timer);
  timer = key && autoLockMs > 0 ? setTimeout(lockVault, autoLockMs) : null;
}

export function unlockVaultWith(dataKey: CryptoKey): void {
  key = dataKey;
  arm();
  notify();
}

export function lockVault(): void {
  key = null;
  if (timer) clearTimeout(timer);
  timer = null;
  notify();
}

/** Returns the key and counts the call as activity, so the auto-lock timer restarts. */
export function getVaultKey(): CryptoKey | null {
  if (key) arm();
  return key;
}

export const isVaultUnlocked = (): boolean => key !== null;

export function setAutoLockMinutes(minutes: number): void {
  autoLockMs = Math.max(0, minutes) * 60 * 1000;
  arm();
}

export function subscribeVault(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', lockVault);
}
