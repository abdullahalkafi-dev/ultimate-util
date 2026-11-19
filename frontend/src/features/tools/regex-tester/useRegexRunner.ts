'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { runMatch, type RunRequest, type RunResult } from './engine';

export type RunStatus = 'idle' | 'running' | 'slow' | 'done' | 'timeout' | 'cancelled';

const SLOW_AFTER_MS = 1000;
const MAIN_THREAD_TEXT_CAP = 100_000;

/**
 * Runs matching in a killable Worker. Each request replaces the previous one; a timed out or
 * cancelled worker is terminated and recreated, which is the only way to stop a runaway regex.
 */
export function useRegexRunner(req: RunRequest, timeoutMs: number, delayMs = 150) {
  const [result, setResult] = useState<RunResult | null>(null);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [fallback, setFallback] = useState(false);
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const kill = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    clearTimers();
  }, []);

  useEffect(() => kill, [kill]);

  const { pattern, flags, text, replacement, maxMatches } = req;
  useEffect(() => {
    const id = ++seq.current;
    kill();
    if (pattern === '') {
      setResult(null);
      setStatus('idle');
      return;
    }
    const start = setTimeout(() => {
      const request: RunRequest = { pattern, flags, text, replacement, maxMatches };
      let w: Worker;
      try {
        w = new Worker(new URL('./match.worker.ts', import.meta.url), { type: 'module' });
      } catch {
        // No worker support: run inline with a smaller cap and no timeout protection.
        setFallback(true);
        setResult(runMatch({ ...request, text: text.slice(0, MAIN_THREAD_TEXT_CAP) }));
        setStatus('done');
        return;
      }
      worker.current = w;
      setStatus('running');
      timers.current.push(setTimeout(() => seq.current === id && setStatus('slow'), SLOW_AFTER_MS));
      timers.current.push(
        setTimeout(() => {
          if (seq.current !== id) return;
          kill();
          setResult(null);
          setStatus('timeout');
        }, timeoutMs),
      );
      w.onmessage = (e: MessageEvent<{ id: number; res: RunResult }>) => {
        if (seq.current !== id) return;
        clearTimers();
        setResult(e.data.res);
        setStatus('done');
      };
      w.onerror = () => {
        if (seq.current !== id) return;
        kill();
        setFallback(true);
        setResult(runMatch({ ...request, text: text.slice(0, MAIN_THREAD_TEXT_CAP) }));
        setStatus('done');
      };
      w.postMessage({ id, req: request });
    }, delayMs);
    return () => clearTimeout(start);
  }, [pattern, flags, text, replacement, maxMatches, timeoutMs, delayMs, kill]);

  const cancel = useCallback(() => {
    seq.current++;
    kill();
    setResult(null);
    setStatus('cancelled');
  }, [kill]);

  return { result, status, cancel, fallback };
}
