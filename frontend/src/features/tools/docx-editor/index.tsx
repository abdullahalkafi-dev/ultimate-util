'use client';

import type { Editor, JSONContent } from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banner, ConfirmDialog, Dialog, DropZone, EmptyState, ErrorBanner, Field, ProgressBar, SegmentedControl, useToast } from '@/components/ui';
import { downloadBlob, downloadText, formatBytes, outputName } from '@/lib/files';
import { DOCX_SOFT_LIMIT } from '../_shared-docs/docxFile';
import type { FidelityIssue } from '../_shared-docs/fidelity';
import { exportHtmlToPdf } from '../_shared-docs/htmlToPdf';
import { findUnsupportedScripts } from '../_shared-docs/scripts';
import { clearDraft, draftsAvailable, loadDraft, saveDraft, type Draft } from './draft';
import { EditorPane } from './EditorPane';
import { toDocxBlob, toMarkdown, toPlainText, type DocNode } from './exporters';
import { docxToEditorHtml, openDocx, OpenError } from './importDocx';
import styles from './styles.module.css';
import { Viewer } from './Viewer';

type Mode = 'empty' | 'viewer' | 'editor';
type Format = 'pdf' | 'docx' | 'html' | 'md' | 'txt';

const FORMATS: { id: Format; label: string }[] = [
  { id: 'pdf', label: 'PDF' },
  { id: 'docx', label: 'DOCX' },
  { id: 'html', label: 'HTML' },
  { id: 'md', label: 'Markdown' },
  { id: 'txt', label: 'Text' },
];
const MOBILE_EDIT_LIMIT = 20 * 1024 * 1024;
const CHANNEL = 'uu-docx-editor';

