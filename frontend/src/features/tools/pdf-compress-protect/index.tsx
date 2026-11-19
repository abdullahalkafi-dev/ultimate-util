'use client';

import { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import {
  Banner,
  Dialog,
  DropZone,
  Field,
  Icon,
  ProgressBar,
  SegmentedControl,
  SliderField,
  StatTile,
  Tabs,
  useToast,
} from '@/components/ui';
import { downloadBlob, formatBytes, outputName, readFirstBytes, sniffType, zipFiles } from '@/lib/files';
import { BeforeAfter } from '../_shared-images/BeforeAfter';
import { decryptWithPrompt, isEncryptedError } from '../_pdf-shared/decrypt';
import { looksPdfA, looksSigned } from '../_pdf-shared/detect';
import { openPdf, renderPageToCanvas } from '../_pdf-shared/pdfjs';
import { QpdfError, isAbort, startQpdf, type QpdfJob } from '../_pdf-shared/qpdf';
import { decryptArgs, encryptArgs, optimizeArgs, type Permissions } from '../_pdf-shared/qpdf-run';
import { canvasReencoder } from './canvas-reencoder';
import { recompressImages, stripMetadata, type ImageReport } from './compress';
import { PRESETS, TARGET_LADDER, bestForTarget, pickSmaller, type CompressSettings, type PresetId } from './plan';

type TabId = 'compress' | 'protect' | 'unlock';

interface PdfItem {
  id: number;
  file: File;
  bytes: Uint8Array;
  signed: boolean;
  pdfA: boolean;
  status: 'ready' | 'working' | 'done' | 'error' | 'cancelled';
  message?: string;
  outBytes?: Uint8Array;
  outName?: string;
  note?: string;
  report?: ImageReport;
  beforePreviewUrl?: string;
  afterPreviewUrl?: string;
}

const SOFT_PDF_BYTES = 200 * 1024 * 1024;
const MAX_BATCH = 50;

function strengthLabel(pw: string): string {
  if (pw.length === 0) return 'Empty';
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return 'Weak (easy to guess)';
  if (score <= 3) return 'Fair';
  return 'Strong';
}

export default function PdfCompressProtect() {
  const toast = useToast();
  const [tab, setTab] = useState<TabId>('compress');
  const [items, setItems] = useState<PdfItem[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ pct?: number; label: string }>({ label: 'Working…' });
  const [banner, setBanner] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<number | null>(null);

  // Compress options
  const [preset, setPreset] = useState<PresetId>('balanced');
  const [customSettings, setCustomSettings] = useState<CompressSettings>(PRESETS.balanced);
  const [targetEnabled, setTargetEnabled] = useState(false);
  const [targetMb, setTargetMb] = useState(2);
  const [dropMeta, setDropMeta] = useState(true);

  // Protect options
  const [userPass, setUserPass] = useState('');
  const [userPass2, setUserPass2] = useState('');
  const [ownerPass, setOwnerPass] = useState('');
  const [showProtectPass, setShowProtectPass] = useState(false);
  const [perms, setPerms] = useState<Permissions>({ print: true, copy: false, modify: false });

  // Unlock options
  const [unlockPass, setUnlockPass] = useState('');
  const [showUnlockPass, setShowUnlockPass] = useState(false);

  // In-page password prompt for encrypted inputs during Compress/Protect
  const [pwPrompt, setPwPrompt] = useState<{ fileName: string; wrong: boolean } | null>(null);
  const [pwInput, setPwInput] = useState('');
  const pwResolver = useRef<((pw: string | null) => void) | null>(null);

  const activeJob = useRef<QpdfJob | null>(null);
  const cancelledRef = useRef(false);
  const nextId = useRef(1);
  const itemsRef = useRef<PdfItem[]>([]);
  itemsRef.current = items;

  useEffect(
    () => () => {
      activeJob.current?.cancel();
      for (const it of itemsRef.current) {
        if (it.beforePreviewUrl) URL.revokeObjectURL(it.beforePreviewUrl);
        if (it.afterPreviewUrl) URL.revokeObjectURL(it.afterPreviewUrl);
      }
    },
    [],
  );

  function askPassword(fileName: string, wrong: boolean): Promise<string | null> {
    return new Promise((resolve) => {
      pwResolver.current = resolve;
      setPwInput('');
      setPwPrompt({ fileName, wrong });
    });
  }

  function submitPasswordPrompt(pw: string | null) {
    setPwPrompt(null);
    pwResolver.current?.(pw);
    pwResolver.current = null;
  }

  function applyPreset(id: PresetId) {
    setPreset(id);
    setCustomSettings(PRESETS[id]);
  }

  async function addFiles(files: File[]) {
    setBanner(null);
    const room = MAX_BATCH - items.length;
    if (room <= 0) {
      setBanner(`Batch limit is ${MAX_BATCH} PDFs.`);
      return;
    }
    const added: PdfItem[] = [];
    for (const file of files.slice(0, room)) {
      if (file.size === 0) {
        added.push({ id: nextId.current++, file, bytes: new Uint8Array(0), signed: false, pdfA: false, status: 'error', message: 'File is empty (0 bytes).' });
        continue;
      }
      const head = await readFirstBytes(file);
      const sniffed = sniffType(head);
      if (sniffed !== 'pdf') {
        added.push({
          id: nextId.current++,
          file,
          bytes: new Uint8Array(0),
          signed: false,
          pdfA: false,
          status: 'error',
          message: `Expected a PDF, detected ${sniffed === 'unknown' ? 'another file type' : sniffed}.`,
        });
        continue;
      }
      if (file.size > SOFT_PDF_BYTES) setBanner(`${file.name} is over 200 MB; processing may require significant memory.`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      added.push({
        id: nextId.current++,
        file,
        bytes,
        signed: looksSigned(bytes),
        pdfA: looksPdfA(bytes),
        status: 'ready',
      });
    }
    setItems((prev) => [...prev, ...added]);
  }

  async function tryExample() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    page.drawText('Ultimate Util Sample PDF', { x: 48, y: 720, size: 22 });

    // Create a colorful raster photo inside the PDF so compression visibly shrinks it
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 900;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 1200, 900);
      grad.addColorStop(0, '#2446f0');
      grad.addColorStop(0.5, '#7440e8');
      grad.addColorStop(1, '#d6246e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1200, 900);
      const pngBlob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (pngBlob) {
        const img = await doc.embedPng(new Uint8Array(await pngBlob.arrayBuffer()));
        page.drawImage(img, { x: 48, y: 200, width: 500, height: 375 });
      }
    }
    const bytes = await doc.save();
    await addFiles([new File([bytes.slice().buffer], 'sample-scan.pdf', { type: 'application/pdf' })]);
  }

  async function renderFirstPagePreview(bytes: Uint8Array): Promise<string | undefined> {
    try {
      const doc = await openPdf(bytes);
      const c = await renderPageToCanvas(doc, 1, 1);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
      c.width = c.height = 0;
      void doc.cleanup();
      return blob ? URL.createObjectURL(blob) : undefined;
    } catch {
      return undefined;
    }
  }

  async function compressOne(bytes: Uint8Array, s: CompressSettings, itemIndex: number, total: number): Promise<{ bytes: Uint8Array; report: ImageReport }> {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const report = await recompressImages(
      doc,
      s,
      canvasReencoder,
      () => cancelledRef.current,
      (done, count) => {
        const frac = count > 0 ? done / count : 1;
        setProgress({ pct: ((itemIndex + frac * 0.8) / total) * 100, label: `Recompressing images (${done}/${count})…` });
      },
    );
    if (dropMeta) stripMetadata(doc);
    let saved = await doc.save({ useObjectStreams: true });
    if (cancelledRef.current) throw new DOMException('Cancelled', 'AbortError');
    setProgress({ pct: ((itemIndex + 0.9) / total) * 100, label: 'Optimizing PDF object streams…' });
    try {
      const job = startQpdf(saved, optimizeArgs);
      activeJob.current = job;
      const opt = await job.promise;
      activeJob.current = null;
      if (opt.length < saved.length) saved = opt;
    } catch (err) {
      if (isAbort(err)) throw err;
    }
    return { bytes: saved, report };
  }

  async function runAction() {
    if (tab === 'protect') {
      if (!userPass && !ownerPass) {
        setBanner('Enter at least an open password or a permissions password.');
        return;
      }
      if (userPass !== userPass2) {
        setBanner('The two open passwords do not match.');
        return;
      }
    }

    const queue = items.filter((i) => i.status !== 'error' || i.bytes.length > 0);
    if (!queue.length) return;

    cancelledRef.current = false;
    setRunning(true);
    setBanner(null);

    for (let idx = 0; idx < queue.length; idx++) {
      if (cancelledRef.current) break;
      const item = queue[idx]!;
      setItems((l) => l.map((x) => (x.id === item.id ? { ...x, status: 'working', message: undefined } : x)));

      try {
        if (tab === 'compress') {
          let workingBytes = item.bytes;
          let wasEncrypted = false;
          try {
            await PDFDocument.load(workingBytes, { updateMetadata: false });
          } catch (err) {
            if (isEncryptedError(err)) {
              const dec = await decryptWithPrompt(workingBytes, item.file.name, askPassword);
              if ('skipped' in dec) {
                setItems((l) => l.map((x) => (x.id === item.id ? { ...x, status: 'cancelled', message: 'Skipped password-protected PDF.' } : x)));
                continue;
              }
              workingBytes = dec.bytes;
              wasEncrypted = true;
            } else {
              throw err;
            }
          }

          let finalOut: Uint8Array;
          let report: ImageReport;
          let extraNote = wasEncrypted ? 'Input was encrypted; re-apply protection in the Protect tab if needed. ' : '';

          if (targetEnabled) {
            const targetBytes = Math.round(targetMb * 1024 * 1024);
            const candidates: { settings: CompressSettings; bytes: Uint8Array; report: ImageReport }[] = [];
            for (const step of TARGET_LADDER) {
              if (cancelledRef.current) throw new DOMException('Cancelled', 'AbortError');
              const res = await compressOne(workingBytes, step, idx, queue.length);
              candidates.push({ settings: step, bytes: res.bytes, report: res.report });
              if (res.bytes.length <= targetBytes) break;
            }
            const best = bestForTarget(
              candidates.map((c) => ({ settings: c.settings, size: c.bytes.length })),
              targetBytes,
            );
            const match = candidates.find((c) => c.settings === best.settings) ?? candidates[candidates.length - 1]!;
            finalOut = match.bytes;
            report = match.report;
            if (!best.reached) {
              extraNote += `Target ${targetMb} MB could not be reached; smallest achievable size is ${formatBytes(finalOut.length)}. `;
            }
          } else {
            const res = await compressOne(workingBytes, customSettings, idx, queue.length);
            finalOut = res.bytes;
            report = res.report;
          }

          const picked = pickSmaller(item.bytes, finalOut);
          const beforePreviewUrl = await renderFirstPagePreview(workingBytes);
          const afterPreviewUrl = !picked.original ? await renderFirstPagePreview(picked.bytes) : undefined;
          const note =
            extraNote +
            (picked.original
              ? 'Already well optimized — kept original bytes.'
              : `Images recompressed: ${report.recompressed} of ${report.found}.`);

          setItems((l) =>
            l.map((x) =>
              x.id === item.id
                ? {
                    ...x,
                    status: 'done',
                    outBytes: picked.bytes,
                    outName: outputName(item.file.name, 'compressed'),
                    report,
                    note,
                    beforePreviewUrl,
                    afterPreviewUrl,
                  }
                : x,
            ),
          );
        } else if (tab === 'protect') {
          setProgress({ pct: (idx / queue.length) * 100, label: `Encrypting ${item.file.name} (AES-256)…` });
          let workingBytes = item.bytes;
          try {
            await PDFDocument.load(workingBytes, { updateMetadata: false });
          } catch (err) {
            if (isEncryptedError(err)) {
              const dec = await decryptWithPrompt(workingBytes, item.file.name, askPassword);
              if ('skipped' in dec) {
                setItems((l) => l.map((x) => (x.id === item.id ? { ...x, status: 'cancelled', message: 'Skipped encrypted file.' } : x)));
                continue;
              }
              workingBytes = dec.bytes;
            }
          }
          const job = startQpdf(workingBytes, encryptArgs(userPass, ownerPass || userPass, perms));
          activeJob.current = job;
          const out = await job.promise;
          activeJob.current = null;
          setItems((l) =>
            l.map((x) =>
              x.id === item.id
                ? {
                    ...x,
                    status: 'done',
                    outBytes: out,
                    outName: outputName(item.file.name, 'protected'),
                    note: 'Encrypted with AES-256.',
                  }
                : x,
            ),
          );
        } else {
          setProgress({ pct: (idx / queue.length) * 100, label: `Unlocking ${item.file.name}…` });
          let out: Uint8Array;
          let note = 'Password protection removed.';
          try {
            const emptyJob = startQpdf(item.bytes, decryptArgs(''));
            activeJob.current = emptyJob;
            out = await emptyJob.promise;
            activeJob.current = null;
            note = 'Owner-only restrictions removed without needing a password.';
          } catch (err) {
            if (isAbort(err)) throw err;
            if (err instanceof QpdfError && (err.reason === 'wrong-password' || err.reason === 'password-required')) {
              if (!unlockPass) {
                throw new Error('This PDF requires an open password. Enter the password above and try again.');
              }
              const pwJob = startQpdf(item.bytes, decryptArgs(unlockPass));
              activeJob.current = pwJob;
              out = await pwJob.promise;
              activeJob.current = null;
            } else {
              throw err;
            }
          }
          setItems((l) =>
            l.map((x) =>
              x.id === item.id
                ? { ...x, status: 'done', outBytes: out, outName: outputName(item.file.name, 'unlocked'), note }
                : x,
            ),
          );
        }
      } catch (err) {
        activeJob.current = null;
        if (isAbort(err) || cancelledRef.current) {
          setItems((l) => l.map((x) => (x.id === item.id ? { ...x, status: 'cancelled', message: 'Cancelled.' } : x)));
        } else {
          const msg =
            err instanceof QpdfError && err.reason === 'wrong-password'
              ? 'Incorrect password. Forgotten passwords cannot be recovered.'
              : err instanceof Error
                ? err.message
                : 'Failed to process PDF.';
          setItems((l) => l.map((x) => (x.id === item.id ? { ...x, status: 'error', message: msg } : x)));
        }
      }
    }

    setRunning(false);
    setProgress({ label: 'Done' });
    if (!cancelledRef.current) toast('Finished processing PDF(s)', 'success');
  }

  function cancelAll() {
    cancelledRef.current = true;
    activeJob.current?.cancel();
    activeJob.current = null;
    setRunning(false);
  }

  function startOver() {
    cancelAll();
    for (const it of items) {
      if (it.beforePreviewUrl) URL.revokeObjectURL(it.beforePreviewUrl);
      if (it.afterPreviewUrl) URL.revokeObjectURL(it.afterPreviewUrl);
    }
    setItems([]);
    setCompareId(null);
    setBanner(null);
  }

  async function downloadAllZip() {
    const done = items.filter((i) => i.outBytes && i.outName);
    if (!done.length) return;
    const zip = await zipFiles(done.map((d) => ({ name: d.outName!, data: d.outBytes! })));
    downloadBlob(zip, `pdfs-${tab}.zip`);
  }

  const doneItems = items.filter((i) => i.outBytes && i.outName);
  const compareItem = items.find((i) => i.id === compareId && i.beforePreviewUrl && i.afterPreviewUrl);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Tabs<TabId>
        label="PDF tools"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'compress', label: 'Compress' },
          { id: 'protect', label: 'Protect (AES-256)' },
          { id: 'unlock', label: 'Unlock' },
        ]}
      />

      {banner && <Banner kind="warn" onDismiss={() => setBanner(null)}>{banner}</Banner>}

      {items.length === 0 ? (
        <div className="stack">
          <DropZone
            multiple
            accept={['application/pdf', '.pdf']}
            maxBytes={500 * 1024 * 1024}
            title="Drop PDF files here"
            hint="Up to 50 PDFs · Compress images, add AES-256 encryption, or unlock with your password · Runs locally"
            onFiles={(f) => void addFiles(f)}
            onReject={(m) => setBanner(m)}
          />
          <div className="row">
            <button type="button" className="btn" onClick={() => void tryExample()}>Try an example</button>
            <span className="hint">Passwords and PDF contents never leave your browser.</span>
          </div>
        </div>
      ) : (
        <>
          {items.some((i) => i.signed || i.pdfA) && (
            <Banner kind="warn">
              One or more PDFs appear to be digitally signed or PDF/A compliant. Compressing or encrypting will invalidate digital signatures and PDF/A conformance.
            </Banner>
          )}

          <section className="panel stack" aria-label="PDF action settings">
            {tab === 'compress' && (
              <div className="stack">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <SegmentedControl<PresetId>
                    label="Compression preset"
                    value={preset}
                    onChange={applyPreset}
                    options={[
                      { id: 'light', label: 'Light' },
                      { id: 'balanced', label: 'Balanced' },
                      { id: 'strong', label: 'Strong' },
                    ]}
                  />
                  <span className="hint">{PRESETS[preset].hint}</span>
                </div>

                <div className="grid-2">
                  <SliderField
                    label="Max image DPI (A4 reference)"
                    value={customSettings.dpi}
                    min={72}
                    max={300}
                    unit="dpi"
                    onChange={(dpi) => setCustomSettings((s) => ({ ...s, dpi }))}
                  />
                  <SliderField
                    label="JPEG image quality"
                    value={Math.round(customSettings.quality * 100)}
                    min={25}
                    max={95}
                    unit="%"
                    onChange={(pct) => setCustomSettings((s) => ({ ...s, quality: pct / 100 }))}
                  />
                </div>

                <div className="row" style={{ gap: 20 }}>
                  <label className="check">
                    <input type="checkbox" checked={dropMeta} onChange={(e) => setDropMeta(e.target.checked)} />
                    Remove document metadata (title, author, XMP)
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={targetEnabled} onChange={(e) => setTargetEnabled(e.target.checked)} />
                    Target size limit (auto-step quality)
                  </label>
                  {targetEnabled && (
                    <Field label="Target (MB)">
                      {(id) => (
                        <input
                          id={id}
                          type="number"
                          className="input"
                          style={{ width: 100 }}
                          min={0.1}
                          max={100}
                          step={0.5}
                          value={targetMb}
                          onChange={(e) => setTargetMb(Math.max(0.1, Number(e.target.value) || 2))}
                        />
                      )}
                    </Field>
                  )}
                </div>
              </div>
            )}

            {tab === 'protect' && (
              <div className="stack">
                <div className="grid-2">
                  <Field label="Open password (required to view)" hint={userPass ? `Strength: ${strengthLabel(userPass)}` : undefined}>
                    {(id) => (
                      <input
                        id={id}
                        className="input"
                        type={showProtectPass ? 'text' : 'password'}
                        value={userPass}
                        onChange={(e) => setUserPass(e.target.value)}
                        autoComplete="new-password"
                      />
                    )}
                  </Field>
                  <Field label="Confirm open password">
                    {(id) => (
                      <input
                        id={id}
                        className="input"
                        type={showProtectPass ? 'text' : 'password'}
                        value={userPass2}
                        onChange={(e) => setUserPass2(e.target.value)}
                        autoComplete="new-password"
                      />
                    )}
                  </Field>
                </div>
                <Field label="Permissions / owner password (optional; defaults to open password)">
                  {(id) => (
                    <input
                      id={id}
                      className="input"
                      type={showProtectPass ? 'text' : 'password'}
                      value={ownerPass}
                      onChange={(e) => setOwnerPass(e.target.value)}
                      autoComplete="new-password"
                    />
                  )}
                </Field>
                <div className="row" style={{ gap: 18 }}>
                  <label className="check">
                    <input type="checkbox" checked={showProtectPass} onChange={(e) => setShowProtectPass(e.target.checked)} />
                    Show passwords
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={perms.print} onChange={(e) => setPerms((p) => ({ ...p, print: e.target.checked }))} />
                    Allow printing
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={perms.copy} onChange={(e) => setPerms((p) => ({ ...p, copy: e.target.checked }))} />
                    Allow copying text
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={perms.modify} onChange={(e) => setPerms((p) => ({ ...p, modify: e.target.checked }))} />
                    Allow editing
                  </label>
                </div>
                <p className="hint" style={{ margin: 0 }}>
                  Passwords cannot be recovered if forgotten. Permission restrictions (print/copy/modify) are advisory because some readers ignore them — the open password provides AES-256 encryption.
                </p>
              </div>
            )}

            {tab === 'unlock' && (
              <div className="stack">
                <Field label="Current PDF password" hint="Leave empty if the PDF only restricts printing/copying without an open password.">
                  {(id) => (
                    <div className="row">
                      <input
                        id={id}
                        className="input grow"
                        type={showUnlockPass ? 'text' : 'password'}
                        value={unlockPass}
                        onChange={(e) => setUnlockPass(e.target.value)}
                        autoComplete="current-password"
                      />
                      <button type="button" className="btn sm" onClick={() => setShowUnlockPass((v) => !v)}>
                        <Icon name={showUnlockPass ? 'eyeOff' : 'eye'} /> {showUnlockPass ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  )}
                </Field>
                <p className="hint" style={{ margin: 0 }}>
                  Unlock removes protection only with the valid password (it never cracks or bypasses encryption).
                </p>
              </div>
            )}
          </section>

          <div className="row">
            <button type="button" className="btn primary" disabled={running} onClick={() => void runAction()}>
              {tab === 'compress' ? 'Compress PDF' : tab === 'protect' ? 'Protect PDF' : 'Unlock PDF'}
            </button>
            <button type="button" className="btn" onClick={startOver}>Start over</button>
          </div>

          {running && <ProgressBar value={progress.pct} label={progress.label} onCancel={cancelAll} />}

          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
            {items.map((it) => {
              const savedPct = it.outBytes ? Math.round(((it.file.size - it.outBytes.length) / Math.max(1, it.file.size)) * 100) : 0;
              return (
                <li key={it.id} className="file-row" style={{ alignItems: 'flex-start' }}>
                  <div className="stack grow" style={{ gap: 4 }}>
                    <span className="name">{it.file.name}</span>
                    <span className="muted tabular" style={{ fontSize: 13 }}>
                      {formatBytes(it.file.size)}
                      {it.outBytes && ` → ${formatBytes(it.outBytes.length)} (${savedPct >= 0 ? `-${savedPct}%` : `+${Math.abs(savedPct)}%`})`}
                      {' · '}
                      {it.status}
                    </span>
                    {it.note && <span className="hint">{it.note}</span>}
                    {it.message && <span role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{it.message}</span>}
                  </div>
                  <div className="row">
                    {it.beforePreviewUrl && it.afterPreviewUrl && (
                      <button type="button" className="btn sm" onClick={() => setCompareId(compareId === it.id ? null : it.id)}>
                        Compare
                      </button>
                    )}
                    {it.outBytes && it.outName && (
                      <button
                        type="button"
                        className="btn sm primary"
                        onClick={() => downloadBlob(new Blob([it.outBytes!.slice().buffer], { type: 'application/pdf' }), it.outName!)}
                      >
                        <Icon name="download" /> Save
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn sm icon ghost"
                      aria-label={`Remove ${it.file.name}`}
                      onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))}
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {compareItem?.beforePreviewUrl && compareItem.afterPreviewUrl && (
            <section className="panel stack" aria-label="First page comparison">
              <h2 className="panel-title" style={{ margin: 0 }}>{compareItem.file.name} — Page 1</h2>
              <BeforeAfter beforeUrl={compareItem.beforePreviewUrl} afterUrl={compareItem.afterPreviewUrl} />
            </section>
          )}

          {doneItems.length > 0 && (
            <section className="panel stack" aria-live="polite">
              <div className="grid-2">
                <StatTile value={`${doneItems.length} of ${items.length}`} label="PDFs processed" />
                <StatTile
                  value={formatBytes(doneItems.reduce((s, d) => s + d.outBytes!.length, 0))}
                  label="Total output size"
                />
              </div>
              {doneItems.length > 1 && (
                <div>
                  <button type="button" className="btn primary" onClick={() => void downloadAllZip()}>
                    <Icon name="download" /> Download all (ZIP)
                  </button>
                </div>
              )}
            </section>
          )}
        </>
      )}

      <Dialog
        open={pwPrompt !== null}
        title="PDF password required"
        onClose={() => submitPasswordPrompt(null)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => submitPasswordPrompt(null)}>Skip file</button>
            <button type="button" className="btn primary" onClick={() => submitPasswordPrompt(pwInput)}>Unlock</button>
          </>
        }
      >
        <p className="muted" style={{ margin: 0 }}>
          {pwPrompt?.wrong
            ? `Incorrect password for ${pwPrompt.fileName}. Try again or skip.`
            : `${pwPrompt?.fileName} is encrypted. Enter its password to continue.`}
        </p>
        <input
          className="input"
          type="password"
          value={pwInput}
          onChange={(e) => setPwInput(e.target.value)}
          placeholder="PDF password"
          autoFocus
        />
      </Dialog>
    </div>
  );
}
