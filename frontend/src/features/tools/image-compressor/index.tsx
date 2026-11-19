'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banner, DropZone, ErrorBanner, Field, Icon, ProgressBar, SegmentedControl, SliderField, StatTile, useToast } from '@/components/ui';
import { downloadBlob, formatBytes, zipFiles } from '@/lib/files';
import { readJson, writeJson } from '@/lib/storage';
import { BeforeAfter } from '../_shared-images/BeforeAfter';
import { prepareInput, type PreparedImage } from '../_shared-images/input';
import { dedupeNames } from '../_shared-images/naming';
import { ImagePool } from '../_shared-images/pool';
import { makeSampleImage } from '../_shared-images/sample';
import { MAX_BATCH, SOFT_FILE_BYTES } from '../_shared-images/types';
import { DEFAULT_SETTINGS, savedPercent, totals, type FormatChoice, type Mode, type Settings } from './compress';
import { compressItem, type CompressResult } from './runItem';
import styles from './styles.module.css';

type Status = 'preparing' | 'ready' | 'working' | 'done' | 'skipped' | 'error' | 'cancelled';

interface Item {
  id: number;
  file: File;
  prepared: PreparedImage | null;
  thumb: string | null;
  status: Status;
  message?: string;
  notes: string[];
  result?: CompressResult & { url: string };
}

const STORAGE_KEY = 'uu:image-compressor:settings';
const isSettings = (v: unknown): v is Settings => typeof v === 'object' && v !== null && 'mode' in v && 'quality' in v;

const MODES: { id: Mode; label: string }[] = [
  { id: 'smart', label: 'Smart' },
  { id: 'lossy', label: 'Lossy' },
  { id: 'lossless', label: 'Lossless' },
];

const MODE_HINT: Record<Mode, string> = {
  smart: 'Tries lossless first, then lossy at falling quality until the file is clearly smaller.',
  lossy: 'Uses exactly the quality you pick. Fastest, smallest.',
  lossless: 'Pixels stay identical. JPEG files only lose metadata; PNG is re-packed.',
};

