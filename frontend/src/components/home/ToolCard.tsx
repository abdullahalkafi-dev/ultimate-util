'use client';

import Link from 'next/link';
import { AuthBadge } from '@/components/auth/AuthBadge';
import { Icon } from '@/components/ui';
import { getCategory } from '@/registry';
import type { ToolMeta } from '@/registry/types';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleBookmark } from '@/store/slices/preferences.slice';
import { showToast } from '@/store/slices/ui.slice';

export function ToolCard({ tool, featured = false }: { tool: ToolMeta; featured?: boolean }) {
  const dispatch = useAppDispatch();
  const bookmarked = useAppSelector((s) => s.preferences.bookmarks.includes(tool.id));
  const category = getCategory(tool.category);
  const live = tool.status === 'live';

  const star = (
    <button
      type="button"
      className="star"
      aria-pressed={bookmarked}
      aria-label={`${bookmarked ? 'Remove bookmark for' : 'Bookmark'} ${tool.name}`}
      onClick={() => {
        dispatch(toggleBookmark(tool.id));
        dispatch(showToast(bookmarked ? 'Removed from bookmarks' : 'Added to bookmarks', 'success'));
      }}
    >
      <Icon name="star" />
    </button>
  );

  const title = live ? (
    <Link href={`/tools/${tool.slug}`} className="name stretched">
      {tool.name}
    </Link>
  ) : (
    <button
      type="button"
      className="name stretched"
      style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left' }}
      onClick={() => dispatch(showToast(`${tool.name} is coming soon`))}
    >
      {tool.name}
    </button>
  );

  if (featured) {
    return (
      <article className="tool-card feat" aria-disabled={!live}>
        <div className="r1">
          <span className="ico"><Icon name={tool.icon} /></span>
          <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
            {tool.isNew && <span className="tag new" style={{ background: 'var(--accent-fg)', color: 'var(--accent)' }}>New</span>}
            {star}
          </span>
        </div>
        <div>
          {title}
          <div className="desc">{tool.description}</div>
        </div>
        <div className="r3">
          <AuthBadge tool={tool} />
          <span className="go">{live ? 'Open tool' : 'Coming soon'} <Icon name="arrow" /></span>
        </div>
      </article>
    );
  }

  return (
    <article className="tool-card" style={{ ['--c' as string]: category.color }} aria-disabled={!live}>
      <div className="r1">
        <span className="ico"><Icon name={tool.icon} /></span>
        {star}
      </div>
      <div>
        {title}
        <div className="desc">{tool.description}</div>
      </div>
      <div className="r3">
        <span className="cat">{category.name}</span>
        <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          {tool.isNew && live && <span className="tag new">New</span>}
          <AuthBadge tool={tool} />
        </span>
      </div>
    </article>
  );
}
