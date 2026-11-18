import type { MergePreferencesBody, Preferences } from '@uu/shared';
import { api, unwrap } from './base';

export const preferencesApi = api.injectEndpoints({
  endpoints: (build) => ({
    getPreferences: build.query<Preferences, void>({
      query: () => '/preferences',
      transformResponse: unwrap<Preferences>,
      providesTags: ['Preferences'],
    }),
    putPreferences: build.mutation<Preferences, Preferences>({
      query: (body) => ({ url: '/preferences', method: 'PUT', body }),
      transformResponse: unwrap<Preferences>,
    }),
    mergePreferences: build.mutation<Preferences, MergePreferencesBody>({
      query: (body) => ({ url: '/preferences/merge', method: 'POST', body }),
      transformResponse: unwrap<Preferences>,
    }),
  }),
});

export const { useGetPreferencesQuery, usePutPreferencesMutation, useMergePreferencesMutation } = preferencesApi;
