import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { MAX_BOOKMARKS, MAX_RECENTS, type Preferences } from '@uu/shared';

export interface PreferencesState extends Preferences {
  /** False until localStorage has been read on the client, so server and client HTML match. */
  hydrated: boolean;
}

/** New visitors start with a few useful tools pinned. */
export const DEFAULT_BOOKMARKS = ['F-001', 'F-012', 'F-018', 'F-024'];

const initialState: PreferencesState = {
  bookmarks: DEFAULT_BOOKMARKS,
  recents: [],
  theme: 'system',
  hydrated: false,
};

const unique = (items: string[]) => [...new Set(items)];

const slice = createSlice({
  name: 'preferences',
  initialState,
  reducers: {
    hydrate(_state, action: PayloadAction<Preferences>) {
      return { ...action.payload, hydrated: true };
    },
    toggleBookmark(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.bookmarks = state.bookmarks.includes(id)
        ? state.bookmarks.filter((b) => b !== id)
        : [...state.bookmarks, id].slice(-MAX_BOOKMARKS);
    },
    removeBookmark(state, action: PayloadAction<string>) {
      state.bookmarks = state.bookmarks.filter((b) => b !== action.payload);
    },
    moveBookmark(state, action: PayloadAction<{ from: number; to: number }>) {
      const { from, to } = action.payload;
      if (from === to || from < 0 || to < 0 || from >= state.bookmarks.length || to >= state.bookmarks.length) return;
      const [item] = state.bookmarks.splice(from, 1);
      if (item) state.bookmarks.splice(to, 0, item);
    },
    pushRecent(state, action: PayloadAction<string>) {
      state.recents = unique([action.payload, ...state.recents]).slice(0, MAX_RECENTS);
    },
    setTheme(state, action: PayloadAction<Preferences['theme']>) {
      state.theme = action.payload;
    },
    /** After login: account data wins on order, merged result replaces local state. */
    replaceFromServer(_state, action: PayloadAction<Preferences>) {
      return { ...action.payload, hydrated: true };
    },
  },
});

export const { hydrate, toggleBookmark, removeBookmark, moveBookmark, pushRecent, setTheme, replaceFromServer } = slice.actions;
export default slice.reducer;
