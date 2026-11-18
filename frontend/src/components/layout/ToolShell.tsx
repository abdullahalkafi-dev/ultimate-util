'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { AuthBadge } from '@/components/auth/AuthBadge';
import { Icon } from '@/components/ui';
import { lockVault } from '@/lib/crypto/session';
import { getCategory } from '@/registry';
import type { ToolMeta } from '@/registry/types';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleBookmark } from '@/store/slices/preferences.slice';

/** Page frame shared by every tool: header, badge, bookmark star, workspace and privacy line. */
export function ToolShell({ tool, children }: { tool: ToolMeta; children: ReactNode }) {
  const dispatch = useAppDispatch();
  const bookmarked = useAppSelector((s) => s.preferences.bookmarks.includes(tool.id));
  const unlocked = useAppSelector((s) => s.ui.vaultUnlocked);
  const category = getCategory(tool.category);

  return (
    <div className="page in">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">All tools</Link>
        <span>/</span>
        <span>{category.name}</span>
      </nav>
      <div className="tool-head" style={{ ['--c' as string]: category.color }}>
        <span className="ico">
          <Icon name={tool.icon} />
        </span>
        <div className="grow">
          <div className="row" style={{ gap: 10 }}>
            <h1>{tool.name}</h1>
            <AuthBadge tool={tool} />
          </div>
          <p>{tool.description}</p>
        </div>
        {tool.vault && unlocked && (
          <button type="button" className="btn sm" onClick={lockVault}>
            <Icon name="lock" /> Lock vault
          </button>
        )}
        <button
          type="button"
          className="btn"
          aria-pressed={bookmarked}
          onClick={() => dispatch(toggleBookmark(tool.id))}
        >
          <Icon name="star" style={bookmarked ? { fill: 'currentColor' } : undefined} />
          {bookmarked ? 'Bookmarked' : 'Bookmark'}
        </button>
      </div>
      {children}
      <p className="privacy-line">
        <Icon name={tool.tier === 'cloud' ? 'cloud' : 'lock'} />
        {tool.tier === 'cloud'
          ? 'Saved to your account. Encrypted items are locked with your vault passphrase.'
          : 'Runs in your browser. Your files and text are not uploaded.'}
      </p>
    </div>
  );
}
