import type { QpdfInstance } from '@neslinesli93/qpdf-wasm';

export interface QpdfResult {
  /** qpdf exit code: 0 ok, 3 ok with warnings, 2 error. */
  code: number;
  output: Uint8Array | null;
  log: string;
}

export type QpdfFactory = () => Promise<QpdfInstance>;

/** Runs qpdf once on `input`. `args` may use the literal tokens IN and OUT for the file paths. */
export async function runQpdf(createInstance: QpdfFactory, input: Uint8Array, args: string[]): Promise<QpdfResult> {
  const lines: string[] = [];
  // The build binds console.log/error when the instance is created and ignores print hooks,
  // so output is captured by swapping the console methods around instance creation.
  const saved = { log: console.log, error: console.error };
  console.log = (...a: unknown[]) => void lines.push(a.join(' '));
  console.error = (...a: unknown[]) => void lines.push(a.join(' '));
  let qpdf: QpdfInstance;
  try {
    qpdf = await createInstance();
  } finally {
    console.log = saved.log;
    console.error = saved.error;
  }
  const fs = qpdf.FS as unknown as { writeFile(p: string, d: Uint8Array): void; readFile(p: string): Uint8Array };
  fs.writeFile('/in.pdf', input);
  const argv = args.map((a) => (a === 'IN' ? '/in.pdf' : a === 'OUT' ? '/out.pdf' : a));
  let code: number;
  try {
    code = qpdf.callMain(argv);
  } catch (err) {
    // Emscripten throws ExitStatus for a non-zero exit.
    const status = (err as { status?: unknown } | null)?.status;
    if (typeof status !== 'number') throw err;
    code = status;
  }
  let output: Uint8Array | null = null;
  if (code === 0 || code === 3) {
    try {
      output = fs.readFile('/out.pdf');
    } catch {
      output = null;
    }
  }
  return { code, output, log: lines.join('\n') };
}

export type QpdfFailure = 'wrong-password' | 'password-required' | 'corrupt' | 'other';

/** Maps qpdf's message text to a coarse reason the UI can explain. */
export function classifyQpdfFailure(log: string): QpdfFailure {
  const text = log.toLowerCase();
  if (text.includes('invalid password')) return 'wrong-password';
  if (text.includes('password')) return 'password-required';
  if (text.includes('not a pdf') || text.includes('damaged') || text.includes('unable to find trailer')) return 'corrupt';
  return 'other';
}

export interface Permissions {
  print: boolean;
  copy: boolean;
  modify: boolean;
}

export function decryptArgs(password: string): string[] {
  return [`--password=${password}`, '--decrypt', 'IN', 'OUT'];
}

export function encryptArgs(userPassword: string, ownerPassword: string, perms: Permissions): string[] {
  return [
    '--encrypt', userPassword, ownerPassword, '256',
    `--print=${perms.print ? 'full' : 'none'}`,
    `--extract=${perms.copy ? 'y' : 'n'}`,
    `--modify=${perms.modify ? 'all' : 'none'}`,
    '--', 'IN', 'OUT',
  ];
}

/** Lossless structural savings: object streams plus maximum flate. */
export const optimizeArgs = ['--object-streams=generate', '--recompress-flate', '--compression-level=9', 'IN', 'OUT'];
