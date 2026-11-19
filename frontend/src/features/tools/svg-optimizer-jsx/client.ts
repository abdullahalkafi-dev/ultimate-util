import type { OptimizeOptions, OptimizeResult } from './optimize';
import type { WorkerResponse } from './svg.worker';

export const TIMEOUT_MS = 30_000;
export const HARD_LIMIT = 20 * 1024 * 1024;
export const SOFT_LIMIT = 5 * 1024 * 1024;
export const MAX_FILES = 50;

export interface Job {
  promise: Promise<OptimizeResult>;
  cancel: () => void;
}

/** One short-lived worker per job so Cancel and the 30 s timeout can simply terminate it. */
export function runJob(text: string, options: OptimizeOptions): Job {
  const worker = new Worker(new URL('./svg.worker.ts', import.meta.url), { type: 'module' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectFn: (e: Error) => void = () => undefined;
  const promise = new Promise<OptimizeResult>((resolve, reject) => {
    rejectFn = reject;
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      clearTimeout(timer);
      worker.terminate();
      if (e.data.ok) resolve(e.data.result);
      else reject(new Error(e.data.message));
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error('The optimizer crashed on this file.'));
    };
    timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Optimizing took longer than 30 seconds and was stopped.'));
    }, TIMEOUT_MS);
    worker.postMessage({ text, options });
  });
  return {
    promise,
    cancel: () => {
      clearTimeout(timer);
      worker.terminate();
      rejectFn(new Error('Cancelled'));
    },
  };
}

/** Decompresses .svgz, aborting once the expanded size passes the hard limit. */
export async function gunzipLimited(buf: ArrayBuffer): Promise<Uint8Array> {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > HARD_LIMIT) {
      await reader.cancel();
      throw new Error('This compressed SVG expands to more than 20 MB and was rejected.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
