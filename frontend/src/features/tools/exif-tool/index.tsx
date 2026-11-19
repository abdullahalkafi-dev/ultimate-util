'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banner,
  ConfirmDialog,
  CopyButton,
  DropZone,
  ErrorBanner,
  Field,
  Icon,
  SegmentedControl,
  Tabs,
  useToast,
} from '@/components/ui';
import { downloadBlob, formatBytes, outputName, readFirstBytes, sniffType, zipFiles, type SniffedType } from '@/lib/files';
import { readJson, writeJson } from '@/lib/storage';
import {
  buildSampleExifTiff,
  diffMetadata,
  injectExifIntoJpeg,
  inspectBytes,
  type FieldDiffRow,
  type InspectionResult,
} from './inspect';
import { DEFAULT_STRIP, stripBytes, type StripFormat, type StripMode, type StripOptions } from './strip';
import styles from './styles.module.css';

type MetaTab = 'summary' | 'camera' | 'location' | 'dates' | 'software' | 'thumbnail' | 'all' | 'raw';

interface PhotoItem {
  id: number;
  file: File;
  bytes: Uint8Array;
  sniffed: SniffedType;
  stripFormat: StripFormat | null;
  inspection: InspectionResult | null;
  cleaned?: {
    bytes: Uint8Array;
    name: string;
    lossless: boolean;
    removedLabels: string[];
    diff: FieldDiffRow[];
    afterGps: boolean;
  };
  error?: string;
}

const STORAGE_KEY = 'uu-exif-tool';
const MAX_BATCH = 50;

function toStripFormat(t: SniffedType): StripFormat | null {
  if (t === 'jpeg' || t === 'png' || t === 'webp') return t;
  return null;
}

async function reencodeFallback(file: File, sniffed: SniffedType): Promise<{ bytes: Uint8Array; ext: string }> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available.');
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const mime = sniffed === 'png' ? 'image/png' : 'image/jpeg';
  const ext = sniffed === 'png' ? 'png' : 'jpg';
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, mime, 0.94));
  if (!blob) throw new Error('Could not re-encode the image.');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), ext };
}