export default function ImageCompressor() {
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [running, setRunning] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [compareId, setCompareId] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const poolRef = useRef<ImagePool | null>(null);
  const nextId = useRef(1);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;
  const runToken = useRef(0);

  const wasmMissing = typeof WebAssembly === 'undefined';

  useEffect(() => {
    setSettings({ ...DEFAULT_SETTINGS, ...readJson<Settings>(STORAGE_KEY, DEFAULT_SETTINGS, isSettings) });
  }, []);
  useEffect(() => {
    writeJson(STORAGE_KEY, settings);
  }, [settings]);
  useEffect(
    () => () => {
      poolRef.current?.dispose();
      for (const i of itemsRef.current) {
        if (i.thumb) URL.revokeObjectURL(i.thumb);
        if (i.result) URL.revokeObjectURL(i.result.url);
      }
    },
    [],
  );

  const patch = useCallback((id: number, change: Partial<Item>) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...change } : i)));
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      setBanner(null);
      const room = MAX_BATCH - itemsRef.current.length;
      if (room <= 0) {
        setBanner(`A batch holds up to ${MAX_BATCH} images. Remove some or start over.`);
        return;
      }
      if (files.length > room) setBanner(`Only the first ${room} images were added (batch limit ${MAX_BATCH}).`);
      const accepted = files.slice(0, room);
      const fresh: Item[] = accepted.map((file) => ({ id: nextId.current++, file, prepared: null, thumb: null, status: 'preparing', notes: [] }));
      setItems((list) => [...list, ...fresh]);
      for (const item of fresh) {
        const prep = await prepareInput(item.file, { allowSvg: false });
        if (!prep.ok) {
          patch(item.id, { status: 'error', message: prep.error });
          continue;
        }
        const big = item.file.size > SOFT_FILE_BYTES ? ['This file is over 50 MB, so it may be slow.'] : [];
        patch(item.id, {
          prepared: prep.image,
          thumb: URL.createObjectURL(prep.image.blob),
          status: 'ready',
          notes: [...prep.image.notes, ...big],
        });
      }
    },
    [patch],
  );

  async function addExample() {
    try {
      await addFiles([await makeSampleImage('example-photo.png')]);
    } catch {
      toast('Could not create the example image.', 'error');
    }
  }

  const compress = useCallback(
    async (targetIds?: number[]) => {
      const token = ++runToken.current;
      const pool = new ImagePool();
      poolRef.current?.dispose();
      poolRef.current = pool;
      const queue = itemsRef.current.filter((i) => i.prepared && (!targetIds || targetIds.includes(i.id)));
      if (!queue.length) return;
      setRunning(true);
      setDoneCount(0);
      setTotal(queue.length);
      setBanner(null);
      setItems((list) => list.map((i) => (queue.some((q) => q.id === i.id) ? { ...i, status: 'working', message: undefined } : i)));
      let finished = 0;
      const concurrency = Math.max(1, Math.min(queue.length, 4));
      let cursor = 0;
      const worker = async () => {
        while (cursor < queue.length && runToken.current === token) {
          const item = queue[cursor++]!;
          const outcome = await compressItem(item.file, item.prepared!, settings, pool);
          if (runToken.current !== token) return;
          if (outcome.kind === 'done') {
            const url = URL.createObjectURL(outcome.result.blob);
            setItems((list) =>
              list.map((i) => {
                if (i.id !== item.id) return i;
                if (i.result) URL.revokeObjectURL(i.result.url);
                return { ...i, status: 'done', result: { ...outcome.result, url } };
              }),
            );
          } else if (outcome.kind === 'skipped') patch(item.id, { status: 'skipped', message: outcome.message });
          else if (outcome.kind === 'error') patch(item.id, { status: 'error', message: outcome.message });
          else patch(item.id, { status: 'cancelled' });
          finished++;
          setDoneCount(finished);
        }
      };
      await Promise.all(Array.from({ length: concurrency }, worker));
      if (runToken.current === token) {
        setRunning(false);
        pool.dispose();
      }
    },
    [settings, patch],
  );

  function cancel() {
    runToken.current++;
    poolRef.current?.cancel();
    setItems((list) => list.map((i) => (i.status === 'working' ? { ...i, status: 'cancelled', message: 'Cancelled.' } : i)));
    setRunning(false);
  }

  // A single file re-runs live when settings change (debounced), as the spec asks.
  const settingsKey = JSON.stringify(settings);
  const lastKey = useRef(settingsKey);
  useEffect(() => {
    if (lastKey.current === settingsKey) return;
    lastKey.current = settingsKey;
    const only = itemsRef.current;
    if (only.length !== 1 || only[0]!.status !== 'done') return;
    const t = setTimeout(() => void compress([only[0]!.id]), 300);
    return () => clearTimeout(t);
  }, [settingsKey, compress]);

  function remove(id: number) {
    const item = items.find((i) => i.id === id);
    if (item?.thumb) URL.revokeObjectURL(item.thumb);
    if (item?.result) URL.revokeObjectURL(item.result.url);
    setItems((list) => list.filter((i) => i.id !== id));
    if (compareId === id) setCompareId(null);
  }

  function startOver() {
    cancel();
    for (const i of items) {
      if (i.thumb) URL.revokeObjectURL(i.thumb);
      if (i.result) URL.revokeObjectURL(i.result.url);
    }
    setItems([]);
    setCompareId(null);
    setBanner(null);
  }

  const done = items.filter((i) => i.result);
  const summary = useMemo(() => totals(done.map((i) => ({ before: i.result!.before, after: i.result!.after }))), [done]);
  const working = items.some((i) => i.status === 'working');
  const readyCount = items.filter((i) => i.prepared).length;
  const compareItem = items.find((i) => i.id === compareId && i.result && i.thumb);
  const hasAlphaWarning = (i: Item) => i.result?.flattened;
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value }));

  async function downloadZip() {
    setZipping(true);
    try {
      const names = dedupeNames(done.map((i) => i.result!.name));
      const blob = await zipFiles(done.map((i, n) => ({ name: names[n]!, data: i.result!.blob })));
      downloadBlob(blob, 'images-compressed.zip');
    } catch {
      toast('Could not build the ZIP. Download the files one by one instead.', 'error');
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {wasmMissing && (
        <ErrorBanner>This browser does not support WebAssembly, which the compression codecs need. Use a current version of Chrome, Edge, Firefox or Safari.</ErrorBanner>
      )}
      {banner && <Banner kind="warn" onDismiss={() => setBanner(null)}>{banner}</Banner>}

      {items.length === 0 ? (
        <div className="stack">
          <DropZone
            multiple
            paste
            onFiles={addFiles}
            onReject={(m) => setBanner(m)}
            accept={['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'image/bmp', 'image/heic', 'image/heif', '.heic', '.heif']}
            maxBytes={100 * 1024 * 1024}
            title="Drop images here, or paste"
            hint="PNG, JPG, WebP, AVIF. GIF, BMP and HEIC are converted on the way in. Up to 50 images."
          />
          <div className="row">
            <button type="button" className="btn" onClick={addExample}>Try an example</button>
            <span className="hint">Nothing is uploaded. Compression runs on your device.</span>
          </div>
        </div>
      ) : (
        <>
          <section className="panel stack" aria-label="Compression settings">
            <div className="row" style={{ gap: 20, alignItems: 'flex-start' }}>
              <div className="stack" style={{ gap: 6 }}>
                <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>Mode</span>
                <SegmentedControl label="Compression mode" options={MODES} value={settings.mode} onChange={(m) => set('mode', m)} />
                <span className="hint" style={{ maxWidth: 280 }}>{MODE_HINT[settings.mode]}</span>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                <span className="muted" style={{ fontWeight: 600, fontSize: 13 }}>Format</span>
                <SegmentedControl<FormatChoice>
                  label="Output format"
                  options={[
                    { id: 'keep', label: 'Keep' },
                    { id: 'webp', label: 'WebP' },
                    { id: 'avif', label: 'AVIF' },
                    { id: 'jpeg', label: 'JPG' },
                    { id: 'png', label: 'PNG' },
                  ]}
                  value={settings.format}
                  onChange={(f) => set('format', f)}
                />
              </div>
              <div style={{ minWidth: 240, flex: 1 }}>
                <SliderField label={settings.mode === 'lossless' ? 'Quality (not used in Lossless)' : 'Quality'} value={settings.quality} onChange={(q) => set('quality', q)} min={1} max={100} />
              </div>
            </div>
            <div className="row" style={{ gap: 20 }}>
              <Field label="Max width or height (pixels, 0 for none)">
                {(id) => (
                  <input
                    id={id}
                    className="input"
                    style={{ width: 120 }}
                    type="number"
                    min={0}
                    max={16384}
                    value={settings.maxDimension}
                    onChange={(e) => set('maxDimension', Math.min(16384, Math.max(0, Math.round(Number(e.target.value) || 0))))}
                  />
                )}
              </Field>
              <Field label="Background for transparency (used for JPG)">
                {(id) => <input id={id} type="color" value={settings.background} onChange={(e) => set('background', e.target.value)} />}
              </Field>
              <label className="check">
                <input type="checkbox" checked={settings.allowFirstFrame} onChange={(e) => set('allowFirstFrame', e.target.checked)} />
                Allow first frame only for animated images
              </label>
            </div>
            <p className="hint" style={{ margin: 0 }}>
              Metadata (location, camera, thumbnails) is removed and the color profile is dropped; the photo orientation is applied to the pixels. Inspect files with the EXIF tool.
            </p>
          </section>

          <div className="row">
            <button type="button" className="btn primary" onClick={() => void compress()} disabled={running || readyCount === 0 || wasmMissing}>
              {done.length ? 'Compress again' : 'Compress'}
            </button>
            <DropZoneMini onFiles={addFiles} disabled={items.length >= MAX_BATCH} />
            <button type="button" className="btn" onClick={startOver}>Start over</button>
          </div>

          {(running || working) && (
            <ProgressBar
              value={total ? (doneCount / total) * 100 : 0}
              label={`${doneCount} of ${total} done`}
              onCancel={cancel}
            />
          )}

          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }} aria-label="Images">
            {items.map((item) => (
              <li key={item.id} className="file-row" style={{ alignItems: 'flex-start' }}>
                <div className={`${styles.thumb} checker`}>
                  {item.thumb ? (
                     
                    <img src={item.thumb} alt="" />
                  ) : (
                    <Icon name="file" />
                  )}
                </div>
                <div className="stack grow" style={{ gap: 4, minWidth: 0 }}>
                  <span className="name">{item.file.name}</span>
                  <span className="muted tabular" style={{ fontSize: 13 }}>
                    {item.status === 'preparing' && 'Reading file...'}
                    {item.status === 'ready' && `${formatBytes(item.file.size)}${item.prepared?.width ? ` · ${item.prepared.width}×${item.prepared.height}` : ''} · Ready`}
                    {item.status === 'working' && `${formatBytes(item.file.size)} · Working...`}
                    {item.status === 'cancelled' && `${formatBytes(item.file.size)} · Cancelled`}
                    {item.status === 'done' && item.result && (
                      <>
                        {formatBytes(item.result.before)} to {formatBytes(item.result.after)} ·{' '}
                        <b>{item.result.outcome === 'already-optimized' ? 'Already optimized (0%)' : `-${savedPercent(item.result.before, item.result.after)}%`}</b>
                        {item.result.width ? ` · ${item.result.width}×${item.result.height}` : ''}
                      </>
                    )}
                  </span>
                  {item.status === 'done' && item.result && <span className="hint">{item.result.method}</span>}
                  <div className="row" style={{ gap: 6 }}>
                    {hasAlphaWarning(item) && <span className="tag local">Transparency removed</span>}
                    {item.notes.map((n) => (
                      <span key={n} className="hint">{n}</span>
                    ))}
                  </div>
                  {(item.status === 'error' || item.status === 'skipped') && item.message && (
                    <span role="alert" style={{ color: item.status === 'error' ? 'var(--danger)' : undefined, fontSize: 13 }}>{item.message}</span>
                  )}
                </div>
                <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  {item.status === 'error' && item.prepared && (
                    <button type="button" className="btn sm" onClick={() => void compress([item.id])} disabled={running}>Retry</button>
                  )}
                  {item.status === 'done' && item.result && (
                    <>
                      {item.result.outcome === 'compressed' && (
                        <button type="button" className="btn sm" onClick={() => setCompareId(compareId === item.id ? null : item.id)} aria-pressed={compareId === item.id}>
                          Compare
                        </button>
                      )}
                      <button type="button" className="btn sm" onClick={() => downloadBlob(item.result!.blob, item.result!.name)}>
                        <Icon name="download" /> Download
                      </button>
                    </>
                  )}
                  <button type="button" className="btn sm icon ghost" aria-label={`Remove ${item.file.name}`} onClick={() => remove(item.id)}>
                    <Icon name="x" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {compareItem?.result && compareItem.thumb && (
            <section className="panel" aria-label={`Comparison for ${compareItem.file.name}`}>
              <h2 className="panel-title">{compareItem.file.name}</h2>
              <BeforeAfter beforeUrl={compareItem.thumb} afterUrl={compareItem.result.url} />
            </section>
          )}

          {done.length > 0 && (
            <section className="panel stack" aria-live="polite">
              <div className="grid-3">
                <StatTile value={`${done.length} of ${items.length}`} label="Images done" />
                <StatTile value={formatBytes(Math.max(0, summary.saved))} label="Saved in total" />
                <StatTile value={`${summary.percent > 0 ? '-' : ''}${Math.max(0, summary.percent)}%`} label="Overall" />
              </div>
              <div className="row">
                <button type="button" className="btn primary" onClick={() => void downloadZip()} disabled={zipping || running}>
                  <Icon name="download" /> {zipping ? 'Building ZIP...' : done.length > 1 ? 'Download all (ZIP)' : 'Download ZIP'}
                </button>
                <span className="hint">Files that were already optimized keep their original bytes.</span>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function DropZoneMini({ onFiles, disabled }: { onFiles: (f: File[]) => void; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="btn" disabled={disabled} onClick={() => input.current?.click()}>
        Add more images
      </button>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="image/*,.heic,.heif"
        onChange={(e) => {
          if (e.target.files) onFiles(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
    </>
  );
}
