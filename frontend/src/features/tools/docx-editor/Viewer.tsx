'use client';

import { useEffect, useRef, useState } from 'react';
import { Banner } from '@/components/ui';
import { findRanges, paintHighlights, scrollToRange } from './highlight';
import styles from './styles.module.css';

interface Props {
  bytes: Uint8Array;
  zoom: number;
  query: string;
  matchIndex: number;
  onMatches: (count: number) => void;
}

/** Read-only page view. The original bytes are only read, never changed. */
export function Viewer({ bytes, zoom, query, matchIndex, onMatches }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const styleHost = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pages, setPages] = useState(0);
  const onMatchesRef = useRef(onMatches);
  onMatchesRef.current = onMatches;

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    (async () => {
      const { renderAsync } = await import('docx-preview');
      if (!host.current || !styleHost.current) return;
      host.current.innerHTML = '';
      await renderAsync(new Blob([bytes as BlobPart]), host.current, styleHost.current, {
        inWrapper: true,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        useBase64URL: true,
      });
      if (cancelled || !host.current) return;
      setPages(host.current.querySelectorAll('section.docx').length);
      setState('ready');
    })().catch(() => {
      if (!cancelled) setState('error');
    });
    return () => {
      cancelled = true;
      paintHighlights([], null);
    };
  }, [bytes]);

  useEffect(() => {
    if (state !== 'ready' || !host.current) return;
    const ranges = findRanges(host.current, query, false);
    onMatchesRef.current(ranges.length);
    const current = ranges.length ? (ranges[((matchIndex % ranges.length) + ranges.length) % ranges.length] ?? null) : null;
    paintHighlights(ranges, current);
    if (current) scrollToRange(current);
  }, [query, matchIndex, state]);

  return (
    <div>
      {state === 'error' && <Banner kind="error">This document could not be rendered. It may be damaged.</Banner>}
      <div className="hint" aria-live="polite" style={{ padding: '6px 0' }}>
        {state === 'loading' ? 'Rendering pages…' : state === 'ready' ? `${pages} page${pages === 1 ? '' : 's'}` : ''}
      </div>
      <div ref={styleHost} />
      <div className={styles.viewer} role="document" aria-label="Document pages">
        <div ref={host} style={{ zoom }} />
      </div>
    </div>
  );
}
