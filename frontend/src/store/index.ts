import { configureStore } from '@reduxjs/toolkit';
import { api } from './api/base';
import './api/auth.api';
import './api/preferences.api';
import './api/vault.api';
import './api/resources.api';
import preferences from './slices/preferences.slice';
import ui from './slices/ui.slice';

export const makeStore = () =>
  configureStore({
    reducer: { [api.reducerPath]: api.reducer, preferences, ui },
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
