'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Banner, DropZone, ErrorBanner, Field, ProgressBar, SegmentedControl, useToast } from '@/components/ui';
import { downloadBlob, formatBytes, outputName, readFirstBytes, sniffType, zipFiles } from '@/lib/files';
import { Cancelled, docxToPdf, PasswordNeeded, pdfToDocx, type Control } from './convert';
import type { FidelityReport } from './toDocx';

type Direction = 'docx-pdf' | 'pdf-docx';
type Kind = 'pdf' | 'docx' | 'bad';
type Status = 'queued' | 'working' | 'done' | 'error' | 'password' | 'scanned';

interface Item {
  id: number;
  file: File;
  kind: Kind;
  status: Status;
  message?: string;
  wrongPassword?: boolean;
  blob?: Blob;
  outName?: string;
  report?: FidelityReport;
  lines?: string[];
}

const MAX_FILES = 20;
const PDF_SOFT = 100 * 1024 * 1024;
const DOCX_SOFT = 50 * 1024 * 1024;
let nextId = 1;

async function classify(file: File): Promise<{ kind: Kind; message?: string }> {
  if (file.size === 0) return { kind: 'bad', message: 'This file is empty.' };
  const type = sniffType(await readFirstBytes(file));
  if (type === 'pdf') return { kind: 'pdf' };
  if (type === 'zip' || type === 'docx') return { kind: 'docx' };
  if (type === 'ole') return { kind: 'bad', message: 'This is an old .doc or a password-protected Office file. Save it as .docx in Word first.' };
  return { kind: 'bad', message: type === 'unknown' ? 'This is not a PDF or DOCX file.' : `This looks like a ${type.toUpperCase()} file, not a PDF or DOCX.` };
}

