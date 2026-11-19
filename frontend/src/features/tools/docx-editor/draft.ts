import type { DocNode } from './exporters';

export interface Draft {
  name: string;
  doc: DocNode;
  savedAt: number;
}

const DB = 'uu-docx-editor';
const STORE = 'drafts';
const KEY = 'current';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB error'));
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB error'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB aborted'));
    });
  } finally {
    db.close();
  }
}

/** Resolves false when storage is unavailable (private mode, blocked) so callers can show a banner. */
export async function saveDraft(draft: Draft): Promise<boolean> {
  try {
    await run('readwrite', (s) => s.put(draft, KEY));
    return true;
  } catch {
    return false;
  }
}

export async function loadDraft(): Promise<Draft | null> {
  try {
    const value = (await run('readonly', (s) => s.get(KEY))) as Draft | undefined;
    return value && value.doc ? value : null;
  } catch {
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(KEY));
  } catch {
    // Nothing stored or storage unavailable: nothing to clear.
  }
}

export async function draftsAvailable(): Promise<boolean> {
  try {
    await run('readonly', (s) => s.count());
    return true;
  } catch {
    return false;
  }
}
