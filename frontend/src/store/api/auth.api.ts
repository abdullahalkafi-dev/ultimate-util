import type { AuthConfig, MockLoginBody, UserDto } from '@uu/shared';
import { api, unwrap } from './base';

export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
    getAuthConfig: build.query<AuthConfig, void>({
      query: () => '/auth/config',
      transformResponse: unwrap<AuthConfig>,
    }),
    getMe: build.query<UserDto | null, void>({
      // 401 simply means "signed out", so it resolves to null instead of an error.
      queryFn: async (_arg, _api, _extra, baseQuery) => {
        // Guests have no session flag cookie, so skip the request instead of logging a 401.
        if (typeof document !== 'undefined' && !document.cookie.includes('uu_has_session')) return { data: null };
        const result = await baseQuery('/auth/me');
        if (result.error) {
          if (result.error.status === 401) return { data: null };
          return { error: result.error };
        }
        return { data: (result.data as { data: UserDto }).data };
      },
      providesTags: ['Me'],
    }),
    mockLogin: build.mutation<UserDto, MockLoginBody>({
      query: (body) => ({ url: '/auth/mock-login', method: 'POST', body }),
      transformResponse: unwrap<UserDto>,
      invalidatesTags: ['Me'],
    }),
    logout: build.mutation<{ signedOut: boolean }, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      transformResponse: unwrap<{ signedOut: boolean }>,
    }),
    exportAccount: build.query<Record<string, unknown>, void>({
      query: () => '/account/export',
      transformResponse: unwrap<Record<string, unknown>>,
    }),
    deleteAccount: build.mutation<{ deleted: boolean }, void>({
      query: () => ({ url: '/account', method: 'DELETE' }),
      transformResponse: unwrap<{ deleted: boolean }>,
    }),
  }),
});

export const {
  useGetAuthConfigQuery,
  useGetMeQuery,
  useMockLoginMutation,
  useLogoutMutation,
  useLazyExportAccountQuery,
  useDeleteAccountMutation,
} = authApi;
