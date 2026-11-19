'use client';

import { useMemo, useRef, useState } from 'react';
import { Banner, ConfirmDialog, CopyButton, Dialog, EmptyState, ErrorBanner, Field, SegmentedControl, SliderField, Tabs, useToast } from '@/components/ui';
import { downloadText } from '@/lib/files';
import {
  KINDS, SHAPES, describeItem, exportCss, exportJson, exportTailwind, findDuplicate, gradientCss, kelvinToHex,
  normalizeColor, parseImport, searchItems, softboxBackground, uniqueName, validateDraft,
  type LibDraft, type LibItem, type LibKind,
} from './library';
import { useLibrary, type MergeResult } from './useLibrary';
import s from './styles.module.css';

const KIND_LABEL: Record<LibKind, string> = { palette: 'Palette', gradient: 'Gradient', softbox: 'Softbox preset' };
type Filter = 'all' | LibKind;

function Thumb({ item }: { item: LibItem }) {
  if (item.kind === 'palette') {
    return (
      <div className={s.strip} aria-hidden="true">
        {((item.data.colors as string[]) ?? []).map((c, i) => <span key={i} style={{ background: c }} />)}
      </div>
    );
  }
  const background = item.kind === 'gradient' ? gradientCss(item.data) : softboxBackground(item.data);
  return <div className={s.preview} aria-hidden="true" style={{ background }} />;
}

function parseColorList(text: string): string[] {
  return text.split(/[\s,;]+/).filter(Boolean).map((c) => normalizeColor(c) ?? c);
}

/** Create / edit dialog for all three kinds. */
function Editor({ initial, onSave, onClose }: { initial: LibItem | null; onSave: (d: LibDraft) => Promise<string | null>; onClose: () => void }) {
  const d = initial?.data ?? {};
  const [kind, setKind] = useState<LibKind>(initial?.kind ?? 'palette');
  const [name, setName] = useState(initial?.name ?? '');
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [colors, setColors] = useState(
    initial?.kind === 'palette' ? ((d.colors as string[]) ?? []).join(' ') : initial?.kind === 'gradient' ? ((d.stops as { color: string }[]) ?? []).map((x) => x.color).join(' ') : '#2446f0 #f0a424 #ffffff',
  );
  const [gType, setGType] = useState<'linear' | 'radial' | 'conic'>((d.type as 'linear') ?? 'linear');
  const [angle, setAngle] = useState(Number(d.angle ?? 90));
  const [kelvin, setKelvin] = useState(Number(d.kelvin ?? 5600));
  const [brightness, setBrightness] = useState(Number(d.brightness ?? 80));
  const [shape, setShape] = useState<(typeof SHAPES)[number]>((d.shape as 'flat') ?? 'flat');
  const [color, setColor] = useState(typeof d.color === 'string' ? d.color : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const list = parseColorList(colors);
  const save = async () => {
    let data: Record<string, unknown>;
    if (kind === 'palette') data = { ...d, colors: list };
    else if (kind === 'gradient') data = { ...d, type: gType, angle, stops: list.map((c, i) => ({ color: c, pos: list.length > 1 ? Math.round((i / (list.length - 1)) * 100) : 0 })) };
    else data = { ...d, kelvin, brightness, shape, ...(color.trim() ? { color: color.trim() } : {}) };
    const draft = validateDraft({ kind, name, tags: tags.split(','), data });
    if (!draft.ok) return setError(draft.reason);
    setBusy(true);
    const err = await onSave(draft.value);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <Dialog
      open
      title={initial ? 'Edit item' : 'New library item'}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
        </>
      }
    >
      {!initial && <SegmentedControl label="Kind" value={kind} onChange={setKind} options={KINDS.map((k) => ({ id: k, label: KIND_LABEL[k] }))} />}
      <Field label="Name" hint="Up to 60 characters">
        {(id) => <input id={id} className="input" dir="auto" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />}
      </Field>
      <Field label="Tags" hint="Comma separated, up to 10">
        {(id) => <input id={id} className="input" value={tags} onChange={(e) => setTags(e.target.value)} />}
      </Field>
      {kind !== 'softbox' && (
        <Field label={kind === 'palette' ? 'Colors (2 to 20)' : 'Gradient colors (2 to 12, evenly spaced)'} hint="HEX or CSS color names, separated by spaces or commas">
          {(id) => <textarea id={id} className="textarea" value={colors} onChange={(e) => setColors(e.target.value)} />}
        </Field>
      )}
      {kind !== 'softbox' && (
        <div className={s.strip} aria-hidden="true">
          {list.map((c, i) => <span key={i} style={{ background: normalizeColor(c) ?? 'transparent' }} />)}
        </div>
      )}
      {kind === 'gradient' && (
        <>
          <SegmentedControl label="Gradient type" value={gType} onChange={setGType} options={[{ id: 'linear', label: 'Linear' }, { id: 'radial', label: 'Radial' }, { id: 'conic', label: 'Conic' }]} />
          <SliderField label="Angle" value={angle} onChange={setAngle} min={0} max={360} unit="deg" />
        </>
      )}
      {kind === 'softbox' && (
        <>
          <SliderField label="Temperature" value={kelvin} onChange={setKelvin} min={1000} max={10000} step={100} unit="K" />
          <SliderField label="Brightness" value={brightness} onChange={setBrightness} min={5} max={100} unit="%" />
          <SegmentedControl label="Shape" value={shape} onChange={setShape} options={SHAPES.map((x) => ({ id: x, label: x }))} />
          <Field label="Tint color (optional)" hint={`Leave empty to use the temperature (${kelvinToHex(kelvin)})`}>
            {(id) => <input id={id} className="input" value={color} onChange={(e) => setColor(e.target.value)} placeholder="#ffd9a0" />}
          </Field>
          <div className={s.preview} style={{ background: softboxBackground({ kelvin, brightness, shape, color: normalizeColor(color) ?? undefined }), height: 90 }} role="img" aria-label="Softbox preview" />
        </>
      )}
      {error && <p className="error-text" role="alert">{error}</p>}
    </Dialog>
  );
}

