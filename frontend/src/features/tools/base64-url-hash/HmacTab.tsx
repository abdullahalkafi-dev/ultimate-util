'use client';

import { useEffect, useState } from 'react';
import { Banner, CopyButton, ErrorBanner, Field, SegmentedControl } from '@/components/ui';
import { HASH_ALGOS, formatDigest, hmacBytes, secretBytes, type DigestFormat, type HashAlgo } from './digest';

export default function HmacTab() {
  const [message, setMessage] = useState('');
  const [secret, setSecret] = useState('');
  const [kind, setKind] = useState<'text' | 'hex' | 'base64'>('text');
  const [show, setShow] = useState(false);
  const [algo, setAlgo] = useState<HashAlgo>('sha256');
  const [format, setFormat] = useState<DigestFormat>('hex');
  const [out, setOut] = useState<{ hex: string; b64: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    const key = secretBytes(secret, kind);
    if (!key.ok) {
      setError(key.error);
      setOut(null);
      return;
    }
    setError(null);
    hmacBytes(algo, key.bytes, new TextEncoder().encode(message)).then(
      (mac) => !stale && setOut({ hex: formatDigest(mac, 'hex'), b64: formatDigest(mac, 'base64') }),
      () => !stale && setError('HMAC failed in this browser.'),
    );
    return () => {
      stale = true;
    };
  }, [message, secret, kind, algo]);

  const value = out ? (format === 'base64' ? out.b64 : format === 'HEX' ? out.hex.toUpperCase() : out.hex) : '';

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="Algorithm">
          {(id) => (
            <select id={id} className="select" value={algo} onChange={(e) => setAlgo(e.target.value as HashAlgo)}>
              {HASH_ALGOS.map((a) => <option key={a.id} value={a.id}>HMAC-{a.label}</option>)}
            </select>
          )}
        </Field>
        <SegmentedControl label="Secret format" value={kind} onChange={setKind} options={[{ id: 'text', label: 'Text' }, { id: 'hex', label: 'Hex' }, { id: 'base64', label: 'Base64' }]} />
        <SegmentedControl label="Output format" value={format} onChange={setFormat} options={[{ id: 'hex', label: 'hex' }, { id: 'HEX', label: 'HEX' }, { id: 'base64', label: 'Base64' }]} />
        <button type="button" className="btn sm" onClick={() => { setKind('text'); setSecret('Jefe'); setMessage('what do ya want for nothing?'); setAlgo('sha256'); }}>Try an example</button>
        <button type="button" className="btn sm" onClick={() => { setMessage(''); setSecret(''); }}>Clear</button>
      </div>
      <Field label="Message (UTF-8)">
        {(id) => <textarea id={id} className="textarea mono" style={{ minHeight: 120 }} value={message} onChange={(e) => setMessage(e.target.value)} spellCheck={false} dir="auto" />}
      </Field>
      <Field label="Secret" hint="Held in memory only. Never saved or put in the URL.">
        {(id) => (
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input id={id} className="input mono grow" type={show ? 'text' : 'password'} value={secret} onChange={(e) => setSecret(e.target.value)}
              autoComplete="new-password" spellCheck={false} autoCapitalize="off" autoCorrect="off" />
            <button type="button" className="btn sm" aria-pressed={show} onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
          </div>
        )}
      </Field>
      {kind === 'text' && secret.includes('\0') && <Banner kind="warn">The secret contains null bytes. Use hex or Base64 mode for binary secrets.</Banner>}
      {!secret && <Banner kind="info">Empty secret: allowed. The result follows RFC 2104 (an empty key is padded with zeros); some WebCrypto builds reject it, so this tool computes it itself.</Banner>}
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {out && (
        <div className="file-row" aria-live="polite" role="group" aria-label="HMAC result">
          <b>HMAC</b>
          <code className="mono grow" style={{ wordBreak: 'break-all' }}>{value}</code>
          <CopyButton text={value} label="Copy" />
        </div>
      )}
    </div>
  );
}
