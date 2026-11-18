'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Banner, CopyButton, Dialog, Field, Icon } from '@/components/ui';
import { unlockVaultWith } from '@/lib/crypto/session';
import {
  VaultError,
  createVault,
  strongEnoughPassphrase,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
  type NewVault,
} from '@/lib/crypto/vault';
import { apiErrorMessage } from '@/store/api/base';
import { useGetVaultQuery, useSetupVaultMutation } from '@/store/api/vault.api';
import { useAppSelector } from '@/store/hooks';

/**
 * Shows the right step before a vault tool: create the vault, unlock it, or the tool itself.
 * The passphrase never leaves the browser.
 */
export function VaultGate({ children }: { children: ReactNode }) {
  const unlocked = useAppSelector((s) => s.ui.vaultUnlocked);
  const { data: vault, isLoading, isError, refetch } = useGetVaultQuery();

  if (unlocked) return <>{children}</>;
  if (isLoading) return <p className="muted">Checking your vault…</p>;
  if (isError) {
    return (
      <Banner kind="error" onRetry={refetch}>
        Could not load your vault. Check your connection and try again.
      </Banner>
    );
  }
  return vault ? <UnlockForm vault={vault} /> : <SetupForm />;
}

function UnlockForm({ vault }: { vault: NonNullable<ReturnType<typeof useGetVaultQuery>['data']> }) {
  const [mode, setMode] = useState<'passphrase' | 'recovery'>('passphrase');
  const [secret, setSecret] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const key = mode === 'passphrase' ? await unlockWithPassphrase(vault, secret) : await unlockWithRecoveryKey(vault, secret);
      unlockVaultWith(key);
    } catch (err) {
      setError(err instanceof VaultError ? err.message : 'Could not unlock the vault.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="gate panel" onSubmit={submit}>
      <span className="gate-ico"><Icon name="lock" /></span>
      <h2>Unlock your vault</h2>
      <p className="muted" style={{ margin: 0 }}>
        {mode === 'passphrase'
          ? 'Enter your vault passphrase. It is checked on this device and never sent to our servers.'
          : 'Enter the recovery key you saved when you created the vault.'}
      </p>
      <div style={{ width: '100%', textAlign: 'left' }}>
        <Field label={mode === 'passphrase' ? 'Vault passphrase' : 'Recovery key'} error={error}>
          {(id) => (
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input
                id={id}
                className="input"
                type={show || mode === 'recovery' ? 'text' : 'password'}
                autoComplete="off"
                autoFocus
                value={secret}
                aria-invalid={Boolean(error)}
                onChange={(e) => setSecret(e.target.value)}
              />
              {mode === 'passphrase' && (
                <button type="button" className="btn icon" aria-label={show ? 'Hide passphrase' : 'Show passphrase'} onClick={() => setShow((s) => !s)}>
                  <Icon name={show ? 'eyeOff' : 'eye'} />
                </button>
              )}
            </div>
          )}
        </Field>
      </div>
      <button type="submit" className="btn primary" disabled={busy || !secret}>
        {busy ? 'Unlocking…' : 'Unlock'}
      </button>
      <button
        type="button"
        className="btn ghost sm"
        onClick={() => {
          setMode(mode === 'passphrase' ? 'recovery' : 'passphrase');
          setSecret('');
          setError('');
        }}
      >
        {mode === 'passphrase' ? 'Forgot passphrase? Use recovery key' : 'Back to passphrase'}
      </button>
    </form>
  );
}

function SetupForm() {
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<NewVault | null>(null);
  const [setup] = useSetupVaultMutation();
  const strength = strongEnoughPassphrase(pass);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!strength.ok) return setError(strength.message);
    if (pass !== confirm) return setError('The two passphrases do not match.');
    setBusy(true);
    setError('');
    try {
      setCreated(await createVault(pass));
    } catch {
      setError('Your browser could not create the vault. Try a current version of Chrome, Edge, Firefox or Safari.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="gate panel" onSubmit={submit}>
        <span className="gate-ico"><Icon name="shield" /></span>
        <h2>Create your vault</h2>
        <p className="muted" style={{ margin: 0 }}>
          Your 2FA codes and notes are encrypted on this device with a passphrase only you know. We cannot read them or reset the passphrase.
        </p>
        <div className="stack" style={{ width: '100%', textAlign: 'left' }}>
          <Field label="Vault passphrase" hint={pass ? strength.message : 'Use 16 or more characters, or a mix of letters, numbers and symbols.'}>
            {(id) => <input id={id} className="input" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />}
          </Field>
          <Field label="Confirm passphrase" error={error}>
            {(id) => <input id={id} className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
          </Field>
        </div>
        <button type="submit" className="btn primary" disabled={busy || !pass}>
          {busy ? 'Creating…' : 'Create vault'}
        </button>
      </form>
      {created && <RecoveryDialog created={created} onSaved={(key) => { unlockVaultWith(key); }} setup={setup} />}
    </>
  );
}

function RecoveryDialog({
  created,
  onSaved,
  setup,
}: {
  created: NewVault;
  onSaved: (key: CryptoKey) => void;
  setup: ReturnType<typeof useSetupVaultMutation>[0];
}) {
  const [tail, setTail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const last4 = created.recoveryKey.replace(/-/g, '').slice(-4);
  const matches = tail.replace(/\s/g, '').toUpperCase() === last4;

  async function finish() {
    setBusy(true);
    setError('');
    try {
      await setup(created.body).unwrap();
      onSaved(created.dataKey);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      locked
      title="Save your recovery key"
      onClose={() => undefined}
      actions={
        <button type="button" className="btn primary" disabled={!matches || busy} onClick={finish}>
          {busy ? 'Saving…' : 'I saved it, continue'}
        </button>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        If you forget your passphrase, this key is the only way back in. It is shown once and is not stored anywhere. Keep it in a password manager or print it.
      </p>
      <div className="recovery-key">{created.recoveryKey}</div>
      <div className="row"><CopyButton text={created.recoveryKey} label="Copy key" size="md" /></div>
      <Field label="Type the last 4 characters to confirm you saved it" error={error}>
        {(id) => <input id={id} className="input mono" maxLength={4} autoComplete="off" value={tail} onChange={(e) => setTail(e.target.value)} />}
      </Field>
    </Dialog>
  );
}
