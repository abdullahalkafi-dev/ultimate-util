'use client';

import { useEffect, useMemo, useState } from 'react';
import { CopyButton, DropZone, ErrorBanner, Banner, Field, SegmentedControl } from '@/components/ui';
import { downloadBlob, formatBytes, sniffType } from '@/lib/files';
import { bytesToText, decodeBase64, encodeBytes, hexDump, toDataUri, utf8, type Alphabet } from './base64';

const WARN_BYTES = 50 * 1024 * 1024;
const MAX_BYTES = 500 * 1024 * 1024;
const EXAMPLE = 'héllo 😀 — Ultimate Util';

export default function Base64Tab() {
  const [dir, setDir] = useState<'encode' | 'decode'>('encode');
  const [text, setText] = useState('');
  const [alphabet, setAlphabet] = useState<Alphabet>('standard');
  const [padding, setPadding] = useState(true);
  const [wrap, setWrap] = useState<'0' | '64' | '76'>('0');
  const [newline, setNewline] = useState<'\n' | '\r\n'>('\n');
  const [asUri, setAsUri] = useState(false);
  const [strip, setStrip] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setFileBytes(null);
      return;
    }
    let cancelled = false;
    file.arrayBuffer().then(
      (buf) => !cancelled && setFileBytes(new Uint8Array(buf)),
      () => !cancelled && setFileError('The file could not be read.'),
    );
    return () => {
      cancelled = true;
    };
  }, [file]);

  const encoded = useMemo(() => {
    if (dir !== 'encode') return '';
    const bytes = file ? fileBytes : utf8(text);
    if (!bytes) return '';
    const b64 = encodeBytes(bytes, { alphabet, padding, wrap: Number(wrap) as 0 | 64 | 76, newline });
    if (!asUri) return b64;
    const mime = file?.type || (file ? 'application/octet-stream' : 'text/plain;charset=utf-8');
    return alphabet === 'standard' && padding && wrap === '0' ? toDataUri(mime, bytes) : `data:${mime};base64,${b64}`;
  }, [dir, text, file, fileBytes, alphabet, padding, wrap, newline, asUri]);

  const decoded = useMemo(() => (dir === 'decode' ? decodeBase64(text, { stripInvalid: strip }) : null), [dir, text, strip]);
  const decodedText = decoded?.ok ? bytesToText(decoded.bytes) : null;
  const decodedType = decoded?.ok && decodedText === null ? sniffType(decoded.bytes) : null;

  function pick(files: File[]) {
    const f = files[0];
    if (!f) return;
    setFileError(null);
    if (f.size > MAX_BYTES) {
      setFileError(`${f.name} is ${formatBytes(f.size)}. Files above ${formatBytes(MAX_BYTES)} are not supported for Base64.`);
      return;
    }
    setFile(f);
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row">
        <SegmentedControl
          label="Direction"
          value={dir}
          onChange={setDir}
          options={[{ id: 'encode', label: 'Encode' }, { id: 'decode', label: 'Decode' }]}
        />
        <button type="button" className="btn sm" onClick={() => { setFile(null); setText(dir === 'encode' ? EXAMPLE : 'aMOpbGxvIPCfmIAg4oCUIFVsdGltYXRlIFV0aWw='); }}>
          Try an example
        </button>
        <button type="button" className="btn sm" onClick={() => { setText(''); setFile(null); setFileError(null); }} disabled={!text && !file}>
          Clear
        </button>
      </div>

      {dir === 'encode' && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <SegmentedControl label="Alphabet" value={alphabet} onChange={(a) => { setAlphabet(a); setPadding(a === 'standard'); }}
            options={[{ id: 'standard', label: 'Standard' }, { id: 'url', label: 'URL-safe' }]} />
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={padding} onChange={(e) => setPadding(e.target.checked)} /> Padding (=)
          </label>
          <Field label="Line wrap">
            {(id) => (
              <select id={id} className="select" value={wrap} onChange={(e) => setWrap(e.target.value as '0' | '64' | '76')}>
                <option value="0">None</option>
                <option value="64">64 columns</option>
                <option value="76">76 columns (MIME)</option>
              </select>
            )}
          </Field>
          {wrap !== '0' && (
            <Field label="Line ending">
              {(id) => (
                <select id={id} className="select" value={newline} onChange={(e) => setNewline(e.target.value as '\n' | '\r\n')}>
                  <option value={'\n'}>LF</option>
                  <option value={'\r\n'}>CRLF</option>
                </select>
              )}
            </Field>
          )}
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={asUri} onChange={(e) => setAsUri(e.target.checked)} /> Output as data URI
          </label>
        </div>
      )}
      {dir === 'decode' && (
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={strip} onChange={(e) => setStrip(e.target.checked)} /> Strip invalid characters
        </label>
      )}

      <div className="split">
        <div className="stack">
          {file ? (
            <div className="file-row">
              <span className="name grow">{file.name}</span>
              <span className="muted tabular">{formatBytes(file.size)}</span>
              <button type="button" className="btn sm" onClick={() => setFile(null)}>Remove file</button>
            </div>
          ) : (
            <Field label={dir === 'encode' ? 'Text to encode (UTF-8)' : 'Base64 or data URI to decode'} hint={dir === 'encode' ? 'Text is converted to UTF-8 bytes first, so any language and emoji work.' : 'Line breaks, spaces, missing padding and both alphabets are accepted.'}>
              {(id) => (
                <textarea id={id} className="textarea mono" style={{ minHeight: 200 }} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} dir="auto" />
              )}
            </Field>
          )}
          {dir === 'encode' && !file && <DropZone onFiles={pick} title="Or drop a file to encode" hint="Encoded in your browser; nothing is uploaded." />}
          {fileError && <ErrorBanner onDismiss={() => setFileError(null)}>{fileError}</ErrorBanner>}
          {file && file.size > WARN_BYTES && (
            <Banner kind="warn">Large file: the Base64 output will be about 33% bigger ({formatBytes(Math.ceil(file.size * 1.34))}) and uses a lot of memory.</Banner>
          )}
        </div>

        <div className="stack" aria-live="polite">
          {dir === 'encode' ? (
            <>
              <Field label="Base64 output">
                {(id) => <textarea id={id} className="textarea mono" style={{ minHeight: 200 }} value={encoded} readOnly dir="ltr" />}
              </Field>
              <div className="row">
                <CopyButton text={encoded} label="Copy output" />
                <button type="button" className="btn sm" disabled={!encoded} onClick={() => downloadBlob(new Blob([encoded], { type: 'text/plain' }), `${file?.name ?? 'text'}.b64.txt`)}>Download .txt</button>
              </div>
            </>
          ) : decoded && !text.trim() ? (
            <p className="muted">Paste Base64 to decode it.</p>
          ) : decoded && !decoded.ok ? (
            <ErrorBanner>{decoded.error}{decoded.canStrip && !strip && ' Tick "Strip invalid characters" to drop them.'}</ErrorBanner>
          ) : decoded?.ok ? (
            <>
              {decoded.notes.map((n) => <p key={n} className="hint">{n}</p>)}
              {decodedText !== null ? (
                <>
                  <Field label="Decoded text">
                    {(id) => <textarea id={id} className="textarea mono" style={{ minHeight: 200 }} value={decodedText} readOnly dir="auto" />}
                  </Field>
                  <div className="row"><CopyButton text={decodedText} label="Copy text" /></div>
                </>
              ) : (
                <>
                  <Banner kind="warn">Not valid UTF-8, showing as bytes. {decodedType !== 'unknown' ? `Looks like a ${decodedType?.toUpperCase()} file (by its first bytes).` : 'File type not recognised.'}</Banner>
                  <Field label={`Hex view (${formatBytes(decoded.bytes.length)})`}>
                    {(id) => <textarea id={id} className="textarea mono" style={{ minHeight: 160 }} value={hexDump(decoded.bytes)} readOnly wrap="off" />}
                  </Field>
                </>
              )}
              <div className="row">
                <button type="button" className="btn sm" onClick={() => downloadBlob(new Blob([decoded.bytes as BlobPart], { type: decoded.mime ?? 'application/octet-stream' }), 'name-decoded.bin')}>
                  Download as file
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
