'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Banner, Field, Icon } from '@/components/ui';
import { apiErrorMessage } from '@/store/api/base';
import { useGetAuthConfigQuery, useMockLoginMutation } from '@/store/api/auth.api';

const TEST_USERS = [
  { name: 'Alice Test', email: 'alice@example.com' },
  { name: 'Bob Test', email: 'bob@example.com' },
  { name: 'Carol Test', email: 'carol@example.com' },
];

/** Only same-site relative paths are accepted as a return target. */
export const safeReturn = (value: string | null | undefined): string =>
  value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/';

export function LoginPanel({ returnTo }: { returnTo?: string | null }) {
  const router = useRouter();
  const target = safeReturn(returnTo);
  const { data: config, isLoading } = useGetAuthConfigQuery();
  const [login, { isLoading: signingIn, error }] = useMockLoginMutation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  async function signIn(n: string, e: string) {
    await login({ name: n, email: e }).unwrap();
    router.push(target);
    router.refresh();
  }

  if (isLoading) return <p className="muted">Loading…</p>;

  if (config?.mode === 'google') {
    return (
      <a className="btn primary" href={`/api/v1/auth/google?returnTo=${encodeURIComponent(target)}`}>
        <Icon name="user" /> Continue with Google
      </a>
    );
  }

  return (
    <div className="stack" style={{ textAlign: 'left', width: '100%' }}>
      <Banner kind="warn">
        <b>Test login.</b> Real Google sign-in is switched off in this environment. Pick a test user to try the cloud tools.
      </Banner>
      <div className="stack" style={{ gap: 8 }}>
        {TEST_USERS.map((u) => (
          <button key={u.email} type="button" className="btn" disabled={signingIn} onClick={() => signIn(u.name, u.email).catch(() => undefined)}>
            <Icon name="user" /> Sign in as {u.name}
          </button>
        ))}
      </div>
      <form
        className="stack"
        onSubmit={(ev: FormEvent) => {
          ev.preventDefault();
          signIn(name.trim() || 'Test User', email.trim()).catch(() => undefined);
        }}
      >
        <Field label="Or use any email">
          {(id) => <input id={id} className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />}
        </Field>
        <Field label="Name">
          {(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />}
        </Field>
        <button type="submit" className="btn primary" disabled={signingIn || !email}>
          Sign in
        </button>
      </form>
      {error ? <Banner kind="error">{apiErrorMessage(error)}</Banner> : null}
    </div>
  );
}
