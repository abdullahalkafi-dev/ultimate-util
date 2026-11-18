'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookmarksStrip } from '@/components/layout/BookmarksStrip';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { TopBar } from '@/components/layout/TopBar';
import { EmptyState } from '@/components/ui';
import { searchTools } from '@/lib/search';
import { categories, featuredTool, registryStats, visibleTools } from '@/registry';
import type { CategoryId } from '@/registry/types';
import { ToolCard } from './ToolCard';

type Filter = 'all' | CategoryId;
const isFilter = (v: string): v is Filter => v === 'all' || categories.some((c) => c.id === v);

export function HomeView() {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const stats = registryStats();

  // The category filter lives in the URL hash so a filtered view can be shared.
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace('#', '');
      if (isFilter(h)) setFilter(h);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const featured = featuredTool();
  const items = useMemo(() => {
    const base = filter === 'all' ? visibleTools : visibleTools.filter((t) => t.category === filter);
    const q = query.trim();
    return q ? searchTools(base, q) : base;
  }, [filter, query]);
  const showFeatured = Boolean(featured) && !query.trim() && (filter === 'all' || filter === featured?.category);

  return (
    <>
      <TopBar />
      <BookmarksStrip />
      <main className="in page">
        <div className="intro">
          <div>
            <h1>
              Every tool you need.
              <br />
              None of your files uploaded.
            </h1>
            <p>Fast, private and free. Most tools run right in your browser.</p>
          </div>
          <div className="stats" aria-label="Tool counts">
            <span className="stat"><b>{stats.local}</b>run locally</span>
            <span className="stat"><b>{stats.synced}</b>sync with Google</span>
          </div>
        </div>

        <div className="row" style={{ marginBottom: 14 }}>
          <label className="sr-only" htmlFor="home-filter">Filter tools</label>
          <input
            id="home-filter"
            className="input"
            style={{ maxWidth: 360 }}
            type="search"
            placeholder="Filter tools on this page"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="cats" role="group" aria-label="Categories">
          {[{ id: 'all' as const, name: 'All tools', color: 'var(--fg)' }, ...categories].map((c) => (
            <button
              key={c.id}
              type="button"
              style={{ ['--c' as string]: c.color }}
              aria-pressed={filter === c.id}
              onClick={() => {
                setFilter(c.id);
                window.history.replaceState(null, '', c.id === 'all' ? window.location.pathname : `#${c.id}`);
              }}
            >
              <i />
              {c.name}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <EmptyState icon="search" title={`No tool matches “${query}”`}>
            Try a shorter word like “pdf” or “color”.
          </EmptyState>
        ) : (
          <div className="tool-grid">
            {items.map((t) => (
              <ToolCard key={t.id} tool={t} featured={showFeatured && t.id === featured?.id} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
