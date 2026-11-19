'use client';

import { useMemo, useState } from 'react';
import { Banner, Dialog, DropZone, Field, SegmentedControl } from '@/components/ui';
import { readBackup } from './backup';
import { DEFAULTS, ParseError, generateCode, groupCode, normalizeSecret, parseOtpauthUri, sameAccount, validateEntry, type Algorithm, type TotpEntry } from './core';
import { decodeMigration } from './migration';
import { QrScanner } from './QrScanner';
import { decodeQrFile } from './qr';

export interface ExistingRef { id: string; entry: TotpEntry }
export interface SaveItem { entry: TotpEntry; replaceId?: string }

type Method = 'qr' | 'image' | 'manual' | 'link' | 'backup';
type Mode = 'add' | 'replace';
interface Candidate { entry: TotpEntry; checked: boolean; status: 'new' | 'duplicate' | 'conflict'; existingId?: string; mode: Mode }

const blank = (): TotpEntry => ({ type: 'totp', issuer: '', account: '', secret: '', algorithm: DEFAULTS.algorithm, digits: DEFAULTS.digits, period: DEFAULTS.period, counter: 0, folder: '', notes: '' });

export function AddDialog({ open, onClose, existing, folders, room, onSave }: {
  open: boolean;
  onClose: () => void;
  existing: ExistingRef[];
  folders: string[];
  room: number;
  onSave: (items: SaveItem[]) => Promise<string | null>;
}) {
  const [method, setMethod] = useState<Method>('manual');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cands, setCands] = useState<Candidate[]>([]);
  const [manual, setManual] = useState<TotpEntry>(blank());
  const [link, setLink] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [backupText, setBackupText] = useState('');
  const [backupPass, setBackupPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [folder, setFolder] = useState('');
  const [migrationBatch, setMigrationBatch] = useState<{ id: number; got: number[]; size: number } | null>(null);

  const reset = () => { setError(''); setInfo(''); setCands([]); setManual(blank()); setLink(''); setCameraOn(false); setBackupText(''); setBackupPass(''); setFolder(''); setMigrationBatch(null); };
  const close = () => { reset(); onClose(); };

  const classify = (entries: TotpEntry[]): Candidate[] =>
    entries.map((entry) => {
      const sameSecret = existing.find((x) => x.entry.secret === entry.secret && sameAccount(x.entry, entry));
      if (sameSecret) return { entry, checked: false, status: 'duplicate', mode: 'add', existingId: sameSecret.id };
      const sameAcc = existing.find((x) => sameAccount(x.entry, entry));
      if (sameAcc) return { entry, checked: true, status: 'conflict', mode: 'add', existingId: sameAcc.id };
      return { entry, checked: true, status: 'new', mode: 'add' };
    });

  const addCandidates = (entries: TotpEntry[], append = false) => {
    const next = classify(entries);
    setCands((c) => (append ? [...c, ...next] : next));
  };

  const handleText = (text: string) => {
    setError(''); setInfo('');
    try {
      const t = text.trim();
      if (t.startsWith('otpauth-migration://')) {
        const r = decodeMigration(t);
        if (!r.entries.length) throw new ParseError('No supported accounts found in that export.');
        if (r.batchSize > 1) {
          const prev = migrationBatch && migrationBatch.id === r.batchId ? migrationBatch : { id: r.batchId, got: [], size: r.batchSize };
          const got = prev.got.includes(r.batchIndex) ? prev.got : [...prev.got, r.batchIndex];
          setMigrationBatch({ ...prev, got });
          addCandidates(r.entries, prev.got.length > 0);
          const left = r.batchSize - got.length;
          setInfo(left > 0 ? `Part ${got.length} of ${r.batchSize} read. Scan or upload the other ${left} QR code(s) to add the rest.` : 'All parts read.');
        } else addCandidates(r.entries);
        if (r.skipped) setInfo((i) => `${i} ${r.skipped} account(s) used an unsupported algorithm and were skipped.`.trim());
      } else {
        addCandidates([parseOtpauthUri(t)]);
      }
    } catch (e) {
      setError(e instanceof ParseError || e instanceof Error ? e.message : 'Could not read that code.');
    }
  };

  const onImage = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setError('');
    try { handleText(await decodeQrFile(f)); } catch (e) { setError((e as Error).message); }
  };

  const submitManual = () => {
    setError('');
    try {
      const n = normalizeSecret(manual.secret);
      if (!manual.issuer.trim() && !manual.account.trim()) throw new ParseError('Enter an issuer or an account name.');
      const entry = { ...manual, secret: n.secret, issuer: manual.issuer.trim().normalize('NFC'), account: manual.account.trim().normalize('NFC') };
      validateEntry(entry);
      if (n.warning) setInfo(n.warning);
      addCandidates([entry]);
    } catch (e) { setError((e as Error).message); }
  };

  const unlockBackup = async () => {
    setError(''); setBusy(true);
    try { addCandidates(await readBackup(backupText, backupPass)); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  const chosen = cands.filter((c) => c.checked);
  const overQuota = useMemo(() => chosen.filter((c) => !(c.status === 'conflict' && c.mode === 'replace')).length > room, [chosen, room]);

  const save = async () => {
    setBusy(true); setError('');
    const items = chosen.map<SaveItem>((c) => ({
      entry: { ...c.entry, folder: folder || c.entry.folder },
      replaceId: c.status === 'conflict' && c.mode === 'replace' ? c.existingId : undefined,
    }));
    const err = await onSave(items);
    setBusy(false);
    if (err) setError(err); else close();
  };

  return (
    <Dialog open={open} title="Add an account" onClose={close}
      actions={cands.length ? (
        <>
          <button type="button" className="btn" onClick={() => { setCands([]); setMigrationBatch(null); }}>Back</button>
          <button type="button" className="btn primary" disabled={busy || !chosen.length || overQuota} onClick={save}>
            {busy ? 'Saving...' : `Save ${chosen.length} account${chosen.length === 1 ? '' : 's'}`}
          </button>
        </>
      ) : <button type="button" className="btn" onClick={close}>Cancel</button>}>
      <div className="stack">
        {error && <Banner kind="error">{error}</Banner>}
        {info && <Banner kind="info">{info}</Banner>}
        {cands.length === 0 ? (
          <>
            <SegmentedControl label="Add method" value={method} onChange={(m) => { setMethod(m); setError(''); setInfo(''); setCameraOn(false); }}
              options={[{ id: 'manual', label: 'Key' }, { id: 'qr', label: 'Scan' }, { id: 'image', label: 'QR image' }, { id: 'link', label: 'Link' }, { id: 'backup', label: 'Backup' }]} />
            {method === 'qr' && (cameraOn
              ? <QrScanner onResult={(t) => { setCameraOn(false); handleText(t); }} onError={(m) => { setCameraOn(false); setError(m); }} />
              : <button type="button" className="btn primary" onClick={() => setCameraOn(true)}>Start camera</button>)}
            {method === 'image' && <DropZone accept={['image/png', 'image/jpeg', 'image/webp']} maxBytes={10 * 1024 * 1024} onFiles={onImage} onReject={setError} title="Drop a QR image here" hint="PNG, JPG or WebP, up to 10 MB" />}
            {method === 'link' && (
              <Field label="otpauth:// or otpauth-migration:// link" hint="Google Authenticator exports can be pasted here too.">
                {(id) => (
                  <div className="stack">
                    <input id={id} className="input" value={link} onChange={(e) => setLink(e.target.value)} autoComplete="off" spellCheck={false} />
                    <button type="button" className="btn primary" disabled={!link.trim()} onClick={() => handleText(link)}>Read link</button>
                  </div>
                )}
              </Field>
            )}
            {method === 'backup' && (
              <div className="stack">
                <Field label="Backup file (.uubackup)">
                  {(id) => <input id={id} type="file" accept=".uubackup,application/json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setBackupText(await f.text()); }} />}
                </Field>
                <Field label="Backup passphrase">
                  {(id) => <input id={id} className="input" type="password" value={backupPass} onChange={(e) => setBackupPass(e.target.value)} autoComplete="off" />}
                </Field>
                <button type="button" className="btn primary" disabled={busy || !backupText || !backupPass} onClick={unlockBackup}>{busy ? 'Decrypting...' : 'Open backup'}</button>
              </div>
            )}
            {method === 'manual' && (
              <div className="stack">
                <Field label="Issuer (service)">{(id) => <input id={id} className="input" dir="auto" value={manual.issuer} onChange={(e) => setManual({ ...manual, issuer: e.target.value })} />}</Field>
                <Field label="Account">{(id) => <input id={id} className="input" dir="auto" value={manual.account} onChange={(e) => setManual({ ...manual, account: e.target.value })} />}</Field>
                <Field label="Secret key" hint="Spaces and lowercase are fine.">
                  {(id) => <input id={id} className="input mono" value={manual.secret} onChange={(e) => setManual({ ...manual, secret: e.target.value })} autoComplete="off" spellCheck={false} />}
                </Field>
                <details>
                  <summary>Advanced</summary>
                  <div className="stack" style={{ marginTop: 8 }}>
                    <Field label="Type">{(id) => <select id={id} className="input" value={manual.type} onChange={(e) => setManual({ ...manual, type: e.target.value as 'totp' | 'hotp' })}><option value="totp">Time based (TOTP)</option><option value="hotp">Counter based (HOTP)</option></select>}</Field>
                    <Field label="Algorithm">{(id) => <select id={id} className="input" value={manual.algorithm} onChange={(e) => setManual({ ...manual, algorithm: e.target.value as Algorithm })}><option>SHA1</option><option>SHA256</option><option>SHA512</option></select>}</Field>
                    <Field label="Digits">{(id) => <select id={id} className="input" value={manual.digits} onChange={(e) => setManual({ ...manual, digits: Number(e.target.value) as 6 | 8 })}><option value={6}>6</option><option value={8}>8</option></select>}</Field>
                    {manual.type === 'totp'
                      ? <Field label="Period (seconds, 15 to 120)">{(id) => <input id={id} className="input" type="number" min={15} max={120} value={manual.period} onChange={(e) => setManual({ ...manual, period: Number(e.target.value) })} />}</Field>
                      : <Field label="Starting counter">{(id) => <input id={id} className="input" type="number" min={0} value={manual.counter} onChange={(e) => setManual({ ...manual, counter: Number(e.target.value) })} />}</Field>}
                  </div>
                </details>
                <button type="button" className="btn primary" onClick={submitManual}>Continue</button>
              </div>
            )}
          </>
        ) : (
          <>
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {cands.map((c, i) => (
                <li key={i} className="panel">
                  <label className="row" style={{ gap: 8 }}>
                    <input type="checkbox" checked={c.checked} onChange={(e) => setCands(cands.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))} />
                    <span><strong dir="auto">{c.entry.issuer || '(no issuer)'}</strong> <span dir="auto">{c.entry.account}</span></span>
                  </label>
                  <div className="hint">{c.entry.type.toUpperCase()} · {c.entry.algorithm} · {c.entry.digits} digits{c.entry.type === 'totp' ? ` · ${c.entry.period}s` : ''}
                    {' '}· test code <span className="mono">{(() => { try { return groupCode(generateCode(c.entry, Date.now())); } catch { return 'n/a'; } })()}</span></div>
                  {c.status === 'duplicate' && <div className="hint">Already saved (same account and secret). Unchecked.</div>}
                  {c.status === 'conflict' && (
                    <div className="row">
                      <span className="hint">Same account with a different secret exists:</span>
                      <select className="input" aria-label="Conflict handling" value={c.mode} onChange={(e) => setCands(cands.map((x, j) => (j === i ? { ...x, mode: e.target.value as Mode } : x)))}>
                        <option value="add">Keep both</option><option value="replace">Replace the old one</option>
                      </select>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Field label="Folder (optional)">
              {(id) => (<><input id={id} className="input" list="uu-2fa-folders" value={folder} maxLength={40} onChange={(e) => setFolder(e.target.value)} />
                <datalist id="uu-2fa-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist></>)}
            </Field>
            {overQuota && <Banner kind="warn">Only {room} more entries fit in your 200-entry limit. Uncheck some, or delete or export entries first.</Banner>}
          </>
        )}
      </div>
    </Dialog>
  );
}
