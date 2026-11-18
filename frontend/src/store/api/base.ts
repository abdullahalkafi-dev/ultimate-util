import { createApi, fetchBaseQuery, type FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type { ApiError, ApiOk } from '@uu/shared';

export const API_TAGS = [
  'Me', 'Preferences', 'Vault', 'Snippet', 'Palette', 'Totp', 'Note', 'Drop', 'FocusSession', 'Habit',
] as const;
export type ApiTag = (typeof API_TAGS)[number];

/** Same-origin calls. Next.js proxies /api/* to the backend, so cookies work without CORS. */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/v1',
    credentials: 'include',
    prepareHeaders: (headers) => {
      headers.set('x-uu-csrf', '1');
      return headers;
    },
  }),
  tagTypes: [...API_TAGS],
  endpoints: () => ({}),
});

export const unwrap = <T>(response: ApiOk<T>): T => response.data;

/** Turns any RTK Query error into a sentence a person can read. */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = error as FetchBaseQueryError | undefined;
  if (!e) return fallback;
  if ('status' in e) {
    if (e.status === 'FETCH_ERROR') return 'Cannot reach the server. Check your connection and try again.';
    if (e.status === 'PARSING_ERROR') return fallback;
    const body = e.data as ApiError | undefined;
    if (body?.error?.message) return body.error.message;
  }
  return fallback;
}

export const apiErrorCode = (error: unknown): string | undefined =>
  ((error as FetchBaseQueryError | undefined)?.data as ApiError | undefined)?.error?.code;

/** The builder passed to injectEndpoints, for helpers that define several endpoints at once. */
export type ApiBuilder = Parameters<Parameters<typeof api.injectEndpoints>[0]['endpoints']>[0];
