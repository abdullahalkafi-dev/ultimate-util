'use client';

import Link from 'next/link';
import { AuthMenu } from '@/components/auth/AuthMenu';
import { Icon } from '@/components/ui';
import { useAppDispatch } from '@/store/hooks';
import { setPaletteOpen } from '@/store/slices/ui.slice';

export function TopBar() {
  const dispatch = useAppDispatch();
  return (
    <header className="topbar">
      <div className="in">
        <Link href="/" className="logo" aria-label="Ultimate Util home">
          <i>
            <Icon name="grid" />
          </i>
          Ultimate Util
        </Link>
        <button type="button" className="search-btn" onClick={() => dispatch(setPaletteOpen(true))} aria-label="Search tools (Ctrl K)">
          <Icon name="search" />
          Search tools
          <kbd>Ctrl K</kbd>
        </button>
        <span className="grow" />
        <AuthMenu />
      </div>
    </header>
  );
}
