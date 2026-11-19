import { runMatch, type RunRequest, type RunResult } from './engine';

interface Message {
  id: number;
  req: RunRequest;
}

self.onmessage = (e: MessageEvent<Message>) => {
  const { id, req } = e.data;
  const res: RunResult = runMatch(req);
  (self as unknown as Worker).postMessage({ id, res });
};
