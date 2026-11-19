'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banner, ConfirmDialog, Dialog, EmptyState, ErrorBanner, Field, Icon, ProgressBar, useToast } from '@/components/ui';
import { downloadText } from '@/lib/files';
import { decryptJson, encryptJson } from '@/lib/crypto/vault';
import { lockVault } from '@/lib/crypto/session';
import { useVaultKey } from '@/hooks/useVaultKey';
import { apiErrorCode, apiErrorMessage } from '@/store/api/base';
import {
  useCreateTotpMutation, useDeleteTotpMutation, useListTotpQuery, useUpdateTotpMutation,
} from '@/store/api/resources.api';
import type { EncryptedItemDto } from '@uu/shared';
import { AddDialog, type SaveItem } from './AddDialog';
import { createBackup } from './backup';
import { generateCode, groupCode, remaining, validateEntry, type TotpEntry } from './core';
import s from './styles.module.css';

const QUOTA = 200;
const COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base' });

interface Row { id: string; sortOrder: number; dto: EncryptedItemDto; entry: TotpEntry | null }

function Ring({ left, period }: { left: number; period: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const low = left <= 5;
  return (
    <div className={s.ring} role="img" aria-label={`Expires in ${Math.ceil(left)} seconds`}>
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="4" />
        <circle cx="22" cy="22" r={r} fill="none" stroke={low ? '#d97706' : 'currentColor'} strokeWidth="4" strokeDasharray={c} strokeDashoffset={c * (1 - left / period)} />
      </svg>
      <span className={`${s.ringText} ${low ? s.warn : ''}`}>{Math.ceil(left)}s</span>
    </div>
  );
}

export default function TotpAuthenticator() {
  const key = useVaultKey();
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useListTotpQuery();
  const [createTotp] = useCreateTotpMutation();
  const [updateTotp] = useUpdateTotpMutation();
  const [deleteTotp] = useDeleteTotpMutation();

  const [entries, setEntries] = useState<Record<string, TotpEntry | null>>({});
  const [decrypting, setDecrypting] = useState(false);
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(0);
  const [useOffset, setUseOffset] = useState(false);
  const [drift, setDrift] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ issuer: '', account: '', folder: '', notes: '' });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportPass, setExportPass] = useState('');
  const [busy, setBusy] = useState('');
  const [announce, setAnnounce] = useState('');
  const [actionError, setActionError] = useState('');
  const clearTimer = useRef<number | undefined>(undefined);

  // Decrypt every item; a failure only affects that row.
  const dtoKey = data?.map((d) => `${d.id}:${d.updatedAt}`).join('|') ?? '';
  useEffect(() => {
    if (!key || !data) return;
    let cancelled = false;
    setDecrypting(true);
    (async () => {
      const out: Record<string, TotpEntry | null> = {};
      for (const d of data) {
        try {
          const e = await decryptJson<TotpEntry>(key, d.payload);
          validateEntry(e);
          out[d.id] = e;
        } catch {
          out[d.id] = null;
        }
      }
      if (!cancelled) { setEntries(out); setDecrypting(false); }
    })();
    return () => { cancelled = true; };
     
  }, [key, dtoKey]);

  // Wipe plaintext from memory when the vault locks.
  useEffect(() => { if (!key) { setEntries({}); setRevealed({}); } }, [key]);

  // Ticker: timestamps are recomputed from Date.now(), never accumulated.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    const vis = () => {
      setNow(Date.now());
      if (document.hidden) setRevealed({});
    };
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, []);

  // Clock drift via the Date header of our own health endpoint. Nothing else is sent.
  useEffect(() => {
    let stop = false;
    const check = async () => {
      try {
        const t0 = Date.now();
        const res = await fetch('/api/v1/health', { cache: 'no-store' });
        const t1 = Date.now();
        const header = res.headers.get('date');
        if (!header || stop) return;
        const server = new Date(header).getTime();
        if (Number.isNaN(server)) return;
        // Date header has 1 s resolution; compare against the request midpoint and allow for that.
        setDrift(server + 500 - (t0 + t1) / 2);
      } catch { /* offline: keep the last value */ }
    };
    void check();
    const id = window.setInterval(check, 10 * 60 * 1000);
    return () => { stop = true; window.clearInterval(id); };
  }, []);
  useEffect(() => { setOffset(useOffset && drift !== null ? drift : 0); }, [useOffset, drift]);

  const rows: Row[] = useMemo(
    () => (data ?? []).map((d) => ({ id: d.id, sortOrder: d.sortOrder, dto: d, entry: entries[d.id] ?? null }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.dto.createdAt.localeCompare(b.dto.createdAt)),
    [data, entries],
  );
  const folders = useMemo(() => Array.from(new Set(rows.map((r) => r.entry?.folder).filter((f): f is string => !!f))).sort(COLLATOR.compare), [rows]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!r.entry) return !q && !folder; // error rows only in the unfiltered list
      if (folder !== null && r.entry.folder !== folder) return false;
      return !q || `${r.entry.issuer} ${r.entry.account}`.toLowerCase().includes(q);
    });
  }, [rows, search, folder]);

  const adjusted = now + offset;
  const count = rows.length;

  const copy = useCallback(async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setAnnounce('Code copied. The clipboard is cleared after 30 seconds if it still holds this code.');
      toast('Code copied. Cleared from the clipboard in 30 s.', 'success');
      window.clearTimeout(clearTimer.current);
      clearTimer.current = window.setTimeout(async () => {
        try {
          if ((await navigator.clipboard.readText()) === code) await navigator.clipboard.writeText('');
        } catch { /* permission denied: best effort */ }
      }, 30_000);
    } catch {
      setAnnounce('Could not copy. Select the code and press Ctrl+C.');
      toast('Could not copy automatically.', 'error');
    }
  }, [toast]);

  const persist = async (entry: TotpEntry, sortOrder: number, id?: string, dto?: EncryptedItemDto) => {
    if (!key) throw new Error('locked');
    const payload = await encryptJson(key, entry);
    if (id) return updateTotp({ id, body: { payload, sortOrder: dto?.sortOrder ?? sortOrder } }).unwrap();
    return createTotp({ payload, sortOrder }).unwrap();
  };

  const saveItems = async (items: SaveItem[]): Promise<string | null> => {
    if (!key) return 'The vault is locked.';
    let next = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;
    let saved = 0;
    try {
      for (const it of items) {
        if (it.replaceId) {
          const old = rows.find((r) => r.id === it.replaceId);
          await persist(it.entry, next, it.replaceId, old?.dto);
        } else await persist(it.entry, next++);
        saved++;
      }
      toast(`Saved ${saved} account${saved === 1 ? '' : 's'}.`, 'success');
      return null;
    } catch (e) {
      const skipped = items.length - saved;
      if (apiErrorCode(e) === 'QUOTA_EXCEEDED') return `You reached the 200-entry limit. ${saved} saved, ${skipped} skipped. Delete or export entries to make room.`;
      return `${saved ? `${saved} saved. ` : ''}${apiErrorMessage(e)}`;
    }
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const a = visible[idx];
    const b = visible[idx + dir];
    if (!a || !b) return;
    // Swap sort orders; fall back to index based values if they collide.
    const ia = rows.findIndex((r) => r.id === a.id);
    const ib = rows.findIndex((r) => r.id === b.id);
    setActionError('');
    try {
      await Promise.all(rows.map((r, i) => {
        const pos = i === ia ? ib : i === ib ? ia : i;
        return r.sortOrder === pos ? null : updateTotp({ id: r.id, body: { payload: r.dto.payload, sortOrder: pos } }).unwrap();
      }));
      setAnnounce(`Moved ${a.entry?.issuer ?? 'item'} ${dir < 0 ? 'up' : 'down'}.`);
    } catch (e) { setActionError(apiErrorMessage(e)); }
  };

  const openEdit = (r: Row) => {
    if (!r.entry) return;
    setEditDraft({ issuer: r.entry.issuer, account: r.entry.account, folder: r.entry.folder, notes: r.entry.notes });
    setEditing(r.id);
  };
  const saveEdit = async () => {
    const r = rows.find((x) => x.id === editing);
    if (!r?.entry) return;
    setBusy('edit'); setActionError('');
    try {
      await persist({ ...r.entry, issuer: editDraft.issuer.trim().normalize('NFC'), account: editDraft.account.trim().normalize('NFC'), folder: editDraft.folder.trim(), notes: editDraft.notes }, r.sortOrder, r.id, r.dto);
      setEditing(null);
    } catch (e) { setActionError(apiErrorMessage(e)); }
    setBusy('');
  };
  const nextHotp = async (r: Row) => {
    if (!r.entry) return;
    try { await persist({ ...r.entry, counter: r.entry.counter + 1 }, r.sortOrder, r.id, r.dto); } catch (e) { setActionError(apiErrorMessage(e)); }
  };
  const confirmDelete = async () => {
    const id = deleting;
    setDeleting(null);
    if (!id) return;
    try { await deleteTotp(id).unwrap(); toast('Entry deleted.', 'success'); } catch (e) { setActionError(apiErrorMessage(e)); }
  };

  const doExport = async () => {
    setBusy('export');
    try {
      const list = rows.map((r) => r.entry).filter((e): e is TotpEntry => !!e);
      const text = await createBackup(list, exportPass);
      const name = `ultimate-util-2fa-${new Date().toISOString().slice(0, 10)}.uubackup`;
      downloadText(text, name, 'application/json');
      toast(`Saved ${name}`, 'success');
      setExporting(false); setExportPass('');
    } catch { setActionError('Export failed.'); }
    setBusy('');
  };

  const onKey = (e: React.KeyboardEvent, idx: number) => {
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); void move(idx, e.key === 'ArrowUp' ? -1 : 1); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-totp-main]'));
      const i = cards.indexOf(e.currentTarget as HTMLElement);
      cards[i + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
      e.preventDefault();
    }
  };

  if (!key) return <Banner kind="warn">The vault is locked. Unlock it to see your codes.</Banner>;

  const driftSecs = drift === null ? 0 : Math.round(drift / 1000);
  const showDrift = drift !== null && Math.abs(drift) > 5000;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="sr-only" aria-live="polite">{announce}</div>
      {showDrift && (
        <Banner kind="warn">
          Your device clock is off by about {Math.abs(driftSecs)} seconds, so codes may be rejected.{' '}
          <label><input type="checkbox" checked={useOffset} onChange={(e) => setUseOffset(e.target.checked)} /> Use server-adjusted time</label>
        </Banner>
      )}
      {isError && <ErrorBanner onRetry={() => void refetch()}>{apiErrorMessage(error, 'Could not load your accounts.')}</ErrorBanner>}
      {actionError && <ErrorBanner onDismiss={() => setActionError('')}>{actionError}</ErrorBanner>}
      {count >= QUOTA * 0.8 && <Banner kind={count >= QUOTA ? 'error' : 'warn'}>{count}/{QUOTA} entries used.{count >= QUOTA ? ' Delete or export entries before adding more.' : ''}</Banner>}

      <div className="row">
        <Field label="Search">{(id) => <input id={id} className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Issuer or account" />}</Field>
        <button type="button" className="btn primary" onClick={() => setAdding(true)} disabled={count >= QUOTA}><Icon name="plus" /> Add</button>
        <button type="button" className="btn" aria-pressed={hidden} onClick={() => { setHidden(!hidden); setRevealed({}); }}><Icon name="eye" /> {hidden ? 'Show codes' : 'Hide codes'}</button>
        <button type="button" className="btn" onClick={() => setExporting(true)} disabled={!count}><Icon name="download" /> Backup</button>
        <button type="button" className="btn" onClick={lockVault}><Icon name="lock" /> Lock now</button>
      </div>
      {folders.length > 0 && (
        <div className={s.chips} role="group" aria-label="Folders">
          <button type="button" className={`btn sm ${folder === null ? "primary" : ""}`} aria-pressed={folder === null} onClick={() => setFolder(null)}>All</button>
          {folders.map((f) => <button key={f} type="button" className={`btn sm ${folder === f ? "primary" : ""}`} aria-pressed={folder === f} onClick={() => setFolder(f)}>{f}</button>)}
        </div>
      )}

      {(isLoading || decrypting) && !rows.length ? <ProgressBar label="Loading and decrypting..." /> : null}
      {!isLoading && !isError && count === 0 && (
        <EmptyState icon="shield" title="No accounts yet">
          <div className="row" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn primary" onClick={() => setAdding(true)}>Add your first account</button>
          </div>
          <p className="hint">Scan a QR, type a key, paste an otpauth:// link, import a Google Authenticator export or open a backup. Secrets are encrypted on this device.</p>
        </EmptyState>
      )}
      {count > 0 && visible.length === 0 && <p className="muted">No accounts match.</p>}

      <ul className={s.list} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {visible.map((r, idx) => {
          if (!r.entry) {
            return (
              <li key={r.id} className={`${s.card} ${s.error}`}>
                <div><strong>This entry could not be decrypted</strong><div className="hint">It may be damaged or from another vault. Your other entries are fine.</div></div>
                <button type="button" className="btn sm danger" onClick={() => setDeleting(r.id)}>Delete</button>
              </li>
            );
          }
          const e = r.entry;
          const left = remaining(e.period, adjusted);
          const code = (() => { try { return generateCode(e, adjusted); } catch { return ''; } })();
          const nextCode = e.type === 'totp' && left <= 5 ? (() => { try { return generateCode(e, adjusted + e.period * 1000); } catch { return ''; } })() : '';
          const show = !hidden || (revealed[r.id] ?? 0) > now;
          const shown = show ? groupCode(code) : '•'.repeat(e.digits);
          const label = `${e.issuer || 'Account'}, ${e.account}, ${show ? `code ${groupCode(code)}` : 'code hidden'}${e.type === 'totp' ? `, expires in ${Math.ceil(left)} seconds` : ''}. Press to ${show ? 'copy' : 'reveal'}`;
          return (
            <li key={r.id} className={s.card}>
              <button type="button" data-totp-main className={s.main} aria-label={label} onKeyDown={(ev) => onKey(ev, idx)}
                onClick={() => { if (!show) setRevealed({ ...revealed, [r.id]: Date.now() + 10_000 }); else void copy(code); }}>
                <span className={s.issuer} dir="auto">{e.issuer || '(no issuer)'}</span>
                <span className={s.account} dir="auto">{e.account}</span>
                <span className={s.code} aria-hidden="true">{shown}</span>
                {show && nextCode && <span className={s.next} aria-hidden="true">Next {groupCode(nextCode)}</span>}
              </button>
              <div className={s.side}>
                {e.type === 'totp' ? <Ring left={left} period={e.period} /> : <button type="button" className="btn sm" onClick={() => void nextHotp(r)}>Next code</button>}
              </div>
              <div className={s.actions}>
                <button type="button" className="btn sm" disabled={!show} onClick={() => void copy(code)}><Icon name="copy" /> Copy</button>
                <button type="button" className="btn sm" onClick={() => openEdit(r)}><Icon name="edit" /> Edit</button>
                <button type="button" className="btn sm" disabled={idx === 0} onClick={() => void move(idx, -1)} aria-label={`Move ${e.issuer} up`}>Up</button>
                <button type="button" className="btn sm" disabled={idx === visible.length - 1} onClick={() => void move(idx, 1)} aria-label={`Move ${e.issuer} down`}>Down</button>
                <button type="button" className="btn sm danger" onClick={() => setDeleting(r.id)}><Icon name="trash" /> Delete</button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="hint">Local codes: computed on this device. {count}/{QUOTA} entries. Do not store the 2FA for your Google account or this site here, and keep each service&apos;s recovery codes elsewhere.</p>

      <AddDialog open={adding} onClose={() => setAdding(false)} folders={folders} room={QUOTA - count} onSave={saveItems}
        existing={rows.filter((r) => r.entry).map((r) => ({ id: r.id, entry: r.entry as TotpEntry }))} />

      <Dialog open={editing !== null} title="Edit account" onClose={() => setEditing(null)}
        actions={<><button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button><button type="button" className="btn primary" disabled={busy === 'edit'} onClick={() => void saveEdit()}>Save</button></>}>
        <div className="stack">
          <Field label="Issuer">{(id) => <input id={id} className="input" dir="auto" value={editDraft.issuer} onChange={(e) => setEditDraft({ ...editDraft, issuer: e.target.value })} />}</Field>
          <Field label="Account">{(id) => <input id={id} className="input" dir="auto" value={editDraft.account} onChange={(e) => setEditDraft({ ...editDraft, account: e.target.value })} />}</Field>
          <Field label="Folder">{(id) => <input id={id} className="input" value={editDraft.folder} maxLength={40} onChange={(e) => setEditDraft({ ...editDraft, folder: e.target.value })} />}</Field>
          <Field label="Notes (encrypted)">{(id) => <textarea id={id} className="textarea" value={editDraft.notes} onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })} />}</Field>
        </div>
      </Dialog>

      <ConfirmDialog open={deleting !== null} danger title="Delete this entry?" confirmLabel="Delete"
        message="You will lose access to these codes on every device. If you have no other copy, you must re-enroll 2FA with the service (you may need its recovery codes)."
        onConfirm={() => void confirmDelete()} onCancel={() => setDeleting(null)} />

      <Dialog open={exporting} title="Encrypted backup" onClose={() => setExporting(false)}
        actions={<><button type="button" className="btn" onClick={() => setExporting(false)}>Cancel</button><button type="button" className="btn primary" disabled={exportPass.length < 10 || busy === 'export'} onClick={() => void doExport()}>{busy === 'export' ? 'Encrypting...' : 'Download backup'}</button></>}>
        <div className="stack">
          <p>The file is encrypted with a passphrase you choose now (at least 10 characters). Using your vault passphrase is a good idea. Store the file somewhere other than this device.</p>
          <Field label="Backup passphrase">{(id) => <input id={id} className="input" type="password" autoComplete="new-password" value={exportPass} onChange={(e) => setExportPass(e.target.value)} />}</Field>
        </div>
      </Dialog>
    </div>
  );
}
