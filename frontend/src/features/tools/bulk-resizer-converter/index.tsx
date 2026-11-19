'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Banner,
  DropZone,
  Field,
  Icon,
  ProgressBar,
  SegmentedControl,
  SliderField,
  StatTile,
  useToast,
} from '@/components/ui';
import { downloadBlob, formatBytes, zipFiles } from '@/lib/files';
import { readJson, writeJson } from '@/lib/storage';
import { svgBaseSize } from '../_shared-images/geometry';
import { prepareInput, rasterizeSvg, svgWarnings, type PreparedImage } from '../_shared-images/input';
import { NAME_TOKENS, dedupeNames, stripExtension, validatePattern } from '../_shared-images/naming';
import { ImagePool } from '../_shared-images/pool';
import { makeSampleImage } from '../_shared-images/sample';
import { FORMAT_MIME, MAX_BATCH, SOFT_FILE_BYTES, type FitMode, type OutFormat } from '../_shared-images/types';
import {
  DEFAULT_SETTINGS,
  MAX_SIZE_ROWS,
  PRESETS,
  encodeSpecFor,
  lockedHeight,
  outputCount,
  outputPath,
  presetById,
  previewSize,
  rasterJobs,
  resolveFormat,
  sizePlans,
  svgJobs,
  type FormatChoice,
  type ResizeMode,
  type Settings,
  type ZipLayout,
} from './plan';
import styles from './styles.module.css';

interface OutputFile {
  path: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
  format: OutFormat;
  notEnlarged?: boolean;
}

interface BatchItem {
  id: number;
  file: File;
  prepared: PreparedImage | null;
  svgText?: string;
  svgBase?: { width: number; height: number } | null;
  thumb: string | null;
  status: 'preparing' | 'ready' | 'working' | 'done' | 'error' | 'cancelled';
  message?: string;
  notes: string[];
  outputs: OutputFile[];
}

const STORAGE_KEY = 'uu-bulk-resizer-converter';

const ANCHORS: { label: string; x: number; y: number }[] = [
  { label: 'Top left', x: 0, y: 0 },
  { label: 'Top center', x: 0.5, y: 0 },
  { label: 'Top right', x: 1, y: 0 },
  { label: 'Middle left', x: 0, y: 0.5 },
  { label: 'Center', x: 0.5, y: 0.5 },
  { label: 'Middle right', x: 1, y: 0.5 },
  { label: 'Bottom left', x: 0, y: 1 },
  { label: 'Bottom center', x: 0.5, y: 1 },
  { label: 'Bottom right', x: 1, y: 1 },
];

