import { classifyQpdfFailure, type QpdfFailure, type QpdfResult } from './qpdf-run';

export class QpdfError extends Error {
  constructor(
    message: string,
    readonly reason: QpdfFailure,
  ) {
    super(message);
  }
}

export interface QpdfJob {
  promise: Promise<Uint8Array>;
  cancel: () => void;
}

/** Runs qpdf in a fresh worker (so Cancel can terminate it). Resolves with the output bytes. */
export function startQpdf(input: Uint8Array, args: string[]): QpdfJob {
  const worker = new Worker(new URL('./qpdf.worker.ts', import.meta.url), { type: 'module' });
  let rejectFn: (e: unknown) => void = () => {};
  const promise = new Promise<Uint8Array>((resolve, reject) => {
    rejectFn = reject;
    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: QpdfResult; message?: string }>) => {
      worker.terminate();
      const { ok, result, message } = e.data;
      if (!ok || !result) return reject(new QpdfError(message ?? 'The PDF engine failed to start.', 'other'));
      if (result.output) return resolve(result.output);
      reject(new QpdfError(result.log || 'qpdf failed', classifyQpdfFailure(result.log)));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new QpdfError(e.message || 'The PDF engine failed to start.', 'other'));
    };
    // Copy so the caller's bytes stay usable.
    const copy = input.slice();
    worker.postMessage({ input: copy, args }, [copy.buffer]);
  });
  return {
    promise,
    cancel: () => {
      worker.terminate();
      rejectFn(new DOMException('Cancelled', 'AbortError'));
    },
  };
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';