function ExportDialog({ items, onClose }: { items: LibItem[]; onClose: () => void }) {
  const [fmt, setFmt] = useState<'css' | 'tailwind' | 'json'>('css');
  const text = fmt === 'css' ? exportCss(items) : fmt === 'tailwind' ? exportTailwind(items) : exportJson(items);
  const file = fmt === 'css' ? 'library.css' : fmt === 'tailwind' ? 'tailwind.colors.js' : 'library.json';
  return (
    <Dialog open title={`Export ${items.length} item${items.length === 1 ? '' : 's'}`} onClose={onClose}
      actions={
        <>
          <CopyButton text={text} label="Copy" />
          <button type="button" className="btn" onClick={() => downloadText(text, file, fmt === 'json' ? 'application/json' : 'text/plain')}>Download</button>
          <button type="button" className="btn primary" onClick={onClose}>Done</button>
        </>
      }
    >
      <SegmentedControl label="Format" value={fmt} onChange={setFmt} options={[{ id: 'css', label: 'CSS variables' }, { id: 'tailwind', label: 'Tailwind' }, { id: 'json', label: 'JSON' }]} />
      <pre className={s.code} tabIndex={0} aria-label="Export preview">{text}</pre>
      {fmt !== 'json' && <p className="hint">Softbox presets are included in JSON only.</p>}
    </Dialog>
  );
}

