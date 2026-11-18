'use client';

import { useGetMeQuery } from '@/store/api/auth.api';

/** Signed-in state. A 401 from the API resolves to a null user, not an error. */
export function useSession() {
  const { data, isLoading, isError, refetch } = useGetMeQuery();
  return { user: data ?? null, isLoading, isError, isAuthed: Boolean(data), refetch };
}