export default function DocxEditor() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('empty');
  const [name, setName] = useState('document.docx');
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [size, setSize] = useState(0);
  const [issues, setIssues] = useState<FidelityIssue[]>([]);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [initial, setInitial] = useState<string | JSONContent>('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftOk, setDraftOk] = useState(true);
  const [savedAt, setSavedAt] = useState(0);
  const [otherTab, setOtherTab] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);

  const [showPreview, setShowPreview] = useState(true);
  const [previewHtml, setPreviewHtml] = useState('');
  const [version, setVersion] = useState(0);
  const [editorKey, setEditorKey] = useState(0);
  const current = useRef<{ json: DocNode; html: string }>({ json: { type: 'doc' }, html: '' });
  const editorRef = useRef<Editor | null>(null);

  const [exportOpen, setExportOpen] = useState(false);
  const [format, setFormat] = useState<Format>('pdf');
  const [pageSize, setPageSize] = useState<'A4' | 'LETTER'>('A4');
  const [marginMm, setMarginMm] = useState(20);
  const [pageNumbers, setPageNumbers] = useState(true);
  const [exportHtml, setExportHtml] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const cancelled = useRef(false);

  // Restore offer and storage availability.
  useEffect(() => {
    void loadDraft().then(setDraft);
    void draftsAvailable().then(setDraftOk);
  }, []);

  // Draft changed in another tab.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = () => setOtherTab(true);
    return () => ch.close();
  }, []);

  const onChange = useCallback((json: JSONContent, html: string) => {
    current.current = { json: json as DocNode, html };
    setVersion((v) => v + 1);
  }, []);
  const onReady = useCallback((e: Editor) => {
    editorRef.current = e;
  }, []);

  // Debounced live preview (about 300 ms).
  useEffect(() => {
    if (mode !== 'editor' || !showPreview) return;
    const t = setTimeout(async () => {
      const DOMPurify = (await import('dompurify')).default;
      setPreviewHtml(DOMPurify.sanitize(current.current.html));
    }, 300);
    return () => clearTimeout(t);
  }, [version, mode, showPreview]);

  // Autosave every few seconds while editing.
  const lastSaved = useRef(0);
  useEffect(() => {
    if (mode !== 'editor' || version === 0) return;
    const t = setTimeout(async () => {
      const now = Date.now();
      const ok = await saveDraft({ name, doc: current.current.json, savedAt: now });
      setDraftOk(ok);
      if (ok) {
        lastSaved.current = now;
        setSavedAt(now);
        if (typeof BroadcastChannel !== 'undefined') {
          const ch = new BroadcastChannel(CHANNEL);
          ch.postMessage(now);
          ch.close();
        }
        setOtherTab(false);
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [version, mode, name]);

  useEffect(() => {
    if (mode !== 'editor' || draftOk) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [mode, draftOk]);

  async function onFiles(files: File[]) {
    const file = files[0];
    if (!file) return;
    setError('');
    setBusy('Checking the file…');
    try {
      const opened = await openDocx(file);
      setName(opened.name);
      setBytes(opened.bytes);
      setSize(file.size);
      setIssues(opened.issues);
      setNoticeDismissed(false);
      setQuery('');
      setMode('viewer');
      if (opened.large) toast(`Large file (${formatBytes(file.size)}). It may be slow.`, 'info');
    } catch (e) {
      setError(e instanceof OpenError ? e.message : 'The file could not be opened.');
    } finally {
      setBusy('');
    }
  }

  function newBlank() {
    setName('document.docx');
    setBytes(null);
    setIssues([]);
    setInitial('');
    setMode('editor');
  }

  async function startEditing() {
    if (!bytes) return;
    const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
    if (phone && size > MOBILE_EDIT_LIMIT) {
      setError('This document is too large to edit on a phone. Use a desktop browser, or keep the viewer.');
      return;
    }
    setBusy('Preparing a working copy…');
    try {
      const { html, warnings: w } = await docxToEditorHtml(bytes);
      setWarnings(w);
      setInitial(html);
      setMode('editor');
    } catch {
      setError('The document could not be loaded into the editor. You can still view it.');
    } finally {
      setBusy('');
    }
  }

  function restore() {
    if (!draft) return;
    setName(draft.name);
    setInitial(draft.doc as JSONContent);
    setBytes(null);
    setIssues([]);
    setMode('editor');
    setDraft(null);
  }

  async function discard() {
    await clearDraft();
    setDraft(null);
    setSavedAt(0);
    toast('Draft cleared', 'info');
  }

  async function reloadFromOtherTab() {
    const d = await loadDraft();
    if (d) {
      setInitial(d.doc as JSONContent);
      setEditorKey((k) => k + 1);
    }
    setOtherTab(false);
  }

  function backToEmpty() {
    setMode('empty');
    setBytes(null);
    setConfirmDiscard(false);
  }

  async function openExport() {
    setExportOpen(true);
    if (mode === 'editor') {
      setExportHtml(current.current.html);
    } else if (bytes) {
      try {
        setExportHtml((await docxToEditorHtml(bytes)).html);
      } catch {
        setExportHtml('');
      }
    }
  }

  const exportText = useMemo(() => {
    if (!exportOpen) return '';
    return mode === 'editor' ? toPlainText(current.current.json) : htmlText(exportHtml);
    // exportHtml changes when the dialog opens; current.current is a snapshot taken then.
     
  }, [exportOpen, exportHtml, mode]);
  const scripts = findUnsupportedScripts(exportText);

  async function runExport() {
    cancelled.current = false;
    setBusy(`Creating ${format.toUpperCase()}…`);
    const base = name.replace(/\.(docx|dotx)$/i, '');
    const fileName = (ext: string) => outputName(`${base}.docx`, mode === 'editor' ? 'edited' : 'export', ext);
    try {
      if (format === 'pdf') {
        const { blob } = await exportHtmlToPdf(exportHtml, { pageSize, marginMm, pageNumbers, title: base });
        if (cancelled.current) return;
        downloadBlob(blob, fileName('pdf'));
        toast(`Saved as ${fileName('pdf')}`, 'success');
      } else if (format === 'docx') {
        if (mode !== 'editor') throw new Error('Open the editor first to export DOCX.');
        const blob = await toDocxBlob(current.current.json, { pageSize, marginMm });
        if (cancelled.current) return;
        downloadBlob(blob, fileName('docx'));
        toast(`Saved as ${fileName('docx')}`, 'success');
      } else if (format === 'html') {
        const DOMPurify = (await import('dompurify')).default;
        const body = DOMPurify.sanitize(exportHtml);
        const page = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(base)}</title><style>body{font-family:system-ui,sans-serif;max-width:48rem;margin:2rem auto;line-height:1.55}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:4px 8px}img{max-width:100%}</style></head><body>${body}</body></html>`;
        downloadText(page, fileName('html'), 'text/html');
        toast(`Saved as ${fileName('html')}`, 'success');
      } else if (format === 'md' || format === 'txt') {
        if (mode !== 'editor') throw new Error('Open the editor first to export Markdown or text.');
        downloadText(format === 'md' ? toMarkdown(current.current.json) : toPlainText(current.current.json), fileName(format), format === 'md' ? 'text/markdown' : 'text/plain');
        toast(`Saved as ${fileName(format)}`, 'success');
      }
      setExportOpen(false);
    } catch (e) {
      setError(`Export failed: ${e instanceof Error ? e.message : 'unknown error'}. Try compressing or removing large images; your draft is kept.`);
    } finally {
      setBusy('');
    }
  }

  const needsEditor = mode === 'viewer' && (format === 'docx' || format === 'md' || format === 'txt');

  return (
    <div className="stack" style={{ gap: 14 }}>
      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}
      {draft && mode === 'empty' && (
        <Banner kind="info">
          <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
            <span>Restore your last draft &quot;{draft.name}&quot; from {new Date(draft.savedAt).toLocaleString()}?</span>
            <span className="row">
              <button type="button" className="btn sm primary" onClick={restore}>
                Restore
              </button>
              <button type="button" className="btn sm" onClick={discard}>
                Discard
              </button>
            </span>
          </div>
        </Banner>
      )}
      {!draftOk && mode !== 'empty' && <Banner kind="warn">Autosave is off (storage is blocked, for example in private mode). Export your work before closing the tab.</Banner>}
      {busy && mode === 'empty' && <ProgressBar label={busy} />}

      {mode === 'empty' && (
        <div className="stack">
          <DropZone onFiles={onFiles} accept={['.docx', '.dotx']} title="Open a .docx" hint="Drop a Word file here, or choose one. It stays on your device." maxBytes={150 * 1024 * 1024} onReject={setError} />
          <div className="row">
            <button type="button" className="btn primary" onClick={newBlank}>
              New blank document
            </button>
          </div>
          <EmptyState icon="doc" title="Nothing is uploaded">
            Files are read in this browser tab. Old .doc files and password-protected files are not supported; save them as .docx in Word first.
          </EmptyState>
        </div>
      )}

      {mode !== 'empty' && (
        <>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="row">
              <strong className="mono" style={{ overflowWrap: 'anywhere' }}>{name}</strong>
              {size > 0 && <span className="faint">{formatBytes(size)}</span>}
            </div>
            <div className="row">
              {mode === 'viewer' && (
                <button type="button" className="btn primary" onClick={startEditing} disabled={!!busy}>
                  Edit a copy
                </button>
              )}
              {mode === 'editor' && bytes && (
                <button type="button" className="btn" onClick={() => setConfirmDiscard(true)}>
                  View original
                </button>
              )}
              <button type="button" className="btn primary" onClick={openExport} disabled={!!busy}>
                Export
              </button>
              <button type="button" className="btn" onClick={() => (mode === 'editor' ? setConfirmDiscard(true) : backToEmpty())}>
                Close
              </button>
            </div>
          </div>
          {busy && <ProgressBar label={busy} onCancel={() => (cancelled.current = true)} />}
          {issues.length > 0 && !noticeDismissed && (
            <Banner kind="warn" onDismiss={() => setNoticeDismissed(true)}>
              <strong>This document has features the editor cannot fully keep.</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {issues.map((i) => (
                  <li key={i.id}>{i.label}</li>
                ))}
              </ul>
              <div className="hint">The viewer shows the original. Editing works on a simplified copy; your original file is never changed.</div>
            </Banner>
          )}
          {warnings.length > 0 && mode === 'editor' && (
            <Banner kind="info" onDismiss={() => setWarnings([])}>
              Conversion notes: {Array.from(new Set(warnings)).slice(0, 4).join(' ')}
            </Banner>
          )}
          {otherTab && mode === 'editor' && (
            <Banner kind="warn" onDismiss={() => setOtherTab(false)}>
              The draft was changed in another tab. Your next autosave replaces it.{' '}
              <button type="button" className="btn sm" onClick={reloadFromOtherTab}>
                Load the other version
              </button>
            </Banner>
          )}

          {mode === 'viewer' && bytes && (
            <div className="panel flush">
              <div className={styles.find}>
                <label className="row" style={{ gap: 6 }}>
                  <span className="muted">Zoom</span>
                  <select className="select" style={{ height: 32 }} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom">
                    {[0.5, 0.75, 1, 1.25, 1.5].map((z) => (
                      <option key={z} value={z}>
                        {Math.round(z * 100)}%
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  className="input"
                  style={{ width: 200 }}
                  aria-label="Search in document"
                  placeholder="Search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setMatchIndex(0);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && setMatchIndex((i) => i + (e.shiftKey ? -1 : 1))}
                />
                <button type="button" className="btn sm" onClick={() => setMatchIndex((i) => i - 1)} disabled={!matchCount}>
                  Previous
                </button>
                <button type="button" className="btn sm" onClick={() => setMatchIndex((i) => i + 1)} disabled={!matchCount}>
                  Next
                </button>
                <span className="muted" aria-live="polite">
                  {query ? (matchCount ? `${matchCount} match${matchCount === 1 ? '' : 'es'}` : 'No matches') : ''}
                </span>
              </div>
              <Viewer bytes={bytes} zoom={zoom} query={query} matchIndex={matchIndex} onMatches={setMatchCount} />
            </div>
          )}

          {mode === 'editor' && (
            <>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <label className="row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={showPreview} onChange={(e) => setShowPreview(e.target.checked)} /> Live page preview
                </label>
                <span className="row">
                  <span className="hint" aria-live="polite">
                    Local, not uploaded. {draftOk ? (savedAt ? `Autosaved ${new Date(savedAt).toLocaleTimeString()}` : 'Autosave on') : 'Autosave off'}
                  </span>
                  <button type="button" className="btn sm" onClick={discard}>
                    Clear draft
                  </button>
                </span>
              </div>
              <div className={showPreview ? 'split' : ''}>
                <div className="panel flush">
                  <EditorPane key={editorKey} initial={initial} onChange={onChange} onReady={onReady} />
                </div>
                {showPreview && (
                  <div className="panel flush">
                    <div className="hint" style={{ padding: 8 }}>
                      Preview. Lines mark approximate page ends; the PDF is paginated at export.
                    </div>
                    <div className={styles.surface}>
                      <div
                        className={`${styles.page} ${pageSize === 'A4' ? styles.a4 : styles.letter}`}
                        role="document"
                        aria-label="Page preview"
                        style={{ padding: `${marginMm}mm`, minHeight: pageSize === 'A4' ? '297mm' : '279.4mm' }}
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      <Dialog
        open={exportOpen}
        title="Export"
        onClose={() => !busy && setExportOpen(false)}
        actions={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => {
                cancelled.current = true;
                setBusy('');
                setExportOpen(false);
              }}
            >
              {busy ? 'Cancel' : 'Close'}
            </button>
            <button type="button" className="btn primary" onClick={runExport} disabled={!!busy || needsEditor || (format === 'pdf' && !exportHtml)}>
              {busy ? 'Working…' : 'Export'}
            </button>
          </>
        }
      >
        <div className="stack">
          <SegmentedControl label="Format" options={FORMATS} value={format} onChange={setFormat} />
          {needsEditor && <Banner kind="info">This format needs the editor. Choose Edit a copy first, or export PDF or HTML from the viewer.</Banner>}
          {(format === 'pdf' || format === 'docx') && (
            <div className="grid-2">
              <Field label="Page size">
                {(id) => (
                  <select id={id} className="select" value={pageSize} onChange={(e) => setPageSize(e.target.value as 'A4' | 'LETTER')}>
                    <option value="A4">A4</option>
                    <option value="LETTER">US Letter</option>
                  </select>
                )}
              </Field>
              <Field label="Margins">
                {(id) => (
                  <select id={id} className="select" value={marginMm} onChange={(e) => setMarginMm(Number(e.target.value))}>
                    <option value={12}>Narrow (12 mm)</option>
                    <option value={20}>Normal (20 mm)</option>
                    <option value={30}>Wide (30 mm)</option>
                  </select>
                )}
              </Field>
            </div>
          )}
          {format === 'pdf' && (
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={pageNumbers} onChange={(e) => setPageNumbers(e.target.checked)} /> Page numbers
            </label>
          )}
          {format === 'pdf' && scripts.length > 0 && (
            <Banner kind="warn">
              This document uses {scripts.join(', ')} text. The bundled PDF font does not include it, so those characters will not display correctly in the PDF. Export DOCX or HTML to keep the text intact.
            </Banner>
          )}
          {format === 'pdf' && <p className="hint">Fonts: Roboto is used for all text (Calibri, Cambria and other fonts are substituted). Text stays selectable.</p>}
          {format === 'docx' && size > DOCX_SOFT_LIMIT && <p className="hint">Large documents can take a while.</p>}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmDiscard}
        title={mode === 'editor' && bytes ? 'View the original?' : 'Close this document?'}
        message="Edits in the working copy will be dropped from the screen. The last autosaved draft stays on this device until you clear it."
        confirmLabel={mode === 'editor' && bytes ? 'View original' : 'Close'}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          if (mode === 'editor' && bytes) {
            setMode('viewer');
            setConfirmDiscard(false);
          } else backToEmpty();
        }}
      />
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

function htmlText(html: string): string {
  return html.replace(/<[^>]+>/g, ' ');
}
