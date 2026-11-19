import { QpdfError, startQpdf } from './qpdf';
import { decryptArgs } from './qpdf-run';

/** Resolves with a password, or null when the user skips the file. */
export type AskPassword = (fileName: string, wasWrong: boolean) => Promise<string | null>;

export type DecryptOutcome = { bytes: Uint8Array; ownerOnly: boolean } | { skipped: true };

/** Decrypts with qpdf. Tries the empty password first (owner-restricted files), then asks until it works or is skipped. */
export async function decryptWithPrompt(bytes: Uint8Array, name: string, ask: AskPassword): Promise<DecryptOutcome> {
  try {
    return { bytes: await startQpdf(bytes, decryptArgs('')).promise, ownerOnly: true };
  } catch (err) {
    if (!(err instanceof QpdfError) || (err.reason !== 'wrong-password' && err.reason !== 'password-required')) throw err;
  }
  let wrong = false;
  for (;;) {
    const password = await ask(name, wrong);
    if (password === null) return { skipped: true };
    try {
      return { bytes: await startQpdf(bytes, decryptArgs(password)).promise, ownerOnly: false };
    } catch (err) {
      if (err instanceof QpdfError && err.reason === 'wrong-password') {
        wrong = true;
        continue;
      }
      throw err;
    }
  }
}

export function isEncryptedError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'EncryptedPDFError' || /encrypted/i.test(err.message));
}