export default function SavedPalettesPresets() {
  const lib = useLibrary();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<LibItem | 'new' | null>(null);
  const [exporting, setExporting] = useState<LibItem[] | null>(null);
  const [deleted, setDeleted] = useState<LibItem | null>(null);
  const [full, setFull] = useState<LibItem | null>(null);
  const [mergeOpen, setMergeOpen] = useState(true);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const [importMsg, setImportMsg] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const allTags = useMemo(() => [...new Set(lib.items.flatMap((i) => i.tags))].sort(), [lib.items]);
  const shown = useMemo(
    () => searchItems(lib.items.filter((i) => filter === 'all' || i.kind === filter), query, tag),
    [lib.items, filter, query, tag],
  );
  const plan = useMemo(() => (lib.remoteReady && lib.localCount ? lib.buildPlan() : null), [lib]);
  const showMerge = Boolean(lib.isAuthed && lib.remoteReady && lib.localCount && mergeOpen && !mergeResult);

  const save = async (draft: LibDraft): Promise<string | null> => {
    if (editing && editing !== 'new') return lib.update(editing.id, draft);
    const dup = findDuplicate(lib.items, draft);
    const next = { ...draft, name: uniqueName(draft.name, lib.items.map((i) => i.name)) };
    const err = await lib.add(next);
    if (!err && dup) toast(`Saved. Note: identical to "${dup.name}".`, 'info');
    else if (!err) toast('Saved', 'success');
    return err;
  };

  const del = async (item: LibItem) => {
    const err = await lib.remove(item.id);
    if (err) toast(err, 'error');
    else setDeleted(item);
  };
  const undo = async () => {
    if (!deleted) return;
    const err = await lib.add({ kind: deleted.kind, name: deleted.name, tags: deleted.tags, data: deleted.data });
    if (err) toast(err, 'error');
    else setDeleted(null);
  };
  const duplicate = async (item: LibItem) => {
    const err = await lib.add({ kind: item.kind, name: uniqueName(item.name, lib.items.map((i) => i.name)), tags: item.tags, data: item.data });
    toast(err ?? 'Duplicated', err ? 'error' : 'success');
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_000_000) return setImportMsg(['File is larger than 2 MB.']);
    const { drafts, errors } = parseImport(await file.text());
    const msgs = errors.map((e) => `${e.name}: ${e.reason}`);
    let added = 0;
    for (const d of drafts) {
      const err = await lib.add({ ...d, name: uniqueName(d.name, lib.items.map((i) => i.name)) });
      if (err) { msgs.push(err); break; }
      added++;
    }
    setImportMsg(msgs);
    toast(`Imported ${added} item${added === 1 ? '' : 's'}`, added ? 'success' : 'info');
  };

  const runMerge = async () => {
    if (!plan) return;
    setMergeBusy(true);
    const r = await lib.mergeLocal(plan);
    setMergeBusy(false);
    setMergeResult(r);
    toast(r.failed ? `Merged with ${r.failed} failure(s). Your local copy was kept.` : `Merged ${r.created + r.updated} local item(s) into your account`, r.failed ? 'error' : 'success');
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      {!lib.isAuthed && !lib.sessionLoading && (
        <Banner kind="info">Saved on this device only (up to 50 items). Sign in to sync across devices. Clearing site data removes guest items.</Banner>
      )}
      {lib.expired && <Banner kind="warn">Your session expired. Sign in again to sync. Local edits continue.</Banner>}
      {lib.error && <ErrorBanner onRetry={() => void lib.retry()}>{lib.error}</ErrorBanner>}
      {mergeResult && (
        <Banner kind={mergeResult.failed ? 'warn' : 'ok'} onDismiss={() => setMergeResult(null)}>
          Merge finished: {mergeResult.created} added, {mergeResult.updated} updated, {mergeResult.skipped} skipped (duplicates or older).
          {mergeResult.overflow > 0 && ` ${mergeResult.overflow} did not fit under the 100 item limit and stay on this device.`}
          {mergeResult.failed > 0 && ` ${mergeResult.failed} failed; they stay on this device. Reload to retry.`}
        </Banner>
      )}
      {lib.items.length >= lib.cap * 0.8 && (
        <Banner kind={lib.items.length >= lib.cap ? 'error' : 'warn'}>
          {lib.items.length} of {lib.cap} items used.{lib.items.length >= lib.cap ? ' The library is full: delete or export items to add more.' : ''}
        </Banner>
      )}
      {deleted && (
        <Banner kind="info" onDismiss={() => setDeleted(null)}>
          Deleted &quot;{deleted.name}&quot;. <button type="button" className="btn sm" onClick={undo}>Undo</button>
        </Banner>
      )}

      <div className={s.toolbar}>
        <Tabs<Filter> label="Library kind" value={filter} onChange={setFilter}
          tabs={[{ id: 'all', label: 'All' }, { id: 'palette', label: 'Palettes' }, { id: 'gradient', label: 'Gradients' }, { id: 'softbox', label: 'Softbox' }]} />
        <div className={s.actions}>
          <button type="button" className="btn primary" onClick={() => setEditing('new')}>New item</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Import JSON</button>
          <button type="button" className="btn" disabled={!shown.length} onClick={() => setExporting(shown)}>Export {shown.length}</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden aria-label="Import JSON file" onChange={(e) => { void doImport(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>
      {importMsg.length > 0 && (
        <Banner kind="warn" onDismiss={() => setImportMsg([])}>
          <strong>Import notes</strong>
          <ul>{importMsg.slice(0, 10).map((m, i) => <li key={i}>{m}</li>)}</ul>
        </Banner>
      )}

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Field label="Search">{(id) => <input id={id} type="search" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or tag" />}</Field>
        {allTags.length > 0 && (
          <Field label="Tag">
            {(id) => (
              <select id={id} className="select" value={tag ?? ''} onChange={(e) => setTag(e.target.value || null)}>
                <option value="">All tags</option>
                {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
          </Field>
        )}
      </div>

      <div aria-live="polite" className="sr-only">{shown.length} items shown</div>
      {lib.loading ? (
        <p className="muted" role="status">Loading your library...</p>
      ) : lib.items.length === 0 ? (
        <EmptyState icon="palette" title="No saved items yet">
          <p>Save palettes, gradients and softbox lighting presets here. Create one, import JSON, or build a palette in <a href="/tools/palette-contrast">Palette &amp; Contrast</a>.</p>
          <button type="button" className="btn primary" onClick={() => setEditing('new')}>Create palette</button>
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon="search" title="Nothing matches">Try a different search or tag.</EmptyState>
      ) : (
        <ul className={s.grid} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {shown.map((item) => (
            <li key={item.id} className={`panel ${s.card}`}>
              <Thumb item={item} />
              <div className={s.name} dir="auto">{item.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{KIND_LABEL[item.kind]}</div>
              <div className={s.values}>{describeItem(item)}</div>
              {item.tags.length > 0 && <div className={s.tags}>{item.tags.map((t) => <span key={t} className="tag local">{t}</span>)}</div>}
              <div className={s.actions}>
                <button type="button" className="btn sm" onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`}>Edit</button>
                <button type="button" className="btn sm" onClick={() => void duplicate(item)} aria-label={`Duplicate ${item.name}`}>Duplicate</button>
                <button type="button" className="btn sm" onClick={() => setExporting([item])} aria-label={`Export ${item.name}`}>Export</button>
                <button type="button" className="btn sm danger" onClick={() => void del(item)} aria-label={`Delete ${item.name}`}>Delete</button>
                {item.kind === 'softbox' && <button type="button" className="btn sm" onClick={() => setFull(item)}>Preview full screen</button>}
                {item.kind === 'softbox' ? (
                  <a className={`btn sm ${s.linkBtn}`} href={`/tools/color-wheel-softbox?library=${encodeURIComponent(item.id)}`}>Open in Softbox</a>
                ) : (
                  <a className={`btn sm ${s.linkBtn}`} href={`/tools/palette-contrast?library=${encodeURIComponent(item.id)}`}>Open in Palette tool</a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && <Editor initial={editing === 'new' ? null : editing} onSave={save} onClose={() => setEditing(null)} />}
      {exporting && <ExportDialog items={exporting} onClose={() => setExporting(null)} />}
      {full && (
        <div className={s.fullscreen} style={{ background: softboxBackground(full.data) }} role="dialog" aria-modal="true" aria-label={`Softbox preview: ${full.name}`}>
          <button type="button" className="btn" autoFocus onClick={() => setFull(null)} onKeyDown={(e) => e.key === 'Escape' && setFull(null)}>Close preview</button>
        </div>
      )}
      <ConfirmDialog
        open={showMerge}
        title={`Merge ${lib.localCount} local item${lib.localCount === 1 ? '' : 's'} into your account?`}
        confirmLabel={mergeBusy ? 'Merging...' : 'Merge'}
        onConfirm={() => void runMerge()}
        onCancel={() => setMergeOpen(false)}
        message={
          <>
            Both libraries are kept. If a local and an account item share a name, the newest one wins; identical items are not duplicated.
            {plan && <> Will add {plan.create.length}, update {plan.update.length}, skip {plan.skipped}{plan.overflow ? `; ${plan.overflow} will not fit under the 100 limit` : ''}.</>}
            {' '}The local copy is removed only after a fully successful merge. Choose Cancel to keep the local items separate.
          </>
        }
      />
    </div>
  );
}
