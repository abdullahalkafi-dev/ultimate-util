'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui';
import { useSession } from '@/hooks/useSession';
import type { ToolMeta } from '@/registry/types';
import { VaultGate } from './VaultGate';

/**
 * Wraps cloud tools. Guests see what the tool does and a sign-in button, never a dead end.
 * Tools with guestAccess "local" skip the wall. Tools with vault data get the vault steps.
 */
export function CloudGate({ tool, children }: { tool: ToolMeta; children: ReactNode }) {
  const { isAuthed, isLoading } = useSession();
  const path = usePathname();

  if (tool.guestAccess === 'local') return <>{children}</>;
  if (isLoading) return <p className="muted">Loading…</p>;

  if (!isAuthed) {
    return (
      <div className="gate panel">
        <span className="gate-ico"><Icon name="cloud" /></span>
        <h2>Sign in to use {tool.name}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {tool.description} This tool saves to your account so it follows you across devices.
        </p>
        <Link href={`/login?returnTo=${encodeURIComponent(path || '/')}`} className="btn primary">
          <Icon name="user" /> Sign in with Google
        </Link>
        <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
          Every other tool on this site works without an account.
        </p>
      </div>
    );
  }

  return tool.vault ? <VaultGate>{children}</VaultGate> : <>{children}</>;
}
