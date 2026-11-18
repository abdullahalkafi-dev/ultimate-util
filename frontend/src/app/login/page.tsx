'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { LoginPanel } from '@/components/auth/LoginPanel';
import { PageFrame } from '@/components/layout/PageFrame';
import { Icon } from '@/components/ui';

function LoginBody() {
  const returnTo = useSearchParams().get('returnTo');
  return (
    <div className="gate panel">
      <span className="gate-ico"><Icon name="user" /></span>
      <h2>Sign in</h2>
      <p className="muted" style={{ margin: 0 }}>
        Signing in syncs your bookmarks and unlocks the cloud tools. We only read your name, email and picture.
      </p>
      <LoginPanel returnTo={returnTo} />
      <Link href="/" className="faint" style={{ fontSize: 13 }}>Back to all tools</Link>
    </div>
  );
}

export default function LoginPage() {
  return (
    <PageFrame narrow>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <LoginBody />
      </Suspense>
    </PageFrame>
  );
}
