'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type Tesseract from 'tesseract.js';
import {
  Banner,
  CopyButton,
  DropZone,
  ErrorBanner,
  Field,
  Icon,
  ProgressBar,
  SliderField,
  useToast,
} from '@/components/ui';
import { downloadBlob, downloadText, outputName, readFirstBytes, sniffType } from '@/lib/files';
import {
  OCR_LANGUAGES,
  createLocalOcrWorker,
  extractAllPdfText,
  extractWordsFromBlocks,
  inspectPdfText,
  prepareCanvasFromBlob,
  prepareCanvasFromElement,
  rasterizePdfPage,
  type OcrPageResult,
} from './engine';
import { buildOcrDocx, buildOcrJson, buildOcrText, buildSearchablePdf } from './exporters';
import { DEFAULT_PREPROCESS, averageConfidence, type PreprocessOptions } from './preprocess';
import styles from './styles.module.css';

interface LoadedSource {
  file: File;
  kind: 'image' | 'pdf';
  bytes?: Uint8Array;
  numPages: number;
  pdfHasText: boolean;
}

export default function OcrTool() {
  const toast = useToast();
  const [source, setSource] = useState<LoadedSource | null>(null);
  const [lang, setLang] = useState('eng');
  const [opts, setOpts] = useState<PreprocessOptions>(DEFAULT_PREPROCESS);
  const [pageFrom, setPageFrom] = useState(1);
  const [pageTo, setPageTo] = useState(1);
  const [joinParagraphs, setJoinParagraphs] = useState(false);

  const [running, setRunning] = useState(false);
  const [progPct, setProgPct] = useState(0);
  const [progLabel, setProgLabel] = useState('');
  const [pages, setPages] = useState<OcrPageResult[]>([]);
  const [editedText, setEditedText] = useState('');
  const [activePageIdx, setActivePageIdx] = useState(0);
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Tesseract.Worker | null>(null);
  const cancelledRef = useRef(false);
  const pagesRef = useRef<OcrPageResult[]>([]);
  pagesRef.current = pages;

  useEffect(
    () => () => {
      void workerRef.current?.terminate();
      for (const p of pagesRef.current) URL.revokeObjectURL(p.previewUrl);
    },
    [],
  );

  function resetPages() {
    for (const p of pagesRef.current) URL.revokeObjectURL(p.previewUrl);
    setPages([]);
    setEditedText('');
    setActivePageIdx(0);
  }

  async function handleFiles(files: File[]) {
    const file = files[0];
    if (!file) return;
    setError(null);
    resetPages();

    if (file.size === 0) {
      setError('This file is empty (0 bytes).');
      return;
    }

    const head = await readFirstBytes(file);
    const type = sniffType(head);

    if (type === 'heic') {
      setError('HEIC images are not decoded here directly. Convert HEIC to JPG/PNG first with the Bulk Resizer & Converter.');
      return;
    }

    if (type === 'pdf') {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const info = await inspectPdfText(bytes);
        setSource({ file, kind: 'pdf', bytes, numPages: info.numPages, pdfHasText: info.hasText });
        setPageFrom(1);
        setPageTo(Math.min(info.numPages, 25));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not inspect this PDF.');
      }
      return;
    }

    if (['png', 'jpeg', 'webp', 'bmp'].includes(type)) {
      setSource({ file, kind: 'image', numPages: 1, pdfHasText: false });
      setPageFrom(1);
      setPageTo(1);
      return;
    }

    setError(`Unsupported file type (${type === 'unknown' ? 'unknown format' : type}). Drop PNG, JPG, WebP, BMP or PDF.`);
  }

  async function tryExample() {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 380;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0b0f19';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('Ultimate Util On-Device OCR', 48, 92);
    ctx.font = '26px sans-serif';
    ctx.fillText('All text extraction happens locally in your browser.', 48, 160);
    ctx.fillText('Nothing is uploaded to any server.', 48, 215);
    ctx.fillText('Invoice #2026-119  Total: $420.00', 48, 285);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) return;
    await handleFiles([new File([blob], 'sample-ocr.png', { type: 'image/png' })]);
  }

  async function extractSelectableText() {
    if (!source?.bytes) return;
    setError(null);
    try {
      const text = await extractAllPdfText(source.bytes, pageFrom, pageTo);
      setEditedText(joinParagraphs ? buildOcrText([{ text }], true) : text);
      toast('Extracted embedded PDF text without OCR', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract PDF text.');
    }
  }

  async function runOcr() {
    if (!source) return;
    if (typeof WebAssembly === 'undefined' || typeof Worker === 'undefined') {
      setError('WebAssembly and Web Workers are required for OCR.');
      return;
    }

    setError(null);
    resetPages();
    cancelledRef.current = false;
    setRunning(true);
    setProgPct(2);
    setProgLabel('Loading local OCR engine (same origin)…');

    const accumulated: OcrPageResult[] = [];
    try {
      const worker = await createLocalOcrWorker(lang, (pct, status) => {
        if (!cancelledRef.current && accumulated.length === 0) {
          setProgPct(Math.min(25, Math.round(pct * 0.25)));
          setProgLabel(status);
        }
      });
      workerRef.current = worker;

      const start = source.kind === 'pdf' ? Math.max(1, pageFrom) : 1;
      const end = source.kind === 'pdf' ? Math.min(source.numPages, pageTo) : 1;
      const count = Math.max(1, end - start + 1);

      for (let i = 0; i < count; i++) {
        if (cancelledRef.current) break;
        const pageNum = start + i;
        setProgLabel(`Recognizing page ${pageNum} of ${end}…`);
        setProgPct(25 + Math.round((i / count) * 75));

        const prep =
          source.kind === 'pdf' && source.bytes
            ? await prepareCanvasFromElement(await rasterizePdfPage(source.bytes, pageNum, 2.2), opts)
            : await prepareCanvasFromBlob(source.file, opts);

        if (cancelledRef.current) break;

        const res = await worker.recognize(prep.canvas, {}, { text: true, blocks: true });
        if (cancelledRef.current) break;

        const words = extractWordsFromBlocks(res.data.blocks);
        const pageOut: OcrPageResult = {
          pageNumber: pageNum,
          width: prep.canvas.width,
          height: prep.canvas.height,
          text: res.data.text,
          confidence: words.length ? averageConfidence(words) : Math.round(res.data.confidence),
          words,
          previewUrl: URL.createObjectURL(new Blob([prep.pngBytes.slice().buffer], { type: 'image/png' })),
          imageBytes: prep.pngBytes,
        };
        prep.canvas.width = prep.canvas.height = 0;

        accumulated.push(pageOut);
        setPages([...accumulated]);
        setEditedText(buildOcrText(accumulated, joinParagraphs));
      }
      if (!cancelledRef.current) {
        setProgPct(100);
        setProgLabel('OCR complete');
        toast(`Recognized ${accumulated.length} page(s)`, 'success');
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : 'OCR failed.');
      }
    } finally {
      await workerRef.current?.terminate();
      workerRef.current = null;
      setRunning(false);
    }
  }

  function cancelOcr() {
    cancelledRef.current = true;
    void workerRef.current?.terminate();
    workerRef.current = null;
    setRunning(false);
    toast('Stopped OCR; recognized pages so far are kept.', 'info');
  }

  async function downloadSearchable() {
    if (!source || pages.length === 0) return;
    const pdfBytes = await buildSearchablePdf(pages);
    downloadBlob(new Blob([pdfBytes.slice().buffer], { type: 'application/pdf' }), outputName(source.file.name, 'ocr', 'pdf'));
  }

  async function downloadDocxFile() {
    if (!source || !editedText.trim()) return;
    const blob = await buildOcrDocx(editedText);
    downloadBlob(blob, outputName(source.file.name, 'ocr', 'docx'));
  }

  const activePage = pages[activePageIdx] ?? pages[0] ?? null;
  const overallConfidence = useMemo(() => {
    if (pages.length === 0) return null;
    return Math.round(pages.reduce((s, p) => s + p.confidence, 0) / pages.length);
  }, [pages]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      {error && <ErrorBanner onDismiss={() => setError(null)}>{error}</ErrorBanner>}

      {!source ? (
        <div className="stack">
          <DropZone
            paste
            accept={['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'application/pdf', '.pdf']}
            maxBytes={100 * 1024 * 1024}
            title="Drop a scanned image or PDF, or paste a screenshot"
            hint="PNG, JPG, WebP, BMP, PDF · Engine and English data load from this site, never uploaded"
            onFiles={(f) => void handleFiles(f)}
            onReject={(m) => setError(m)}
          />
          <div className="row">
            <button type="button" className="btn" onClick={() => void tryExample()}>Try an example</button>
            <span className="hint">Runs locally in your browser using Tesseract WASM.</span>
          </div>
        </div>
      ) : (
        <>
          <section className="panel stack" aria-label="OCR configuration">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{source.file.name}</strong>
                <span className="faint"> · {source.kind === 'pdf' ? `${source.numPages} page(s)` : 'Image'}</span>
              </div>
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  cancelOcr();
                  resetPages();
                  setSource(null);
                  setError(null);
                }}
              >
                Start over
              </button>
            </div>

            {source.pdfHasText && (
              <Banner kind="info">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>This PDF already has selectable text. You can extract it instantly without OCR.</span>
                  <button type="button" className="btn sm primary" onClick={() => void extractSelectableText()}>
                    Extract existing text
                  </button>
                </div>
              </Banner>
            )}

            <div className="grid-3">
              <Field label="OCR language pack (same-origin)">
                {(id) => (
                  <select id={id} className="select" value={lang} onChange={(e) => setLang(e.target.value)}>
                    {OCR_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{l.label} ({l.sizeMb})</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Rotate image before OCR">
                {(id) => (
                  <select
                    id={id}
                    className="select"
                    value={opts.rotateDeg}
                    onChange={(e) => setOpts((o) => ({ ...o, rotateDeg: Number(e.target.value) as 0 | 90 | 180 | 270 }))}
                  >
                    <option value={0}>0° (original)</option>
                    <option value={90}>90° clockwise</option>
                    <option value={180}>180°</option>
                    <option value={270}>270° clockwise</option>
                  </select>
                )}
              </Field>
              <SliderField label="Contrast boost" value={opts.contrast} min={0} max={80} onChange={(contrast) => setOpts((o) => ({ ...o, contrast }))} />
            </div>

            <div className="row" style={{ gap: 18 }}>
              <label className="check">
                <input type="checkbox" checked={opts.grayscale} onChange={(e) => setOpts((o) => ({ ...o, grayscale: e.target.checked }))} />
                Grayscale
              </label>
              <label className="check">
                <input type="checkbox" checked={opts.invert} onChange={(e) => setOpts((o) => ({ ...o, invert: e.target.checked }))} />
                Invert colors (for dark-mode screenshots)
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={joinParagraphs}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setJoinParagraphs(next);
                    if (pages.length) setEditedText(buildOcrText(pages, next));
                  }}
                />
                Join lines into paragraphs
              </label>
              {source.kind === 'pdf' && (
                <div className="row">
                  <Field label="From page">
                    {(id) => (
                      <input
                        id={id}
                        type="number"
                        className="input"
                        style={{ width: 84 }}
                        min={1}
                        max={source.numPages}
                        value={pageFrom}
                        onChange={(e) => setPageFrom(Math.max(1, Math.min(source.numPages, Number(e.target.value) || 1)))}
                      />
                    )}
                  </Field>
                  <Field label="To page">
                    {(id) => (
                      <input
                        id={id}
                        type="number"
                        className="input"
                        style={{ width: 84 }}
                        min={pageFrom}
                        max={source.numPages}
                        value={pageTo}
                        onChange={(e) => setPageTo(Math.max(pageFrom, Math.min(source.numPages, Number(e.target.value) || pageFrom)))}
                      />
                    )}
                  </Field>
                </div>
              )}
            </div>

            <div className="row">
              <button type="button" className="btn primary" disabled={running} onClick={() => void runOcr()}>
                <Icon name="scan" /> {running ? 'Recognizing…' : 'Recognize text'}
              </button>
            </div>
          </section>

          {running && <ProgressBar value={progPct} label={progLabel} onCancel={cancelOcr} />}

          {(pages.length > 0 || editedText) && (
            <div className="split" aria-live="polite">
              <section className="panel stack" aria-label="Page image and word boxes">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2 className="panel-title" style={{ margin: 0 }}>
                    {activePage ? `Page ${activePage.pageNumber}` : 'Preview'}
                  </h2>
                  {overallConfidence !== null && (
                    <span className="tag local">
                      Confidence: {overallConfidence}%{overallConfidence < 65 ? ' (low — check language or lighting)' : ''}
                    </span>
                  )}
                </div>

                {pages.length > 1 && (
                  <div className="row" style={{ gap: 6 }}>
                    {pages.map((p, idx) => (
                      <button
                        key={p.pageNumber}
                        type="button"
                        className={`btn sm ${idx === activePageIdx ? 'primary' : ''}`}
                        onClick={() => setActivePageIdx(idx)}
                      >
                        Page {p.pageNumber}
                      </button>
                    ))}
                  </div>
                )}

                {activePage ? (
                  <div className={styles.previewBox}>
                    <div className={styles.previewWrap}>
                      { }
                      <img src={activePage.previewUrl} alt={`Preprocessed page ${activePage.pageNumber}`} />
                      {activePage.words.map((w, idx) => (
                        <span
                          key={idx}
                          className={`${styles.wordBox} ${w.confidence < 65 ? styles.wordBoxLow : ''}`}
                          title={`${w.text} (${Math.round(w.confidence)}%)`}
                          onMouseEnter={() => setHoveredWord(`${w.text} — ${Math.round(w.confidence)}% confidence`)}
                          onMouseLeave={() => setHoveredWord(null)}
                          style={{
                            left: `${(w.x0 / activePage.width) * 100}%`,
                            top: `${(w.y0 / activePage.height) * 100}%`,
                            width: `${((w.x1 - w.x0) / activePage.width) * 100}%`,
                            height: `${((w.y1 - w.y0) / activePage.height) * 100}%`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>Text was extracted directly from the PDF text layer.</p>
                )}
                {hoveredWord && <p className="hint" style={{ margin: 0 }}>{hoveredWord}</p>}
              </section>

              <section className="panel stack" aria-label="Recognized text">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2 className="panel-title" style={{ margin: 0 }}>Recognized text</h2>
                  <CopyButton text={editedText} label="Copy text" />
                </div>
                <Field label="Editable text output">
                  {(id) => (
                    <textarea
                      id={id}
                      className="textarea"
                      style={{ minHeight: 320 }}
                      value={editedText}
                      onChange={(e) => setEditedText(e.target.value)}
                    />
                  )}
                </Field>
                <div className="row">
                  <button
                    type="button"
                    className="btn sm"
                    disabled={!editedText.trim()}
                    onClick={() => downloadText(editedText, outputName(source.file.name, 'ocr', 'txt'))}
                  >
                    <Icon name="download" /> .txt
                  </button>
                  <button
                    type="button"
                    className="btn sm primary"
                    disabled={pages.length === 0}
                    onClick={() => void downloadSearchable()}
                  >
                    <Icon name="download" /> Searchable PDF
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    disabled={!editedText.trim()}
                    onClick={() => void downloadDocxFile()}
                  >
                    <Icon name="download" /> .docx
                  </button>
                  <button
                    type="button"
                    className="btn sm"
                    disabled={pages.length === 0}
                    onClick={() => downloadText(buildOcrJson(pages), outputName(source.file.name, 'ocr', 'json'), 'application/json')}
                  >
                    <Icon name="download" /> JSON boxes
                  </button>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
