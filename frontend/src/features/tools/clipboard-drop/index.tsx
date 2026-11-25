'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VaultGate } from '@/components/auth/VaultGate';
import { Banner, ConfirmDialog, CopyButton, Dialog, EmptyState, ErrorBanner, Field, ProgressBar, useToast } from '@/components/ui';
import { useVaultKey } from '@/hooks/useVaultKey';
import { fromBase64, toBase64 } from '@/lib/crypto/encoding';
import { decryptJson, encryptJson } from '@/lib/crypto/vault';
import { downloadBlob, formatBytes } from '@/lib/files';
import { readJson, writeJson } from '@/lib/storage';
import { apiErrorCode, apiErrorMessage } from '@/store/api/base';
import {
  useClearDropsMutation, useCreateDropMutation, useDeleteDropMutation, useListDropsQuery, usePinDropMutation,
} from '@/store/api/resources.api';
import { useGetVaultQuery } from '@/store/api/vault.api';
import type { DropBody, DropDto } from '@uu/shared';
import {
  EXPIRY, LIMITS, byteLength, checkFileName, checkSend, classifyText, clampDays, deviceLabel, expiresIn,
  isImageMime, isRecentDuplicate, linkInfo, orderDrops, parseLink, usageOf,
} from './drop';
import s from './styles.module.css';

interface Payload { text?: string; fileName?: string; mimeType?: string; fileData?: string }
const DEVICE_KEY = 'uu-drop-device';
const EXPIRY_KEY = 'uu-drop-expiry';

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.readAsDataURL(file);
  });
}

/** Live updates: SSE with reconnect, and a 15 s polling fallback while disconnected. */
function useLiveDrops() {
  const [connected, setConnected] = useState(false);
  const query = useListDropsQuery(undefined, { pollingInterval: connected ? 0 : 15_000, refetchOnFocus: true, refetchOnReconnect: true });
  const refetch = query.refetch;
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const open = () => {
      es = new EventSource('/api/v1/clipboard/stream', { withCredentials: true });
      es.addEventListener('ready', () => setConnected(true));
      es.onopen = () => setConnected(true);
      for (const ev of ['drop', 'removed', 'cleared']) es.addEventListener(ev, () => void refetch());
      es.onerror = () => {
        setConnected(false);
        es?.close();
        if (!stopped) timer = setTimeout(open, 5000);
      };
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(timer);
      es?.close();
    };
  }, [refetch]);
  return { ...query, connected };
}

function PairingDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/tools/clipboard-drop` : '';
  useEffect(() => {
    let cancelled = false;
    void import('qr-code-styling').then(({ default: QRCodeStyling }) => {
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = '';
      new QRCodeStyling({ width: 220, height: 220, data: url, margin: 4 }).append(ref.current);
    });
    return () => { cancelled = true; };
  }, [url]);
  return (
    <Dialog open title="Open on another device" onClose={onClose} actions={<button type="button" className="btn primary" onClick={onClose}>Done</button>}>
      <div className={s.qr}>
        <div ref={ref} role="img" aria-label={`QR code for ${url}`} />
        <code>{url}</code>
        <CopyButton text={url} label="Copy link" />
      </div>
      <p className="hint">Scan with your phone and sign in with the same account. Nothing is paired in the QR itself.</p>
    </Dialog>
  );
}

function E2eGate({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open title="Vault for end-to-end encryption" onClose={onClose} actions={<button type="button" className="btn" onClick={onClose}>Close</button>}>
      <VaultGate><Banner kind="ok">Your vault is unlocked. You can now encrypt drops.</Banner></VaultGate>
    </Dialog>
  );
}

function DropCard({
  drop, plain, locked, onPin, onDelete,
}: { drop: DropDto; plain: Payload | null; locked: boolean; onPin: () => void; onDelete: () => void }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const encrypted = Boolean(drop.encrypted);
  const text = encrypted ? plain?.text : drop.text;
  const fileName = encrypted ? plain?.fileName : drop.fileName;
  const mime = encrypted ? plain?.mimeType : drop.mimeType;
  const url = drop.kind === 'link' && text ? parseLink(text) : null;
  const info = url ? linkInfo(url) : null;

  useEffect(() => () => { if (imgUrl) URL.revokeObjectURL(imgUrl); }, [imgUrl]);

  const getBlob = async (): Promise<Blob> => {
    if (encrypted) {
      if (!plain?.fileData) throw new Error('No file data');
      return new Blob([fromBase64(plain.fileData)], { type: mime || 'application/octet-stream' });
    }
    const res = await fetch(`/api/v1/clipboard/${drop.id}/file`, { credentials: 'include' });
    if (!res.ok) throw new Error(res.status === 404 ? 'This file has expired or was removed.' : 'Download failed.');
    // Re-type only image blobs (for preview); everything else stays opaque bytes.
    return new Blob([await res.arrayBuffer()], { type: isImageMime(mime) ? mime : 'application/octet-stream' });
  };
  const download = async () => {
    setBusy(true);
    try { downloadBlob(await getBlob(), fileName ?? 'file'); } catch (e) { toast(e instanceof Error ? e.message : 'Download failed.', 'error'); }
    setBusy(false);
  };
  const preview = async () => {
    setBusy(true);
    try { setImgUrl(URL.createObjectURL(await getBlob())); } catch (e) { toast(e instanceof Error ? e.message : 'Preview failed.', 'error'); }
    setBusy(false);
  };

  return (
    <li className={`panel ${s.item}`}>
      <div className={s.meta}>
        <span className={s.pill}>{drop.kind === 'file' ? 'File' : drop.kind === 'link' ? 'Link' : 'Text'}</span>
        {encrypted && <span className={s.pill}>Encrypted</span>}
        {drop.pinned && <span className={s.pill}>Pinned</span>}
        <span>From {drop.deviceName}</span>
        <time dateTime={drop.createdAt}>{new Date(drop.createdAt).toLocaleString()}</time>
        <span>{formatBytes(drop.size)}</span>
        <span>{drop.pinned ? 'Kept until unpinned' : expiresIn(drop.expiresAt)}</span>
      </div>

      {locked && <Banner kind="warn">Locked: unlock your vault to view this encrypted item.</Banner>}
      {encrypted && !locked && !plain && <p className="muted" role="status">Decrypting...</p>}

      {drop.kind === 'file' && !locked && (plain || !encrypted) && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <strong dir="auto">{fileName}</strong>
          <button type="button" className="btn sm" onClick={download} disabled={busy}>Download</button>
          {isImageMime(mime) && !imgUrl && <button type="button" className="btn sm" onClick={preview} disabled={busy}>Show preview</button>}
        </div>
      )}
      {imgUrl &&   <img className={s.img} src={imgUrl} alt={fileName ?? 'Image'} />}

      {drop.kind !== 'file' && text && (
        <>
          {info && url && (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <span className="tag local">Domain: {info.host}</span>
              <a className="btn sm" href={url.href} target="_blank" rel="noopener noreferrer">Open link</a>
            </div>
          )}
          {info && info.warnings.length > 0 && (
            <ul className={s.warn} role="alert">{info.warnings.map((w) => <li key={w}>Warning: {w}</li>)}</ul>
          )}
          <div className={`${s.text} ${expanded ? s.textFull : ''}`} dir="auto">{text}</div>
          {text.length > 400 && <button type="button" className="btn sm ghost" onClick={() => setExpanded((v) => !v)}>{expanded ? 'Show less' : 'Show more'}</button>}
        </>
      )}

      <div className={s.actions}>
        {text && drop.kind !== 'file' && <CopyButton text={text} label="Copy" />}
        <button type="button" className="btn sm" onClick={onPin} aria-pressed={drop.pinned}>{drop.pinned ? 'Unpin' : 'Pin'}</button>
        <button type="button" className="btn sm danger" onClick={() => setConfirmOpen(true)}>Delete</button>
      </div>
      <ConfirmDialog open={confirmOpen} danger title="Delete this item?" confirmLabel="Delete" message="It is removed from all your devices." onCancel={() => setConfirmOpen(false)} onConfirm={() => { setConfirmOpen(false); onDelete(); }} />
    </li>
  );
}

export default function ClipboardDrop() {
  const toast = useToast();
  const live = useLiveDrops();
  const [createDrop] = useCreateDropMutation();
  const [pinDrop] = usePinDropMutation();
  const [deleteDrop] = useDeleteDropMutation();
  const [clearDrops] = useClearDropsMutation();
  const { data: vault } = useGetVaultQuery();
  const key = useVaultKey();

  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [device, setDevice] = useState('This device');
  const [days, setDays] = useState<number>(EXPIRY.default);
  const [e2e, setE2e] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showVault, setShowVault] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [plain, setPlain] = useState<Record<string, Payload>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDevice(readJson<string>(DEVICE_KEY, deviceLabel(navigator.userAgent)));
    setDays(clampDays(readJson<number>(EXPIRY_KEY, EXPIRY.default)));
  }, []);

  const drops = useMemo(() => orderDrops(live.data ?? []), [live.data]);
  const usage = usageOf(drops);
  const canE2e = Boolean(vault && key);

  // Decrypt encrypted items whenever the key or the list changes.
  useEffect(() => {
    if (!key) { setPlain({}); return; }
    let cancelled = false;
    void (async () => {
      const next: Record<string, Payload> = {};
      for (const d of drops) {
        if (!d.encrypted) continue;
        try { next[d.id] = await decryptJson<Payload>(key, d.encrypted); } catch { next[d.id] = { text: '(Could not be decrypted with this vault.)' }; }
      }
      if (!cancelled) setPlain(next);
    })();
    return () => { cancelled = true; };
  }, [drops, key]);

  const send = useCallback(async () => {
    setError('');
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) return setError('Paste some text or add a file first.');
    if (e2e && !canE2e) return setError('Unlock your vault to send end-to-end encrypted items.');
    setSending(true);
    let running = usage;
    try {
      const jobs: { body: DropBody; plainBytes: number }[] = [];
      if (trimmed) {
        if (isRecentDuplicate(drops, trimmed, device)) throw new Error('You just sent the same text from this device.');
        const bytes = byteLength(trimmed);
        const check = checkSend({ kind: classifyText(trimmed), bytes, encrypted: e2e }, running);
        if (!check.ok) throw new Error(check.reason);
        if (check.asFile) {
          const data = toBase64(new TextEncoder().encode(trimmed));
          jobs.push({ body: { kind: 'file', fileName: 'text.txt', mimeType: 'text/plain', fileData: data, deviceName: device, pinned: false, expiresInDays: days }, plainBytes: bytes });
        } else jobs.push({ body: { kind: classifyText(trimmed), text: trimmed, deviceName: device, pinned: false, expiresInDays: days }, plainBytes: bytes });
      }
      for (const f of files) {
        const nameCheck = checkFileName(f.name);
        if (!nameCheck.ok) throw new Error(nameCheck.reason);
        const check = checkSend({ kind: 'file', bytes: f.size, encrypted: e2e }, running);
        if (!check.ok) throw new Error(check.reason);
        running = { items: running.items + 1, bytes: running.bytes + f.size };
        jobs.push({ body: { kind: 'file', fileName: f.name, mimeType: f.type || 'application/octet-stream', deviceName: device, pinned: false, expiresInDays: days, fileData: await readFileBase64(f) }, plainBytes: f.size });
      }
      for (const { body } of jobs) {
        if (e2e && key) {
          const payload: Payload = { text: body.text, fileName: body.fileName, mimeType: body.mimeType, fileData: body.fileData };
          if (byteLength(JSON.stringify(payload)) > LIMITS.encryptedPayloadBytes + 20_000) throw new Error('Too large for end-to-end encryption.');
          const encrypted = await encryptJson(key, payload);
          await createDrop({ kind: body.kind, encrypted, deviceName: device, pinned: false, expiresInDays: days }).unwrap();
        } else await createDrop(body).unwrap();
      }
      setText('');
      setFiles([]);
      toast(`Sent ${jobs.length} item${jobs.length === 1 ? '' : 's'}`, 'success');
    } catch (e) {
      const code = apiErrorCode(e);
      setError(e instanceof Error ? e.message : code === 'QUOTA_EXCEEDED' || code ? apiErrorMessage(e) : apiErrorMessage(e, 'Could not send. Check your connection and try again.'));
    }
    setSending(false);
  }, [text, files, e2e, canE2e, key, usage, drops, device, days, createDrop, toast]);

  // Copy the list now: a FileList is live and is emptied when the input value is reset below, before the state updater runs.
  const addFiles = (list: FileList | File[]) => { const picked = Array.from(list); setFiles((cur) => [...cur, ...picked].slice(0, 10)); };

  const run = async (p: Promise<unknown>) => {
    try { await p; } catch (e) { toast(apiErrorMessage(e), 'error'); }
  };

  const listError = live.error ? apiErrorMessage(live.error, 'Could not load your clipboard.') : null;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Banner kind="info">
        Browsers cannot read your clipboard in the background, so sending is manual: paste into the box, drop files, or use the buttons. Items expire automatically.
      </Banner>

      <div
        className={`panel ${s.compose} ${dragging ? s.drag : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
      >
        <Field label="Send text or a link" hint="Paste here, or drop files anywhere in this box. Files up to 10 MB.">
          {(id) => (
            <textarea id={id} className="textarea" dir="auto" value={text} onChange={(e) => setText(e.target.value)}
              onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
              placeholder="Paste text or a link" />
          )}
        </Field>
        {files.length > 0 && (
          <ul className={s.list} aria-label="Files to send">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="row">
                <span dir="auto">{f.name}</span><span className="muted">{formatBytes(f.size)}</span>
                <button type="button" className="btn sm ghost" aria-label={`Remove ${f.name}`} onClick={() => setFiles((c) => c.filter((_, j) => j !== i))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Add files</button>
          <input ref={fileRef} type="file" multiple hidden aria-label="Choose files" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
          <button type="button" className="btn" onClick={async () => {
            try { setText(await navigator.clipboard.readText()); } catch { setError('Clipboard access was blocked. Paste into the box with Ctrl+V (or long-press on a phone).'); }
          }}>Paste from clipboard</button>
          <button type="button" className="btn primary" onClick={() => void send()} disabled={sending}>{sending ? 'Sending...' : 'Send'}</button>
        </div>
        {sending && <ProgressBar label="Sending" />}
        {error && <p className="error-text" role="alert">{error}</p>}

        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="This device is called">
            {(id) => <input id={id} className="input" value={device} maxLength={80} onChange={(e) => { setDevice(e.target.value); writeJson(DEVICE_KEY, e.target.value); }} />}
          </Field>
          <Field label="Delete after (days)" hint="1 to 30, default 7">
            {(id) => <input id={id} className="input" type="number" min={1} max={30} value={days} onChange={(e) => { const v = clampDays(Number(e.target.value)); setDays(v); writeJson(EXPIRY_KEY, v); }} />}
          </Field>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <label className="check">
            <input type="checkbox" checked={e2e} disabled={!canE2e} onChange={(e) => setE2e(e.target.checked)} />
            End-to-end encrypt (up to about 270 KB; only readable on devices with your unlocked vault)
          </label>
          {!canE2e && <button type="button" className="btn sm" onClick={() => setShowVault(true)}>{vault ? 'Unlock vault' : 'Set up vault'}</button>}
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div className="row" role="status" aria-live="polite">
          <span className={s.pill}>{live.connected ? 'Live' : 'Reconnecting, checking every 15 s'}</span>
          <span className="muted">{usage.items} of {LIMITS.items} items, {formatBytes(usage.bytes)} of 100 MB</span>
        </div>
        <div className={s.actions}>
          <button type="button" className="btn" onClick={() => setShowQr(true)}>Open on another device</button>
          <button type="button" className="btn danger" disabled={!drops.some((d) => !d.pinned)} onClick={() => setConfirmClear(true)}>Clear all (keeps pinned)</button>
        </div>
      </div>

      {listError && <ErrorBanner onRetry={() => void live.refetch()}>{listError}</ErrorBanner>}
      {live.isLoading ? (
        <p className="muted" role="status">Loading...</p>
      ) : drops.length === 0 && !listError ? (
        <EmptyState icon="clip" title="Nothing here yet">Send text, a link or a small file from this device, then open this page on another device to receive it.</EmptyState>
      ) : (
        <ul className={s.list} aria-label="Drops">
          {drops.map((d) => (
            <DropCard key={d.id} drop={d} plain={plain[d.id] ?? null} locked={Boolean(d.encrypted) && !key}
              onPin={() => void run(pinDrop({ id: d.id, pinned: !d.pinned }).unwrap())}
              onDelete={() => void run(deleteDrop(d.id).unwrap())} />
          ))}
        </ul>
      )}

      {showQr && <PairingDialog onClose={() => setShowQr(false)} />}
      {showVault && <E2eGate onClose={() => setShowVault(false)} />}
      <ConfirmDialog open={confirmClear} danger title="Clear all unpinned items?" confirmLabel="Clear all"
        message="Everything except pinned items is deleted from all devices."
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => { setConfirmClear(false); void run(clearDrops().unwrap().then((r) => toast(`Removed ${r.removed} items`, 'success'))); }} />
    </div>
  );
}
