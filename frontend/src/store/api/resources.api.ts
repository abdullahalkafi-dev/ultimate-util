import type {
  DropBody,
  DropDto,
  EncryptedItemBody,
  EncryptedItemDto,
  FocusSessionBody,
  FocusSessionDto,
  HabitBody,
  HabitDto,
  PaletteBody,
  PaletteDto,
  SnippetBody,
  SnippetDto,
} from '@uu/shared';

import { api, unwrap, type ApiBuilder, type ApiTag } from './base';

type Builder = ApiBuilder;

/** list / create / update / soft-delete / restore for one owner-scoped resource. */
function crud<Dto extends { id: string }, Body>(build: Builder, path: string, tag: ApiTag) {
  const list = build.query<Dto[], void>({
    query: () => path,
    transformResponse: unwrap<Dto[]>,
    providesTags: (result) => [
      tag,
      ...(result ?? []).map((item) => ({ type: tag, id: item.id }) as const),
    ],
  });
  const create = build.mutation<Dto, Body>({
    query: (body) => ({ url: path, method: 'POST', body }),
    transformResponse: unwrap<Dto>,
    invalidatesTags: [tag],
  });
  const update = build.mutation<Dto, { id: string; body: Body }>({
    query: ({ id, body }) => ({ url: `${path}/${id}`, method: 'PUT', body }),
    transformResponse: unwrap<Dto>,
    invalidatesTags: (_r, _e, { id }) => [{ type: tag, id }],
  });
  const remove = build.mutation<{ id: string }, string>({
    query: (id) => ({ url: `${path}/${id}`, method: 'DELETE' }),
    transformResponse: unwrap<{ id: string }>,
    invalidatesTags: [tag],
  });
  const restore = build.mutation<Dto, string>({
    query: (id) => ({ url: `${path}/${id}/restore`, method: 'POST' }),
    transformResponse: unwrap<Dto>,
    invalidatesTags: [tag],
  });
  return { list, create, update, remove, restore };
}

export const resourcesApi = api.injectEndpoints({
  endpoints: (build) => {
    const snippets = crud<SnippetDto, SnippetBody>(build, '/snippets', 'Snippet');
    const palettes = crud<PaletteDto, PaletteBody>(build, '/palettes', 'Palette');
    const totp = crud<EncryptedItemDto, EncryptedItemBody>(build, '/totp', 'Totp');
    const notes = crud<EncryptedItemDto, EncryptedItemBody>(build, '/notes', 'Note');
    const sessions = crud<FocusSessionDto, FocusSessionBody>(build, '/focus/sessions', 'FocusSession');
    const habits = crud<HabitDto, HabitBody>(build, '/focus/habits', 'Habit');

    return {
      listSnippets: snippets.list,
      createSnippet: snippets.create,
      updateSnippet: snippets.update,
      deleteSnippet: snippets.remove,
      restoreSnippet: snippets.restore,

      listPalettes: palettes.list,
      createPalette: palettes.create,
      updatePalette: palettes.update,
      deletePalette: palettes.remove,

      listTotp: totp.list,
      createTotp: totp.create,
      updateTotp: totp.update,
      deleteTotp: totp.remove,

      listNotes: notes.list,
      createNote: notes.create,
      updateNote: notes.update,
      deleteNote: notes.remove,
      restoreNote: notes.restore,

      listFocusSessions: sessions.list,
      createFocusSession: sessions.create,
      deleteFocusSession: sessions.remove,

      listHabits: habits.list,
      createHabit: habits.create,
      updateHabit: habits.update,
      deleteHabit: habits.remove,

      listDrops: build.query<DropDto[], void>({
        query: () => '/clipboard',
        transformResponse: unwrap<DropDto[]>,
        providesTags: ['Drop'],
      }),
      createDrop: build.mutation<DropDto, DropBody>({
        query: (body) => ({ url: '/clipboard', method: 'POST', body }),
        transformResponse: unwrap<DropDto>,
        invalidatesTags: ['Drop'],
      }),
      pinDrop: build.mutation<DropDto, { id: string; pinned: boolean }>({
        query: ({ id, pinned }) => ({ url: `/clipboard/${id}/pin`, method: 'PATCH', body: { pinned } }),
        transformResponse: unwrap<DropDto>,
        invalidatesTags: ['Drop'],
      }),
      deleteDrop: build.mutation<{ id: string }, string>({
        query: (id) => ({ url: `/clipboard/${id}`, method: 'DELETE' }),
        transformResponse: unwrap<{ id: string }>,
        invalidatesTags: ['Drop'],
      }),
      clearDrops: build.mutation<{ removed: number }, void>({
        query: () => ({ url: '/clipboard', method: 'DELETE' }),
        transformResponse: unwrap<{ removed: number }>,
        invalidatesTags: ['Drop'],
      }),
    };
  },
});

export const {
  useListSnippetsQuery, useCreateSnippetMutation, useUpdateSnippetMutation, useDeleteSnippetMutation, useRestoreSnippetMutation,
  useListPalettesQuery, useCreatePaletteMutation, useUpdatePaletteMutation, useDeletePaletteMutation,
  useListTotpQuery, useCreateTotpMutation, useUpdateTotpMutation, useDeleteTotpMutation,
  useListNotesQuery, useCreateNoteMutation, useUpdateNoteMutation, useDeleteNoteMutation, useRestoreNoteMutation,
  useListFocusSessionsQuery, useCreateFocusSessionMutation, useDeleteFocusSessionMutation,
  useListHabitsQuery, useCreateHabitMutation, useUpdateHabitMutation, useDeleteHabitMutation,
  useListDropsQuery, useCreateDropMutation, usePinDropMutation, useDeleteDropMutation, useClearDropsMutation,
} = resourcesApi;