export default function PdfDocxConverter() {
  const toast = useToast();
  const [direction, setDirection] = useState<Direction>('pdf-docx');
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ value: number; label: string } | null>(null);
  const control = useRef<Control>({ cancelled: false });

  const [pageRange, setPageRange] = useState('');
  const [detectStructure, setDetectStructure] = useState(true);
  const [pageSize, setPageSize] = useState<'A4' | 'LETTER'>('A4');
  const [marginMm, setMarginMm] = useState(20);
  const [passwords, setPasswords] = useState<Record<number, string>>({});

  const patch = (id: number, p: Partial<Item>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)));

  async function onFiles(files: File[]) {
    setError('');
    const room = MAX_FILES - items.length;
    if (files.length > room) setError(`At most ${MAX_FILES} files at a time; extra files were skipped.`);
    const added: Item[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      const { kind, message } = await classify(file);
      added.push({ id: nextId++, file, kind, status: kind === 'bad' ? 'error' : 'queued', message });
    }
    setItems((list) => [...list, ...added]);
    const first = added.find((a) => a.kind !== 'bad');
    if (first && items.length === 0) setDirection(first.kind === 'pdf' ? 'pdf-docx' : 'docx-pdf');
  }

  async function convertOne(item: Item, password?: string) {
    patch(item.id, { status: 'working', message: undefined, wrongPassword: false });
    const bytes = new Uint8Array(await item.file.arrayBuffer());
    const base = item.file.name;
    const onProgress = (value: number, label: string) => setProgress({ value: value * 100, label: `${item.file.name}: ${label}` });
    try {
      if (item.kind === 'pdf') {
        const res = await pdfToDocx(bytes, { pageRange, detectStructure, password }, control.current, onProgress);
        if (res.allScanned || !res.blob) {
          patch(item.id, { status: 'scanned', report: res.report, message: 'This PDF has no text layer (it looks scanned).' });
          return;
        }
        patch(item.id, { status: 'done', blob: res.blob, outName: outputName(base, 'converted', 'docx'), report: res.report });
      } else {
        const res = await docxToPdf(bytes, { pageSize, marginMm }, control.current, onProgress);
        const lines = [`${res.pages || 'Unknown number of'} page${res.pages === 1 ? '' : 's'} created.`, ...res.notes];
        if (res.unsupportedScripts.length) lines.push(`${res.unsupportedScripts.join(', ')} text cannot be drawn with the bundled PDF font and will show incorrectly. Use a different export for that text.`);
        patch(item.id, { status: 'done', blob: res.blob, outName: outputName(base, 'converted', 'pdf'), lines });
      }
    } catch (e) {
      if (e instanceof Cancelled) patch(item.id, { status: 'queued', message: 'Cancelled.' });
      else if (e instanceof PasswordNeeded) patch(item.id, { status: 'password', wrongPassword: e.wrong, message: e.message });
      else patch(item.id, { status: 'error', message: e instanceof Error ? e.message : 'Conversion failed.' });
    }
  }

  async function convertAll() {
    control.current = { cancelled: false };
    setBusy(true);
    setError('');
    for (const item of items) {
      if (control.current.cancelled) break;
      if (item.status === 'queued') await convertOne(item);
    }
    setProgress(null);
    setBusy(false);
  }

  async function unlock(item: Item) {
    control.current = { cancelled: false };
    setBusy(true);
    await convertOne(item, passwords[item.id] ?? '');
    setPasswords((p) => ({ ...p, [item.id]: '' }));
    setProgress(null);
    setBusy(false);
  }

  async function downloadAll() {
    const done = items.filter((i) => i.status === 'done' && i.blob && i.outName);
    const files = await Promise.all(done.map(async (i) => ({ name: i.outName as string, data: new Uint8Array(await (i.blob as Blob).arrayBuffer()) })));
    downloadBlob(await zipFiles(files), 'converted-files.zip');
    toast('Saved converted-files.zip', 'success');
  }

  const pending = items.some((i) => i.status === 'queued');
  const done = items.filter((i) => i.status === 'done');
  const showPdf = direction === 'pdf-docx' || items.some((i) => i.kind === 'pdf');
  const showDocx = direction === 'docx-pdf' || items.some((i) => i.kind === 'docx');
  const big = items.find((i) => (i.kind === 'pdf' && i.file.size > PDF_SOFT) || (i.kind === 'docx' && i.file.size > DOCX_SOFT));

  return (
    <div className="stack" style={{ gap: 16 }}>
      <SegmentedControl
        label="Direction"
        value={direction}
        onChange={setDirection}
        options={[
          { id: 'docx-pdf', label: 'DOCX to PDF' },
          { id: 'pdf-docx', label: 'PDF to DOCX' },
        ]}
      />
      <DropZone
        multiple
        onFiles={onFiles}
        accept={direction === 'pdf-docx' ? ['.pdf'] : ['.docx']}
        title={direction === 'pdf-docx' ? 'Drop PDF files' : 'Drop Word files'}
        hint="Dropping a file picks the direction automatically. Files never leave your device."
        onReject={setError}
      />
      <p className="hint">Text and structure are converted. Complex layouts may differ.</p>
      {error && <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>}
      {big && <Banner kind="warn">{big.file.name} is large ({formatBytes(big.file.size)}). Conversion may be slow; for PDFs, a page range helps.</Banner>}

      {items.length > 0 && (
        <div className="panel stack">
          <h2 className="panel-title">Options</h2>
          <div className="grid-2">
            {showPdf && (
              <>
                <Field label="PDF page range" hint="Example: 1-5, 8. Empty means all pages.">
                  {(id) => <input id={id} className="input" value={pageRange} onChange={(e) => setPageRange(e.target.value)} placeholder="All pages" />}
                </Field>
                <label className="row" style={{ gap: 6, alignSelf: 'end' }}>
                  <input type="checkbox" checked={detectStructure} onChange={(e) => setDetectStructure(e.target.checked)} /> Detect headings, lists and tables
                </label>
              </>
            )}
            {showDocx && (
              <>
                <Field label="PDF page size">
                  {(id) => (
                    <select id={id} className="select" value={pageSize} onChange={(e) => setPageSize(e.target.value as 'A4' | 'LETTER')}>
                      <option value="A4">A4</option>
                      <option value="LETTER">US Letter</option>
                    </select>
                  )}
                </Field>
                <Field label="PDF margins">
                  {(id) => (
                    <select id={id} className="select" value={marginMm} onChange={(e) => setMarginMm(Number(e.target.value))}>
                      <option value={12}>Narrow (12 mm)</option>
                      <option value={20}>Normal (20 mm)</option>
                      <option value={30}>Wide (30 mm)</option>
                    </select>
                  )}
                </Field>
              </>
            )}
          </div>
          {showDocx && <p className="hint">Fonts: all text uses Roboto in the PDF; other fonts are substituted and embedded.</p>}
          <div className="row">
            <button type="button" className="btn primary" onClick={convertAll} disabled={busy || !pending}>
              Convert
            </button>
            <button type="button" className="btn" onClick={() => setItems([])} disabled={busy}>
              Clear list
            </button>
            {done.length > 1 && (
              <button type="button" className="btn" onClick={downloadAll}>
                Download all (ZIP)
              </button>
            )}
          </div>
          {progress && (
            <ProgressBar
              value={progress.value}
              label={progress.label}
              onCancel={() => {
                control.current.cancelled = true;
              }}
            />
          )}
        </div>
      )}

      <div className="stack" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className="panel stack" style={{ gap: 8 }}>
            <div className="file-row" style={{ border: 0, padding: 0 }}>
              <span className="name grow">{item.file.name}</span>
              <span className="faint">{formatBytes(item.file.size)}</span>
              <span className="tag">{statusLabel(item.status)}</span>
              {item.status === 'done' && item.blob && (
                <button type="button" className="btn sm primary" onClick={() => downloadBlob(item.blob as Blob, item.outName ?? 'converted')}>
                  Download
                </button>
              )}
              {!busy && (
                <button type="button" className="btn sm ghost" aria-label={`Remove ${item.file.name}`} onClick={() => setItems((l) => l.filter((i) => i.id !== item.id))}>
                  Remove
                </button>
              )}
            </div>
            {item.status === 'error' && <ErrorBanner>{item.message}</ErrorBanner>}
            {item.status === 'queued' && item.message && <p className="hint">{item.message}</p>}
            {item.status === 'password' && (
              <div className="row">
                <Field label="Password" error={item.wrongPassword ? 'That password is not correct. Try again.' : undefined}>
                  {(id) => (
                    <input
                      id={id}
                      type="password"
                      className="input"
                      autoComplete="off"
                      value={passwords[item.id] ?? ''}
                      onChange={(e) => setPasswords((p) => ({ ...p, [item.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && unlock(item)}
                    />
                  )}
                </Field>
                <button type="button" className="btn primary" disabled={busy} onClick={() => unlock(item)}>
                  Unlock and convert
                </button>
              </div>
            )}
            {item.status === 'scanned' && (
              <Banner kind="warn">
                {item.message} No file was created. Run text recognition first: <Link href="/tools/ocr">open the OCR tool</Link>, make the PDF searchable, then convert it here.
              </Banner>
            )}
            {item.report && item.status !== 'scanned' && <ReportView report={item.report} />}
            {item.report && item.status === 'scanned' && item.report.pagesTotal > 0 && <p className="hint">Scanned pages: {item.report.scannedPages.join(', ')}</p>}
            {item.lines && (
              <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
                {item.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function statusLabel(s: Status): string {
  return { queued: 'Ready', working: 'Converting', done: 'Done', error: 'Failed', password: 'Password needed', scanned: 'Scanned' }[s];
}

function ReportView({ report }: { report: FidelityReport }) {
  const parts = [`${report.pagesConverted} of ${report.pagesTotal} page${report.pagesTotal === 1 ? '' : 's'} converted`, `${report.paragraphs} paragraphs`, `${report.headings} headings`, `${report.lists} list items`, `${report.tables} table${report.tables === 1 ? '' : 's'} detected`];
  return (
    <div className="stack" style={{ gap: 4 }}>
      <strong>Fidelity report</strong>
      <div className="muted">{parts.join(', ')}.</div>
      {report.scannedPages.length > 0 && (
        <div className="muted">
          Pages that look scanned and were skipped: {report.scannedPages.join(', ')}. <Link href="/tools/ocr">Run OCR on them</Link>.
        </div>
      )}
      {report.lowConfidencePages.length > 0 && <div className="muted">Pages that may differ (columns or tables reconstructed): {report.lowConfidencePages.join(', ')}.</div>}
      <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
        {report.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
