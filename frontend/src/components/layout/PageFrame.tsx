import type { ReactNode } from 'react';
import { BookmarksStrip } from './BookmarksStrip';
import { SiteFooter } from './SiteFooter';
import { TopBar } from './TopBar';

export function PageFrame({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <>
      <TopBar />
      <BookmarksStrip />
      <main className="in page" style={narrow ? { maxWidth: 720 } : undefined}>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
