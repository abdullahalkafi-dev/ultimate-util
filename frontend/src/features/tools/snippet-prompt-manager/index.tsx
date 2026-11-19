'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Banner, ConfirmDialog, Dialog, EmptyState, ErrorBanner, Field, Icon, ProgressBar, SegmentedControl, useToast } from '@/components/ui';
import { downloadText } from '@/lib/files';
import { readJson, writeJson } from '@/lib/storage';
import { apiErrorCode, apiErrorMessage } from '@/store/api/base';
import {
  useCreateSnippetMutation, useDeleteSnippetMutation, useListSnippetsQuery, useUpdateSnippetMutation,
} from '@/store/api/resources.api';
import type { SnippetBody, SnippetDto } from '@uu/shared';
import { LANGUAGE_OPTIONS, guessLanguage, highlight } from './highlight';
import {
  EXTENSIONS, MAX_BODY_BYTES, QUOTA, WARN_BODY_BYTES, bodyBytes, buildExport, detectSecret, fillVariables, findDuplicate, fuzzySearch, guessKind,
  isTrashExpired, isTrashed, parseImport, parseVariables, titleFromBody, trashFolder, untrashFolder,
} from './snippets';
import s from './styles.module.css';

type Kind = SnippetBody['kind'];
type Filter = { type: 'all' } | { type: 'fav' } | { type: 'kind'; kind: Kind } | { type: 'folder'; name: string } | { type: 'tag'; name: string } | { type: 'trash' };
interface Draft { id: string | null; title: string; kind: Kind; language: string; languageSet: boolean; description: string; body: string; tags: string; folder: string; isFavorite: boolean }

const newDraft = (over: Partial<Draft> = {}): Draft => ({ id: null, title: '', kind: 'code', language: 'text', languageSet: false, description: '', body: '', tags: '', folder: '', isFavorite: false, ...over });
const VARS_KEY = 'uu.snippets.lastValues';
const toBody = (d: Draft): SnippetBody => ({
  title: d.title.trim() || titleFromBody(d.body), kind: d.kind, language: d.language, description: d.description, body: d.body,
  tags: Array.from(new Set(d.tags.split(',').map((t) => t.trim()).filter(Boolean))).slice(0, 20), folder: d.folder.trim(), isFavorite: d.isFavorite,
});
const bodyOf = (x: SnippetDto): SnippetBody => ({ title: x.title, kind: x.kind, language: x.language, description: x.description, body: x.body, tags: x.tags, folder: x.folder, isFavorite: x.isFavorite });

function CodeView({ body, language, kind }: { body: string; language: string; kind: Kind }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    setHtml(null);
    if (kind === 'prompt') return;
    void highlight(body, language).then((h) => { if (!cancel) setHtml(h); });
    return () => { cancel = true; };
  }, [body, language, kind]);
  if (kind === 'prompt' || html === null) return <pre className={`${s.code} ${kind === 'prompt' ? s.prompt : ''}`} dir="auto">{body}</pre>;
  // hljs output is HTML-escaped; plain fallback escapes manually.
  return <pre className={s.code} dir="auto"><code dangerouslySetInnerHTML={{ __html: html }} /></pre>;
}

