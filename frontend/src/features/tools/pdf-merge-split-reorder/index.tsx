'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { Banner, ConfirmDialog, Dialog, DropZone, EmptyState, ErrorBanner, Field, Icon, ProgressBar, SegmentedControl, Tabs, useToast } from '@/components/ui';
import { downloadBlob, formatBytes, outputName, zipFiles } from '@/lib/files';
import {
  commit, duplicate, insertBlank, moveBefore, moveBy, newUid, redo, remove, rotate, startHistory, undo,
  type History, type PageItem,
} from './arrange';
import type { BuildOptions, OutputJob, PlannedPage } from './build';
import type { BuildMessage, BuildRequest } from './build.worker';
import { PageCard } from './PageCard';
import { RangeInput } from './RangeInput';
import { parseRanges, planAtStarts, planBySize, planEveryN, type RangeGroup } from './ranges';
import { loadSource, type SourceFile } from './sources';
import styles from './styles.module.css';
import { dropThumbnails, outlineStarts } from './thumbs';

type Tab = 'arrange' | 'split' | 'extract';
type SplitMode = 'ranges' | 'every' | 'size' | 'bookmarks';

const MAX_FILES = 50;
const SOFT_FILE_BYTES = 200 * 1024 * 1024;
const SOFT_TOTAL_BYTES = 500 * 1024 * 1024;
const BLANK_ESTIMATE = 800;

interface Failure { name: string; reason: string }
interface Result { name: string; blob: Blob }
interface Busy { label: string; done: number; total: number }
interface PasswordRequest { fileName: string; wrong: boolean; resolve: (pw: string | null) => void }

const baseName = (name: string) => name.replace(/\.[^.]+$/, '');

