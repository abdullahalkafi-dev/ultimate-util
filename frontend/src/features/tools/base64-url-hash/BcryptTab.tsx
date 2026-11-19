'use client';

import { useEffect, useRef, useState } from 'react';
import { Banner, CopyButton, ErrorBanner, Field, ProgressBar, SegmentedControl, SliderField } from '@/components/ui';
import { readJson, writeJson } from '@/lib/storage';
import { BCRYPT_MAX_BYTES, COST_DEFAULT, COST_MAX, COST_MIN, checkPassword, costFromHash, estimateMs, formatMs, validateBcryptHash } from './bcrypt';
import { runWorker, type Job } from './worker-client';

const COST_KEY = 'uu:base64-url-hash:bcrypt-cost';
const isNumber = (v: unknown): v is number => typeof v === 'number';

export default function BcryptTab() {
  const [mode, setMode] = useState<'hash' | 'verify'>('hash');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [cost, setCost] = useState(COST_DEFAULT);
  const [hashIn, setHashIn] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<boolean | null>(null);
  const [calibration, setCalibration] = useState<{ cost: number; ms: number } | null>(null);
  const [busy, setBusy] = useState<'idle' | 'hash' | 'verify' | 'calibrate'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const job = useRef<Job | null>(null);

  useEffect(() => {
    const saved = readJson<number>(COST_KEY, COST_DEFAULT, isNumber);
    setCost(Math.min(COST_MAX, Math.max(COST_MIN, saved)));
    return () => job.current?.cancel();
  }, []);

  const check = checkPassword(password);
  const hashError = mode === 'verify' && hashIn.trim() ? validateBcryptHash(hashIn) : null;
  const blocked = check.hasNul;

  function start(kind: 'hash' | 'verify' | 'calibrate') {
    job.current?.cancel();
    setBusy(kind);
    setError(null);
    setCancelled(false);
    setResult(null);
    setVerdict(null);
    const done = () => {
      setBusy('idle');
      job.current = null;
    };
    const onError = (message: string) => {
      setError(message);
      done();
    };
    if (kind === 'verify') {
      job.current = runWorker({ type: 'bcrypt-verify', password, hash: hashIn.trim() }, (m) => {
        if (m.type === 'bcrypt-verify-done') {
          setVerdict(m.match);
          done();
        } else if (m.type === 'error') onError(m.message);
      });
    } else {
      const c = kind === 'calibrate' ? 10 : cost;
      job.current = runWorker({ type: 'bcrypt-hash', password: kind === 'calibrate' ? 'calibration' : password, cost: c }, (m) => {
        if (m.type === 'bcrypt-hash-done') {
          if (kind === 'calibrate') setCalibration({ cost: 10, ms: m.ms });
          else setResult(m.hash);
          done();
        } else if (m.type === 'error') onError(m.message);
      });
    }
  }

  function cancel() {
    job.current?.cancel();
    job.current = null;
    setBusy('idle');
    setCancelled(true);
  }

  const est = calibration ? estimateMs(cost, calibration) : null;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row">
        <SegmentedControl label="Bcrypt action" value={mode} onChange={(m) => { setMode(m); setResult(null); setVerdict(null); }} options={[{ id: 'hash', label: 'Hash' }, { id: 'verify', label: 'Verify' }]} />
        <button type="button" className="btn sm" onClick={() => { setPassword('correct horse battery staple'); setShow(true); }}>Try an example</button>
        <button type="button" className="btn sm" onClick={() => { setPassword(''); setHashIn(''); setResult(null); setVerdict(null); }}>Clear</button>
      </div>

      <Field label="Password">
        {(id) => (
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input id={id} className="input mono grow" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password" spellCheck={false} autoCapitalize="off" autoCorrect="off" />
            <button type="button" className="btn sm" aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
          </div>
        )}
      </Field>
      <p className="hint tabular">{check.bytes} / {BCRYPT_MAX_BYTES} bytes (emoji and non-ASCII characters use several bytes each).</p>
      {check.tooLong && <Banner kind="warn">This password is {check.bytes} bytes. Bcrypt ignores everything after byte {BCRYPT_MAX_BYTES}, so the extra {check.bytes - BCRYPT_MAX_BYTES} bytes do not change the hash. Nothing was changed in your input.</Banner>}
      {check.hasNul && <ErrorBanner>The password contains a null byte. Bcrypt implementations disagree on how to handle it, so this tool rejects it.</ErrorBanner>}

      {mode === 'hash' ? (
        <>
          <SliderField label="Cost factor" value={cost} min={COST_MIN} max={COST_MAX} onChange={(v) => { setCost(v); writeJson(COST_KEY, v); }} />
          <div className="row">
            <button type="button" className="btn sm" onClick={() => start('calibrate')} disabled={busy !== 'idle'}>Measure speed on this device</button>
            <span className="muted tabular" aria-live="polite">
              {est !== null ? `Estimated time at cost ${cost}: about ${formatMs(est)}.` : 'Measure to see an estimated time. Each +1 of cost doubles the work.'}
            </span>
          </div>
          {cost >= 14 && <Banner kind="warn">Cost {cost} can take many seconds and drains a phone battery. Cost 10 to 12 is typical for logins.</Banner>}
          <div className="row">
            <button type="button" className="btn primary" onClick={() => start('hash')} disabled={busy !== 'idle' || blocked || !password}>Hash password</button>
          </div>
          {result && (
            <div className="file-row" aria-live="polite" role="group" aria-label="Bcrypt hash result">
              <code className="mono grow" style={{ wordBreak: 'break-all' }}>{result}</code>
              <CopyButton text={result} label="Copy" />
            </div>
          )}
          <p className="hint">Each hash uses a fresh random salt, so hashing the same password twice gives different results. Both verify.</p>
        </>
      ) : (
        <>
          <Field label="Bcrypt hash" error={hashError ?? undefined}>
            {(id) => <input id={id} className="input mono" value={hashIn} onChange={(e) => setHashIn(e.target.value)} spellCheck={false} autoComplete="off" placeholder="$2b$12$..." />}
          </Field>
          {hashIn.trim() && !hashError && <p className="hint">Cost {costFromHash(hashIn)}.</p>}
          <div className="row">
            <button type="button" className="btn primary" onClick={() => start('verify')} disabled={busy !== 'idle' || blocked || !hashIn.trim() || !!hashError}>Verify</button>
          </div>
          <div aria-live="polite">
            {verdict === true && <Banner kind="ok">Match: the password verifies against this hash.</Banner>}
            {verdict === false && <Banner kind="error">No match.</Banner>}
          </div>
        </>
      )}

      {busy !== 'idle' && <ProgressBar label={busy === 'calibrate' ? 'Measuring' : busy === 'hash' ? `Hashing at cost ${cost}` : 'Verifying'} onCancel={cancel} />}
      {cancelled && <Banner kind="info">Cancelled.</Banner>}
      {error && <ErrorBanner onDismiss={() => setError(null)}>{error}</ErrorBanner>}
    </div>
  );
}
