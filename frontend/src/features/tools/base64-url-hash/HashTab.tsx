'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Banner, CopyButton, DropZone, ErrorBanner, Field, Icon, ProgressBar, SegmentedControl } from '@/components/ui';
import { downloadText, formatBytes } from '@/lib/files';
import { HASH_ALGOS, SECURITY_NOTE, checksumLine, compareDigest, formatDigest, hashBytes, type DigestFormat, type HashAlgo } from './digest';
import { runWorker, type Job } from './worker-client';

type Digest = { algo: HashAlgo; bytes: Uint8Array };

export default function HashTab() {
  const [text, setText] = useState('');
  const [nfc, setNfc] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [algos, setAlgos] = useState<HashAlgo[]>(['md5', 'sha1', 'sha256']);
  const [format, setFormat] = useState<DigestFormat>('hex');
  const [expected, setExpected] = useState('');
  const [digests, setDigests] = useState<Digest[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'working' | 'cancelled'>('idle');
  const [error, setError] = useState<string | null>(null);
  const job = useRef<Job | null>(null);

  useEffect(() => () => job.current?.cancel(), []);

  // Text hashing runs live; files run in a worker.
  useEffect(() => {
    if (file) return;
    let stale = false;
    const input = nfc ? text.normalize('NFC') : text;
    void Promise.all(algos.map(async (algo) => ({ algo, bytes: await hashBytes(algo, new TextEncoder().encode(input)) }))).then(
      (r) => !stale && (setDigests(r), setError(null)),
      () => !stale && setError('Hashing failed in this browser.'),
    );
    return () => {
      stale = true;
    };
  }, [text, nfc, algos, file]);

  function startFile(f: File, selected: HashAlgo[]) {
    job.current?.cancel();
    setStatus('working');
    setProgress(0);
    setDigests([]);
    setError(null);
    job.current = runWorker({ type: 'file', file: f, algos: selected }, (m) => {
      if (m.type === 'progress') setProgress(m.fraction * 100);
      else if (m.type === 'file-done') {
        setDigests(m.digests.map((d) => ({ algo: d.algo, bytes: d.bytes })));
        setStatus('idle');
        setProgress(null);
      } else if (m.type === 'error') {
        setError(m.message);
        setStatus('idle');
        setProgress(null);
      }
    });
  }

  function cancel() {
    job.current?.cancel();
    job.current = null;
    setStatus('cancelled');
    setProgress(null);
    setDigests([]);
  }

  function toggle(a: HashAlgo) {
    const next = algos.includes(a) ? algos.filter((x) => x !== a) : [...algos, a];
    setAlgos(next);
    if (file && next.length) startFile(file, next);
  }

  function pick(files: File[]) {
    const f = files[0];
    if (!f) return;
    setFile(f);
    if (algos.length) startFile(f, algos);
  }

  function clear() {
    job.current?.cancel();
    setFile(null);
    setText('');
    setDigests([]);
    setStatus('idle');
    setProgress(null);
    setExpected('');
  }

  const ordered = useMemo(() => HASH_ALGOS.filter((a) => digests.some((d) => d.algo === a.id)), [digests]);
  const compare = useMemo(() => (expected.trim() ? compareDigest(expected, digests) : null), [expected, digests]);
  const weakShown = digests.some((d) => d.algo === 'md5' || d.algo === 'sha1');
  const sourceName = file?.name ?? 'text';

  return (
    <div className="stack" style={{ gap: 14 }}>
      <fieldset className="row" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="muted" style={{ fontSize: 13, marginBottom: 4 }}>Algorithms</legend>
        {HASH_ALGOS.map((a) => (
          <label key={a.id} className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={algos.includes(a.id)} onChange={() => toggle(a.id)} /> {a.label}
          </label>
        ))}
        <SegmentedControl label="Output format" value={format} onChange={setFormat}
          options={[{ id: 'hex', label: 'hex' }, { id: 'HEX', label: 'HEX' }, { id: 'base64', label: 'Base64' }]} />
      </fieldset>

      {file ? (
        <div className="file-row">
          <Icon name="file" />
          <span className="name grow">{file.name}</span>
          <span className="muted tabular">{formatBytes(file.size)}</span>
          <button type="button" className="btn sm" onClick={clear}>Remove file</button>
        </div>
      ) : (
        <div className="split">
          <div className="stack">
            <Field label="Text to hash (UTF-8)" hint="Line endings are never changed: CRLF and LF give different hashes.">
              {(id) => <textarea id={id} className="textarea mono" style={{ minHeight: 140 }} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} dir="auto" />}
            </Field>
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={nfc} onChange={(e) => setNfc(e.target.checked)} /> Normalize to NFC before hashing
            </label>
            <p className="hint">Off by default: é as one code point and as e + accent hash differently.</p>
          </div>
          <DropZone onFiles={pick} title="Or drop a file to hash" hint="Large files are read in chunks, so memory stays flat." />
        </div>
      )}

      {file && file.size > 1024 ** 3 && (
        <Banner kind="warn">Large file: keep this tab in the foreground (background tabs are throttled), and expect battery use on a phone.</Banner>
      )}
      {error && <ErrorBanner onDismiss={() => setError(null)}>{error}</ErrorBanner>}
      {status === 'working' && <ProgressBar value={progress ?? undefined} label={`Hashing ${file?.name ?? ''}`} onCancel={cancel} />}
      {status === 'cancelled' && <Banner kind="info">Cancelled. Partial results were discarded.</Banner>}
      {!algos.length && <p className="muted">Select at least one algorithm.</p>}

      <div className="stack" aria-live="polite" style={{ gap: 8 }}>
        {ordered.map((a) => {
          const d = digests.find((x) => x.algo === a.id)!;
          const value = formatDigest(d.bytes, format);
          const matched = compare?.matched.includes(a.id);
          return (
            <div key={a.id} className="file-row" role="group" aria-label={`${a.label} result`}>
              <b style={{ minWidth: 72 }}>{a.label}</b>
              <code className="mono grow" style={{ wordBreak: 'break-all' }}>{value}</code>
              {matched && <span className="tag new"><Icon name="check" /> Match</span>}
              <CopyButton text={value} label="Copy" />
              {file && <button type="button" className="btn sm" onClick={() => downloadText(checksumLine(formatDigest(d.bytes, 'hex'), file.name), `${file.name}.${a.id}`)}>.{a.id} file</button>}
            </div>
          );
        })}
        {weakShown && <Banner kind="warn">MD5 / SHA-1: {SECURITY_NOTE}</Banner>}
      </div>

      {digests.length > 0 && (
        <div className="stack">
          <Field label={`Compare with an expected hash (${sourceName})`} hint="Spaces, colons and upper case are ignored; hex or Base64 is detected.">
            {(id) => <input id={id} className="input mono" value={expected} onChange={(e) => setExpected(e.target.value)} spellCheck={false} autoComplete="off" />}
          </Field>
          <div aria-live="polite">
            {compare && (compare.valid ? (
              compare.matched.length ? (
                <Banner kind="ok">Match: {compare.matched.map((m) => HASH_ALGOS.find((a) => a.id === m)!.label).join(', ')}.</Banner>
              ) : compare.lengthFits.length && !compare.lengthFits.some((a) => algos.includes(a)) ? (
                <Banner kind="warn">No match. This length fits {compare.lengthFits.map((m) => HASH_ALGOS.find((a) => a.id === m)!.label).join(' / ')}, which is not selected.</Banner>
              ) : (
                <Banner kind="error">No match.</Banner>
              )
            ) : (
              <Banner kind="warn">That does not look like a hex or Base64 hash.</Banner>
            ))}
          </div>
        </div>
      )}

      <div className="row">
        <button type="button" className="btn sm" onClick={() => { setFile(null); setText('abc'); }}>Try an example</button>
        <button type="button" className="btn sm" onClick={clear}>Clear</button>
      </div>
    </div>
  );
}
