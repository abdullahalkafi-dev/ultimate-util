'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Banner, ConfirmDialog, Dialog, EmptyState, ErrorBanner, Field, Icon, ProgressBar, SegmentedControl, useToast } from '@/components/ui';
import { downloadBlob, downloadText, zipFiles } from '@/lib/files';
import { decryptJson, encryptJson, rewrapWithPassphrase, strongEnoughPassphrase } from '@/lib/crypto/vault';
import { getVaultKey, lockVault, setAutoLockMinutes } from '@/lib/crypto/session';
import { useVaultKey } from '@/hooks/useVaultKey';
import { apiErrorCode, apiErrorMessage } from '@/store/api/base';
import { useCreateNoteMutation, useDeleteNoteMutation, useListNotesQuery, useUpdateNoteMutation } from '@/store/api/resources.api';
import { useRewrapVaultMutation } from '@/store/api/vault.api';
import type { EncryptedItemDto } from '@uu/shared';
import { renderMarkdown } from './markdown';
import {
  NOTE_MAX_BYTES, NOTE_WARN_BYTES, byteLength, emptyNote, fileNameFor, isTrashExpired, looksLikeSecret, normalizeTags, searchNotes,
  snippetAround, splitForLimit, withSnapshot, type NotePayload,
} from './notes';
import s from './styles.module.css';

const QUOTA = 500;
type Tab = 'scratch' | 'notes' | 'trash';
type View = 'edit' | 'both' | 'preview';
interface Draft { title: string; body: string; tags: string }
interface Row { id: string; dto: EncryptedItemDto; note: NotePayload | null }

const toDraft = (n: NotePayload): Draft => ({ title: n.title, body: n.body, tags: n.tags.join(', ') });
const MAX_PASTE_BYTES = 200_000;