export default function PdfMergeSplitReorder() {
  const toast = useToast();
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [history, setHistory] = useState<History<PageItem[]>>(() => startHistory([]));
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [failures, setFailures] = useState<Failure[]>([]);
  const [tab, setTab] = useState<Tab>('arrange');
  const [loading, setLoading] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PasswordRequest | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [title, setTitle] = useState('');
  const [strip, setStrip] = useState(false);
  const [rangeText, setRangeText] = useState('');
  const [splitMode, setSplitMode] = useState<SplitMode>('ranges');
  const [everyN, setEveryN] = useState(10);
  const [maxMb, setMaxMb] = useState(5);
  const [bookmarkStarts, setBookmarkStarts] = useState<number[] | null>(null);
  const [dragging, setDragging] = useState<ReadonlySet<string>>(new Set());
  const [dropAt, setDropAt] = useState<string | 'end' | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [supported, setSupported] = useState(true);

  const pages = history.present;
  const idCounter = useRef(0);
  const worker = useRef<Worker | null>(null);
  const cardEls = useRef(new Map<string, HTMLLIElement>());
  const focusUid = useRef<string | null>(null);
  const anchor = useRef<string | null>(null);
  const latest = useRef({ pages, selected, files });
  latest.current = { pages, selected, files };

  useEffect(() => {
    setSupported(typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined');
    return () => worker.current?.terminate();
  }, []);

  useEffect(() => {
    if (!focusUid.current) return;
    cardEls.current.get(focusUid.current)?.focus();
    focusUid.current = null;
  });

  const fileMap = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);
  const hueOf = useMemo(() => new Map(files.map((f, i) => [f.id, (i * 67 + 200) % 360])), [files]);
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  const working = busy !== null || loading !== null;

  const setPages = useCallback((next: PageItem[]) => setHistory((h) => commit(h, next)), []);

  // ---------- adding files ----------
  const askPassword = useCallback(
    (fileName: string, wrong: boolean) =>
      new Promise<string | null>((resolve) => {
        setPassword('');
        setPrompt({ fileName, wrong, resolve });
      }),
    [],
  );

  async function addFiles(list: File[]) {
    setError(null);
    const room = MAX_FILES - latest.current.files.length;
    if (list.length > room) {
      toast(`Up to ${MAX_FILES} files per session. ${Math.max(0, room)} added.`, 'error');
      list = list.slice(0, Math.max(0, room));
    }
    const added: SourceFile[] = [];
    const newFailures: Failure[] = [];
    const seen = new Map<string, number>();
    for (const f of latest.current.files) seen.set(f.name, (seen.get(f.name) ?? 0) + 1);
    for (const file of list) {
      setLoading(`Reading ${file.name}`);
      const count = (seen.get(file.name) ?? 0) + 1;
      seen.set(file.name, count);
      const outcome = await loadSource(file, `f${++idCounter.current}`, count > 1 ? `${file.name} (${count})` : file.name, askPassword);
      if (outcome.ok) added.push(outcome.file);
      else newFailures.push({ name: file.name, reason: outcome.reason });
    }
    setLoading(null);
    setFailures((f) => [...f, ...newFailures]);
    if (!added.length) return;
    setFiles((f) => [...f, ...added]);
    const items: PageItem[] = added.flatMap((file) =>
      file.sizes.map((s, index) => ({ uid: newUid(), fileId: file.id, index, rotation: 0, width: s.width, height: s.height })),
    );
    setPages([...latest.current.pages, ...items]);
    if (!title) setTitle(baseName(added[0]?.name ?? ''));
    setResults([]);
  }

  function removeFile(id: string) {
    dropThumbnails(id);
    setFiles((f) => f.filter((x) => x.id !== id));
    const keep = latest.current.pages.filter((p) => p.fileId !== id);
    setHistory(startHistory(keep));
    setSelected(new Set());
    setResults([]);
  }

  function clearAll() {
    for (const f of files) dropThumbnails(f.id);
    setFiles([]);
    setFailures([]);
    setHistory(startHistory([]));
    setSelected(new Set());
    setResults([]);
    setRangeText('');
    setTitle('');
    setBookmarkStarts(null);
  }

  // ---------- page operations ----------
  const targetUids = useCallback((uid?: string): ReadonlySet<string> => {
    const { selected: sel } = latest.current;
    if (uid && !sel.has(uid)) return new Set([uid]);
    return sel.size ? sel : new Set();
  }, []);

  const onToggle = useCallback((uid: string, shift: boolean) => {
    const { pages: list } = latest.current;
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && anchor.current) {
        const a = list.findIndex((p) => p.uid === anchor.current);
        const b = list.findIndex((p) => p.uid === uid);
        if (a !== -1 && b !== -1) for (const p of list.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(p.uid);
        return next;
      }
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
    anchor.current = uid;
  }, []);

  const onRotate = useCallback((uid: string) => setPages(rotate(latest.current.pages, targetUids(uid), 90)), [setPages, targetUids]);
  const onDuplicate = useCallback((uid: string) => setPages(duplicate(latest.current.pages, targetUids(uid))), [setPages, targetUids]);
  const onRemove = useCallback(
    (uid: string) => {
      const uids = targetUids(uid);
      setPages(remove(latest.current.pages, uids));
      setSelected((s) => new Set([...s].filter((x) => !uids.has(x))));
    },
    [setPages, targetUids],
  );
  const onBlankAfter = useCallback((uid: string) => setPages(insertBlank(latest.current.pages, uid)), [setPages]);

  const move = useCallback(
    (uids: ReadonlySet<string>, delta: -1 | 1) => {
      if (uids.size) setPages(moveBy(latest.current.pages, uids, delta));
    },
    [setPages],
  );

  const onKey = useCallback(
    (e: KeyboardEvent<HTMLLIElement>, uid: string) => {
      const list = latest.current.pages;
      const i = list.findIndex((p) => p.uid === uid);
      if (e.target !== e.currentTarget) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        onToggle(uid, e.shiftKey);
      } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'ArrowDown')) {
        e.preventDefault();
        move(targetUids(uid), e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1);
        focusUid.current = uid;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
        const target = list[i + step];
        if (target) cardEls.current.get(target.uid)?.focus();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const next = list[i + 1] ?? list[i - 1];
        onRemove(uid);
        if (next) focusUid.current = next.uid;
      } else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
        onRotate(uid);
      }
    },
    [move, onRemove, onRotate, onToggle, targetUids],
  );

  const register = useCallback((uid: string, el: HTMLLIElement | null) => {
    if (el) cardEls.current.set(uid, el);
    else cardEls.current.delete(uid);
  }, []);

  const onDragStart = useCallback((e: DragEvent, uid: string) => {
    const moving = latest.current.selected.has(uid) ? latest.current.selected : new Set([uid]);
    setDragging(moving);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', uid);
  }, []);
  const onDragEnd = useCallback(() => {
    setDragging(new Set());
    setDropAt(null);
  }, []);
  const onDragOver = useCallback((e: DragEvent, uid: string) => {
    e.preventDefault();
    setDropAt(uid);
  }, []);
  const dropBefore = useCallback(
    (before: string | null) => {
      setDragging((moving) => {
        if (moving.size && !(before && moving.has(before))) setPages(moveBefore(latest.current.pages, moving, before));
        return new Set();
      });
      setDropAt(null);
    },
    [setPages],
  );
  const onDrop = useCallback(
    (e: DragEvent, uid: string) => {
      e.preventDefault();
      dropBefore(uid);
    },
    [dropBefore],
  );

  function onWorkspaceKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.target instanceof HTMLElement && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      setHistory((h) => (e.shiftKey ? redo(h) : undo(h)));
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && e.target instanceof HTMLElement && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      setSelected(new Set(pages.map((p) => p.uid)));
    }
  }

  // ---------- export ----------
  const parsed = useMemo(() => parseRanges(rangeText, pages.length), [rangeText, pages.length]);

  function plan(p: PageItem): PlannedPage {
    return { sourceId: p.fileId, index: p.index, rotation: p.rotation, width: p.width, height: p.height };
  }

  const firstName = files[0]?.name ?? 'document.pdf';

  /** Page groups (1-based positions in the current order) for the active split mode. */
  const splitGroups: { groups: RangeGroup[]; note?: string } = useMemo(() => {
    const total = pages.length;
    if (!total) return { groups: [] };
    if (splitMode === 'every') return { groups: planEveryN(total, everyN) };
    if (splitMode === 'ranges') return { groups: parsed.groups };
    if (splitMode === 'bookmarks') return { groups: bookmarkStarts ? planAtStarts(total, bookmarkStarts) : [] };
    const estimates = pages.map((p) => {
      const f = p.fileId ? fileMap.get(p.fileId) : null;
      return f ? f.size / f.pageCount : BLANK_ESTIMATE;
    });
    return { groups: planBySize(estimates, maxMb * 1024 * 1024), note: 'Part sizes are estimated from the average page size of each source file; real sizes are shown after splitting.' };
  }, [pages, splitMode, everyN, parsed.groups, bookmarkStarts, maxMb, fileMap]);

  async function run(label: string, jobs: OutputJob[], options: BuildOptions): Promise<Result[] | null> {
    setError(null);
    setResults([]);
    const used = new Set(jobs.flatMap((j) => j.pages.map((p) => p.sourceId).filter((x): x is string => x !== null)));
    const sources: [string, Uint8Array][] = files.filter((f) => used.has(f.id)).map((f) => [f.id, f.bytes.slice()]);
    const total = jobs.reduce((n, j) => n + j.pages.length, 0);
    setBusy({ label, done: 0, total });
    return new Promise((resolve) => {
      const w = new Worker(new URL('./build.worker.ts', import.meta.url), { type: 'module' });
      worker.current = w;
      const finish = (value: Result[] | null) => {
        w.terminate();
        worker.current = null;
        setBusy(null);
        resolve(value);
      };
      w.onmessage = (e: MessageEvent<BuildMessage>) => {
        const m = e.data;
        if (m.type === 'progress') setBusy({ label, done: m.done, total: m.total });
        else if (m.type === 'error') {
          setError(`${m.message} Try again, or remove the file that failed.`);
          finish(null);
        } else finish(m.files.map((f) => ({ name: f.name, blob: new Blob([f.bytes.slice().buffer], { type: 'application/pdf' }) })));
      };
      w.onerror = () => {
        setError('The export worker crashed, most likely from low memory. Try fewer or smaller files, or process one file at a time.');
        finish(null);
      };
      const req: BuildRequest = { sources, jobs, options };
      w.postMessage(req, sources.map(([, b]) => b.buffer as ArrayBuffer));
    });
  }

  function cancelExport() {
    worker.current?.terminate();
    worker.current = null;
    setBusy(null);
    toast('Export cancelled. Nothing was downloaded.');
  }

  const buildOptions: BuildOptions = { title, stripMetadata: strip };

  async function exportMerged() {
    const out = await run('Building PDF', [{ name: outputName(firstName, 'merged', 'pdf'), pages: pages.map(plan) }], buildOptions);
    if (!out) return;
    setResults(out);
    downloadBlob(out[0]!.blob, out[0]!.name);
  }

  async function exportSplit() {
    const groups = splitGroups.groups;
    const jobs = groups.map((g, i) => ({ name: outputName(firstName, `part-${i + 1}`, 'pdf'), pages: pages.slice(g.from - 1, g.to).map(plan) }));
    const out = await run('Splitting PDF', jobs, buildOptions);
    if (!out) return;
    setResults(out);
    const zip = await zipFiles(out.map((r) => ({ name: r.name, data: r.blob })));
    downloadBlob(zip, outputName(firstName, 'split', 'zip'));
    if (splitMode === 'size') {
      const over = out.filter((r) => r.blob.size > maxMb * 1024 * 1024).length;
      if (over) toast(`${over} part${over === 1 ? ' is' : 's are'} larger than ${maxMb} MB (a single page can exceed the limit).`);
    }
  }

  /** Pages picked for extraction: typed ranges win, otherwise the clicked pages in visible order. */
  const extractPages = useMemo(() => {
    if (rangeText.trim()) return parsed.errors.length ? [] : parsed.pages.map((n) => pages[n - 1]).filter((p): p is PageItem => !!p);
    return pages.filter((p) => selected.has(p.uid));
  }, [rangeText, parsed, pages, selected]);

  async function exportExtract() {
    const out = await run('Extracting pages', [{ name: outputName(firstName, 'extract', 'pdf'), pages: extractPages.map(plan) }], buildOptions);
    if (!out) return;
    setResults(out);
    downloadBlob(out[0]!.blob, out[0]!.name);
  }

  async function detectBookmarks() {
    // Bookmarks are read from the first PDF that has them; only meaningful when one file is loaded.
    const source = files.find((f) => !f.isImage);
    if (!source) return;
    const starts = await outlineStarts(source.doc);
    setBookmarkStarts(starts);
  }

  useEffect(() => {
    if (splitMode === 'bookmarks' && bookmarkStarts === null && files.length) void detectBookmarks();
     
  }, [splitMode, files.length]);

  // ---------- render ----------
  if (!supported) {
    return <ErrorBanner>This browser cannot run Web Workers or WebAssembly, which this tool needs. Try a current version of Chrome, Edge, Firefox or Safari.</ErrorBanner>;
  }

  const hasPages = pages.length > 0;
  const arrangeLocked = tab !== 'arrange' || working;
  const selectedCount = selected.size;

  const picker = (
    <DropZone
      multiple
      paste
      accept={['.pdf', 'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif']}
      title={files.length ? 'Add more PDFs or images' : 'Drop PDFs or images here'}
      hint="Several files at once are fine. Images become one page each."
      onFiles={(f) => void addFiles(f)}
      onReject={(m) => toast(m, 'error')}
    />
  );

  return (
    <div className="stack" style={{ gap: 16 }} onKeyDown={onWorkspaceKey}>
      {!files.length && !loading && (
        <>
          <EmptyState icon="layers" title="Combine, split and reorder PDFs">
            Merge files into one, pull out pages, or cut a document into parts. Drag pages to reorder, rotate or delete them. Everything stays in your browser.
          </EmptyState>
          {picker}
        </>
      )}

      {loading && <ProgressBar label={loading} />}

      {failures.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {failures.map((f, i) => (
            <ErrorBanner key={`${f.name}${i}`} onDismiss={() => setFailures((all) => all.filter((_, j) => j !== i))}>
              <b>{f.name}</b>: {f.reason}
            </ErrorBanner>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <>
          {(totalBytes > SOFT_TOTAL_BYTES || files.some((f) => f.size > SOFT_FILE_BYTES)) && (
            <Banner kind="warn">These files are large ({formatBytes(totalBytes)} in total). Merging may run out of memory; consider processing one file at a time.</Banner>
          )}

          <div className="panel">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <h2 className="panel-title" style={{ margin: 0 }}>
                Files ({files.length}) · {pages.length} page{pages.length === 1 ? '' : 's'}
              </h2>
              <button type="button" className="btn sm" onClick={() => setConfirmClear(true)} disabled={working}>
                Start over
              </button>
            </div>
            <ul className={styles.fileList} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {files.map((f) => (
                <li key={f.id} className={styles.fileRow}>
                  <span className={styles.swatch} style={{ background: `hsl(${hueOf.get(f.id)} 60% 50%)` }} aria-hidden="true" />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{f.label}</div>
                    <div className="faint tabular" style={{ fontSize: 12.5 }}>
                      {f.pageCount} page{f.pageCount === 1 ? '' : 's'} · {formatBytes(f.size)}{f.isImage ? ' · image' : ''}
                    </div>
                    {f.notes.map((n) => (
                      <div key={n} className={styles.notes}>{n}</div>
                    ))}
                  </div>
                  <button type="button" className="btn sm icon ghost" aria-label={`Remove ${f.label}`} disabled={working} onClick={() => removeFile(f.id)}>
                    <Icon name="x" />
                  </button>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 12 }}>{picker}</div>
          </div>

          <Tabs
            label="Mode"
            value={tab}
            onChange={(t) => setTab(t)}
            tabs={[
              { id: 'arrange', label: 'Merge / Arrange' },
              { id: 'split', label: 'Split' },
              { id: 'extract', label: 'Extract' },
            ]}
          />

          <div className="toolbar-wrap" role="toolbar" aria-label="Page actions">
            <div className={styles.toolbar}>
              <button type="button" className="btn sm" onClick={() => setHistory(undo)} disabled={!history.past.length || working}>Undo</button>
              <button type="button" className="btn sm" onClick={() => setHistory(redo)} disabled={!history.future.length || working}>Redo</button>
              <span className={styles.sep} aria-hidden="true" />
              <button type="button" className="btn sm" onClick={() => setSelected(new Set(pages.map((p) => p.uid)))} disabled={!hasPages}>Select all</button>
              <button type="button" className="btn sm" onClick={() => setSelected(new Set())} disabled={!selectedCount}>Clear selection</button>
              <span className="muted" aria-live="polite">{selectedCount} selected</span>
              {tab === 'arrange' && (
                <>
                  <span className={styles.sep} aria-hidden="true" />
                  <button type="button" className="btn sm" disabled={!selectedCount || working} onClick={() => move(selected, -1)} aria-label="Move selected pages earlier">Move earlier</button>
                  <button type="button" className="btn sm" disabled={!selectedCount || working} onClick={() => move(selected, 1)} aria-label="Move selected pages later">Move later</button>
                  <button type="button" className="btn sm" disabled={!selectedCount || working} onClick={() => setPages(rotate(pages, selected, 90))}>Rotate</button>
                  <button type="button" className="btn sm" disabled={!selectedCount || working} onClick={() => setPages(duplicate(pages, selected))}>Duplicate</button>
                  <button type="button" className="btn sm danger" disabled={!selectedCount || working} onClick={() => { setPages(remove(pages, selected)); setSelected(new Set()); }}>Delete</button>
                  <button type="button" className="btn sm" disabled={working} onClick={() => setPages(insertBlank(pages, pages.at(-1)?.uid ?? null))}>Add blank page at end</button>
                </>
              )}
            </div>
            {tab === 'arrange' && <p className="hint" style={{ margin: '6px 0 0' }}>Drag pages to reorder. With the keyboard: arrow keys to move focus, Space to select, Alt+Arrow to move, R to rotate, Delete to remove, Ctrl+Z to undo.</p>}
          </div>

          {hasPages ? (
            <ul className={styles.grid} role="listbox" aria-multiselectable="true" aria-label="Pages in output order">
              {pages.map((p, i) => (
                <PageCard
                  key={p.uid}
                  item={p}
                  position={i + 1}
                  total={pages.length}
                  file={p.fileId ? fileMap.get(p.fileId) ?? null : null}
                  hue={p.fileId ? hueOf.get(p.fileId) ?? 0 : 0}
                  selected={selected.has(p.uid)}
                  dragging={dragging.has(p.uid)}
                  dropTarget={dropAt === p.uid}
                  disabled={arrangeLocked}
                  onToggle={onToggle}
                  onKey={onKey}
                  onRotate={onRotate}
                  onDuplicate={onDuplicate}
                  onRemove={onRemove}
                  onBlankAfter={onBlankAfter}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  register={register}
                />
              ))}
              {tab === 'arrange' && dragging.size > 0 && (
                <li
                  className={styles.endDrop}
                  data-drop={dropAt === 'end'}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropAt('end');
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropBefore(null);
                  }}
                >
                  Move to end
                </li>
              )}
            </ul>
          ) : (
            <EmptyState icon="file" title="No pages left">Every page was deleted. Undo, or add more files.</EmptyState>
          )}

          <div className="panel stack">
            {tab === 'arrange' && (
              <>
                <h2 className="panel-title">Merge and download</h2>
                <div className="grid-2">
                  <Field label="Document title">{(id) => <input id={id} className="input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={strip} />}</Field>
                  <Field label="Metadata">
                    {(id) => (
                      <label className="row" htmlFor={id} style={{ minHeight: 38 }}>
                        <input id={id} type="checkbox" checked={strip} onChange={(e) => setStrip(e.target.checked)} /> Remove title, author and other metadata
                      </label>
                    )}
                  </Field>
                </div>
                <div className="row">
                  <button type="button" className="btn primary" disabled={!hasPages || working} onClick={() => void exportMerged()}>
                    <Icon name="download" /> Download {files.length > 1 ? 'merged ' : ''}PDF ({pages.length} page{pages.length === 1 ? '' : 's'})
                  </button>
                </div>
              </>
            )}

            {tab === 'split' && (
              <>
                <h2 className="panel-title">Split into parts</h2>
                <p className="muted" style={{ margin: 0 }}>Splits the pages as arranged above (after any reordering, rotation and deletion).</p>
                <SegmentedControl
                  label="Split by"
                  value={splitMode}
                  onChange={setSplitMode}
                  options={[
                    { id: 'ranges', label: 'Page ranges' },
                    { id: 'every', label: 'Every N pages' },
                    { id: 'size', label: 'File size' },
                    { id: 'bookmarks', label: 'Bookmarks' },
                  ]}
                />
                {splitMode === 'ranges' && <RangeInput label="Each range becomes its own file" value={rangeText} onChange={setRangeText} parsed={parsed} />}
                {splitMode === 'every' && (
                  <Field label="Pages per part">
                    {(id) => <input id={id} className="input" type="number" min={1} value={everyN} onChange={(e) => setEveryN(Math.max(1, Number(e.target.value) || 1))} style={{ maxWidth: 140 }} />}
                  </Field>
                )}
                {splitMode === 'size' && (
                  <Field label="Maximum part size (MB)" hint="Page sizes are estimated, so parts can end up slightly over or under.">
                    {(id) => <input id={id} className="input" type="number" min={0.1} step={0.5} value={maxMb} onChange={(e) => setMaxMb(Math.max(0.1, Number(e.target.value) || 1))} style={{ maxWidth: 140 }} />}
                  </Field>
                )}
                {splitMode === 'bookmarks' &&
                  (bookmarkStarts && bookmarkStarts.length ? (
                    <p className="muted" style={{ margin: 0 }}>Found {bookmarkStarts.length} top-level bookmark{bookmarkStarts.length === 1 ? '' : 's'} in the first PDF. Bookmark positions refer to the original page order, so use this before reordering.</p>
                  ) : (
                    <Banner kind="info">{bookmarkStarts ? 'The first PDF has no usable bookmarks.' : 'Reading bookmarks...'}</Banner>
                  ))}
                {splitGroups.note && <p className="hint" style={{ margin: 0 }}>{splitGroups.note}</p>}
                {parsed.warnings.length > 0 && splitMode === 'ranges' && parsed.warnings.map((w) => <Banner key={w} kind="warn">{w}</Banner>)}
                <div className="muted" aria-live="polite">
                  {splitGroups.groups.length ? `${splitGroups.groups.length} file${splitGroups.groups.length === 1 ? '' : 's'}: ${splitGroups.groups.map((g) => (g.from === g.to ? `${g.from}` : `${g.from}-${g.to}`)).join(', ')}` : 'No parts yet.'}
                </div>
                <div className="row">
                  <button type="button" className="btn primary" disabled={!splitGroups.groups.length || working || (splitMode === 'ranges' && parsed.errors.length > 0)} onClick={() => void exportSplit()}>
                    <Icon name="download" /> Download ZIP of parts
                  </button>
                </div>
              </>
            )}

            {tab === 'extract' && (
              <>
                <h2 className="panel-title">Extract pages</h2>
                <p className="muted" style={{ margin: 0 }}>Type page numbers, or leave the box empty and click pages above. Typed numbers can repeat a page.</p>
                <RangeInput label="Pages to extract" value={rangeText} onChange={setRangeText} parsed={parsed} />
                {rangeText.trim() && parsed.warnings.map((w) => <Banner key={w} kind="warn">{w}</Banner>)}
                <div className="muted" aria-live="polite">{extractPages.length} page{extractPages.length === 1 ? '' : 's'} will be extracted.</div>
                <div className="row">
                  <button type="button" className="btn primary" disabled={!extractPages.length || working} onClick={() => void exportExtract()}>
                    <Icon name="download" /> Download extracted PDF
                  </button>
                </div>
                {!extractPages.length && !rangeText.trim() && <p className="hint" style={{ margin: 0 }}>Nothing selected yet.</p>}
              </>
            )}

            {busy && <ProgressBar label={`${busy.label} (${busy.done} of ${busy.total} pages)`} value={busy.total ? (busy.done / busy.total) * 100 : undefined} onCancel={cancelExport} />}
            {error && <ErrorBanner onDismiss={() => setError(null)}>{error}</ErrorBanner>}

            {results.length > 0 && (
              <div className={styles.results} aria-live="polite">
                <Banner kind="ok">Done. {results.length === 1 ? 'Your file was downloaded.' : `${results.length} files were downloaded as a ZIP.`}</Banner>
                {results.map((r) => (
                  <div key={r.name} className={styles.resultRow}>
                    <span style={{ overflowWrap: 'anywhere' }}>{r.name} <span className="faint tabular">({formatBytes(r.blob.size)})</span></span>
                    <button type="button" className="btn sm" onClick={() => downloadBlob(r.blob, r.name)}>
                      <Icon name="download" /> Download
                    </button>
                  </div>
                ))}
              </div>
            )}

            <details>
              <summary className="muted" style={{ cursor: 'pointer' }}>What is kept in the output</summary>
              <ul className="muted" style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                <li>Page content and text stay as they are (text remains selectable). Pages are copied, not re-rendered.</li>
                <li>Bookmarks (the outline) are not carried over.</li>
                <li>Fillable form fields may lose their structure, and fields with the same name in different files may collide.</li>
                <li>Links to other pages may stop working. Web links are copied with their page.</li>
                <li>Digital signatures are invalidated by merging or splitting.</li>
                <li>Page sizes are never changed; mixed sizes stay mixed.</li>
              </ul>
            </details>
          </div>
        </>
      )}

      <Dialog
        open={prompt !== null}
        title="Password needed"
        onClose={() => {
          prompt?.resolve(null);
          setPrompt(null);
        }}
        actions={
          <>
            <button type="button" className="btn" onClick={() => { prompt?.resolve(null); setPrompt(null); }}>Skip this file</button>
            <button type="button" className="btn primary" disabled={!password} onClick={() => { prompt?.resolve(password); setPrompt(null); setPassword(''); }}>Unlock</button>
          </>
        }
      >
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!password) return;
            prompt?.resolve(password);
            setPrompt(null);
            setPassword('');
          }}
        >
          <p style={{ margin: 0 }}><b>{prompt?.fileName}</b> is password protected. The password is used in your browser only and is never stored.</p>
          <Field label="Password" error={prompt?.wrong ? 'That password is not correct. Try again.' : undefined}>
            {(id) => <input id={id} className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" autoFocus />}
          </Field>
        </form>
      </Dialog>

      <ConfirmDialog
        open={confirmClear}
        title="Start over?"
        message="All loaded files and your page arrangement will be cleared."
        confirmLabel="Start over"
        onConfirm={() => {
          setConfirmClear(false);
          clearAll();
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
