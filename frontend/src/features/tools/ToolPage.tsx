'use client';

import { Component, Suspense, lazy, useEffect, type ComponentType, type ReactNode } from 'react';
import { BookmarksStrip } from '@/components/layout/BookmarksStrip';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { ToolShell } from '@/components/layout/ToolShell';
import { TopBar } from '@/components/layout/TopBar';
import { CloudGate } from '@/components/auth/CloudGate';
import { Banner, EmptyState } from '@/components/ui';
import { getToolBySlug } from '@/registry';
import { useAppDispatch } from '@/store/hooks';
import { pushRecent } from '@/store/slices/preferences.slice';
import { toolLoaders } from './loaders';

const cache = new Map<string, ComponentType>();

function toolComponent(slug: string): ComponentType | null {
  const hit = cache.get(slug);
  if (hit) return hit;
  const loader = toolLoaders[slug];
  if (!loader) return null;
  const Lazy = lazy(loader);
  cache.set(slug, Lazy);
  return Lazy;
}

class ToolErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Banner kind="error" onRetry={() => this.setState({ failed: false })}>
        This tool could not load. Check your connection and try again. Your files were not uploaded anywhere.
      </Banner>
    );
  }
}

export function ToolPage({ slug }: { slug: string }) {
  const dispatch = useAppDispatch();
  const tool = getToolBySlug(slug);
  const Tool = tool?.status === 'live' ? toolComponent(slug) : null;

  useEffect(() => {
    if (tool && Tool) dispatch(pushRecent(tool.id));
  }, [dispatch, tool, Tool]);

  if (!tool) return null;

  const body = Tool ? (
    <ToolErrorBoundary>
      <Suspense fallback={<p className="muted">Loading {tool.name}…</p>}>
        <Tool />
      </Suspense>
    </ToolErrorBoundary>
  ) : (
    <EmptyState icon={tool.icon} title={`${tool.name} is coming soon`}>
      This tool is planned and not available yet. Bookmark it and it will be waiting for you.
    </EmptyState>
  );

  return (
    <>
      <TopBar />
      <BookmarksStrip />
      <ToolShell tool={tool}>{tool.tier === 'cloud' && Tool ? <CloudGate tool={tool}>{body}</CloudGate> : body}</ToolShell>
      <SiteFooter />
    </>
  );
}
