/** bcrypt through hash-wasm. Validation lives here so it can be tested without a worker. */

export const COST_MIN = 4;
export const COST_MAX = 15;
export const COST_DEFAULT = 12;
export const BCRYPT_MAX_BYTES = 72;

export interface PasswordCheck {
  bytes: number;
  tooLong: boolean;
  hasNul: boolean;
}

export function checkPassword(password: string): PasswordCheck {
  const bytes = new TextEncoder().encode(password).length;
  return { bytes, tooLong: bytes > BCRYPT_MAX_BYTES, hasNul: password.includes('\0') };
}

const BCRYPT_RE = /^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/;

export function validateBcryptHash(hash: string): string | null {
  return BCRYPT_RE.test(hash.trim()) ? null : 'Not a bcrypt hash (expected $2a$/$2b$/$2y$, cost, 53-char salt+hash).';
}

export function costFromHash(hash: string): number | null {
  const m = /^\$2[aby]\$(\d\d)\$/.exec(hash.trim());
  return m ? Number(m[1]) : null;
}

/** bcrypt work doubles with every cost step. */
export function estimateMs(cost: number, calibration: { cost: number; ms: number }): number {
  return calibration.ms * 2 ** (cost - calibration.cost);
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

export async function hashPassword(password: string, cost: number): Promise<string> {
  const { bcrypt } = await import('hash-wasm');
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const out = await bcrypt({ password: new TextEncoder().encode(password), salt, costFactor: cost, outputType: 'encoded' });
  // hash-wasm emits $2a$; $2b$ is the same algorithm with the post-2014 identifier.
  return out.replace(/^\$2a\$/, '$2b$');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const { bcryptVerify } = await import('hash-wasm');
  // $2a$, $2b$ and $2y$ are interchangeable for hash-wasm.
  const normalized = hash.trim().replace(/^\$2[by]\$/, '$2a$');
  return bcryptVerify({ password: new TextEncoder().encode(password), hash: normalized });
}
