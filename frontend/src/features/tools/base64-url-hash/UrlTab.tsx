'use client';

import { useMemo, useState } from 'react';
import { CopyButton, ErrorBanner, Field, SegmentedControl } from '@/components/ui';
import { decodeUrl, encodeUrl, parseUrl, type UrlMode } from './url';

const MODES: { id: UrlMode; label: string }[] = [
  { id: 'component', label: 'Component' },
  { id: 'full', label: 'Full URL' },
  { id: 'form', label: 'Form (+)' },
];

export default function UrlTab() {
  const [dir, setDir] = useState<'encode' | 'decode'>('encode');
  const [mode, setMode] = useState<UrlMode>('component');
  const [text, setText] = useState('');
  const [lenient, setLenient] = useState(false);
  const [latin1, setLatin1] = useState(false);

  const result = useMemo(
    () => (dir === 'encode' ? encodeUrl(text, mode) : decodeUrl(text, mode, { lenient, latin1 })),
    [dir, mode, text, lenient, latin1],
  );
  const breakdown = useMemo(() => parseUrl(dir === 'encode' ? text : result.ok ? result.value : text), [dir, text, result]);
  const output = result.ok ? result.value : '';

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row">
        <SegmentedControl label="Direction" value={dir} onChange={setDir} options={[{ id: 'encode', label: 'Encode' }, { id: 'decode', label: 'Decode' }]} />
        <SegmentedControl label="Mode" value={mode} onChange={setMode} options={MODES} />
        <button type="button" className="btn sm" onClick={() => setText(dir === 'encode' ? 'a b&c=d+e' : 'a%20b%26c%3Dd%2Be+f')}>Try an example</button>
        <button type="button" className="btn sm" onClick={() => setText('')} disabled={!text}>Clear</button>
      </div>
      <div className="split">
        <Field label={dir === 'encode' ? 'Text to encode' : 'Percent-encoded text'}>
          {(id) => <textarea id={id} className="textarea mono" style={{ minHeight: 160 }} value={text} onChange={(e) => { setText(e.target.value); setLenient(false); setLatin1(false); }} spellCheck={false} dir="auto" />}
        </Field>
        <div className="stack" aria-live="polite">
          {!result.ok ? (
            <ErrorBanner>
              <div>{result.error}</div>
              {dir === 'decode' && (
                <div className="row" style={{ marginTop: 8 }}>
                  {result.canLenient && <button type="button" className="btn sm" onClick={() => setLenient(true)}>Decode leniently</button>}
                  {result.canLatin1 && <button type="button" className="btn sm" onClick={() => setLatin1(true)}>Decode as Latin-1 / Windows-1252</button>}
                </div>
              )}
            </ErrorBanner>
          ) : (
            <>
              <Field label="Result">
                {(id) => <textarea id={id} className="textarea mono" style={{ minHeight: 160 }} value={output} readOnly dir="auto" />}
              </Field>
              <div className="row"><CopyButton text={output} label="Copy result" /></div>
              {result.hints.map((h) => <p key={h} className="hint">{h}</p>)}
            </>
          )}
        </div>
      </div>

      {breakdown && (
        <section className="panel">
          <h2 className="panel-title">URL breakdown</h2>
          <dl className="stack mono" style={{ gap: 4, margin: 0 }}>
            <div>scheme: {breakdown.scheme}</div>
            <div>host: {breakdown.host}{breakdown.port && `:${breakdown.port}`}</div>
            <div>path: {breakdown.path}</div>
            {breakdown.query.map((q, i) => <div key={i}>query {q.key} = {q.value}</div>)}
            {breakdown.hash && <div>fragment: {breakdown.hash}</div>}
          </dl>
        </section>
      )}

      <section className="panel">
        <h2 className="panel-title">Which mode?</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr><th scope="col" align="left">Mode</th><th scope="col" align="left">a b&amp;c=d+e becomes</th><th scope="col" align="left">Use for</th></tr></thead>
          <tbody>
            <tr><th scope="row" align="left">Component</th><td className="mono">a%20b%26c%3Dd%2Be</td><td>One value inside a URL (encodes &amp; = ? / # +)</td></tr>
            <tr><th scope="row" align="left">Full URL</th><td className="mono">a%20b&amp;c=d+e</td><td>A whole URL; keeps : / ? # &amp; =</td></tr>
            <tr><th scope="row" align="left">Form</th><td className="mono">a+b%26c%3Dd%2Be</td><td>Query strings and form bodies; space becomes +</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
