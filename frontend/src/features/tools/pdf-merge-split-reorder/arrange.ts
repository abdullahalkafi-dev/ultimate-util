/** Pure page-list operations for the arrange view. Every function returns a new array. */

export interface PageItem {
  uid: string;
  /** Source file id, or null for an inserted blank page. */
  fileId: string | null;
  /** 0-based page index inside the source file (0 for blanks). */
  index: number;
  /** Extra rotation chosen by the user: 0, 90, 180 or 270. */
  rotation: number;
  /** Displayed size in PDF points, used for the thumbnail aspect ratio. */
  width: number;
  height: number;
}

let counter = 0;
export const newUid = () => `p${++counter}`;

export function moveBefore<T extends { uid: string }>(list: T[], moving: ReadonlySet<string>, beforeUid: string | null): T[] {
  const picked = list.filter((p) => moving.has(p.uid));
  if (!picked.length) return list;
  const rest = list.filter((p) => !moving.has(p.uid));
  const at = beforeUid === null ? rest.length : rest.findIndex((p) => p.uid === beforeUid);
  if (at === -1) return list;
  return [...rest.slice(0, at), ...picked, ...rest.slice(at)];
}

/** Moves the selected items one step (or more) towards the start (-1) or end (+1), keeping their relative order. */
export function moveBy<T extends { uid: string }>(list: T[], moving: ReadonlySet<string>, delta: -1 | 1): T[] {
  const out = [...list];
  if (delta < 0) {
    for (let i = 1; i < out.length; i++) {
      if (moving.has(out[i]!.uid) && !moving.has(out[i - 1]!.uid)) [out[i - 1], out[i]] = [out[i]!, out[i - 1]!];
    }
  } else {
    for (let i = out.length - 2; i >= 0; i--) {
      if (moving.has(out[i]!.uid) && !moving.has(out[i + 1]!.uid)) [out[i + 1], out[i]] = [out[i]!, out[i + 1]!];
    }
  }
  return out;
}

export function rotate(list: PageItem[], uids: ReadonlySet<string>, by: 90 | -90): PageItem[] {
  return list.map((p) => (uids.has(p.uid) ? { ...p, rotation: (((p.rotation + by) % 360) + 360) % 360 } : p));
}

export const remove = <T extends { uid: string }>(list: T[], uids: ReadonlySet<string>): T[] => list.filter((p) => !uids.has(p.uid));

/** Inserts a copy right after each selected page. */
export function duplicate(list: PageItem[], uids: ReadonlySet<string>): PageItem[] {
  return list.flatMap((p) => (uids.has(p.uid) ? [p, { ...p, uid: newUid() }] : [p]));
}

/** Inserts a blank page after the given page (or at the start when afterUid is null), sized like its neighbour. */
export function insertBlank(list: PageItem[], afterUid: string | null): PageItem[] {
  const at = afterUid === null ? 0 : list.findIndex((p) => p.uid === afterUid) + 1;
  const ref = list[Math.max(0, at - 1)] ?? list[0];
  const blank: PageItem = {
    uid: newUid(),
    fileId: null,
    index: 0,
    rotation: 0,
    width: ref ? ref.width : 595,
    height: ref ? ref.height : 842,
  };
  return [...list.slice(0, at), blank, ...list.slice(at)];
}

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const startHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });

export function commit<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h;
  return { past: [...h.past.slice(-99), h.present], present: next, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  return prev === undefined ? h : { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  const next = h.future[0];
  return next === undefined ? h : { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}