export default function SecureNotes() {
  const key = useVaultKey();
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useListNotesQuery();
  const [createNote] = useCreateNoteMutation();
  const [updateNote] = useUpdateNoteMutation();
  const [deleteNote] = useDeleteNoteMutation();
  const [rewrap] = useRewrapVaultMutation();

  const [decoded, setDecoded] = useState<Record<string, NotePayload | null>>({});
  const cache = useRef(new Map<string, NotePayload | null>());
  const [tab, setTab] = useState<Tab>('notes');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState<'note' | 'scratch' | null>(null);
  const [draft, setDraft] = useState<Draft>({ title: '', body: '', tags: '' });
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'blocked'>('idle');
  const [saveError, setSaveError] = useState('');
  const [view, setView] = useState<View>('both');
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());
  const [search, setSearch] = useState('');
  const [announce, setAnnounce] = useState('');
  const [pasteWarn, setPasteWarn] = useState(false);
  const [pasteError, setPasteError] = useState('');
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [autoMin, setAutoMin] = useState(5);
  const [blurHidden, setBlurHidden] = useState(false);
  const [hiddenNow, setHiddenNow] = useState(false);
  const [pass, setPass] = useState({ next: '', confirm: '' });
  const [passError, setPassError] = useState('');
  const [passBusy, setPassBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const baseRef = useRef<string>('');
  const dirtyRef = useRef(false);
  const draftRef = useRef(draft);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const idRef = useRef<string | null>(null);
  const creatingRef = useRef<'note' | 'scratch' | null>(null);
  const rowsRef = useRef<Row[]>([]);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const revealTimers = useRef(new Map<number, number>());
  draftRef.current = draft;
  dirtyRef.current = dirty;
  idRef.current = selectedId;
  creatingRef.current = creating;

  // Decrypt only new or changed items; a failure affects only that row.
  useEffect(() => {
    if (!key || !data) return;
    let cancelled = false;
    (async () => {
      const out: Record<string, NotePayload | null> = {};
      const live = new Set<string>();
      for (const d of data) {
        const ck = `${d.id}:${d.updatedAt}`;
        live.add(ck);
        if (!cache.current.has(ck)) {
          try {
            const raw = await decryptJson<Partial<NotePayload>>(key, d.payload);
            cache.current.set(ck, emptyNote({ ...raw, versions: Array.isArray(raw.versions) ? raw.versions : [], tags: Array.isArray(raw.tags) ? raw.tags : [] }));
          } catch {
            cache.current.set(ck, null);
          }
        }
        out[d.id] = cache.current.get(ck) ?? null;
      }
      for (const k of cache.current.keys()) if (!live.has(k)) cache.current.delete(k);
      if (!cancelled) setDecoded(out);
    })();
    return () => { cancelled = true; };
  }, [key, data]);

  useEffect(() => {
    if (!key) { setDecoded({}); cache.current.clear(); setDraft({ title: '', body: '', tags: '' }); setRevealed(new Set()); }
  }, [key]);

  const rows: Row[] = useMemo(() => (data ?? []).map((d) => ({ id: d.id, dto: d, note: decoded[d.id] ?? null })), [data, decoded]);
  rowsRef.current = rows;
  const readable = rows.filter((r): r is Row & { note: NotePayload } => !!r.note);
  const scratch = readable.find((r) => r.note.isScratchpad && !r.note.trashedAt);
  const notes = readable.filter((r) => !r.note.isScratchpad && !r.note.trashedAt).sort((a, b) => Number(b.note.pinned) - Number(a.note.pinned) || b.dto.updatedAt.localeCompare(a.dto.updatedAt));
  const trashed = readable.filter((r) => r.note.trashedAt);
  const broken = rows.filter((r) => !r.note && data && decoded[r.id] === null && r.id in decoded);
  const filtered = useMemo(() => {
    const by = new Map(notes.map((n) => [n.id, n]));
    return searchNotes(notes.map((n) => ({ ...n.note, id: n.id })), search).map((n) => by.get(n.id)!);
  }, [notes, search]);

  // Load the draft when selection changes, or when another device changed the open note while we have no edits.
  const selectedRow = rows.find((r) => r.id === selectedId);
  useEffect(() => {
    if (!selectedRow?.note) return;
    if (dirtyRef.current) return;
    if (baseRef.current === selectedRow.dto.updatedAt) return;
    baseRef.current = selectedRow.dto.updatedAt;
    setDraft(toDraft(selectedRow.note));
  }, [selectedRow]);

  // Purge notes that sat in the trash for over 30 days.
  useEffect(() => {
    const now = Date.now();
    for (const r of trashed) if (r.note.trashedAt && isTrashExpired(r.note.trashedAt, now)) void deleteNote(r.id);
     
  }, [trashed.length]);

  const persist = useCallback(async (payload: NotePayload, id: string | null) => {
    const k = getVaultKey();
    if (!k) throw new Error('locked');
    const ct = await encryptJson(k, payload);
    return id ? updateNote({ id, body: { payload: ct, sortOrder: 0 } }).unwrap() : createNote({ payload: ct, sortOrder: 0 }).unwrap();
  }, [createNote, updateNote]);

  const flush = useCallback(async () => {
    if (!dirtyRef.current) return;
    if (savingRef.current) { pendingRef.current = true; return; }
    const d = draftRef.current;
    if (byteLength(d.body) > NOTE_MAX_BYTES) { setSaveState('blocked'); return; }
    savingRef.current = true;
    setSaveState('saving');
    setSaveError('');
    try {
      const id = idRef.current;
      const prevRow = id ? rowsRef.current.find((r) => r.id === id) : undefined;
      const prev = prevRow?.note ?? null;
      const isScratch = prev?.isScratchpad ?? creatingRef.current === 'scratch';
      const base = prev ?? emptyNote({ isScratchpad: isScratch });
      const mine = { ...base, title: d.title.trim() ? d.title : '', body: d.body, tags: normalizeTags(d.tags) };

      if (prevRow && baseRef.current && prevRow.dto.updatedAt > baseRef.current) {
        // Someone else saved this note since we opened it: keep both, nothing is overwritten.
        const copy = emptyNote({ ...mine, isScratchpad: false, pinned: false, versions: [], title: `${d.title || 'Untitled'} (conflict copy, this device, ${new Date().toLocaleString()})` });
        await persist(copy, null);
        baseRef.current = '';
        setDirty(false);
        dirtyRef.current = false;
        toast('This note changed on another device. Your edit was saved as a conflict copy.', 'info');
        setAnnounce('Conflict copy created.');
        setSaveState('saved');
        return;
      }
      const next = withSnapshot(prev, mine, Date.now());
      const dto = await persist(next, id);
      baseRef.current = dto.updatedAt;
      cache.current.set(`${dto.id}:${dto.updatedAt}`, next);
      if (!id) { setSelectedId(dto.id); setCreating(null); }
      if (JSON.stringify(draftRef.current) === JSON.stringify(d)) { setDirty(false); dirtyRef.current = false; }
      setSaveState('saved');
      setAnnounce('Saved');
    } catch (e) {
      setSaveState('error');
      setSaveError(apiErrorCode(e) === 'QUOTA_EXCEEDED' ? 'You reached the 500-note limit. Delete notes (and empty the trash) or export them.' : e instanceof Error && e.message === 'locked' ? 'The vault is locked.' : apiErrorMessage(e, 'Could not save. Your text is still here; it will retry on the next edit.'));
    } finally {
      savingRef.current = false;
      if (pendingRef.current) { pendingRef.current = false; void flush(); }
    }
  }, [persist, toast]);

  // Debounced autosave (1 s).
  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(() => void flush(), 1000);
    return () => window.clearTimeout(t);
  }, [draft, dirty, flush]);

  // Flush when the tab goes to the background; track visibility for blur; detect device sleep.
  useEffect(() => {
    const vis = () => { setHiddenNow(document.hidden); if (document.hidden) void flush(); else void refetch(); };
    document.addEventListener('visibilitychange', vis);
    let last = Date.now();
    const iv = window.setInterval(() => {
      const t = Date.now();
      if (autoMin > 0 && t - last > autoMin * 60_000) lockVault();
      last = t;
    }, 5000);
    return () => { document.removeEventListener('visibilitychange', vis); window.clearInterval(iv); void flush(); };
  }, [flush, refetch, autoMin]);

  const edit = (patch: Partial<Draft>) => {
    getVaultKey(); // counts as activity for the auto-lock timer
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    dirtyRef.current = true;
  };

  const open = async (id: string) => {
    await flush();
    setSelectedId(id); setCreating(null); setDirty(false); dirtyRef.current = false; baseRef.current = '';
    setRevealed(new Set()); setPasteWarn(false); setPasteError(''); setSaveState('idle');
    const row = rowsRef.current.find((r) => r.id === id);
    if (row?.note) { baseRef.current = row.dto.updatedAt; setDraft(toDraft(row.note)); }
  };

  const newNote = async (kind: 'note' | 'scratch' = 'note') => {
    if (kind === 'note' && rows.length >= QUOTA) { setActionError('You reached the 500-note limit. Delete notes (and empty the trash) or export them.'); return; }
    await flush();
    setTab(kind === 'scratch' ? 'scratch' : 'notes');
    setSelectedId(null); setCreating(kind); setDirty(false); dirtyRef.current = false; baseRef.current = '';
    setDraft({ title: '', body: '', tags: '' }); setSaveState('idle'); setRevealed(new Set());
    setTimeout(() => textRef.current?.focus(), 0);
  };

  const switchTab = async (t: Tab) => {
    setTab(t);
    if (t === 'scratch') { if (scratch) await open(scratch.id); else await newNote('scratch'); }
  };

  const setNoteFlags = async (r: Row & { note: NotePayload }, patch: Partial<NotePayload>) => {
    setActionError('');
    try {
      await persist({ ...r.note, ...patch }, r.id);
    } catch (e) { setActionError(apiErrorMessage(e)); }
  };

  const trash = async (r: Row & { note: NotePayload }) => {
    if (selectedId === r.id) { setDirty(false); dirtyRef.current = false; }
    await setNoteFlags(r, { trashedAt: Date.now() });
    if (selectedId === r.id) { setSelectedId(null); setDraft({ title: '', body: '', tags: '' }); baseRef.current = ''; }
    toast('Moved to Trash. You can restore it for 30 days.', 'success');
  };
  const restore = async (r: Row & { note: NotePayload }) => { await setNoteFlags(r, { trashedAt: null }); toast('Note restored.', 'success'); };
  const removeForever = async (id: string) => {
    setConfirmDelete(null);
    try { await deleteNote(id).unwrap(); if (selectedId === id) { setSelectedId(null); } } catch (e) { setActionError(apiErrorMessage(e)); }
  };
  const emptyTrash = async () => {
    setConfirmEmpty(false);
    try { for (const r of trashed) await deleteNote(r.id).unwrap(); toast('Trash emptied.', 'success'); } catch (e) { setActionError(apiErrorMessage(e)); }
  };

  const restoreVersion = (i: number) => {
    const row = rows.find((r) => r.id === selectedId);
    const v = row?.note?.versions[i];
    if (!v) return;
    // Restoring is an ordinary edit, so the current text is snapshotted as a new version on save.
    edit({ title: v.title, body: v.body });
    setVersionsOpen(false);
    toast('Version restored into the editor. It is saved as a new version.', 'success');
  };

  const maskSelection = () => {
    const el = textRef.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    if (a === b) { toast('Select some text first.', 'info'); return; }
    edit({ body: `${draft.body.slice(0, a)}||${draft.body.slice(a, b)}||${draft.body.slice(b)}` });
  };

  const splitNote = async () => {
    const [first, rest] = splitForLimit(draft.body);
    if (!rest) return;
    try {
      await persist(emptyNote({ title: `${draft.title || 'Untitled'} (part 2)`, body: rest, tags: normalizeTags(draft.tags) }), null);
      edit({ body: first });
      toast('The rest of the text was saved as a new note.', 'success');
    } catch (e) { setActionError(apiErrorMessage(e)); }
  };

  const exportOne = () => downloadText(draft.body, fileNameFor(draft.title), 'text/markdown');
  const exportAll = async () => {
    const files = readable.map((r) => ({ name: fileNameFor(r.note.title || (r.note.isScratchpad ? 'scratchpad' : 'untitled')), data: new TextEncoder().encode(r.note.body) }));
    if (!files.length) return;
    downloadBlob(await zipFiles(files), `ultimate-util-notes-${new Date().toISOString().slice(0, 10)}.zip`);
    toast('Exported decrypted notes. Keep this file safe: it is not encrypted.', 'info');
  };

  const changePassphrase = async () => {
    setPassError('');
    const k = getVaultKey();
    if (!k) { setPassError('The vault is locked.'); return; }
    if (pass.next !== pass.confirm) { setPassError('The two passphrases do not match.'); return; }
    const strength = strongEnoughPassphrase(pass.next);
    if (!strength.ok) { setPassError(strength.message); return; }
    setPassBusy(true);
    try {
      await rewrap(await rewrapWithPassphrase(k, pass.next)).unwrap();
      setPass({ next: '', confirm: '' });
      setSettingsOpen(false);
      toast('Passphrase changed. Your notes were not re-uploaded.', 'success');
    } catch (e) { setPassError(apiErrorMessage(e)); }
    setPassBusy(false);
  };

  const html = useMemo(() => (view === 'edit' ? '' : renderMarkdown(draft.body, revealed)), [draft.body, revealed, view]);
  const deferredHtml = useDeferredValue(html);

  const toggleSecret = (i: number) => {
    setRevealed((cur) => {
      const next = new Set(cur);
      if (next.has(i)) { next.delete(i); return next; }
      next.add(i);
      window.clearTimeout(revealTimers.current.get(i));
      revealTimers.current.set(i, window.setTimeout(() => setRevealed((c) => { const n = new Set(c); n.delete(i); return n; }), 15_000));
      return next;
    });
  };
  const onPreviewClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    const sec = t.closest<HTMLElement>('button[data-secret]');
    if (sec) { toggleSecret(Number(sec.dataset.secret)); return; }
    const a = t.closest<HTMLAnchorElement>('a');
    if (a) {
      e.preventDefault();
      const href = a.getAttribute('href') ?? '';
      if (/^https?:\/\//i.test(href) && window.confirm(`Open this external link?\n${href}`)) window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  const onRootKey = (e: React.KeyboardEvent) => {
    getVaultKey();
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'n' && !e.shiftKey) { e.preventDefault(); void newNote('note'); }
    else if (k === 'l') { e.preventDefault(); lockVault(); }
    else if (k === 'f') { e.preventDefault(); searchRef.current?.focus(); }
  };

  if (!key) return <Banner kind="warn">The vault is locked. Unlock it to open your notes.</Banner>;

  const bytes = byteLength(draft.body);
  const hasEditor = selectedId !== null || creating !== null;
  const current = rows.find((r) => r.id === selectedId)?.note ?? null;
  const used = rows.length;
  const listRows = tab === 'trash' ? trashed : filtered;
  const blurred = blurHidden && hiddenNow;

  return (
    <div className="stack" style={{ gap: 12, filter: blurred ? 'blur(8px)' : undefined }} onKeyDownCapture={onRootKey} onPointerDownCapture={() => getVaultKey()}>
      <div className="sr-only" aria-live="polite">{announce}</div>
      {isError && <ErrorBanner onRetry={() => void refetch()}>{apiErrorMessage(error, 'Could not load your notes.')}</ErrorBanner>}
      {actionError && <ErrorBanner onDismiss={() => setActionError('')}>{actionError}</ErrorBanner>}
      {used >= QUOTA * 0.8 && <Banner kind={used >= QUOTA ? 'error' : 'warn'}>{used}/{QUOTA} notes used (the trash counts until emptied).</Banner>}

      <div className="row">
        <SegmentedControl label="Section" value={tab} onChange={(t) => void switchTab(t)} options={[{ id: 'scratch', label: 'Scratchpad' }, { id: 'notes', label: 'Notes' }, { id: 'trash', label: `Trash${trashed.length ? ` (${trashed.length})` : ''}` }]} />
        <button type="button" className="btn primary" onClick={() => void newNote('note')}><Icon name="plus" /> New note</button>
        <button type="button" className="btn" onClick={() => setSettingsOpen(true)}><Icon name="key" /> Settings</button>
        <button type="button" className="btn" onClick={() => void exportAll()} disabled={!readable.length}><Icon name="download" /> Export all (.zip)</button>
        <button type="button" className="btn" onClick={lockVault}><Icon name="lock" /> Lock now</button>
      </div>

      <div className={s.layout}>
        {tab !== 'scratch' && (
          <aside className="stack" aria-label="Note list">
            {tab === 'notes' && (
              <Field label="Search notes" hint="Searches decrypted notes on this device only.">
                {(id) => <input id={id} ref={searchRef} className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />}
              </Field>
            )}
            {tab === 'trash' && trashed.length > 0 && <button type="button" className="btn sm danger" onClick={() => setConfirmEmpty(true)}>Empty trash</button>}
            {isLoading && <ProgressBar label="Loading and decrypting..." />}
            <ul className={s.list}>
              {listRows.map((r) => (
                <li key={r.id}>
                  <button type="button" className={s.item} aria-current={selectedId === r.id} onClick={() => void open(r.id)}>
                    <div className={s.itemTitle} dir="auto">{r.note.pinned ? '* ' : ''}{r.note.title || 'Untitled'}{r.note.title.includes('(conflict copy') && ' [Conflict]'}</div>
                    <div className={s.itemSub} dir="auto">{search ? snippetAround(r.note.body, search) : r.note.tags.map((t) => `#${t}`).join(' ') || new Date(r.dto.updatedAt).toLocaleDateString()}</div>
                  </button>
                </li>
              ))}
              {tab === 'notes' && broken.map((r) => (
                <li key={r.id} className="panel">
                  <strong>Cannot decrypt</strong>
                  <div className="hint">This note is damaged or from another vault.</div>
                  <button type="button" className="btn sm danger" onClick={() => setConfirmDelete(r.id)}>Delete</button>
                </li>
              ))}
            </ul>
            {!isLoading && listRows.length === 0 && (
              tab === 'trash' ? <p className="muted">Trash is empty. Items are removed after 30 days.</p>
                : search ? <p className="muted">No notes match.</p>
                  : <EmptyState icon="note" title="No notes yet"><button type="button" className="btn primary" onClick={() => void newNote('note')}>Write your first note</button></EmptyState>
            )}
          </aside>
        )}

        <section className={s.editor} style={tab === 'scratch' ? { gridColumn: '1 / -1' } : undefined} aria-label="Editor">
          {!hasEditor && tab !== 'scratch' && <p className="muted">Select a note or create a new one.</p>}
          {hasEditor && (
            <>
              {tab === 'scratch' ? <h2 className="panel-title" style={{ margin: 0 }}>Scratchpad</h2> : (
                <Field label="Title">{(id) => <input id={id} className="input" dir="auto" value={draft.title} onChange={(e) => edit({ title: e.target.value })} />}</Field>
              )}
              {tab !== 'scratch' && <Field label="Tags" hint="Comma separated">{(id) => <input id={id} className="input" value={draft.tags} onChange={(e) => edit({ tags: e.target.value })} />}</Field>}
              <div className="row">
                <SegmentedControl label="View" value={view} onChange={setView} options={[{ id: 'edit', label: 'Edit' }, { id: 'both', label: 'Split' }, { id: 'preview', label: 'Preview' }]} />
                <button type="button" className="btn sm" onClick={maskSelection}><Icon name="eye" /> Mask selection</button>
                <button type="button" className="btn sm" onClick={exportOne} disabled={!draft.body}><Icon name="download" /> Export .md</button>
                {current && (
                  <>
                    <button type="button" className="btn sm" onClick={() => setVersionsOpen(true)} disabled={!current.versions.length}><Icon name="clock" /> History ({current.versions.length})</button>
                    {!current.isScratchpad && <button type="button" className="btn sm" onClick={() => void setNoteFlags({ id: selectedId!, dto: rows.find((r) => r.id === selectedId)!.dto, note: current }, { pinned: !current.pinned })}>{current.pinned ? 'Unpin' : 'Pin'}</button>}
                    {!current.isScratchpad && <button type="button" className="btn sm danger" onClick={() => void trash({ id: selectedId!, dto: rows.find((r) => r.id === selectedId)!.dto, note: current })}><Icon name="trash" /> Trash</button>}
                  </>
                )}
              </div>
              {pasteWarn && <Banner kind="info" onDismiss={() => setPasteWarn(false)}>That looks like a secret. Select it and use Mask selection (or wrap it in ||double bars||) to hide it in the preview.</Banner>}
              {pasteError && <ErrorBanner onDismiss={() => setPasteError('')}>{pasteError}</ErrorBanner>}
              {saveState === 'blocked' && (
                <ErrorBanner>
                  This note is over 50 KB and cannot be saved. Nothing was cut.{' '}
                  <button type="button" className="btn sm" onClick={() => void splitNote()}>Split into two notes</button>
                </ErrorBanner>
              )}
              {saveState === 'error' && <ErrorBanner onRetry={() => void flush()}>{saveError} Your text is kept in the editor.</ErrorBanner>}
              {tab === 'trash' && <Banner kind="info">This note is in the trash. <button type="button" className="btn sm" onClick={() => { const r = rows.find((x) => x.id === selectedId); if (r?.note) void restore({ ...r, note: r.note }); }}>Restore</button> <button type="button" className="btn sm danger" onClick={() => selectedId && setConfirmDelete(selectedId)}>Delete forever</button></Banner>}
              <div className={`${s.panes} ${view !== 'both' ? s.one : ''}`}>
                {view !== 'preview' && (
                  <Field label="Markdown">
                    {(id) => (
                      <textarea id={id} ref={textRef} className={`textarea ${s.area}`} dir="auto" spellCheck value={draft.body} readOnly={tab === 'trash'}
                        onChange={(e) => edit({ body: e.target.value })}
                        onPaste={(e) => {
                          const t = e.clipboardData.getData('text');
                          if (byteLength(t) > MAX_PASTE_BYTES) { e.preventDefault(); setPasteError('That paste is too large (over 200 KB) and was not added. Notes are limited to 50 KB.'); return; }
                          if (looksLikeSecret(t)) setPasteWarn(true);
                        }} />
                    )}
                  </Field>
                )}
                {view !== 'edit' && (
                  // Output of renderMarkdown is DOMPurify-sanitized; images are never loaded.
                  <div className={s.preview} aria-label="Preview" onClick={onPreviewClick} dangerouslySetInnerHTML={{ __html: deferredHtml }} />
                )}
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className={bytes > NOTE_MAX_BYTES ? s.over : bytes >= NOTE_WARN_BYTES ? s.near : 'hint'}>{bytes.toLocaleString()} / {NOTE_MAX_BYTES.toLocaleString()} bytes</span>
                <span className="hint" role="status">{saveState === 'saving' ? 'Saving...' : dirty ? 'Unsaved changes' : saveState === 'saved' ? 'Saved (encrypted)' : 'Encrypted on this device'}</span>
              </div>
            </>
          )}
        </section>
      </div>

      <Dialog open={versionsOpen} title="Version history" onClose={() => setVersionsOpen(false)} actions={<button type="button" className="btn" onClick={() => setVersionsOpen(false)}>Close</button>}>
        <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
          {(current?.versions ?? []).slice().reverse().map((v, ri, arr) => {
            const i = arr.length - 1 - ri;
            return (
              <li key={v.savedAt} className="panel">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{new Date(v.savedAt).toLocaleString()}</strong>
                  <button type="button" className="btn sm" onClick={() => restoreVersion(i)}>Restore</button>
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', margin: '6px 0 0' }} dir="auto">{v.body.slice(0, 600)}</pre>
              </li>
            );
          })}
        </ul>
        <p className="hint">The last 10 snapshots (at most one per 5 minutes) are kept inside the note. Large notes keep fewer because of the encrypted size limit.</p>
      </Dialog>

      <Dialog open={settingsOpen} title="Notes settings" onClose={() => setSettingsOpen(false)} actions={<button type="button" className="btn" onClick={() => setSettingsOpen(false)}>Done</button>}>
        <div className="stack">
          <Field label="Auto-lock after inactivity">
            {(id) => (
              <select id={id} className="select" value={autoMin} onChange={(e) => { const m = Number(e.target.value); setAutoMin(m); setAutoLockMinutes(m); }}>
                {[1, 5, 15, 30, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                <option value={0}>Never (until the tab closes)</option>
              </select>
            )}
          </Field>
          <label className="row"><input type="checkbox" checked={blurHidden} onChange={(e) => setBlurHidden(e.target.checked)} /> Blur notes when this tab is not focused</label>
          <h3 className="panel-title">Change vault passphrase</h3>
          <p className="hint">Only the key that wraps your data key changes. Notes are not re-encrypted or re-uploaded. The old passphrase stops working; your recovery key is unchanged.</p>
          {passError && <ErrorBanner>{passError}</ErrorBanner>}
          <Field label="New passphrase">{(id) => <input id={id} className="input" type="password" autoComplete="new-password" value={pass.next} onChange={(e) => setPass({ ...pass, next: e.target.value })} />}</Field>
          <Field label="Repeat new passphrase">{(id) => <input id={id} className="input" type="password" autoComplete="new-password" value={pass.confirm} onChange={(e) => setPass({ ...pass, confirm: e.target.value })} />}</Field>
          <button type="button" className="btn primary" disabled={passBusy || !pass.next} onClick={() => void changePassphrase()}>{passBusy ? 'Changing...' : 'Change passphrase'}</button>
        </div>
      </Dialog>

      <ConfirmDialog open={confirmDelete !== null} danger title="Delete permanently?" confirmLabel="Delete" message="This cannot be undone."
        onConfirm={() => confirmDelete && void removeForever(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
      <ConfirmDialog open={confirmEmpty} danger title="Empty the trash?" confirmLabel="Empty trash" message={`${trashed.length} note(s) will be deleted permanently.`}
        onConfirm={() => void emptyTrash()} onCancel={() => setConfirmEmpty(false)} />
    </div>
  );
}
