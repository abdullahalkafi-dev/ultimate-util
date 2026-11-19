'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Banner,
  CopyButton,
  DropZone,
  EmptyState,
  ErrorBanner,
  Field,
  ProgressBar,
  SegmentedControl,
  SliderField,
  StatTile,
  Tabs,
  useToast,
} from '@/components/ui';
import { downloadBlob, downloadText, formatBytes, outputName, sniffType, zipFiles } from '@/lib/files';
import { readJson, writeJson } from '@/lib/storage';
import { MAX_FILES, SOFT_LIMIT, HARD_LIMIT, gunzipLimited, runJob, type Job } from './client';
import { DEFAULT_JSX, barrel, componentNameFrom, svgToComponent, svgToVue, type JsxOptions } from './jsx';
import { DEFAULT_OPTIONS, PLUGINS, type OptimizeOptions, type OptimizeResult } from './optimize';
import { cssBackground, diffVerdict, svgToBase64Uri, svgToUrlEncoded } from './outputs';
import { svgBlobUrl, visualDiff, type VisualDiff } from './raster';
import styles from './styles.module.css';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: Figma -->
<svg width="48px" height="48px" viewBox="0 0 48 48" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns">
  <title>heart-badge</title>
  <desc>Created with Sketch.</desc>
  <metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description about="editor"/></rdf:RDF></metadata>
  <defs>
    <linearGradient x1="50%" y1="0%" x2="50%" y2="100%" id="linearGradient-1">
      <stop stop-color="#FF8A9B" offset="0%"></stop>
      <stop stop-color="#E5254D" offset="100%"></stop>
    </linearGradient>
  </defs>
  <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" sketch:type="MSPage">
    <g id="badge" sketch:type="MSLayerGroup" transform="translate(4.000000, 4.000000)">
      <circle id="Oval" fill="#FFF1F3" cx="20.000000" cy="20.000000" r="20.000000"></circle>
      <path d="M20.000000,31.000000 C20.000000,31.000000 9.000000,24.000000 9.000000,16.500000 C9.000000,12.500000 12.000000,10.000000 15.000000,10.000000 C17.000000,10.000000 19.000000,11.000000 20.000000,13.000000 C21.000000,11.000000 23.000000,10.000000 25.000000,10.000000 C28.000000,10.000000 31.000000,12.500000 31.000000,16.500000 C31.000000,24.000000 20.000000,31.000000 20.000000,31.000000 Z" id="Heart" fill="url(#linearGradient-1)"></path>
    </g>
  </g>
