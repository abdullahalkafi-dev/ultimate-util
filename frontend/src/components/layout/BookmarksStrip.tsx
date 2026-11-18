'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui';
import { getCategory, getToolById } from '@/registry';
import type { ToolMeta } from '@/registry/types';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { removeBookmark } from '@/store/slices/preferences.slice';
import { showToast } from '@/store/slices/ui.slice';

export function BookmarksStrip() {
  const dispatch = useAppDispatch();
  const bookmarks = useAppSelector((s) => s.preferences.bookmarks);
  const tools = bookmarks.map(getToolById).filter((t): t is ToolMeta => t !== undefined && t.status !== 'hidden');

  return (
    <div className="bmbar">
      <div className="in">
        <nav className="bm" aria-label="Bookmarked tools">
          <span className="bm-label">
            <Icon name="star" />
            Bookmarks
          </span>
          <div className="bm-list">
            {tools.length === 0 && <span className="bm-empty">Star a tool and it appears here for one-click access.</span>}
            {tools.map((t) => (
              <span key={t.id} className="chip" style={{ ['--c' as string]: getCategory(t.category).color }}>
                {t.status === 'live' ? (
                  <Link href={`/tools/${t.slug}`} className="o">
                    <span className="dot"><Icon name={t.icon} /></span>
                    {t.name}
                  </Link>
                ) : (
                  <button type="button" className="o" onClick={() => dispatch(showToast(`${t.name} is coming soon`))}>
                    <span className="dot"><Icon name={t.icon} /></span>
                    {t.name}
                  </button>
                )}
                <button type="button" className="x" aria-label={`Remove ${t.name} from bookmarks`} onClick={() => dispatch(removeBookmark(t.id))}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <span className="bm-note">Saved in this browser</span>
        </nav>
      </div>
    </div>
  );
}
