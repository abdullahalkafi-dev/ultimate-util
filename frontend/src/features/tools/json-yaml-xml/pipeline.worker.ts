import { runPipeline, type PipelineRequest, type PipelineResponse } from './pipeline';

interface Message {
  id: number;
  req: PipelineRequest;
}

self.onmessage = (e: MessageEvent<Message>) => {
  const { id, req } = e.data;
  let res: PipelineResponse;
  try {
    res = runPipeline(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    res = { parse: { ok: false, warnings: [], error: { message, line: 1, col: 1, offset: 0 } }, output: null };
  }
  (self as unknown as Worker).postMessage({ id, res });
};
