/// <reference lib="webworker" />
import { buildOutputs, type BuildOptions, type OutputJob } from './build';

export interface BuildRequest {
  sources: [string, Uint8Array][];
  jobs: OutputJob[];
  options: BuildOptions;
}

export type BuildMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; files: { name: string; bytes: Uint8Array }[] }
  | { type: 'error'; message: string };

const post = (m: BuildMessage, transfer: Transferable[] = []) => self.postMessage(m, transfer);

self.onmessage = async (e: MessageEvent<BuildRequest>) => {
  try {
    const files = await buildOutputs(new Map(e.data.sources), e.data.jobs, e.data.options, (done, total) => post({ type: 'progress', done, total }));
    post({ type: 'done', files }, files.map((f) => f.bytes.buffer as ArrayBuffer));
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
