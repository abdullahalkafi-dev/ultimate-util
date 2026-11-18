'use client';

import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';

export function ProgressBar({ value, label, onCancel }: { value?: number; label?: string; onCancel?: () => void }) {
  const determinate = typeof value === 'number';
  return (
    <div className="stack" style={{ gap: 6 }} role="status" aria-live="polite">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{label ?? 'Working…'}</span>
        <span className="row" style={{ gap: 8 }}>
          {determinate && <span className="tabular faint">{Math.round(value)}%</span>}
          {onCancel && (
            <button type="button" className="btn sm" onClick={onCancel}>
              Cancel
            </button>
          )}
        </span>
      </div>
      <div className={`progress ${determinate ? '' : 'indeterminate'}`}>
        <span style={determinate ? { width: `${Math.min(100, Math.max(0, value))}%` } : undefined} />
      </div>
    </div>
  );
}

type BannerKind = 'error' | 'warn' | 'ok' | 'info';
const bannerIcon: Record<BannerKind, IconName> = { error: 'alert', warn: 'alert', ok: 'check', info: 'info' };

export function Banner({
  kind = 'info',
  children,
  onRetry,
  onDismiss,
}: {
  kind?: BannerKind;
  children: ReactNode;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className={`banner ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon name={bannerIcon[kind]} />
      <div className="banner-body">{children}</div>
      {onRetry && (
        <button type="button" className="btn sm" onClick={onRetry}>
          Try again
        </button>
      )}
      {onDismiss && (
        <button type="button" className="btn sm icon ghost" aria-label="Dismiss" onClick={onDismiss}>
          <Icon name="x" />
        </button>
      )}
    </div>
  );
}

export const ErrorBanner = (p: Omit<Parameters<typeof Banner>[0], 'kind'>) => <Banner kind="error" {...p} />;

export function EmptyState({ icon = 'file', title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} style={{ fontSize: 28, marginBottom: 6 }} />
      <div style={{ fontWeight: 700, color: 'var(--fg)' }}>{title}</div>
      {children && <div style={{ marginTop: 4 }}>{children}</div>}
    </div>
  );
}

export function StatTile({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat-tile">
      <b className="tabular">{value}</b>
      <span>{label}</span>
    </div>
  );
}
