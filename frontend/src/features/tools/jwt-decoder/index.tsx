'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banner, CopyButton, EmptyState, Field, SegmentedControl } from '@/components/ui';
import { claimTimes, decodeToken, tokenWarnings, verifySignature, weakSecretReason, type VerifyResult } from './jwt';
import s from './styles.module.css';

const SAMPLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

const CLEAR_OPTIONS = [
  { id: 'off', label: 'Off' },
  { id: '1', label: '1 min' },
  { id: '5', label: '5 min' },
  { id: '15', label: '15 min' },
] as const;

/** The token lives only in component state: never in storage, the URL or history. */
export default function JwtDecoder() {
  const [raw, setRaw] = useState('');
  const [zone, setZone] = useState<'local' | 'utc'>('local');
  const [autoClear, setAutoClear] = useState<(typeof CLEAR_OPTIONS)[number]['id']>('off');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [key, setKey] = useState('');
  const [secretEncoding, setSecretEncoding] = useState<'utf8' | 'base64'>('utf8');
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Keep the relative times fresh.
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15_000);
    return () => clearInterval(t);
  }, []);

  // Optional inactivity timer: restarts on every edit.
  useEffect(() => {
    if (autoClear === 'off' || !raw) return;
    const t = setTimeout(() => {
      setRaw('');
      setKey('');
    }, Number(autoClear) * 60_000);
    return () => clearTimeout(t);
  }, [autoClear, raw, key]);

  const result = useMemo(() => (raw.trim() ? decodeToken(raw) : null), [raw]);
  const token = result?.ok ? result.token : null;
  const tz = zone === 'utc' ? 'UTC' : undefined;
  const times = useMemo(() => claimTimes(token?.payload, now, tz), [token, now, tz]);
  const warnings = useMemo(() => (token ? tokenWarnings(token, now) : []), [token, now]);
  const isHmac = token?.alg.startsWith('HS') ?? false;
  const weak = isHmac && key ? weakSecretReason(key, token?.alg ?? '') : null;
  const localZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  useEffect(() => setVerify(null), [raw, key, secretEncoding]);

  async function runVerify() {
    if (!token) return;
    setVerifying(true);
    setVerify(await verifySignature({ token, key, secretEncoding }));
    setVerifying(false);
  }

  function clearAll() {
    setRaw('');
    setKey('');
    setVerify(null);
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="stack">
        <Field label="Token" hint="Decoded in your browser. The token is never stored, put in the URL or sent anywhere.">
          {(id) => (
            <textarea
              id={id}
              className="textarea mono"
              style={{ minHeight: 120, wordBreak: 'break-all' }}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Paste a JWT, with or without the “Bearer ” prefix"
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              aria-invalid={result ? !result.ok : undefined}
            />
          )}
        </Field>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            <button type="button" className="btn sm" onClick={() => setRaw(SAMPLE)}>
              Try an example
            </button>
            <button type="button" className="btn sm" onClick={clearAll} disabled={!raw && !key}>
              Clear token
            </button>
          </div>
          <SegmentedControl
            label="Clear automatically after"
            value={autoClear}
            options={CLEAR_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
            onChange={setAutoClear}
          />
        </div>
      </div>

      <div aria-live="polite" className="stack">
        {!result && <EmptyState icon="key" title="Paste a token to inspect it">The header, claims and expiry appear here. Nothing leaves this page.</EmptyState>}
        {result && !result.ok && (
          <Banner kind="error">
            {result.message}
            {result.hint && <div className="muted">{result.hint}</div>}
          </Banner>
        )}
        {warnings.map((w) => (
          <Banner key={w.id} kind={w.level === 'danger' ? 'error' : w.level === 'warn' ? 'warn' : 'info'}>
            {w.level === 'danger' ? 'Danger: ' : w.level === 'warn' ? 'Warning: ' : 'Note: '}
            {w.text}
          </Banner>
        ))}
      </div>

      {token && (
        <>
          <div className={s.parts} aria-label="Token parts">
            <code className={s.p1}>{token.parts[0]}</code>.<code className={s.p2}>{token.parts[1]}</code>
            {token.kind === 'jws' && (
              <>
                .<code className={s.p3}>{token.parts[2] || '(empty)'}</code>
              </>
            )}
          </div>

          <div className="split">
            <section className="panel">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 className="panel-title" style={{ margin: 0 }}>Header</h2>
                <CopyButton text={token.headerJson} label="Copy header" />
              </div>
              <pre className={s.json}>{token.headerJson}</pre>
            </section>
            {token.kind === 'jws' && (
              <section className="panel">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2 className="panel-title" style={{ margin: 0 }}>Payload</h2>
                  <CopyButton text={token.payloadJson} label="Copy payload" />
                </div>
                <pre className={s.json}>{token.payloadJson}</pre>
              </section>
            )}
          </div>

          {times.length > 0 && (
            <section className="panel">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 className="panel-title" style={{ margin: 0 }}>Times</h2>
                <SegmentedControl
                  label="Time zone"
                  value={zone}
                  options={[{ id: 'local', label: `Local (${localZone})` }, { id: 'utc', label: 'UTC' }]}
                  onChange={setZone}
                />
              </div>
              <div className="stack" style={{ gap: 8, marginTop: 10 }}>
                {times.map((t) => (
                  <div key={t.claim} className={s.time}>
                    <b>{t.label}</b>
                    <span className="tabular">{zone === 'utc' ? t.utc : t.local}</span>
                    <span className="muted">
                      {t.relative}
                      {t.claim === 'exp' && ` (${t.state === 'expired' ? 'expired' : 'still valid'})`}
                      {t.claim === 'nbf' && ` (${t.state === 'future' ? 'not yet valid' : 'active'})`}
                    </span>
                    {t.note && <span className="hint">{t.note}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {token.kind === 'jws' && (
            <section className="panel stack">
              <h2 className="panel-title" style={{ margin: 0 }}>Verify signature (optional)</h2>
              <p className="muted" style={{ margin: 0 }}>
                {isHmac
                  ? `Enter the shared secret for ${token.alg}. It stays in this page.`
                  : token.alg.toLowerCase() === 'none'
                    ? 'There is no signature to verify on an unsigned token.'
                    : `Paste the public key (PEM or JWK / JWKS) for ${token.alg || 'this token'}. Never paste a private key.`}
              </p>
              {token.alg.toLowerCase() !== 'none' && (
                <>
                  <Field label={isHmac ? 'Secret' : 'Public key'}>
                    {(id) =>
                      isHmac ? (
                        <input id={id} className="input mono" type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} />
                      ) : (
                        <textarea id={id} className="textarea mono" style={{ minHeight: 120 }} value={key} onChange={(e) => setKey(e.target.value)} spellCheck={false} autoComplete="off" placeholder={'-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----'} />
                      )
                    }
                  </Field>
                  {isHmac && (
                    <SegmentedControl
                      label="Secret encoding"
                      value={secretEncoding}
                      options={[{ id: 'utf8', label: 'Text' }, { id: 'base64', label: 'Base64 / Base64url' }]}
                      onChange={setSecretEncoding}
                    />
                  )}
                  {weak && <Banner kind="warn">Weak secret: {weak}</Banner>}
                  <div className="row">
                    <button type="button" className="btn primary" onClick={() => void runVerify()} disabled={verifying || !key.trim()}>
                      Verify signature
                    </button>
                  </div>
                </>
              )}
              <div aria-live="polite" className="stack">
                {verify && (
                  <Banner kind={verify.status === 'valid' ? 'ok' : verify.status === 'invalid' ? 'error' : 'warn'}>
                    <b>{verify.status === 'valid' ? 'Signature valid. ' : verify.status === 'invalid' ? 'Signature invalid. ' : 'Could not verify. '}</b>
                    {verify.message}
                  </Banner>
                )}
                {verify?.warnings.map((w) => (
                  <Banner key={w} kind="warn">{w}</Banner>
                ))}
                {verify?.status === 'valid' && <p className="hint">A valid signature only proves integrity. Your server must still check exp, iss, aud and the allowed algorithms.</p>}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
