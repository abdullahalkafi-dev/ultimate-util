'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { CommandPalette } from '@/components/palette/CommandPalette';
import { Toaster } from '@/components/ui';
import { subscribeVault } from '@/lib/crypto/session';
import { makeStore, type AppStore } from '@/store';
import { PreferencesSync } from './PreferencesSync';
import { setVaultUnlocked } from '@/store/slices/ui.slice';

export function AppProviders({ children }: { children: ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) storeRef.current = makeStore();
  const store = storeRef.current;

  useEffect(() => subscribeVault((unlocked) => store.dispatch(setVaultUnlocked(unlocked))), [store]);

  return (
    <Provider store={store}>
      <PreferencesSync />
      {children}
      <CommandPalette />
      <Toaster />
    </Provider>
  );
}