export default function BulkResizerConverter() {
  const toast = useToast();
  const [items, setItems] = useState<BatchItem[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);

  const poolRef = useRef<ImagePool | null>(null);
  const itemsRef = useRef<BatchItem[]>([]);
  itemsRef.current = items;
  const runToken = useRef(0);
  const nextId = useRef(1);

  useEffect(() => {
    const saved = readJson<Partial<Settings> | null>(STORAGE_KEY, null);
    if (saved) setSettings((s) => ({ ...s, ...saved }));
    setLoaded(true);
    return () => {
      poolRef.current?.dispose();
      for (const it of itemsRef.current) {
        if (it.thumb) URL.revokeObjectURL(it.thumb);
        for (const o of it.outputs) URL.revokeObjectURL(o.url);
      }
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    writeJson(STORAGE_KEY, settings);
  }, [settings, loaded]);

  const patternError = useMemo(() => validatePattern(settings.pattern), [settings.pattern]);

  const patchItem = useCallback((id: number, change: Partial<BatchItem>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...change } : it)));
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      setBanner(null);
      const room = MAX_BATCH - itemsRef.current.length;
      if (room <= 0) {
        setBanner(`Batch limit is ${MAX_BATCH} images. Remove some or start over.`);
        return;
      }
      const batch = files.slice(0, room);
      if (files.length > room) setBanner(`Added the first ${room} images (batch limit ${MAX_BATCH}).`);

      const created: BatchItem[] = batch.map((file) => ({
        id: nextId.current++,
        file,
        prepared: null,
        thumb: null,
        status: 'preparing',
        notes: [],
        outputs: [],
      }));
      setItems((prev) => [...prev, ...created]);

      for (const item of created) {
        const prep = await prepareInput(item.file, { allowSvg: true });
        if (!prep.ok) {
          patchItem(item.id, { status: 'error', message: prep.error });
          continue;
        }
        const notes = [...prep.image.notes];
        if (item.file.size > SOFT_FILE_BYTES) notes.push('Over 50 MB: processing may take longer.');
        if (prep.image.animated) notes.push('Animated image: only the first frame is exported.');

        let svgText: string | undefined;
        let svgBase: { width: number; height: number } | null | undefined;
        if (prep.image.type === 'svg') {
          svgText = await item.file.text();
          svgBase = svgBaseSize(svgText);
          notes.push(...svgWarnings(svgText));
        }

        patchItem(item.id, {
          prepared: prep.image,
          svgText,
          svgBase,
          thumb: URL.createObjectURL(prep.image.blob),
          status: 'ready',
          notes,
        });
      }
    },
    [patchItem],
  );

  async function tryExample() {
    try {
      await addFiles([await makeSampleImage('example-photo.png', 1600, 1000)]);
    } catch {
      toast('Could not create the example image.', 'error');
    }
  }

  function clearOutputs(item: BatchItem) {
    for (const o of item.outputs) URL.revokeObjectURL(o.url);
  }

  async function runBatch() {
    if (patternError) return;
    const token = ++runToken.current;
    poolRef.current?.dispose();
    const pool = new ImagePool();
    poolRef.current = pool;

    const queue = itemsRef.current.filter((i) => i.prepared);
    if (!queue.length) return;
    setRunning(true);
    setDoneCount(0);
    setTotalCount(queue.length);
    setItems((list) =>
      list.map((it) => {
        if (!queue.some((q) => q.id === it.id)) return it;
        clearOutputs(it);
        return { ...it, status: 'working', message: undefined, outputs: [] };
      }),
    );

    const plans = sizePlans(settings);
    let finished = 0;

    for (let idx = 0; idx < queue.length; idx++) {
      if (runToken.current !== token) break;
      const item = queue[idx]!;
      const prep = item.prepared!;
      const baseName = stripExtension(item.file.name);

      try {
        if (prep.type === 'svg' && item.svgText) {
          const base = item.svgBase ?? { width: settings.svgBaseWidth, height: settings.svgBaseWidth };
          const jobs = svgJobs(settings, base);
          const format = resolveFormat(settings.format, 'svg');
          const outList: OutputFile[] = [];

          for (const job of jobs) {
            if (runToken.current !== token) return;
            if (job.skipped) continue;
            const pngBlob = await rasterizeSvg(item.svgText, job.rasterW, job.rasterH);
            const buf = await pngBlob.arrayBuffer();
            const res = await pool.run(buf, [{ key: job.key, resize: job.resize, encode: encodeSpecFor(settings, format) }]);
            const r = res.results[0];
            if (!res.ok || !r?.ok || !r.bytes) throw new Error(r?.error ?? res.error ?? 'SVG conversion failed.');
            const blob = new Blob([r.bytes], { type: FORMAT_MIME[format] });
            const p = outputPath(settings, {
              baseName,
              width: r.width ?? job.rasterW,
              height: r.height ?? job.rasterH,
              index: idx + 1,
              preset: job.preset,
              scale: `${job.scale}x`,
              label: job.label,
              format,
            });
            outList.push({
              path: p,
              blob,
              url: URL.createObjectURL(blob),
              width: r.width ?? job.rasterW,
              height: r.height ?? job.rasterH,
              format,
            });
          }
          patchItem(item.id, { status: 'done', outputs: outList });
        } else if (prep.type !== 'svg') {
          const format = resolveFormat(settings.format, prep.type);
          const jobs = rasterJobs(settings, prep.type);
          const buf = await prep.blob.arrayBuffer();
          const res = await pool.run(buf, jobs);
          if (runToken.current !== token) return;
          if (!res.ok) throw new Error(res.error ?? 'Failed to process image.');

          const outList: OutputFile[] = [];
          res.results.forEach((r, ji) => {
            if (!r.ok || !r.bytes) return;
            const plan = plans[ji];
            const blob = new Blob([r.bytes], { type: FORMAT_MIME[format] });
            const p = outputPath(settings, {
              baseName,
              width: r.width ?? 0,
              height: r.height ?? 0,
              index: idx + 1,
              preset: plan?.preset,
              label: plan?.label ?? 'out',
              format,
            });
            outList.push({
              path: p,
              blob,
              url: URL.createObjectURL(blob),
              width: r.width ?? 0,
              height: r.height ?? 0,
              format,
              notEnlarged: r.notEnlarged,
            });
          });
          if (outList.length === 0) throw new Error(res.results[0]?.error ?? 'No output produced.');
          patchItem(item.id, { status: 'done', outputs: outList });
        }
      } catch (err) {
        if (runToken.current !== token) return;
        patchItem(item.id, { status: 'error', message: err instanceof Error ? err.message : 'Conversion failed.' });
      }
      finished++;
      setDoneCount(finished);
    }

    if (runToken.current === token) {
      setRunning(false);
      pool.dispose();
    }
  }

  function cancelRun() {
    runToken.current++;
    poolRef.current?.cancel();
    setItems((list) => list.map((it) => (it.status === 'working' ? { ...it, status: 'cancelled', message: 'Cancelled.' } : it)));
    setRunning(false);
  }

  function startOver() {
    cancelRun();
    for (const it of items) {
      if (it.thumb) URL.revokeObjectURL(it.thumb);
      clearOutputs(it);
    }
    setItems([]);
    setBanner(null);
  }

  async function downloadAllZip() {
    const allOutputs = items.flatMap((it) => it.outputs);
    if (!allOutputs.length) return;
    setZipping(true);
    try {
      const uniquePaths = dedupeNames(allOutputs.map((o) => o.path));
      const zip = await zipFiles(allOutputs.map((o, i) => ({ name: uniquePaths[i]!, data: o.blob })));
      downloadBlob(zip, 'resized-images.zip');
    } catch {
      toast('Could not build ZIP; download files individually.', 'error');
    } finally {
      setZipping(false);
    }
  }

  const firstPrepared = items.find((i) => i.prepared)?.prepared ?? null;
  const firstPreviewDims = useMemo(() => {
    if (!firstPrepared?.width || !firstPrepared?.height) return [];
    return previewSize(firstPrepared.width, firstPrepared.height, settings);
  }, [firstPrepared, settings]);

  const svgCount = items.filter((i) => i.prepared?.type === 'svg').length;
  const totalOutputsPlanned = outputCount(items.filter((i) => i.prepared).length, settings, svgCount);
  const doneOutputs = items.flatMap((i) => i.outputs);

  const groupedPresets = useMemo(() => {
    const map = new Map<string, typeof PRESETS>();
    for (const p of PRESETS) {
      const arr = map.get(p.group) ?? [];
      arr.push(p);
      map.set(p.group, arr);
    }
    return [...map.entries()];
  }, []);

  return (
    <div className="stack" style={{ gap: 16 }}>
      {banner && <Banner kind="warn" onDismiss={() => setBanner(null)}>{banner}</Banner>}

      {items.length === 0 ? (
        <div className="stack">
          <DropZone
            multiple
            paste
            accept={['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'image/bmp', 'image/svg+xml', 'image/heic', 'image/heif', '.heic', '.heif', '.svg']}
            maxBytes={100 * 1024 * 1024}
            title="Drop images or SVGs to resize and convert"
            hint="JPG, PNG, WebP, AVIF, GIF, BMP, SVG, HEIC · Up to 50 files · Processed in your browser"
            onFiles={(f) => void addFiles(f)}
            onReject={(m) => setBanner(m)}
          />
          <div className="row">
            <button type="button" className="btn" onClick={() => void tryExample()}>Try an example</button>
            <span className="hint">Nothing is uploaded. EXIF metadata is stripped and orientation is applied automatically.</span>
          </div>
        </div>
      ) : (
        <>
          <section className="panel stack" aria-label="Resize, format and output settings">
            <div className="grid-2">
              <div className="stack">
                <h2 className="panel-title" style={{ margin: 0 }}>1. Resize</h2>
                <SegmentedControl<ResizeMode>
                  label="Resize mode"
                  value={settings.resizeMode}
                  onChange={(resizeMode) => {
                    if (resizeMode === 'preset') {
                      const p = presetById(settings.presetId);
                      setSettings((s) => ({ ...s, resizeMode, fit: p?.fit ?? s.fit }));
                    } else {
                      setSettings((s) => ({ ...s, resizeMode }));
                    }
                  }}
                  options={[
                    { id: 'pixels', label: 'Pixels' },
                    { id: 'percent', label: 'Percent' },
                    { id: 'longEdge', label: 'Long edge' },
                    { id: 'preset', label: 'Preset' },
                    { id: 'none', label: 'Original' },
                  ]}
                />

                {settings.resizeMode === 'pixels' && (
                  <div className="row">
                    <Field label="Width (px)">
                      {(id) => (
                        <input
                          id={id}
                          type="number"
                          className="input"
                          style={{ width: 110 }}
                          min={0}
                          max={16384}
                          value={settings.width}
                          onChange={(e) => {
                            const w = Math.max(0, Math.min(16384, Number(e.target.value) || 0));
                            setSettings((s) => ({
                              ...s,
                              width: w,
                              height: s.lockAspect && w > 0 && firstPrepared?.width && firstPrepared?.height ? lockedHeight(w, firstPrepared.width, firstPrepared.height) : s.height,
                            }));
                          }}
                        />
                      )}
                    </Field>
                    <Field label="Height (px, 0 = auto)">
                      {(id) => (
                        <input
                          id={id}
                          type="number"
                          className="input"
                          style={{ width: 120 }}
                          min={0}
                          max={16384}
                          value={settings.height}
                          onChange={(e) => setSettings((s) => ({ ...s, height: Math.max(0, Math.min(16384, Number(e.target.value) || 0)) }))}
                        />
                      )}
                    </Field>
                    <label className="check" style={{ alignSelf: 'flex-end', marginBottom: 8 }}>
                      <input
                        type="checkbox"
                        checked={settings.lockAspect}
                        onChange={(e) => setSettings((s) => ({ ...s, lockAspect: e.target.checked }))}
                      />
                      Lock aspect
                    </label>
                  </div>
                )}

                {settings.resizeMode === 'percent' && (
                  <SliderField label="Scale (%)" value={settings.percent} min={5} max={400} unit="%" onChange={(percent) => setSettings((s) => ({ ...s, percent }))} />
                )}

                {settings.resizeMode === 'longEdge' && (
                  <Field label="Longest side (px)">
                    {(id) => (
                      <input
                        id={id}
                        type="number"
                        className="input"
                        style={{ width: 130 }}
                        min={16}
                        max={16384}
                        value={settings.longEdge}
                        onChange={(e) => setSettings((s) => ({ ...s, longEdge: Math.max(16, Math.min(16384, Number(e.target.value) || 1600)) }))}
                      />
                    )}
                  </Field>
                )}

                {settings.resizeMode === 'preset' && (
                  <Field label="Social & web preset">
                    {(id) => (
                      <select
                        id={id}
                        className="select"
                        value={settings.presetId}
                        onChange={(e) => {
                          const p = presetById(e.target.value);
                          setSettings((s) => ({ ...s, presetId: e.target.value, fit: p?.fit ?? s.fit }));
                        }}
                      >
                        {groupedPresets.map(([group, list]) => (
                          <optgroup key={group} label={group}>
                            {list.map((p) => (
                              <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    )}
                  </Field>
                )}

                <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
                  <div className="field">
                    <span className="label">Fit mode</span>
                    <SegmentedControl<FitMode>
                      label="Fit mode"
                      value={settings.fit}
                      onChange={(fit) => setSettings((s) => ({ ...s, fit }))}
                      options={[
                        { id: 'inside', label: 'Fit inside' },
                        { id: 'cover', label: 'Fill (crop)' },
                        { id: 'pad', label: 'Pad' },
                      ]}
                    />
                  </div>
                  {(settings.fit === 'cover' || settings.fit === 'pad') && (
                    <div className="field">
                      <span className="label">Anchor</span>
                      <div className={styles.anchorGrid} role="radiogroup" aria-label="Crop or pad anchor">
                        {ANCHORS.map((a) => {
                          const selected = settings.anchor.x === a.x && settings.anchor.y === a.y;
                          return (
                            <button
                              key={a.label}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              aria-label={a.label}
                              className={styles.anchorBtn}
                              onClick={() => setSettings((s) => ({ ...s, anchor: { x: a.x, y: a.y } }))}
                            >
                              ●
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.doNotEnlarge}
                    onChange={(e) => setSettings((s) => ({ ...s, doNotEnlarge: e.target.checked }))}
                  />
                  Do not enlarge images smaller than target (recommended)
                </label>
                {!settings.doNotEnlarge && (
                  <p className="hint" style={{ margin: 0 }}>Upscaling raster images can soften sharpness.</p>
                )}
              </div>

              <div className="stack">
                <h2 className="panel-title" style={{ margin: 0 }}>2. Format &amp; Output</h2>
                <div className="field">
                  <span className="label">Target format</span>
                  <SegmentedControl<FormatChoice>
                    label="Output format"
                    value={settings.format}
                    onChange={(format) => setSettings((s) => ({ ...s, format }))}
                    options={[
                      { id: 'keep', label: 'Keep' },
                      { id: 'webp', label: 'WebP' },
                      { id: 'jpeg', label: 'JPG' },
                      { id: 'png', label: 'PNG' },
                      { id: 'avif', label: 'AVIF' },
                    ]}
                  />
                </div>
                <SliderField label="Quality" value={settings.quality} min={10} max={100} unit="%" onChange={(quality) => setSettings((s) => ({ ...s, quality }))} />
                <div className="row">
                  <Field label="Background for JPG / transparent fill">
                    {(id) => <input id={id} type="color" value={settings.background} onChange={(e) => setSettings((s) => ({ ...s, background: e.target.value }))} />}
                  </Field>
                  {settings.fit === 'pad' && (
                    <label className="check" style={{ alignSelf: 'flex-end', marginBottom: 8 }}>
                      <input
                        type="checkbox"
                        checked={settings.padTransparent}
                        onChange={(e) => setSettings((s) => ({ ...s, padTransparent: e.target.checked }))}
                      />
                      Transparent pad (when format supports alpha)
                    </label>
                  )}
                </div>

                {svgCount > 0 && (
                  <div className="row">
                    <span className="label">SVG raster scales:</span>
                    {[1, 2, 3].map((sc) => {
                      const on = settings.svgScales.includes(sc);
                      return (
                        <label key={sc} className="check">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              setSettings((s) => {
                                const next = on ? s.svgScales.filter((x) => x !== sc) : [...s.svgScales, sc].sort();
                                return { ...s, svgScales: next.length ? next : [1] };
                              })
                            }
                          />
                          {sc}x
                        </label>
                      );
                    })}
                  </div>
                )}

                <div className="stack" style={{ gap: 6 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="label">Multi-size outputs ({settings.sizes.length}/{MAX_SIZE_ROWS})</span>
                    <button
                      type="button"
                      className="btn sm"
                      disabled={settings.sizes.length >= MAX_SIZE_ROWS}
                      onClick={() =>
                        setSettings((s) => ({
                          ...s,
                          sizes: [...s.sizes, { id: Date.now(), width: s.sizes.length ? 800 : 400, height: 0 }],
                        }))
                      }
                    >
                      <Icon name="plus" /> Add size row
                    </button>
                  </div>
                  {settings.sizes.map((row, idx) => (
                    <div key={row.id} className="row">
                      <input
                        type="number"
                        className="input"
                        style={{ width: 96, minHeight: 34 }}
                        aria-label={`Extra width ${idx + 1}`}
                        min={0}
                        max={16384}
                        value={row.width}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            sizes: s.sizes.map((r) => (r.id === row.id ? { ...r, width: Math.max(0, Number(e.target.value) || 0) } : r)),
                          }))
                        }
                      />
                      <span className="hint">×</span>
                      <input
                        type="number"
                        className="input"
                        style={{ width: 96, minHeight: 34 }}
                        aria-label={`Extra height ${idx + 1} (0 auto)`}
                        min={0}
                        max={16384}
                        value={row.height}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            sizes: s.sizes.map((r) => (r.id === row.id ? { ...r, height: Math.max(0, Number(e.target.value) || 0) } : r)),
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="btn sm ghost"
                        aria-label={`Remove size row ${idx + 1}`}
                        onClick={() => setSettings((s) => ({ ...s, sizes: s.sizes.filter((r) => r.id !== row.id) }))}
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  ))}
                </div>

                <Field
                  label="Rename pattern"
                  hint={`Tokens: ${NAME_TOKENS.join(', ')}`}
                  error={patternError ?? undefined}
                >
                  {(id) => (
                    <input
                      id={id}
                      className="input mono"
                      value={settings.pattern}
                      onChange={(e) => setSettings((s) => ({ ...s, pattern: e.target.value }))}
                    />
                  )}
                </Field>
                <SegmentedControl<ZipLayout>
                  label="ZIP structure"
                  value={settings.zip}
                  onChange={(zip) => setSettings((s) => ({ ...s, zip }))}
                  options={[
                    { id: 'flat', label: 'Flat ZIP' },
                    { id: 'folders', label: 'Folder per size' },
                  ]}
                />
              </div>
            </div>

            {firstPrepared && firstPreviewDims.length > 0 && (
              <p className="hint" style={{ margin: 0 }}>
                Preview on first file ({firstPrepared.width}×{firstPrepared.height}):{' '}
                {firstPreviewDims.map((d) => `${d.width}×${d.height}${d.notEnlarged ? ' (not enlarged)' : ''}`).join(', ')} ·{' '}
                Planned total: <strong>{totalOutputsPlanned} output(s)</strong>
              </p>
            )}
          </section>

          <div className="row">
            <button type="button" className="btn primary" disabled={running || Boolean(patternError) || !items.some((i) => i.prepared)} onClick={() => void runBatch()}>
              Convert {totalOutputsPlanned > 1 ? `(${totalOutputsPlanned} outputs)` : ''}
            </button>
            <button type="button" className="btn" onClick={startOver}>Start over</button>
          </div>

          {running && (
            <ProgressBar
              value={totalCount ? (doneCount / totalCount) * 100 : 0}
              label={`Processing ${doneCount} of ${totalCount} source files…`}
              onCancel={cancelRun}
            />
          )}

          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
            {items.map((it) => (
              <li key={it.id} className="file-row" style={{ alignItems: 'flex-start' }}>
                <div className={`${styles.thumb} checker`}>
                  {it.thumb ? (
                     
                    <img src={it.thumb} alt="" />
                  ) : (
                    <Icon name="file" />
                  )}
                </div>
                <div className="stack grow" style={{ gap: 4, minWidth: 0 }}>
                  <span className="name">{it.file.name}</span>
                  <span className="muted tabular" style={{ fontSize: 13 }}>
                    {formatBytes(it.file.size)}
                    {it.prepared?.width ? ` · ${it.prepared.width}×${it.prepared.height}` : ''} · {it.status}
                  </span>
                  {it.notes.map((n) => (
                    <span key={n} className="hint">{n}</span>
                  ))}
                  {it.message && <span role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{it.message}</span>}
                  {it.outputs.length > 0 && (
                    <div className="row" style={{ gap: 6, marginTop: 4 }}>
                      {it.outputs.map((o) => {
                        const larger = o.blob.size > it.file.size;
                        return (
                          <button
                            key={o.path}
                            type="button"
                            className="btn sm"
                            onClick={() => downloadBlob(o.blob, o.path.split('/').pop() ?? o.path)}
                          >
                            <Icon name="download" /> {o.width}×{o.height} ({formatBytes(o.blob.size)}
                            {larger ? ', +larger' : ''})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="btn sm icon ghost"
                  aria-label={`Remove ${it.file.name}`}
                  onClick={() => {
                    if (it.thumb) URL.revokeObjectURL(it.thumb);
                    clearOutputs(it);
                    setItems((l) => l.filter((x) => x.id !== it.id));
                  }}
                >
                  <Icon name="x" />
                </button>
              </li>
            ))}
          </ul>

          {doneOutputs.length > 0 && (
            <section className="panel stack" aria-live="polite">
              <div className="grid-2">
                <StatTile value={doneOutputs.length} label="Outputs ready" />
                <StatTile value={formatBytes(doneOutputs.reduce((s, o) => s + o.blob.size, 0))} label="Total output size" />
              </div>
              <div className="row">
                <button type="button" className="btn primary" disabled={zipping || running} onClick={() => void downloadAllZip()}>
                  <Icon name="download" /> {zipping ? 'Building ZIP…' : 'Download all (ZIP)'}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
