'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageFrame } from '@/components/layout/PageFrame';
import { Banner, ConfirmDialog, Field, Icon, SegmentedControl, useToast } from '@/components/ui';
import { useSession } from '@/hooks/useSession';
import { downloadText } from '@/lib/files';
import { lockVault, setAutoLockMinutes } from '@/lib/crypto/session';
import { api, apiErrorMessage } from '@/store/api/base';
import { useDeleteAccountMutation, useLazyExportAccountQuery } from '@/store/api/auth.api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setTheme } from '@/store/slices/preferences.slice';

export default function AccountPage() {
  const { user, isLoading } = useSession();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const theme = useAppSelector((s) => s.preferences.theme);
  const [exportData, { isFetching: exporting }] = useLazyExportAccountQuery();
  const [deleteAccount, { isLoading: deleting }] = useDeleteAccountMutation();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [lockMinutes, setLockMinutes] = useState('5');

  if (isLoading) return <PageFrame narrow><p className="muted">Loading…</p></PageFrame>;
  if (!user) {
    return (
      <PageFrame narrow>
        <Banner kind="info">
          <Link href="/login?returnTo=%2Faccount" style={{ textDecoration: 'underline' }}>Sign in</Link> to see your account and data.
        </Banner>
      </PageFrame>
    );
  }

  async function onExport() {
    try {
      const result = await exportData().unwrap();
      downloadText(JSON.stringify(result, null, 2), 'ultimate-util-export.json', 'application/json');
      toast('Export downloaded', 'success');
    } catch (err) {
      toast(apiErrorMessage(err), 'error');
    }
  }

  async function onDelete() {
    setError('');
    try {
      await deleteAccount().unwrap();
      lockVault();
      dispatch(api.util.resetApiState());
      toast('Your account and data were deleted', 'success');
      router.push('/');
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <PageFrame narrow>
      <h1 style={{ font: '700 28px var(--head)', margin: '0 0 16px' }}>Account & data</h1>
      <div className="stack" style={{ gap: 16 }}>
        <section className="panel">
          <h2 className="panel-title">Signed in as</h2>
          <div className="row">
            <span className="avatar" style={{ width: 40, height: 40 }}>{user.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <div style={{ fontWeight: 700 }}>{user.name}</div>
              <div className="muted">{user.email}</div>
            </div>
          </div>
        </section>

        <section className="panel stack">
          <h2 className="panel-title">Preferences</h2>
          <div className="field">
            <span className="label">Theme</span>
            <SegmentedControl
              label="Theme"
              value={theme}
              onChange={(t) => dispatch(setTheme(t))}
              options={[{ id: 'system', label: 'System' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]}
            />
          </div>
          <Field label="Auto-lock the vault after" hint="Your vault locks after this much inactivity and when you close the tab.">
            {(id) => (
              <select
                id={id}
                className="select"
                style={{ maxWidth: 220 }}
                value={lockMinutes}
                onChange={(e) => {
                  setLockMinutes(e.target.value);
                  setAutoLockMinutes(Number(e.target.value));
                }}
              >
                {['1', '5', '15', '30', '60'].map((m) => <option key={m} value={m}>{m} minutes</option>)}
              </select>
            )}
          </Field>
        </section>

        <section className="panel stack">
          <h2 className="panel-title">Your data</h2>
          <p className="muted" style={{ margin: 0 }}>
            Download everything we hold for you as JSON. Encrypted items (2FA codes, notes) are exported as ciphertext and stay unreadable without your vault passphrase.
          </p>
          <div className="row">
            <button type="button" className="btn" onClick={onExport} disabled={exporting}>
              <Icon name="download" /> {exporting ? 'Preparing…' : 'Export my data'}
            </button>
          </div>
        </section>

        <section className="panel stack" style={{ borderColor: 'var(--danger)' }}>
          <h2 className="panel-title" style={{ color: 'var(--danger)' }}>Delete account</h2>
          <p className="muted" style={{ margin: 0 }}>
            This removes your account and everything saved to it right away. It cannot be undone. Tools that run in your browser are not affected.
          </p>
          <div className="row">
            <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
              <Icon name="trash" /> Delete my account
            </button>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirming}
        danger
        title="Delete your account?"
        confirmLabel={deleting ? 'Deleting…' : 'Delete everything'}
        onCancel={() => { setConfirming(false); setTyped(''); setError(''); }}
        onConfirm={() => { if (typed === 'DELETE') void onDelete(); else setError('Type DELETE to confirm.'); }}
        message={
          <div className="stack">
            <span>All snippets, notes, 2FA entries, palettes, clipboard items and focus history will be erased. Type <b>DELETE</b> to confirm.</span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type DELETE to confirm" autoComplete="off" />
            {error && <span className="error-text" role="alert">{error}</span>}
          </div>
        }
      />
    </PageFrame>
  );
}
