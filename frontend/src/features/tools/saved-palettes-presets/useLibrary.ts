'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/hooks/useSession';
import { readJson, writeJson, removeKey } from '@/lib/storage';
import { apiErrorCode, apiErrorMessage } from '@/store/api/base';
import {
  useCreatePaletteMutation,
  useDeletePaletteMutation,
  useListPalettesQuery,
  useUpdatePaletteMutation,
} from '@/store/api/resources.api';
import {
  ACCOUNT_CAP, LOCAL_CAP, LOCAL_KEY, isLibItemArray, newLocalId, planMerge,
  type LibDraft, type LibItem, type MergePlan,
} from './library';

const CHANNEL = 'uu-library';

export interface MergeResult {
  created: number;
  updated: number;
  skipped: number;
  overflow: number;
  failed: number;
}

/** One library API over guest-local storage and the signed-in account. */
export function useLibrary() {
  const { user, isAuthed, isLoading: sessionLoading } = useSession();
  const [local, setLocal] = useState<LibItem[]>([]);
  const [localReady, setLocalReady] = useState(false);
  const channel = useRef<BroadcastChannel | null>(null);

  const list = useListPalettesQuery(undefined, { skip: !isAuthed });
  const [createPalette] = useCreatePaletteMutation();
  const [updatePalette] = useUpdatePaletteMutation();
  const [deletePalette] = useDeletePaletteMutation();

  useEffect(() => {
    setLocal(readJson<LibItem[]>(LOCAL_KEY, [], isLibItemArray));
    setLocalReady(true);
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(CHANNEL);
    channel.current = ch;
    ch.onmessage = () => setLocal(readJson<LibItem[]>(LOCAL_KEY, [], isLibItemArray));
    return () => ch.close();
  }, []);

  const persistLocal = useCallback((next: LibItem[]) => {
    setLocal(next);
    if (next.length) writeJson(LOCAL_KEY, next);
    else removeKey(LOCAL_KEY);
    channel.current?.postMessage('changed');
  }, []);

  const remote = useMemo<LibItem[]>(() => (list.data ?? []).map((p) => ({ id: p.id, kind: p.kind, name: p.name, tags: p.tags, data: p.data, createdAt: p.createdAt, updatedAt: p.updatedAt })), [list.data]);
  const items = isAuthed ? remote : local;
  const cap = isAuthed ? ACCOUNT_CAP : LOCAL_CAP;

  /** Returns an error message, or null on success. */
  const add = useCallback(
    async (draft: LibDraft): Promise<string | null> => {
      if (items.length >= cap) return `The library is full (${cap} items). Delete or export some items first.`;
      if (!isAuthed) {
        const now = new Date().toISOString();
        persistLocal([{ id: newLocalId(), ...draft, createdAt: now, updatedAt: now }, ...local]);
        return null;
      }
      try {
        await createPalette(draft).unwrap();
        return null;
      } catch (e) {
        return apiErrorCode(e) === 'QUOTA_EXCEEDED' ? `Your account library is full (${ACCOUNT_CAP} items).` : apiErrorMessage(e, 'Could not save. Try again.');
      }
    },
    [items.length, cap, isAuthed, local, persistLocal, createPalette],
  );

  const update = useCallback(
    async (id: string, draft: LibDraft): Promise<string | null> => {
      if (!isAuthed) {
        persistLocal(local.map((i) => (i.id === id ? { ...i, ...draft, updatedAt: new Date().toISOString() } : i)));
        return null;
      }
      try {
        await updatePalette({ id, body: draft }).unwrap();
        return null;
      } catch (e) {
        return apiErrorMessage(e, 'Could not update. Try again.');
      }
    },
    [isAuthed, local, persistLocal, updatePalette],
  );

  const remove = useCallback(
    async (id: string): Promise<string | null> => {
      if (!isAuthed) {
        persistLocal(local.filter((i) => i.id !== id));
        return null;
      }
      try {
        await deletePalette(id).unwrap();
        return null;
      } catch (e) {
        return apiErrorMessage(e, 'Could not delete. Try again.');
      }
    },
    [isAuthed, local, persistLocal, deletePalette],
  );

  /** Merge guest items into the account. Local copy is cleared only if nothing failed. */
  const mergeLocal = useCallback(
    async (plan: MergePlan): Promise<MergeResult> => {
      const result: MergeResult = { created: 0, updated: 0, skipped: plan.skipped, overflow: plan.overflow, failed: 0 };
      for (const d of plan.create) {
        try { await createPalette(d).unwrap(); result.created++; } catch { result.failed++; }
      }
      for (const u of plan.update) {
        try { await updatePalette({ id: u.id, body: u.draft }).unwrap(); result.updated++; } catch { result.failed++; }
      }
      if (result.failed === 0 && result.overflow === 0) persistLocal([]);
      return result;
    },
    [createPalette, updatePalette, persistLocal],
  );

  const buildPlan = useCallback(() => planMerge(local, remote, ACCOUNT_CAP), [local, remote]);

  const status = (list.error as { status?: unknown } | undefined)?.status;
  return {
    user, isAuthed, sessionLoading, items, cap, add, update, remove, mergeLocal, buildPlan,
    localCount: local.length,
    loading: isAuthed ? list.isLoading : !localReady,
    error: isAuthed && list.error ? apiErrorMessage(list.error, 'Could not load your library.') : null,
    expired: status === 401,
    retry: list.refetch,
    remoteReady: isAuthed && list.isSuccess,
  };
}
