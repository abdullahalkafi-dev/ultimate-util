/// <reference lib="webworker" />
/** File hashing (all selected algorithms in one pass) and bcrypt. Cancel = the page terminates this worker. */
import { toHex } from './base64';
import { createHasher, type HashAlgo } from './digest';
import { hashPassword, verifyPassword } from './bcrypt';

export type WorkerRequest =
  | { type: 'file'; file: File; algos: HashAlgo[] }
  | { type: 'bcrypt-hash'; password: string; cost: number }
  | { type: 'bcrypt-verify'; password: string; hash: string };

export type WorkerResponse =
  | { type: 'progress'; fraction: number }
  | { type: 'file-done'; digests: { algo: HashAlgo; hex: string; bytes: Uint8Array }[] }
  | { type: 'bcrypt-hash-done'; hash: string; ms: number }
  | { type: 'bcrypt-verify-done'; match: boolean }
  | { type: 'error'; message: string };

const CHUNK = 4 * 1024 * 1024;
const post = (m: WorkerResponse) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.type === 'file') {
      const hashers = await Promise.all(req.algos.map(async (algo) => ({ algo, h: (await createHasher(algo)).init() })));
      let last = -1;
      for (let offset = 0; offset < req.file.size; offset += CHUNK) {
        const buf = new Uint8Array(await req.file.slice(offset, offset + CHUNK).arrayBuffer());
        for (const { h } of hashers) h.update(buf);
        const fraction = Math.min(1, (offset + buf.length) / req.file.size);
        if (fraction - last >= 0.01) {
          last = fraction;
          post({ type: 'progress', fraction });
        }
      }
      post({
        type: 'file-done',
        digests: hashers.map(({ algo, h }) => {
          const bytes = h.digest('binary');
          return { algo, hex: toHex(bytes), bytes };
        }),
      });
    } else if (req.type === 'bcrypt-hash') {
      const t = performance.now();
      const hash = await hashPassword(req.password, req.cost);
      post({ type: 'bcrypt-hash-done', hash, ms: performance.now() - t });
    } else {
      post({ type: 'bcrypt-verify-done', match: await verifyPassword(req.password, req.hash) });
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : 'Worker failed.' });
  }
};