</svg>`;

type OutTab = 'svg' | 'react' | 'native' | 'vue' | 'datauri' | 'css';
const OUT_TABS: { id: OutTab; label: string }[] = [
  { id: 'svg', label: 'SVG' },
  { id: 'react', label: 'React' },
  { id: 'native', label: 'React Native' },
  { id: 'vue', label: 'Vue' },
  { id: 'datauri', label: 'Data URI' },
  { id: 'css', label: 'CSS background' },
];

interface Item {
  id: number;
  name: string;
  text: string;
  size: number;
  status: 'working' | 'done' | 'error';
  result?: OptimizeResult;
  error?: string;
  note?: string;
}

interface Saved {
  options: OptimizeOptions;
  jsx: Omit<JsxOptions, 'componentName' | 'target'>;
}

const isSaved = (v: unknown): v is Saved => typeof v === 'object' && v !== null && 'options' in v && 'jsx' in v;
const STORE_KEY = 'uu.svg-optimizer.settings';

let nextId = 1;

async function readItem(file: File): Promise<Item> {
  const base: Item = { id: nextId++, name: file.name, text: '', size: file.size, status: 'working' };
  if (file.size === 0) return { ...base, status: 'error', error: 'The file is empty.' };
  if (file.size > HARD_LIMIT) return { ...base, status: 'error', error: 'Larger than 20 MB. Simplify the drawing in your design tool first.' };
  const buf = await file.arrayBuffer();
  let bytes: Uint8Array = new Uint8Array(buf);
  try {
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzipLimited(buf);
  } catch (e) {
    return { ...base, status: 'error', error: (e as Error).message };
  }
  const sniff = sniffType(bytes);
  if (sniff !== 'svg' && sniff !== 'unknown') {
    return { ...base, status: 'error', error: `This is a ${sniff.toUpperCase()} file, not an SVG.` };
  }
  const text = new TextDecoder('utf-8').decode(bytes);
  const note = file.size > SOFT_LIMIT ? 'Large file: processing may use a lot of memory.' : undefined;
  return { ...base, text, size: bytes.length, note: file.name.toLowerCase().endsWith('.svgz') ? `Decompressed from .svgz. ${note ?? ''}`.trim() : note };
}

function renderOutput(item: Item, tab: OutTab, jsx: Omit<JsxOptions, 'componentName' | 'target'>): { code: string; file: string; warnings: string[] } {
  const svg = item.result?.svg ?? '';
  const name = componentNameFrom(item.name);
  const ext = jsx.typescript ? 'tsx' : 'jsx';
  switch (tab) {
    case 'svg':
      return { code: svg, file: outputName(item.name.replace(/\.svgz$/i, '.svg'), 'optimized', 'svg'), warnings: [] };
    case 'react':
    case 'native': {
      const r = svgToComponent(svg, { ...jsx, target: tab, componentName: name });
      return { code: r.code, file: `${name}.${ext}`, warnings: r.warnings };
    }
    case 'vue':
      return { code: svgToVue(svg, name), file: `${name}.vue`, warnings: svg.includes('<style') ? ['Vue strips <style> from templates; inline styles first.'] : [] };
    case 'datauri': {
      const enc = svgToUrlEncoded(svg);
      const b64 = svgToBase64Uri(svg);
      return { code: `${enc}\n\n${b64}`, file: outputName(item.name, 'datauri', 'txt'), warnings: [] };
    }
    case 'css':
      return { code: cssBackground(svg), file: outputName(item.name, 'background', 'css'), warnings: [] };
  }
}

function pct(before: number, after: number) {
  if (!before) return '0%';
  const d = Math.round(((after - before) / before) * 100);
  return `${d > 0 ? '+' : ''}${d}%`;
}

export default function SvgOptimizer() {
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [options, setOptions] = useState<OptimizeOptions>(DEFAULT_OPTIONS);
  const [jsx, setJsx] = useState<Omit<JsxOptions, 'componentName' | 'target'>>(() => {
    const { componentName: _c, target: _t, ...rest } = DEFAULT_JSX;
    void _c;
    void _t;
    return rest;
  });
  const [tab, setTab] = useState<OutTab>('svg');
  const [pasted, setPasted] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [split, setSplit] = useState(50);
  const [diff, setDiff] = useState<{ key: string; value: VisualDiff | 'failed' } | null>(null);
  const [urls, setUrls] = useState<{ before: string; after: string; key: string } | null>(null);
  const genRef = useRef(0);
  const jobsRef = useRef<Set<Job>>(new Set());
  const itemsRef = useRef<Item[]>([]);
  const hydrated = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const saved = readJson<Saved | null>(STORE_KEY, null, (v): v is Saved | null => v === null || isSaved(v));
    if (saved) {
      setOptions({ ...DEFAULT_OPTIONS, ...saved.options, titleText: '' });
      setJsx((j) => ({ ...j, ...saved.jsx }));
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    writeJson(STORE_KEY, { options: { ...options, titleText: '', idPrefix: '' }, jsx });
  }, [options, jsx]);

  const idsKey = items.map((i) => i.id).join(',');

  // Re-run everything when files or settings change (debounced); at most two workers at once.
  useEffect(() => {
    if (!idsKey) return;
    const gen = ++genRef.current;
    const timer = setTimeout(() => {
      const ids = itemsRef.current.filter((i) => i.text).map((i) => i.id);
      let next = 0;
      const update = (id: number, patch: Partial<Item>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      const worker = async () => {
        for (;;) {
          const id = ids[next++];
          if (id === undefined || gen !== genRef.current) return;
          const item = itemsRef.current.find((i) => i.id === id);
          if (!item) continue;
          update(id, { status: 'working', error: undefined });
          const job = runJob(item.text, options);
          jobsRef.current.add(job);
          try {
            const result = await job.promise;
            if (gen !== genRef.current) return;
            update(id, { status: 'done', result });
          } catch (e) {
            if (gen !== genRef.current) return;
            update(id, { status: 'error', error: (e as Error).message, result: undefined });
          } finally {
            jobsRef.current.delete(job);
          }
        }
      };
      void Promise.all([worker(), worker()]);
    }, 200);
    return () => {
      clearTimeout(timer);
      jobsRef.current.forEach((j) => j.cancel());
      jobsRef.current.clear();
    };
  }, [idsKey, options]);

  const current = items.find((i) => i.id === selected) ?? items[0];
  const result = current?.result;

  // Preview URLs: always the sanitized and optimized text, shown through <img>, never as markup.
  useEffect(() => {
    if (!result) {
      setUrls(null);
      return;
    }
    const before = svgBlobUrl(result.sanitized);
    const after = svgBlobUrl(result.svg);
    setUrls({ before, after, key: result.svg });
    return () => {
      URL.revokeObjectURL(before);
      URL.revokeObjectURL(after);
    };
  }, [result]);

  useEffect(() => {
    if (!result) return;
    let live = true;
    visualDiff(result.sanitized, result.svg)
      .then((value) => live && setDiff({ key: result.svg, value }))
      .catch(() => live && setDiff({ key: result.svg, value: 'failed' }));
    return () => {
      live = false;
    };
  }, [result]);

  const addFiles = useCallback(
    async (files: File[]) => {
      setMessage(null);
      const room = MAX_FILES - itemsRef.current.length;
      if (files.length > room) setMessage(`Only ${MAX_FILES} files fit in one batch; ${files.length - Math.max(room, 0)} were skipped.`);
      const read = await Promise.all(files.slice(0, Math.max(room, 0)).map(readItem));
      setItems((prev) => [...prev, ...read]);
      const first = read[0];
      if (first) setSelected((s) => s ?? first.id);
    },
    [],
  );

  const addPasted = (text: string, name = 'pasted.svg') => {
    if (!text.trim()) {
      setMessage('Nothing to process: the pasted text is empty.');
      return;
    }
    const item: Item = { id: nextId++, name, text, size: new TextEncoder().encode(text).length, status: 'working' };
    setItems((prev) => [...prev, item]);
    setSelected(item.id);
    setPasted('');
  };

  const cancelAll = () => {
    genRef.current++;
    jobsRef.current.forEach((j) => j.cancel());
    jobsRef.current.clear();
    setItems((prev) => prev.map((i) => (i.status === 'working' ? { ...i, status: 'error', error: 'Cancelled' } : i)));
  };

  const reset = () => {
    genRef.current++;
    jobsRef.current.forEach((j) => j.cancel());
    setItems([]);
    setSelected(null);
    setMessage(null);
    setDiff(null);
  };

  const out = useMemo(() => (current?.result ? renderOutput(current, tab, jsx) : null), [current, tab, jsx]);
  const doneItems = items.filter((i) => i.status === 'done' && i.result);
  const working = items.filter((i) => i.status === 'working').length;
  const verdict = diff && result && diff.key === result.svg && diff.value !== 'failed' ? diffVerdict(diff.value) : null;
  const diffValue = diff && result && diff.key === result.svg && diff.value !== 'failed' ? diff.value : null;

  async function downloadAll() {
    const files: { name: string; data: Uint8Array }[] = [];
    const enc = new TextEncoder();
    for (const it of doneItems) {
      const o = renderOutput(it, tab, jsx);
      files.push({ name: o.file, data: enc.encode(o.code) });
    }
    if (tab === 'react' || tab === 'native') {
      files.push({ name: 'index.ts', data: enc.encode(barrel(doneItems.map((i) => componentNameFrom(i.name)))) });
    }
    downloadBlob(await zipFiles(files), 'svg-optimized.zip');
    toast(`Downloaded ${doneItems.length} file${doneItems.length === 1 ? '' : 's'}.`, 'success');
  }

  const toggle = (id: string, on: boolean) =>
    setOptions((o) => ({ ...o, disabled: on ? o.disabled.filter((d) => d !== id) : [...o.disabled, id] }));

  const setJ = <K extends keyof typeof jsx>(k: K, v: (typeof jsx)[K]) => setJsx((j) => ({ ...j, [k]: v }));

  const removedCount = result ? result.removed.reduce((n, r) => n + r.count, 0) : 0;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="split">
        <div className="stack">
          <DropZone
            multiple
            accept={['.svg', '.svgz', 'image/svg+xml']}
            maxBytes={HARD_LIMIT}
            title="Drop SVG files or click to choose"
            hint="Up to 50 files. You can also paste SVG code below."
            onFiles={(f) => void addFiles(f)}
            onReject={setMessage}
          />
          <Field label="Or paste SVG code" hint="Everything stays in your browser.">
            {(id) => (
              <textarea
                id={id}
                className="textarea mono"
                style={{ minHeight: 110 }}
                value={pasted}
                spellCheck={false}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="<svg xmlns=...>"
              />
            )}
          </Field>
          <div className="row">
            <button type="button" className="btn primary sm" onClick={() => addPasted(pasted)}>
              Optimize pasted code
            </button>
            <button type="button" className="btn sm" onClick={() => addPasted(SAMPLE, 'heart-badge.svg')}>
              Try a sample
            </button>
            {items.length > 0 && (
              <button type="button" className="btn sm" onClick={reset}>
                Start over
              </button>
            )}
          </div>
          {message && <ErrorBanner onDismiss={() => setMessage(null)}>{message}</ErrorBanner>}
        </div>

        <section className="panel stack" aria-label="Settings">
          <h2 className="panel-title" style={{ margin: 0 }}>Settings</h2>
          <SliderField label="Number precision (decimals)" value={options.precision} min={0} max={8} onChange={(v) => setOptions((o) => ({ ...o, precision: v }))} />
          <label className="row">
            <input type="checkbox" checked={options.multipass} onChange={(e) => setOptions((o) => ({ ...o, multipass: e.target.checked }))} />
            <span>Run several passes (smaller, a bit slower)</span>
          </label>
          <Field label="Prefix IDs" hint="Avoids ID clashes when several icons are inlined on one page. Leave empty to skip.">
            {(id) => (
              <input id={id} className="input" value={options.idPrefix} maxLength={32} pattern="[A-Za-z][A-Za-z0-9_-]*" onChange={(e) => setOptions((o) => ({ ...o, idPrefix: e.target.value.replace(/[^A-Za-z0-9_-]/g, '') }))} placeholder="icon" />
            )}
          </Field>
          <div className="stack" style={{ gap: 6 }}>
            <SegmentedControl
              label="Use currentColor"
              value={options.currentColor}
              onChange={(v) => setOptions((o) => ({ ...o, currentColor: v }))}
              options={[
                { id: 'off', label: 'Off' },
                { id: 'single', label: 'Single-color only' },
                { id: 'all', label: 'All colors' },
              ]}
            />
            <span className="hint">Fills and strokes become currentColor so CSS color controls them. Gradients are left alone.</span>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <SegmentedControl
              label="Accessibility"
              value={options.a11y}
              onChange={(v) => setOptions((o) => ({ ...o, a11y: v }))}
              options={[
                { id: 'none', label: 'Leave as is' },
                { id: 'title', label: 'Add title' },
                { id: 'decorative', label: 'Decorative' },
              ]}
            />
            {options.a11y === 'title' && (
              <Field label="Title text (screen readers)">
                {(id) => <input id={id} className="input" value={options.titleText} onChange={(e) => setOptions((o) => ({ ...o, titleText: e.target.value }))} />}
              </Field>
            )}
          </div>
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>SVGO plugins ({PLUGINS.length - options.disabled.length} of {PLUGINS.length} on)</summary>
            <div className={styles.plugins} style={{ marginTop: 10 }}>
              {PLUGINS.map((p) => (
                <div key={p.id} className={styles.plugin}>
                  <input
                    type="checkbox"
                    role="switch"
                    id={`plugin-${p.id}`}
                    aria-describedby={`plugin-${p.id}-d`}
                    checked={!options.disabled.includes(p.id)}
                    onChange={(e) => toggle(p.id, e.target.checked)}
                  />
                  <label htmlFor={`plugin-${p.id}`}>
                    {p.label} {p.risk === 'risky' ? <span className={styles.risky}>(may change rendering)</span> : <span className="faint">(safe)</span>}
                  </label>
                  <small id={`plugin-${p.id}-d`}>{p.explain}</small>
                </div>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 8 }}>viewBox is always kept, and added from width/height when missing.</p>
          </details>
        </section>
      </div>

      {items.length === 0 && (
        <EmptyState icon="svg" title="No SVG yet">
          Drop files, paste code, or try the sample. Scripts and external links are removed before anything is previewed.
        </EmptyState>
      )}

      {working > 0 && (
        <div aria-live="polite">
          <ProgressBar label={`Optimizing ${working} file${working === 1 ? '' : 's'}`} onCancel={cancelAll} />
        </div>
      )}

      {items.length > 1 && (
        <div className="stack" style={{ gap: 6 }} role="list" aria-label="Files">
          {items.map((i) => (
            <div key={i.id} className="file-row" role="listitem">
              <button type="button" className="btn sm ghost grow" style={{ justifyContent: 'flex-start' }} aria-pressed={current?.id === i.id} onClick={() => setSelected(i.id)}>
                <span className="name">{i.name}</span>
              </button>
              <span className="muted tabular">
                {i.status === 'working' && 'Working'}
                {i.status === 'error' && `Failed: ${i.error}`}
                {i.status === 'done' && i.result && `${formatBytes(i.result.bytesBefore)} to ${formatBytes(i.result.bytesAfter)} (${pct(i.result.bytesBefore, i.result.bytesAfter)})`}
              </span>
            </div>
          ))}
        </div>
      )}

      {current?.status === 'error' && current.error !== 'Cancelled' && <ErrorBanner>{`${current.name}: ${current.error}`}</ErrorBanner>}
      {current?.note && <Banner kind="warn">{current.note}</Banner>}

      {result && urls && current && (
        <>
          <div className={styles.chips} role="group" aria-label="Size result" aria-live="polite">
            <StatTile value={formatBytes(result.bytesBefore)} label="Before" />
            <StatTile value={formatBytes(result.bytesAfter)} label="After" />
            <StatTile value={pct(result.bytesBefore, result.bytesAfter)} label="Change" />
            <StatTile
              value={diffValue ? `${diffValue.differing.toLocaleString()} px` : diff && diff.value === 'failed' ? 'n/a' : '...'}
              label={diffValue ? `Pixel diff at ${diffValue.size} px` : 'Pixel diff'}
            />
          </div>

          {verdict && diffValue && (
            <Banner kind={verdict === 'warn' ? 'warn' : 'ok'}>
              {verdict === 'identical' && `Pixel diff: 0 of ${diffValue.total.toLocaleString()} pixels differ at ${diffValue.size} px. The picture is unchanged.`}
              {verdict === 'ok' && `Pixel diff: ${diffValue.differing.toLocaleString()} of ${diffValue.total.toLocaleString()} pixels differ at ${diffValue.size} px (under 0.1%, normal anti-aliasing noise).`}
              {verdict === 'warn' && `Pixel diff: ${diffValue.differing.toLocaleString()} pixels (${((diffValue.differing / diffValue.total) * 100).toFixed(2)}%) differ at ${diffValue.size} px. Open the plugin list and switch off the risky ones (path data, merge paths, hidden elements, shapes to paths) one at a time.`}
            </Banner>
          )}
          {diff && diff.value === 'failed' && <Banner kind="warn">The visual comparison could not run in this browser.</Banner>}

          <div className="split">
            <section className="panel stack" aria-label="Before and after">
              <h2 className="panel-title" style={{ margin: 0 }}>Before and after</h2>
              <div className={styles.stage}>
                <div className={`${styles.layer} ${styles.before}`}>
                  { }
                  <img src={urls.before} alt={`Original ${current.name} (sanitized)`} />
                </div>
                <div className={`${styles.layer} ${styles.after}`} style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
                  { }
                  <img src={urls.after} alt={`Optimized ${current.name}`} />
                </div>
                <div className={styles.divider} style={{ left: `${split}%` }} />
              </div>
              <label className="row" style={{ gap: 10 }}>
                <span className="muted">Original</span>
                <input
                  className={`${styles.slider} grow`}
                  type="range"
                  min={0}
                  max={100}
                  value={split}
                  aria-label="Reveal optimized version: drag left to show more of the optimized SVG"
                  aria-valuetext={`${100 - split}% original, ${split}% optimized`}
                  onChange={(e) => setSplit(Number(e.target.value))}
                />
                <span className="muted">Optimized</span>
              </label>
              {diffValue?.overlay && (
                <div className="row">
                  { }
                  <img className={styles.diffImg} src={diffValue.overlay} alt="Map of pixels that differ, shown in red" />
                  <span className="hint">Red marks pixels that changed.</span>
                </div>
              )}
            </section>

            <section className="panel stack" aria-label="Safety report" aria-live="polite">
              <h2 className="panel-title" style={{ margin: 0 }}>Safety report</h2>
              {removedCount === 0 ? (
                <p className="muted" style={{ margin: 0 }}>Nothing dangerous found. Downloads and previews use the sanitized file.</p>
              ) : (
                <>
                  <p style={{ margin: 0 }}>These were removed from the preview and from every download:</p>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {result.removed.map((r) => (
                      <li key={r.kind + r.label}>
                        {r.label}: {r.count}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {result.warnings.map((w) => (
                <Banner key={w} kind="warn">{w}</Banner>
              ))}
            </section>
          </div>

          <section className="panel stack" aria-label="Output">
            <div className={styles.scroll}>
              <Tabs tabs={OUT_TABS} value={tab} onChange={setTab} label="Output format" />
            </div>
            {(tab === 'react' || tab === 'native') && (
              <div className="row" style={{ gap: 16 }} role="group" aria-label="Component options">
                {(
                  [
                    ['typescript', 'TypeScript'],
                    ['memo', 'memo'],
                    ['forwardRef', 'ref forwarding'],
                    ['spreadProps', 'Spread props'],
                    ...(tab === 'react' ? ([['titleProp', 'title prop']] as const) : []),
                    ['keepDimensions', 'Keep width/height'],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="row" style={{ gap: 6 }}>
                    <input type="checkbox" checked={jsx[k]} onChange={(e) => setJ(k, e.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>
            )}
            {out && (
              <>
                {out.warnings.map((w) => (
                  <Banner key={w} kind="warn">{w}</Banner>
                ))}
                <pre className={styles.code} tabIndex={0} aria-label={`${OUT_TABS.find((t) => t.id === tab)?.label} output`}>
                  {out.code}
                </pre>
                <div className="row">
                  <CopyButton text={out.code} label="Copy" />
                  <button type="button" className="btn primary sm" onClick={() => downloadText(out.code, out.file, tab === 'svg' ? 'image/svg+xml' : 'text/plain')}>
                    Download {out.file}
                  </button>
                  {doneItems.length > 1 && (
                    <button type="button" className="btn sm" onClick={() => void downloadAll()}>
                      Download all as ZIP ({doneItems.length})
                    </button>
                  )}
                </div>
              </>
            )}
            {tab === 'datauri' && out && <p className="hint">URL-encoded is smaller; base64 is the safest to paste. {formatBytes(out.code.length)} total shown.</p>}
          </section>
        </>
      )}
    </div>
  );
}