export default function ExifTool() {
  const toast = useToast();
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [metaTab, setMetaTab] = useState<MetaTab>('summary');
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<StripOptions>(DEFAULT_STRIP);
  const [loaded, setLoaded] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [mapPrompt, setMapPrompt] = useState<{ lat: number; lon: number } | null>(null);
  const [mapSessionOk, setMapSessionOk] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    const saved = readJson<Partial<StripOptions> | null>(STORAGE_KEY, null);
    if (saved) setOptions((prev) => ({ ...prev, ...saved }));
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    writeJson(STORAGE_KEY, options);
  }, [options, loaded]);

  const active = useMemo(() => items.find((i) => i.id === selectedId) ?? items[0] ?? null, [items, selectedId]);

  useEffect(() => {
    const tb = active?.inspection?.thumbnailBytes;
    if (!tb) {
      setThumbUrl(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([tb.slice().buffer], { type: 'image/jpeg' }));
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [active]);

  async function addFiles(files: File[]) {
    setBanner(null);
    const room = MAX_BATCH - items.length;
    if (room <= 0) {
      setBanner(`Batch limit is ${MAX_BATCH} files. Remove some or start over.`);
      return;
    }
    const batch = files.slice(0, room);
    const added: PhotoItem[] = [];
    for (const file of batch) {
      if (file.size === 0) {
        added.push({ id: nextId.current++, file, bytes: new Uint8Array(0), sniffed: 'unknown', stripFormat: null, inspection: null, error: 'File is empty (0 bytes).' });
        continue;
      }
      const head = await readFirstBytes(file);
      const sniffed = sniffType(head);
      const supported = ['jpeg', 'png', 'webp', 'heic', 'avif'].includes(sniffed);
      if (!supported) {
        added.push({
          id: nextId.current++,
          file,
          bytes: new Uint8Array(0),
          sniffed,
          stripFormat: null,
          inspection: null,
          error: `Unsupported file type (${sniffed === 'unknown' ? 'unknown format' : sniffed}). Drop JPEG, PNG, WebP, HEIC or AVIF images.`,
        });
        continue;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const stripFormat = toStripFormat(sniffed);
      const inspection = await inspectBytes(bytes, stripFormat);
      added.push({ id: nextId.current++, file, bytes, sniffed, stripFormat, inspection });
    }
    setItems((prev) => [...prev, ...added]);
    if (added[0]) setSelectedId(added[0].id);
  }

  async function tryExample() {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#2446f0';
    ctx.fillRect(0, 0, 320, 200);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('Sample Photo (Fake GPS)', 36, 108);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    if (!blob) return;
    const rawJpg = new Uint8Array(await blob.arrayBuffer());
    const withExif = injectExifIntoJpeg(rawJpg, buildSampleExifTiff());
    const file = new File([withExif.slice().buffer], 'sample-location.jpg', { type: 'image/jpeg' });
    await addFiles([file]);
  }

  async function cleanItem(item: PhotoItem, allowReencode: boolean): Promise<PhotoItem> {
    if (item.error || !item.inspection) return item;
    try {
      let outBytes: Uint8Array;
      let outName: string;
      let lossless = true;
      let removedLabels: string[] = [];

      if (item.stripFormat) {
        const res = stripBytes(item.bytes, item.stripFormat, options);
        outBytes = res.bytes;
        outName = outputName(item.file.name, 'clean');
        removedLabels = res.removed;
      } else if (allowReencode) {
        const re = await reencodeFallback(item.file, item.sniffed);
        outBytes = re.bytes;
        outName = outputName(item.file.name, 'clean', re.ext);
        lossless = false;
        removedLabels = ['All metadata (re-encoded to strip container tags)'];
      } else {
        return {
          ...item,
          error: `${item.sniffed.toUpperCase()} has no lossless metadata writer here. Use "Clean with re-encode" to strip metadata by re-encoding.`,
        };
      }

      const afterFormat: StripFormat | null = lossless ? item.stripFormat : outName.endsWith('.png') ? 'png' : 'jpeg';
      const afterInspection = await inspectBytes(outBytes, afterFormat);
      const diff = diffMetadata(item.inspection.fields, afterInspection.fields);

      return {
        ...item,
        cleaned: {
          bytes: outBytes,
          name: outName,
          lossless,
          removedLabels,
          diff,
          afterGps: Boolean(afterInspection.gps),
        },
      };
    } catch (err) {
      return {
        ...item,
        error: err instanceof Error ? err.message : 'Could not strip metadata from this file.',
      };
    }
  }

  async function cleanAll(allowReencode = false) {
    const next = await Promise.all(items.map((it) => cleanItem(it, allowReencode)));
    setItems(next);
    toast('Finished cleaning metadata', 'success');
  }

  async function downloadAllZip() {
    const ready = items.filter((i) => i.cleaned);
    if (!ready.length) return;
    const blob = await zipFiles(ready.map((i) => ({ name: i.cleaned!.name, data: i.cleaned!.bytes })));
    downloadBlob(blob, 'cleaned-images.zip');
  }

  function openMap(lat: number, lon: number) {
    if (mapSessionOk) {
      window.open(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`, '_blank', 'noopener,noreferrer');
    } else {
      setMapPrompt({ lat, lon });
    }
  }

  const filteredFields = useMemo(() => {
    if (!active?.inspection) return [];
    const q = search.trim().toLowerCase();
    return active.inspection.fields.filter((f) => {
      if (metaTab === 'camera' && f.category !== 'camera') return false;
      if (metaTab === 'location' && f.category !== 'location') return false;
      if (metaTab === 'dates' && f.category !== 'dates') return false;
      if (metaTab === 'software' && f.category !== 'software') return false;
      if (!q) return true;
      return f.key.toLowerCase().includes(q) || f.value.toLowerCase().includes(q);
    });
  }, [active, metaTab, search]);

  const cleanedCount = items.filter((i) => i.cleaned).length;

  return (
    <div className="stack" style={{ gap: 16 }}>
      {banner && <Banner kind="warn" onDismiss={() => setBanner(null)}>{banner}</Banner>}

      {items.length === 0 ? (
        <div className="stack">
          <DropZone
            multiple
            accept={['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif', '.heic', '.heif']}
            maxBytes={200 * 1024 * 1024}
            title="Drop photos to inspect and strip EXIF metadata"
            hint="JPEG, PNG, WebP (lossless byte removal) · HEIC, AVIF (inspect + re-encode fallback) · Up to 50 files"
            onFiles={(f) => void addFiles(f)}
            onReject={(m) => setBanner(m)}
          />
          <div className="row">
            <button type="button" className="btn" onClick={() => void tryExample()}>Try an example</button>
            <span className="hint">Nothing is uploaded. GPS and camera tags are read locally in your browser.</span>
          </div>
        </div>
      ) : (
        <>
          <section className="panel stack" aria-label="Metadata stripping options">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <SegmentedControl<StripMode>
                label="Strip mode"
                value={options.mode}
                onChange={(mode) => setOptions((o) => ({ ...o, mode }))}
                options={[
                  { id: 'all', label: 'Remove everything' },
                  { id: 'gps', label: 'Remove GPS location only' },
                ]}
              />
              <div className="row">
                <button type="button" className="btn primary" onClick={() => void cleanAll(false)}>
                  Clean {items.length > 1 ? `all (${items.length})` : 'file'}
                </button>
                {items.some((i) => !i.stripFormat && !i.error) && (
                  <button type="button" className="btn" onClick={() => void cleanAll(true)}>
                    Clean with re-encode
                  </button>
                )}
                {cleanedCount > 1 && (
                  <button type="button" className="btn" onClick={() => void downloadAllZip()}>
                    <Icon name="download" /> Download ZIP
                  </button>
                )}
                <button type="button" className="btn sm" onClick={() => { setItems([]); setSelectedId(null); }}>
                  Start over
                </button>
              </div>
            </div>

            {options.mode === 'all' && (
              <div className="row" style={{ gap: 18 }}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={options.keepOrientation}
                    onChange={(e) => setOptions((o) => ({ ...o, keepOrientation: e.target.checked }))}
                  />
                  Keep Orientation tag (recommended so portrait photos stay upright)
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={options.keepIcc}
                    onChange={(e) => setOptions((o) => ({ ...o, keepIcc: e.target.checked }))}
                  />
                  Keep ICC color profile
                </label>
              </div>
            )}

            {options.mode === 'all' && !options.keepOrientation && (
              <Banner kind="warn">Orientation tag will be removed; portrait photos may appear rotated in some viewers.</Banner>
            )}
          </section>

          <div className="split">
            <section className="panel stack" aria-label="Files queue">
              <h2 className="panel-title" style={{ margin: 0 }}>Files ({items.length})</h2>
              <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 8 }}>
                {items.map((it) => (
                  <li key={it.id} className="file-row" style={{ borderColor: active?.id === it.id ? 'var(--accent)' : undefined }}>
                    <button
                      type="button"
                      className="btn ghost sm grow"
                      style={{ justifyContent: 'flex-start', textAlign: 'left', overflow: 'hidden' }}
                      onClick={() => setSelectedId(it.id)}
                    >
                      <span className="name">{it.file.name}</span>
                      <span className="faint tabular">({formatBytes(it.file.size)})</span>
                    </button>
                    {it.inspection?.gps && <span className="tag local">GPS</span>}
                    {it.cleaned && (
                      <button
                        type="button"
                        className="btn sm primary"
                        onClick={() =>
                          downloadBlob(
                            new Blob([it.cleaned!.bytes.slice().buffer], {
                              type: it.cleaned!.name.endsWith('.png') ? 'image/png' : it.cleaned!.name.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
                            }),
                            it.cleaned!.name,
                          )
                        }
                      >
                        <Icon name="download" /> Save
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn sm icon ghost"
                      aria-label={`Remove ${it.file.name}`}
                      onClick={() => setItems((list) => list.filter((x) => x.id !== it.id))}
                    >
                      <Icon name="x" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {active && (
              <section className="panel stack" aria-label="Inspected metadata" aria-live="polite">
                {active.error ? (
                  <ErrorBanner>{active.error}</ErrorBanner>
                ) : active.inspection ? (
                  <>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <h2 className="panel-title" style={{ margin: 0 }}>{active.file.name}</h2>
                      <CopyButton
                        text={JSON.stringify(Object.fromEntries(active.inspection.fields.map((f) => [f.key, f.value])), null, 2)}
                        label="Copy JSON"
                      />
                    </div>

                    {active.inspection.parseWarning && <Banner kind="warn">{active.inspection.parseWarning}</Banner>}
                    {active.inspection.riskFlags.length > 0 ? (
                      <Banner kind="warn">
                        Privacy risks: {active.inspection.riskFlags.join(' · ')}
                      </Banner>
                    ) : (
                      <Banner kind="ok">No camera, author or GPS metadata detected.</Banner>
                    )}

                    {active.cleaned && (
                      <Banner kind="ok">
                        {active.cleaned.lossless
                          ? 'Lossless: pixels untouched.'
                          : 'Re-encoded: quality may differ slightly.'}{' '}
                        {active.cleaned.removedLabels.length > 0
                          ? `Removed: ${active.cleaned.removedLabels.join(', ')}.`
                          : 'No matching metadata needed removal.'}
                        {active.cleaned.afterGps && ' Warning: re-check revealed remaining GPS fields.'}
                      </Banner>
                    )}

                    <Tabs<MetaTab>
                      label="Metadata groups"
                      value={metaTab}
                      onChange={setMetaTab}
                      tabs={[
                        { id: 'summary', label: 'Summary' },
                        { id: 'camera', label: 'Camera' },
                        { id: 'location', label: 'Location' },
                        { id: 'dates', label: 'Dates' },
                        { id: 'software', label: 'Software/Author' },
                        { id: 'thumbnail', label: 'Thumbnail' },
                        { id: 'all', label: `All (${active.inspection.fields.length})` },
                        { id: 'raw', label: 'Raw blocks' },
                      ]}
                    />

                    {metaTab === 'summary' && active.cleaned && (
                      <div className="stack" style={{ gap: 6 }}>
                        <strong>Before / after diff ({active.cleaned.diff.filter((d) => d.status === 'removed').length} fields removed)</strong>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th scope="col">Field</th>
                              <th scope="col">Before</th>
                              <th scope="col">After</th>
                            </tr>
                          </thead>
                          <tbody>
                            {active.cleaned.diff.map((row) => (
                              <tr key={row.key} className={row.status === 'removed' ? styles.removedRow : styles.keptRow}>
                                <td className="mono">{row.key}</td>
                                <td>{row.before}</td>
                                <td>{row.after ?? 'Removed'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {metaTab === 'location' && active.inspection.gps && (
                      <div className="panel stack" style={{ background: 'var(--bg)' }}>
                        <div><strong>Decimal:</strong> <code className="mono">{active.inspection.gps.lat.toFixed(6)}, {active.inspection.gps.lon.toFixed(6)}</code></div>
                        <div><strong>DMS:</strong> <code className="mono">{active.inspection.gps.latDms}, {active.inspection.gps.lonDms}</code></div>
                        {active.inspection.gps.altitude !== undefined && (
                          <div><strong>Altitude:</strong> {active.inspection.gps.altitude} m</div>
                        )}
                        <div className="row">
                          <CopyButton text={`${active.inspection.gps.lat.toFixed(6)}, ${active.inspection.gps.lon.toFixed(6)}`} label="Copy coordinates" />
                          <button type="button" className="btn sm" onClick={() => openMap(active.inspection!.gps!.lat, active.inspection!.gps!.lon)}>
                            Show on map (opt-in)
                          </button>
                        </div>
                      </div>
                    )}

                    {metaTab === 'thumbnail' && (
                      thumbUrl ? (
                        <div className="stack">
                          <p className="hint" style={{ margin: 0 }}>
                            Embedded EXIF thumbnail (sometimes shows an uncropped original; removed by &ldquo;Remove everything&rdquo;).
                          </p>
                          { }
                          <img src={thumbUrl} alt="Embedded EXIF thumbnail" className={styles.thumbPreview} />
                        </div>
                      ) : (
                        <p className="muted" style={{ margin: 0 }}>No embedded thumbnail found.</p>
                      )
                    )}

                    {metaTab === 'raw' && (
                      active.inspection.blocks.length > 0 ? (
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th scope="col">Container block</th>
                              <th scope="col">Size</th>
                            </tr>
                          </thead>
                          <tbody>
                            {active.inspection.blocks.map((b, i) => (
                              <tr key={`${b.name}-${i}`}>
                                <td className="mono">{b.name}</td>
                                <td className="tabular">{formatBytes(b.bytes)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className="muted" style={{ margin: 0 }}>No metadata container blocks detected.</p>
                      )
                    )}

                    {(metaTab === 'summary' || metaTab === 'camera' || metaTab === 'location' || metaTab === 'dates' || metaTab === 'software' || metaTab === 'all') && (
                      <div className="stack">
                        {metaTab === 'all' && (
                          <Field label="Filter metadata fields">
                            {(id) => <input id={id} className="input" placeholder="Search field name or value…" value={search} onChange={(e) => setSearch(e.target.value)} />}
                          </Field>
                        )}
                        {filteredFields.length === 0 ? (
                          <p className="muted" style={{ margin: 0 }}>No metadata fields in this group.</p>
                        ) : (
                          <div style={{ overflowX: 'auto', maxHeight: 340 }}>
                            <table className={styles.table}>
                              <thead>
                                <tr>
                                  <th scope="col">Field</th>
                                  <th scope="col">Value</th>
                                  <th scope="col">Copy</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredFields.map((f) => (
                                  <tr key={f.key}>
                                    <td className="mono">
                                      {f.key}{' '}
                                      {f.risk === 'high' && <span className="tag local">GPS risk</span>}
                                    </td>
                                    <td style={{ wordBreak: 'break-word' }}>{f.value}</td>
                                    <td><CopyButton text={`${f.key}: ${f.value}`} label="Copy" /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : null}
              </section>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={mapPrompt !== null}
        title="Open coordinates on OpenStreetMap?"
        message={
          mapPrompt
            ? `Opening OpenStreetMap in a new tab will share these approximate coordinates (${mapPrompt.lat.toFixed(5)}, ${mapPrompt.lon.toFixed(5)}) with openstreetmap.org.`
            : ''
        }
        confirmLabel="Open map in new tab"
        onConfirm={() => {
          if (mapPrompt) {
            setMapSessionOk(true);
            window.open(
              `https://www.openstreetmap.org/?mlat=${mapPrompt.lat}&mlon=${mapPrompt.lon}#map=15/${mapPrompt.lat}/${mapPrompt.lon}`,
              '_blank',
              'noopener,noreferrer',
            );
          }
          setMapPrompt(null);
        }}
        onCancel={() => setMapPrompt(null)}
      />
    </div>
  );
}
