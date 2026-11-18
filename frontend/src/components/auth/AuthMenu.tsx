'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { useSession } from '@/hooks/useSession';
import { lockVault } from '@/lib/crypto/session';
import { api } from '@/store/api/base';
import { useLogoutMutation } from '@/store/api/auth.api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setTheme } from '@/store/slices/preferences.slice';
import { showToast } from '@/store/slices/ui.slice';

export function AuthMenu() {
  const { user, isLoading } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const path = usePathname();
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.preferences.theme);
  const [logout] = useLogoutMutation();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const themeButton = (
    <button type="button" className="btn icon" aria-label={`Switch to ${nextTheme} theme`} onClick={() => dispatch(setTheme(nextTheme))}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );

  if (isLoading) return <div style={{ width: 160 }} aria-hidden />;
  if (!user) {
    return (
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        {themeButton}
        <Link href={`/login?returnTo=${encodeURIComponent(path || '/')}`} className="btn">
          <Icon name="user" />
          <span className="signin-label">Sign in with Google</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="row" style={{ flexWrap: 'nowrap', position: 'relative' }} ref={ref}>
      {themeButton}
      <button type="button" className="btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
        <span className="signin-label">{user.name}</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <div style={{ fontWeight: 700 }}>{user.name}</div>
            <div className="faint" style={{ fontSize: 12 }}>{user.email}</div>
          </div>
          <Link href="/account" role="menuitem" onClick={() => setOpen(false)}>
            <Icon name="user" /> Account & data
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              lockVault();
              await logout().unwrap().catch(() => undefined);
              dispatch(api.util.resetApiState());
              dispatch(showToast('Signed out', 'success'));
              router.refresh();
            }}
          >
            <Icon name="arrow" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
