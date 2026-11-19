/** Linear undo history with a size cap and optional coalescing of rapid edits (slider drags). */
export interface HistoryEntry<T> { label: string; state: T; key?: string; at: number }
export interface History<T> { entries: HistoryEntry<T>[]; index: number; dropped: number; limit: number }

export const HISTORY_LIMIT = 50;

export function createHistory<T>(initial: T, label = 'Open', limit = HISTORY_LIMIT, now = 0): History<T> {
  return { entries: [{ label, state: initial, at: now }], index: 0, dropped: 0, limit };
}

export const current = <T>(h: History<T>): T => (h.entries[h.index] as HistoryEntry<T>).state;
export const canUndo = <T>(h: History<T>) => h.index > 0;
export const canRedo = <T>(h: History<T>) => h.index < h.entries.length - 1;

/**
 * Pushes a new state, discarding any redo branch. When `key` equals the top entry's key and it was
 * pushed less than `coalesceMs` ago, the top entry is replaced instead (one undo step per slider drag).
 */
export function push<T>(
  h: History<T>,
  state: T,
  label: string,
  opts: { key?: string; now?: number; coalesceMs?: number } = {},
): History<T> {
  const now = opts.now ?? 0;
  const top = h.entries[h.index];
  if (opts.key && top && top.key === opts.key && h.index === h.entries.length - 1 && h.index > 0 && now - top.at <= (opts.coalesceMs ?? 900)) {
    const entries = h.entries.slice();
    entries[h.index] = { label, state, key: opts.key, at: now };
    return { ...h, entries };
  }
  let entries = h.entries.slice(0, h.index + 1);
  entries.push({ label, state, key: opts.key, at: now });
  let dropped = h.dropped;
  if (entries.length > h.limit) {
    const extra = entries.length - h.limit;
    entries = entries.slice(extra);
    dropped += extra;
  }
  return { ...h, entries, index: entries.length - 1, dropped };
}

export const undo = <T>(h: History<T>): History<T> => (canUndo(h) ? { ...h, index: h.index - 1 } : h);
export const redo = <T>(h: History<T>): History<T> => (canRedo(h) ? { ...h, index: h.index + 1 } : h);
export const jump = <T>(h: History<T>, i: number): History<T> => ({ ...h, index: Math.max(0, Math.min(h.entries.length - 1, i)) });
