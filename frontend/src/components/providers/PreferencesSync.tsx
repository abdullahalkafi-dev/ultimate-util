'use client';

import { useEffect, useRef } from 'react';
import { MAX_BOOKMARKS, MAX_RECENTS, type Preferences } from '@uu/shared';
import { readJson, writeJson } from '@/lib/storage';
import { getToolById } from '@/registry';
import { useSession } from '@/hooks/useSession';
import { useMergePreferencesMutation, usePutPreferencesMutation } from '@/store/api/preferences.api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { DEFAULT_BOOKMARKS, hydrate, replaceFromServer } from '@/store/slices/preferences.slice';

const KEY = 'uu-preferences';

interface Stored extends Preferences {
  v: 1;
}

const isStored = (value: unknown): value is Stored =>
  typeof value === 'object' && value !== null && (value as Stored).v === 1 && Array.isArray((value as Stored).bookmarks);

/** Drops ids for tools that no longer exist, so old saved data never breaks the UI. */
const prune = (ids: string[], max: number) => ids.filter((id) => getToolById(id)).slice(0, max);

/**
 * Keeps bookmarks, recents and theme in localStorage for everyone, and mirrors them to the
 * account once signed in. On first login the local data is merged into the account.
 */
export function PreferencesSync() {
  const dispatch = useAppDispatch();
  const prefs = useAppSelector((s) => s.preferences);
  const { user } = useSession();
  const [merge] = useMergePreferencesMutation();
  const [put] = usePutPreferencesMutation();
  const mergedFor = useRef<string | null>(null);
  const synced = useRef<string>('');

  useEffect(() => {
    const stored = readJson<Stored | null>(KEY, null, isStored as (v: unknown) => v is Stored | null);
    dispatch(
      hydrate(
        stored
          ? { bookmarks: prune(stored.bookmarks, MAX_BOOKMARKS), recents: prune(stored.recents ?? [], MAX_RECENTS), theme: stored.theme ?? 'system' }
          : { bookmarks: DEFAULT_BOOKMARKS, recents: [], theme: 'system' },
      ),
    );
  }, [dispatch]);

  // Persist locally on every change.
  useEffect(() => {
    if (!prefs.hydrated) return;
    writeJson(KEY, { v: 1, bookmarks: prefs.bookmarks, recents: prefs.recents, theme: prefs.theme });
  }, [prefs.hydrated, prefs.bookmarks, prefs.recents, prefs.theme]);

  // Theme.
  useEffect(() => {
    if (!prefs.hydrated) return;
    const root = document.documentElement;
    if (prefs.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prefs.theme);
  }, [prefs.hydrated, prefs.theme]);

  // First login on this browser: merge guest data into the account, account order wins.
  useEffect(() => {
    if (!user || !prefs.hydrated || mergedFor.current === user.id) return;
    mergedFor.current = user.id;
    merge({ bookmarks: prefs.bookmarks, recents: prefs.recents, theme: prefs.theme })
      .unwrap()
      .then((result) => {
        synced.current = JSON.stringify(result);
        dispatch(replaceFromServer(result));
      })
      .catch(() => {
        mergedFor.current = null; // try again on the next change
      });
  }, [user, prefs.hydrated, prefs.bookmarks, prefs.recents, prefs.theme, merge, dispatch]);

  // After the merge, mirror later changes to the account (debounced).
  useEffect(() => {
    if (!user || !prefs.hydrated || mergedFor.current !== user.id) return;
    const snapshot: Preferences = { bookmarks: prefs.bookmarks, recents: prefs.recents, theme: prefs.theme };
    const text = JSON.stringify(snapshot);
    if (text === synced.current) return;
    const timer = setTimeout(() => {
      put(snapshot)
        .unwrap()
        .then(() => {
          synced.current = text;
        })
        .catch(() => undefined);
    }, 800);
    return () => clearTimeout(timer);
  }, [user, prefs.hydrated, prefs.bookmarks, prefs.recents, prefs.theme, put]);

  // Signed out: allow the next login to merge again.
  useEffect(() => {
    if (!user) {
      mergedFor.current = null;
      synced.current = '';
    }
  }, [user]);

  return null;
}
