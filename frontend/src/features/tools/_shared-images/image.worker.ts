import { runTransform } from './transform';
import type { TransformRequest } from './types';

self.onmessage = async (event: MessageEvent<TransformRequest>) => {
  const { id, bytes, jobs } = event.data;
  const response = await runTransform(id, bytes, jobs);
  const transfer = response.results.flatMap((r) => (r.bytes ? [r.bytes] : []));
  (self as unknown as Worker).postMessage(response, transfer);
};
