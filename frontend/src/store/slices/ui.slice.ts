import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  message: string;
}

interface UiState {
  toasts: Toast[];
  paletteOpen: boolean;
  /** True while the vault key is held in memory. The key itself never enters Redux. */
  vaultUnlocked: boolean;
}

let nextId = 1;

const slice = createSlice({
  name: 'ui',
  initialState: { toasts: [], paletteOpen: false, vaultUnlocked: false } as UiState,
  reducers: {
    showToast: {
      reducer(state, action: PayloadAction<Toast>) {
        state.toasts = [...state.toasts, action.payload].slice(-4);
      },
      prepare(message: string, kind: Toast['kind'] = 'info') {
        return { payload: { id: nextId++, kind, message } };
      },
    },
    dismissToast(state, action: PayloadAction<number>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    setPaletteOpen(state, action: PayloadAction<boolean>) {
      state.paletteOpen = action.payload;
    },
    setVaultUnlocked(state, action: PayloadAction<boolean>) {
      state.vaultUnlocked = action.payload;
    },
  },
});

export const { showToast, dismissToast, setPaletteOpen, setVaultUnlocked } = slice.actions;
export default slice.reducer;
