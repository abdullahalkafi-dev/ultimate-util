import { optimizeSvg, type OptimizeOptions } from './optimize';

export type WorkerRequest = { text: string; options: OptimizeOptions };
export type WorkerResponse =
  | { ok: true; result: ReturnType<typeof optimizeSvg> }
  | { ok: false; message: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  let reply: WorkerResponse;
  try {
    reply = { ok: true, result: optimizeSvg(e.data.text, e.data.options) };
  } catch (err) {
    reply = { ok: false, message: err instanceof Error ? err.message : 'Unknown error' };
  }
  (self as unknown as Worker).postMessage(reply);
};
