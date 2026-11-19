'use client';

import { useCallback } from 'react';
import { useSession } from '@/hooks/useSession';
import { useCreatePaletteMutation, useListPalettesQuery } from '@/store/api/resources.api';

export type CloudKind = 'palette' | 'softbox';

export interface CloudItem {
  id: string;
  name: string;
  data: Record<string, unknown>;
}

/**
 * Optional account sync for a tool that works fully as a guest. Everything here is inert
 * (no request is made) unless the user is signed in.
 */
export function useCloudSave(kind: CloudKind) {
  const { isAuthed } = useSession();
  const list = useListPalettesQuery(undefined, { skip: !isAuthed });
  const [create, createState] = useCreatePaletteMutation();

  const items: CloudItem[] = (list.data ?? [])
    .filter((p) => p.kind === kind)
    .map((p) => ({ id: p.id, name: p.name, data: p.data }));

  const save = useCallback(
    async (name: string, data: Record<string, unknown>): Promise<boolean> => {
      try {
        await create({ kind, name: name.slice(0, 120) || 'Untitled', tags: [], data }).unwrap();
        return true;
      } catch {
        return false;
      }
    },
    [create, kind],
  );

  return { isAuthed, items, save, saving: createState.isLoading };
}
