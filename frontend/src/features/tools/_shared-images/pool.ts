import type { OutputJob, TransformResponse } from './types';

interface Task {
  id: number;
  bytes: ArrayBuffer;
  jobs: OutputJob[];
  resolve: (r: TransformResponse) => void;
}

/** Number of workers: min(cores - 1, 4), and one on small devices. */
export function poolSize(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  const memory = (typeof navigator !== 'undefined' && (navigator as Navigator & { deviceMemory?: number }).deviceMemory) || 8;
  if (memory <= 2) return 1;
  return Math.max(1, Math.min(cores - 1, 4));
}

/**
 * Pool of image workers. Each worker lazily loads only the codecs it needs.
 * `cancel()` terminates every worker, rejects nothing and resolves pending tasks as cancelled.
 */
export class ImagePool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: Task[] = [];
  private running = new Map<Worker, Task>();
  private nextId = 1;
  private cancelled = false;
  private readonly size: number;

  constructor(size = poolSize()) {
    this.size = size;
  }

  private spawn(): Worker {
    const worker = new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<TransformResponse>) => {
      const task = this.running.get(worker);
      this.running.delete(worker);
      this.idle.push(worker);
      task?.resolve(e.data);
      this.pump();
    };
    worker.onerror = () => {
      // A crashed worker (often out of memory) is replaced; its task fails alone.
      const task = this.running.get(worker);
      this.running.delete(worker);
      this.workers = this.workers.filter((w) => w !== worker);
      worker.terminate();
      task?.resolve({ id: task.id, ok: false, results: [], error: 'The browser ran out of memory or the image worker crashed. Resize the image smaller first and try again.' });
      this.pump();
    };
    this.workers.push(worker);
    return worker;
  }

  private pump() {
    while (this.queue.length && !this.cancelled) {
      let worker = this.idle.pop();
      if (!worker && this.workers.length < this.size) worker = this.spawn();
      if (!worker) return;
      const task = this.queue.shift()!;
      this.running.set(worker, task);
      worker.postMessage({ id: task.id, bytes: task.bytes, jobs: task.jobs }, [task.bytes]);
    }
  }

  /** The buffer is transferred, so pass a copy if you still need it. */
  run(bytes: ArrayBuffer, jobs: OutputJob[]): Promise<TransformResponse> {
    if (this.cancelled) return Promise.resolve({ id: 0, ok: false, error: 'Cancelled', results: [] });
    return new Promise((resolve) => {
      this.queue.push({ id: this.nextId++, bytes, jobs, resolve });
      this.pump();
    });
  }

  cancel() {
    this.cancelled = true;
    for (const w of this.workers) w.terminate();
    const pending = [...this.running.values(), ...this.queue];
    this.workers = [];
    this.idle = [];
    this.running.clear();
    this.queue = [];
    for (const t of pending) t.resolve({ id: t.id, ok: false, error: 'Cancelled', results: [] });
  }

  dispose() {
    this.cancel();
  }
}
