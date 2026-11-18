import type { VaultDto, VaultRewrapBody, VaultSetupBody } from '@uu/shared';
import { api, unwrap } from './base';

export const vaultApi = api.injectEndpoints({
  endpoints: (build) => ({
    getVault: build.query<VaultDto | null, void>({
      query: () => '/vault',
      transformResponse: unwrap<VaultDto | null>,
      providesTags: ['Vault'],
    }),
    setupVault: build.mutation<VaultDto, VaultSetupBody>({
      query: (body) => ({ url: '/vault', method: 'POST', body }),
      transformResponse: unwrap<VaultDto>,
      invalidatesTags: ['Vault'],
    }),
    rewrapVault: build.mutation<VaultDto, VaultRewrapBody>({
      query: (body) => ({ url: '/vault/rewrap', method: 'PUT', body }),
      transformResponse: unwrap<VaultDto>,
      invalidatesTags: ['Vault'],
    }),
  }),
});

export const { useGetVaultQuery, useSetupVaultMutation, useRewrapVaultMutation } = vaultApi;
