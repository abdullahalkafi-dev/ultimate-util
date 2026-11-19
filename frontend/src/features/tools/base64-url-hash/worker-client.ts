import type { WorkerRequest, WorkerResponse } from './hash.worker';

export interface Job {
  cancel(): void;
}

/** Runs one request in a fresh worker. Cancelling terminates the worker, which stops file reads at once. */
export function runWorker(req: WorkerRequest, onMessage: (m: WorkerResponse) => void): Job {
  const worker = new Worker(new URL('./hash.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    onMessage(e.data);
    if (e.data.type !== 'progress') worker.terminate();
  };
  worker.onerror = () => {
    onMessage({ type: 'error', message: 'The background worker failed to start.' });
    worker.terminate();
  };
  worker.postMessage(req);
  return { cancel: () => worker.terminate() };
}