export default function SnippetManager() {
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useListSnippetsQuery();
  const [createSnippet] = useCreateSnippetMutation();
  const [updateSnippet] = useUpdateSnippetMutation();
  const [deleteSnippet] = useDeleteSnippetMutation();

  const [filter, setFilter] = useState<Filter>({ type: 'all' });
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fillOpen, setFillOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importState, setImportState] = useState<{ valid: SnippetBody[]; invalid: number; dupes: number } | null>(null);
  const [importError, setImportError] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [announce, setAnnounce] = useState('');
  const [secretIgnored, setSecretIgnored] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const t = window.setTimeout(() => setDebounced(query), 150); return () => window.clearTimeout(t); }, [query]);

  const all = useMemo(() => data ?? [], [data]);
  const live = useMemo(() => all.filter((x) => !isTrashed(x.folder)), [all]);
  const trashed = useMemo(() => all.filter((x) => isTrashed(x.folder)), [all]);

  // Purge items that sat in the trash for over 30 days.
  useEffect(() => {
    const now = Date.now();
    for (const x of trashed) if (isTrashExpired(x.updatedAt, now)) void deleteSnippet(x.id);
     
  }, [trashed.length]);

  const folders = useMemo(() => Array.from(new Set(live.map((x) => x.folder).filter(Boolean))).sort(), [live]);
  const tags = useMemo(() => Array.from(new Set(live.flatMap((x) => x.tags))).sort(), [live]);

  const pool = filter.type === 'trash' ? trashed : live;
  const shown = useMemo(() => {
    let items = pool.filter((x) => {
      switch (filter.type) {
        case 'fav': return x.isFavorite;
        case 'kind': return x.kind === filter.kind;
        case 'folder': return x.folder === filter.name;
        case 'tag': return x.tags.includes(filter.name);
        default: return true;
      }
    });
    items = fuzzySearch(items, debounced);
    if (!debounced.trim()) items = [...items].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || b.updatedAt.localeCompare(a.updatedAt));
    return items;
  }, [pool, filter, debounced]);

  const selected = all.find((x) => x.id === selectedId) ?? null;
  const variables = useMemo(() => (selected ? parseVariables(selected.body) : []), [selected]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied', 'success');
      setAnnounce('Copied to clipboard');
    } catch {
      toast('Could not copy automatically. Select the text and press Ctrl+C.', 'error');
    }
  };

  const onCopy = () => {
    if (!selected) return;
    if (selected.kind === 'prompt' && variables.length) {
      const last = readJson<Record<string, Record<string, string>>>(VARS_KEY, {})[selected.id] ?? {};
      setValues(Object.fromEntries(variables.map((v) => [v.name, last[v.name] ?? ''])));
      setFillOpen(true);
    } else void copy(selected.body);
  };
  const finishFill = () => {
    if (!selected) return;
    const all2 = readJson<Record<string, Record<string, string>>>(VARS_KEY, {});
    all2[selected.id] = values;
    writeJson(VARS_KEY, all2);
    void copy(fillVariables(selected.body, values));
    setFillOpen(false);
  };

  const dup = useMemo(() => (draft && draft.body ? findDuplicate(live, draft.body, draft.id ?? undefined) : undefined), [draft, live]);
  const secret = useMemo(() => (draft ? detectSecret(`${draft.body}\n${draft.description}`) : null), [draft]);
  const bytes = draft ? bodyBytes(draft.body) : 0;

  const setBody = (body: string) => setDraft((d) => {
    if (!d) return d;
    const next = { ...d, body };
    if (!d.languageSet && d.kind !== 'prompt') next.language = guessLanguage(body);
    return next;
  });

  const startNew = (over: Partial<Draft> = {}) => {
    if (live.length >= QUOTA) { setActionError('You reached the 1,000-snippet limit. Export snippets and empty the trash or delete some.'); return; }
    setFormError(''); setSecretIgnored(false); setDraft(newDraft(over));
  };

  const quickAdd = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { setPasteOpen(true); return; }
      startFromText(text);
    } catch { setPasteOpen(true); } // permission denied or unsupported: manual paste box
  };
  const startFromText = (text: string) => {
    const kind = guessKind(text);
    startNew({ body: text, kind, language: kind === 'prompt' ? 'text' : guessLanguage(text), title: titleFromBody(text) });
    setPasteOpen(false); setPasteText('');
  };

  const startEdit = (x: SnippetDto) => {
    setFormError(''); setSecretIgnored(false);
    setDraft({ id: x.id, title: x.title, kind: x.kind, language: x.language, languageSet: true, description: x.description, body: x.body, tags: x.tags.join(', '), folder: x.folder, isFavorite: x.isFavorite });
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.body.trim()) { setFormError('The body is empty. Add some text to save.'); return; }
    if (bytes > MAX_BODY_BYTES) { setFormError('This snippet is over 100 KB. Split it into smaller snippets.'); return; }
    setBusy(true); setFormError('');
    try {
      const body = toBody(draft);
      const result = draft.id ? await updateSnippet({ id: draft.id, body }).unwrap() : await createSnippet(body).unwrap();
      setSelectedId(result.id);
      setDraft(null);
      toast('Saved', 'success');
    } catch (e) {
      setFormError(apiErrorCode(e) === 'QUOTA_EXCEEDED' ? 'You reached the 1,000-snippet limit. Delete some or export them.' : apiErrorMessage(e));
    }
    setBusy(false);
  };

  const patch = async (x: SnippetDto, over: Partial<SnippetBody>) => {
    setActionError('');
    try { await updateSnippet({ id: x.id, body: { ...bodyOf(x), ...over } }).unwrap(); } catch (e) { setActionError(apiErrorMessage(e)); }
  };
  const trash = async (x: SnippetDto) => { await patch(x, { folder: trashFolder(x.folder) }); toast('Moved to Trash (30 days).', 'success'); if (selectedId === x.id) setSelectedId(null); };
  const restore = async (x: SnippetDto) => { await patch(x, { folder: untrashFolder(x.folder) }); toast('Restored.', 'success'); };
  const removeForever = async (id: string) => {
    setConfirmDelete(null);
    try { await deleteSnippet(id).unwrap(); if (selectedId === id) setSelectedId(null); } catch (e) { setActionError(apiErrorMessage(e)); }
  };
  const emptyTrash = async () => {
    setConfirmEmpty(false);
    try { for (const x of trashed) await deleteSnippet(x.id).unwrap(); toast('Trash emptied.', 'success'); } catch (e) { setActionError(apiErrorMessage(e)); }
  };

  const exportAll = () => {
    downloadText(buildExport(live.map(bodyOf)), `ultimate-util-snippets-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    const flagged = live.filter((x) => detectSecret(x.body)).length;
    toast(flagged ? `Exported. ${flagged} snippet(s) look like they hold a secret; the file is plain text.` : 'Exported.', flagged ? 'info' : 'success');
  };
  const downloadOne = (x: SnippetDto) => {
    const ext = EXTENSIONS[x.language] ?? 'txt';
    const base = x.title.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 50) || 'snippet';
    downloadText(x.body, ext === 'Dockerfile' ? 'Dockerfile' : `${base}.${ext}`);
  };

  const onImportFile = async (f: File | undefined) => {
    setImportError(''); setImportState(null);
    if (!f) return;
    try {
      const r = parseImport(await f.text());
      const dupes = r.valid.filter((b) => findDuplicate(all, b.body)).length;
      setImportState({ ...r, dupes });
    } catch (e) { setImportError((e as Error).message); }
  };
  const runImport = async () => {
    if (!importState) return;
    setBusy(true); setImportError('');
    const todo = importState.valid.filter((b) => !findDuplicate(all, b.body));
    let done = 0;
    try {
      for (const b of todo) {
        if (live.length + done >= QUOTA) throw Object.assign(new Error('quota'), { quota: true });
        await createSnippet(b).unwrap();
        done++;
      }
      toast(`Imported ${done} snippet(s).`, 'success');
      setImportOpen(false); setImportState(null);
    } catch (e) {
      const q = (e as { quota?: boolean }).quota || apiErrorCode(e) === 'QUOTA_EXCEEDED';
      setImportError(`${done} imported. ${q ? `Stopped at the 1,000-snippet limit; ${todo.length - done} skipped.` : apiErrorMessage(e)}`);
    }
    setBusy(false);
  };

  // Keyboard: "/" focuses search, "n" opens a new snippet (when not typing).
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || e.ctrlKey || e.metaKey) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && selected && !draft) { e.preventDefault(); onCopy(); }
      return;
    }
    if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); } else if (e.key.toLowerCase() === 'n' && !draft) { e.preventDefault(); startNew(); }
  };

  const filterLabel = (f: Filter) => f.type === 'all' ? 'All' : f.type === 'fav' ? 'Favorites' : f.type === 'trash' ? 'Trash' : f.type === 'kind' ? f.kind : f.name;
  const filterValue = filter.type === 'kind' ? `kind:${filter.kind}` : filter.type === 'folder' ? `folder:${filter.name}` : filter.type === 'tag' ? `tag:${filter.name}` : filter.type;
  const onFilter = (v: string) => {
    if (v === 'all' || v === 'fav' || v === 'trash') setFilter({ type: v });
    else { const [t, ...rest] = v.split(':'); const name = rest.join(':'); setFilter(t === 'kind' ? { type: 'kind', kind: name as Kind } : t === 'folder' ? { type: 'folder', name } : { type: 'tag', name }); }
  };

  return (
    <div className="stack" style={{ gap: 12 }} onKeyDown={onKey}>
      <div className="sr-only" aria-live="polite">{announce}</div>
      <Banner kind="info">Snippets are saved to your account and are readable by the service (not end-to-end encrypted). Put secrets in Secure Notes instead.</Banner>
      {isError && <ErrorBanner onRetry={() => void refetch()}>{apiErrorMessage(error, 'Could not load your snippets.')}</ErrorBanner>}
      {actionError && <ErrorBanner onDismiss={() => setActionError('')}>{actionError}</ErrorBanner>}
      {live.length >= QUOTA * 0.8 && <Banner kind={live.length >= QUOTA ? 'error' : 'warn'}>{live.length}/{QUOTA} snippets used. {live.length >= QUOTA ? 'Export and delete some to add more.' : ''}</Banner>}

      <div className="row">
        <button type="button" className="btn primary" onClick={() => startNew()}><Icon name="plus" /> New</button>
        <button type="button" className="btn" onClick={() => void quickAdd()}><Icon name="clip" /> Add from clipboard</button>
        <button type="button" className="btn" onClick={() => { setImportOpen(true); setImportState(null); setImportError(''); }}><Icon name="upload" /> Import</button>
        <button type="button" className="btn" onClick={exportAll} disabled={!live.length}><Icon name="download" /> Export JSON</button>
      </div>

      <div className={s.layout}>
        <aside className={s.side} aria-label="Snippet list">
          <Field label="Search" hint="Press / to focus. Typos are tolerated.">
            {(id) => <input id={id} ref={searchRef} className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />}
          </Field>
          <Field label="Show">
            {(id) => (
              <select id={id} className="select" value={filterValue} onChange={(e) => onFilter(e.target.value)}>
                <option value="all">All ({live.length})</option>
                <option value="fav">Favorites</option>
                <optgroup label="Type"><option value="kind:code">Code</option><option value="kind:command">Commands</option><option value="kind:prompt">Prompts</option></optgroup>
                {folders.length > 0 && <optgroup label="Folders">{folders.map((f) => <option key={f} value={`folder:${f}`}>{f}</option>)}</optgroup>}
                {tags.length > 0 && <optgroup label="Tags">{tags.map((t) => <option key={t} value={`tag:${t}`}>#{t}</option>)}</optgroup>}
                <option value="trash">Trash ({trashed.length})</option>
              </select>
            )}
          </Field>
          {filter.type === 'trash' && trashed.length > 0 && <button type="button" className="btn sm danger" onClick={() => setConfirmEmpty(true)}>Empty trash</button>}
          {isLoading && <ProgressBar label="Loading snippets..." />}
          <ul className={s.list} aria-label={filterLabel(filter)}>
            {shown.map((x) => (
              <li key={x.id}>
                <button type="button" className={s.item} aria-current={selectedId === x.id} onClick={() => setSelectedId(x.id)}>
                  <div className={s.itemTitle} dir="auto">{x.isFavorite ? '* ' : ''}{x.title}</div>
                  <div className={s.itemSub}>{x.kind} · {x.language}{x.tags.length ? ` · ${x.tags.map((t) => `#${t}`).join(' ')}` : ''}</div>
                </button>
              </li>
            ))}
          </ul>
          {!isLoading && shown.length === 0 && (
            all.length === 0 ? (
              <EmptyState icon="code" title="No snippets yet">
                <div className="stack" style={{ alignItems: 'center' }}>
                  <button type="button" className="btn primary" onClick={() => startNew()}>New snippet</button>
                  <button type="button" className="btn" onClick={() => startNew({ kind: 'command', language: 'bash', title: 'Undo last commit', body: 'git reset --soft HEAD~1', tags: 'git' })}>Starter: git command</button>
                  <button type="button" className="btn" onClick={() => startNew({ kind: 'prompt', title: 'Summarize text', body: 'Summarize the following text in a {{tone:formal,casual|formal}} tone, in {{length|3}} sentences:\n\n{{text}}', tags: 'ai' })}>Starter: prompt with variables</button>
                </div>
              </EmptyState>
            ) : <p className="muted">{filter.type === 'trash' ? 'Trash is empty. Items are removed after 30 days.' : 'No snippets match.'}</p>
          )}
        </aside>

        <section aria-label="Snippet detail" className="stack" style={{ minWidth: 0 }}>
          {!selected && <p className="muted">Select a snippet, or create one.</p>}
          {selected && (
            <>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 className="panel-title" style={{ margin: 0 }} dir="auto">{selected.title}</h2>
                <span className="hint">{selected.kind} · {selected.language}{selected.folder && !isTrashed(selected.folder) ? ` · ${selected.folder}` : ''}</span>
              </div>
              {selected.description && <p dir="auto">{selected.description}</p>}
              {detectSecret(selected.body) && <Banner kind="warn">This snippet looks like it contains {detectSecret(selected.body)}. It is stored readable by the service; consider moving it to Secure Notes.</Banner>}
              <CodeView body={selected.body} language={selected.language} kind={selected.kind} />
              {selected.tags.length > 0 && <div className="row">{selected.tags.map((t) => <span key={t} className="tag local">#{t}</span>)}</div>}
              <div className={`row ${s.sticky}`}>
                {isTrashed(selected.folder) ? (
                  <>
                    <button type="button" className="btn primary" onClick={() => void restore(selected)}>Restore</button>
                    <button type="button" className="btn danger" onClick={() => setConfirmDelete(selected.id)}>Delete forever</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn primary" onClick={onCopy}><Icon name="copy" /> {selected.kind === 'prompt' && variables.length ? 'Fill and copy' : 'Copy'}</button>
                    <button type="button" className="btn" aria-pressed={selected.isFavorite} onClick={() => void patch(selected, { isFavorite: !selected.isFavorite })}><Icon name="star" /> {selected.isFavorite ? 'Unfavorite' : 'Favorite'}</button>
                    <button type="button" className="btn" onClick={() => startEdit(selected)}><Icon name="edit" /> Edit</button>
                    <button type="button" className="btn" onClick={() => downloadOne(selected)}><Icon name="download" /> Download</button>
                    <button type="button" className="btn danger" onClick={() => void trash(selected)}><Icon name="trash" /> Trash</button>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <Dialog open={draft !== null} title={draft?.id ? 'Edit snippet' : 'New snippet'} onClose={() => setDraft(null)} locked={busy}
        actions={<><button type="button" className="btn" onClick={() => setDraft(null)}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving...' : 'Save'}</button></>}>
        {draft && (
          <div className="stack">
            {formError && <ErrorBanner>{formError}</ErrorBanner>}
            {secret && !secretIgnored && (
              <Banner kind="warn" onDismiss={() => setSecretIgnored(true)}>This looks like {secret}. Snippets are not end-to-end encrypted. Save it in Secure Notes instead, or dismiss this and save anyway.</Banner>
            )}
            {dup && <Banner kind="info">A similar snippet exists: &quot;{dup.title}&quot;. <button type="button" className="btn sm" onClick={() => { setSelectedId(dup.id); setDraft(null); }}>Open it</button> or save anyway.</Banner>}
            <Field label="Title" hint="Leave empty to use the first line.">{(id) => <input id={id} className="input" dir="auto" maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />}</Field>
            <SegmentedControl label="Type" value={draft.kind} onChange={(k) => setDraft({ ...draft, kind: k })} options={[{ id: 'code', label: 'Code' }, { id: 'command', label: 'Command' }, { id: 'prompt', label: 'Prompt' }]} />
            <Field label="Body" hint={draft.kind === 'prompt' ? 'Use {{name}}, {{name|default}} or {{name:a,b}} for variables. Escape a literal with \\{{.' : undefined} error={bytes > MAX_BODY_BYTES ? 'Over 100 KB.' : undefined}>
              {(id) => <textarea id={id} className={`textarea ${s.area}`} dir="auto" spellCheck={false} value={draft.body} onChange={(e) => setBody(e.target.value)} />}
            </Field>
            <div className="hint">{bytes.toLocaleString()} bytes{bytes > WARN_BODY_BYTES ? ' (large, the limit is 100 KB)' : ''}</div>
            <Field label="Language" hint={draft.languageSet ? undefined : 'Guessed from the text. Change it to set it yourself.'}>
              {(id) => (
                <select id={id} className="select" value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value, languageSet: true })}>
                  {LANGUAGE_OPTIONS.map((l) => <option key={l} value={l}>{l}{!draft.languageSet && l === draft.language ? ' (guessed)' : ''}</option>)}
                </select>
              )}
            </Field>
            <Field label="Description">{(id) => <input id={id} className="input" dir="auto" maxLength={2000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />}</Field>
            <Field label="Tags" hint="Comma separated, up to 20">{(id) => <input id={id} className="input" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />}</Field>
            <Field label="Folder">
              {(id) => (<><input id={id} className="input" list="uu-snip-folders" maxLength={80} value={draft.folder} onChange={(e) => setDraft({ ...draft, folder: e.target.value.replace(/^\.trash\/?/, '') })} /><datalist id="uu-snip-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist></>)}
            </Field>
            <label className="row"><input type="checkbox" checked={draft.isFavorite} onChange={(e) => setDraft({ ...draft, isFavorite: e.target.checked })} /> Favorite</label>
          </div>
        )}
      </Dialog>

      <Dialog open={fillOpen} title="Fill in the variables" onClose={() => setFillOpen(false)}
        actions={<><button type="button" className="btn" onClick={() => { if (selected) void copy(selected.body); setFillOpen(false); }}>Copy raw</button><button type="button" className="btn primary" onClick={finishFill}>Copy result</button></>}>
        <div className="stack">
          {variables.map((v) => (
            <Field key={v.name} label={v.name} hint={v.default !== undefined ? `Default: ${v.default || '(empty)'}` : undefined}>
              {(id) => v.choices ? (
                <select id={id} className="select" value={values[v.name] ?? ''} onChange={(e) => setValues({ ...values, [v.name]: e.target.value })}>
                  <option value="">{v.default ? `Default (${v.default})` : '(none)'}</option>
                  {v.choices.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <textarea id={id} className="textarea" style={{ minHeight: 60 }} dir="auto" value={values[v.name] ?? ''} onChange={(e) => setValues({ ...values, [v.name]: e.target.value })} />
              )}
            </Field>
          ))}
          <h3 className="panel-title">Preview</h3>
          <pre className={`${s.code} ${s.prompt}`} dir="auto" aria-live="polite">{selected ? fillVariables(selected.body, values) : ''}</pre>
        </div>
      </Dialog>

      <Dialog open={pasteOpen} title="Paste your text" onClose={() => setPasteOpen(false)}
        actions={<><button type="button" className="btn" onClick={() => setPasteOpen(false)}>Cancel</button><button type="button" className="btn primary" disabled={!pasteText.trim()} onClick={() => startFromText(pasteText)}>Continue</button></>}>
        <Field label="Text" hint="The browser did not allow reading the clipboard, so paste it here.">{(id) => <textarea id={id} className="textarea" value={pasteText} onChange={(e) => setPasteText(e.target.value)} autoFocus />}</Field>
      </Dialog>

      <Dialog open={importOpen} title="Import snippets (JSON)" onClose={() => setImportOpen(false)}
        actions={<><button type="button" className="btn" onClick={() => setImportOpen(false)}>Close</button><button type="button" className="btn primary" disabled={busy || !importState} onClick={() => void runImport()}>{busy ? 'Importing...' : 'Import'}</button></>}>
        <div className="stack">
          {importError && <ErrorBanner>{importError}</ErrorBanner>}
          <Field label="Export file from this tool">{(id) => <input id={id} type="file" accept="application/json,.json" onChange={(e) => void onImportFile(e.target.files?.[0])} />}</Field>
          {importState && (
            <p role="status">{importState.valid.length} valid, {importState.dupes} duplicate(s) will be skipped, {importState.invalid} invalid item(s) ignored. Nothing existing is overwritten.</p>
          )}
        </div>
      </Dialog>

      <ConfirmDialog open={confirmDelete !== null} danger title="Delete permanently?" confirmLabel="Delete" message="This cannot be undone."
        onConfirm={() => confirmDelete && void removeForever(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
      <ConfirmDialog open={confirmEmpty} danger title="Empty the trash?" confirmLabel="Empty trash" message={`${trashed.length} snippet(s) will be deleted permanently.`}
        onConfirm={() => void emptyTrash()} onCancel={() => setConfirmEmpty(false)} />
    </div>
  );
}
