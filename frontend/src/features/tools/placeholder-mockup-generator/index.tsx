'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banner,
  CopyButton,
  DropZone,
  ErrorBanner,
  Field,
  Icon,
  SegmentedControl,
  Tabs,
  useToast,
} from '@/components/ui';
import { downloadBlob, downloadText, readFirstBytes, sniffType, zipFiles } from '@/lib/files';
import { ColorInput } from '../_shared-color/ColorInput';
import {
  ALL_FIELDS,
  FAKE_LOCALES,
  FAKER_VERSION_TAG,
  FIXED_REF_DATE,
  MAX_RECORDS,
  exportFakeCsv,
  exportFakeJson,
  exportFakeSql,
  generateFakeRows,
  loadLocaleFaker,
  type FakeField,
  type FakeLocale,
  type SqlDialect,
} from './fakedata';
import {
  DEVICE_FRAMES,
  renderMockupCanvas,
  type DeviceKind,
  type FrameBackdrop,
  type ScreenFit,
} from './frames';
import {
  MAX_PLACEHOLDER_PIXELS,
  MAX_PLACEHOLDER_SIDE,
  buildPlaceholderSvg,
  imgTagSnippet,
  parseSizeRows,
  placeholderContrast,
  svgToDataUri,
  type PlaceholderFormat,
  type PlaceholderPattern,
} from './placeholder';
import styles from './styles.module.css';

type ToolTab = 'placeholder' | 'mockup' | 'fakedata';
type ExportDataFmt = 'json' | 'csv' | 'sql';

export default function PlaceholderMockupGenerator() {
  const toast = useToast();
  const [tab, setTab] = useState<ToolTab>('placeholder');

  // Placeholder state
  const [phW, setPhW] = useState(600);
  const [phH, setPhH] = useState(400);
  const [phBg, setPhBg] = useState('#e2e8f0');
  const [phFg, setPhFg] = useState('#0f172a');
  const [phLabel, setPhLabel] = useState('');
  const [phPattern, setPhPattern] = useState<PlaceholderPattern>('solid');
  const [phBatchSizes, setPhBatchSizes] = useState('400x300\n800x600\n1200x630');

  // Mockup state
  const [device, setDevice] = useState<DeviceKind>('phone');
  const [landscape, setLandscape] = useState(false);
  const [backdrop, setBackdrop] = useState<FrameBackdrop>('gradient');
  const [bgColor, setBgColor] = useState('#2446f0');
  const [bgColor2, setBgColor2] = useState('#7440e8');
  const [fit, setFit] = useState<ScreenFit>('cover');
  const [shadow, setShadow] = useState(true);
  const [mockupScale, setMockupScale] = useState<1 | 2 | 3>(2);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [shotImg, setShotImg] = useState<{ img: HTMLImageElement; w: number; h: number } | null>(null);
  const [mockupError, setMockupError] = useState<string | null>(null);
  const mockupCanvasRef = useRef<HTMLCanvasElement>(null);

  // Fake data state
  const [locale, setLocale] = useState<FakeLocale>('en');
  const [recordCount, setRecordCount] = useState(10);
  const [seed, setSeed] = useState('2026-demo');
  const [fields, setFields] = useState<FakeField[]>(['id', 'name', 'email', 'company', 'birthdate']);
  const [dataFmt, setDataFmt] = useState<ExportDataFmt>('json');
  const [csvBom, setCsvBom] = useState(true);
  const [csvGuard, setCsvGuard] = useState(true);
  const [sqlTable, setSqlTable] = useState('fake_users');
  const [sqlDialect, setSqlDialect] = useState<SqlDialect>('postgresql');
  const [sqlCreate, setSqlCreate] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [fakeRows, setFakeRows] = useState<Record<string, string>[]>([]);

  useEffect(
    () => () => {
      if (shotUrl) URL.revokeObjectURL(shotUrl);
    },
    [shotUrl],
  );

  // Placeholder computations
  const phSvg = useMemo(
    () => buildPlaceholderSvg({ width: phW, height: phH, bg: phBg, fg: phFg, label: phLabel, pattern: phPattern }),
    [phW, phH, phBg, phFg, phLabel, phPattern],
  );
  const phUri = useMemo(() => svgToDataUri(phSvg), [phSvg]);
  const phContrast = useMemo(() => placeholderContrast(phBg, phFg), [phBg, phFg]);
  const rasterAllowed = phW <= MAX_PLACEHOLDER_SIDE && phH <= MAX_PLACEHOLDER_SIDE && phW * phH <= MAX_PLACEHOLDER_PIXELS;

  async function renderPlaceholderBlob(w: number, h: number, svgStr: string, fmt: Exclude<PlaceholderFormat, 'svg'>): Promise<Blob> {
    const url = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      if (fmt === 'jpeg') {
        ctx.fillStyle = phBg;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      const mime = fmt === 'png' ? 'image/png' : fmt === 'jpeg' ? 'image/jpeg' : 'image/webp';
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, mime, 0.92));
      if (!blob) throw new Error('Could not encode image');
      return blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function downloadPlaceholder(fmt: PlaceholderFormat) {
    const name = `placeholder-${phW}x${phH}.${fmt === 'jpeg' ? 'jpg' : fmt}`;
    if (fmt === 'svg') {
      downloadText(phSvg, name, 'image/svg+xml');
      return;
    }
    if (!rasterAllowed) {
      toast('Raster export is capped at 8000 px / 64 MP; download SVG instead.', 'error');
      return;
    }
    const blob = await renderPlaceholderBlob(phW, phH, phSvg, fmt);
    downloadBlob(blob, name);
  }

  async function downloadPlaceholderBatch() {
    const list = parseSizeRows(phBatchSizes);
    if (!list.length) {
      toast('Enter sizes such as 400x300 on each line.', 'error');
      return;
    }
    const entries = await Promise.all(
      list.map(async (sz) => {
        const svg = buildPlaceholderSvg({ width: sz.width, height: sz.height, bg: phBg, fg: phFg, label: phLabel, pattern: phPattern });
        const png = await renderPlaceholderBlob(sz.width, sz.height, svg, 'png');
        return { name: `placeholder-${sz.width}x${sz.height}.png`, data: png };
      }),
    );
    downloadBlob(await zipFiles(entries), 'placeholders.zip');
  }

  // Mockup drawing
  async function handleScreenshotFiles(files: File[]) {
    const file = files[0];
    if (!file) return;
    setMockupError(null);
    const type = sniffType(await readFirstBytes(file));
    if (type === 'heic') {
      setMockupError('HEIC images must be converted to PNG or JPG first (use Bulk Resizer & Converter).');
      return;
    }
    if (!['png', 'jpeg', 'webp', 'gif'].includes(type)) {
      setMockupError('Please drop a PNG, JPG, WebP or GIF screenshot.');
      return;
    }
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setShotUrl(url);
      setShotImg({ img, w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setMockupError('Could not decode that image.');
    };
    img.src = url;
  }

  useEffect(() => {
    if (tab !== 'mockup' || !mockupCanvasRef.current) return;
    const out = renderMockupCanvas(
      shotImg?.img ?? null,
      shotImg ? { width: shotImg.w, height: shotImg.h } : null,
      { device, landscape, backdrop, bgColor, bgColor2, fit, shadow, scale: 1 },
    );
    const dst = mockupCanvasRef.current;
    dst.width = out.width;
    dst.height = out.height;
    dst.getContext('2d')?.drawImage(out, 0, 0);
  }, [tab, shotImg, device, landscape, backdrop, bgColor, bgColor2, fit, shadow]);

  async function exportMockup(fmt: 'png' | 'webp') {
    const out = renderMockupCanvas(
      shotImg?.img ?? null,
      shotImg ? { width: shotImg.w, height: shotImg.h } : null,
      { device, landscape, backdrop, bgColor, bgColor2, fit, shadow, scale: mockupScale },
    );
    const mime = fmt === 'png' ? 'image/png' : 'image/webp';
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, mime, 0.94));
    if (!blob) {
      toast('Export failed; try a smaller scale.', 'error');
      return;
    }
    downloadBlob(blob, `mockup-${device}-${mockupScale}x.${fmt}`);
    toast(`Saved ${mockupScale}x mockup`, 'success');
  }

  // Fake data generation
  async function generateData(overrideSeed?: string) {
    if (fields.length === 0) return;
    setGenerating(true);
    try {
      const faker = await loadLocaleFaker(locale);
      const rows = generateFakeRows(faker, {
        seed: overrideSeed ?? seed,
        locale,
        count: recordCount,
        fields,
        refDate: FIXED_REF_DATE,
      });
      setFakeRows(rows);
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (tab === 'fakedata' && fakeRows.length === 0) {
      void generateData();
    }
     
  }, [tab]);

  const exportedDataText = useMemo(() => {
    if (fakeRows.length === 0) return '';
    if (dataFmt === 'json') return exportFakeJson(fakeRows, { seed, locale, refDate: FIXED_REF_DATE });
    if (dataFmt === 'csv') return exportFakeCsv(fakeRows, fields, { bom: csvBom, guardInjection: csvGuard });
    return exportFakeSql(fakeRows, fields, { table: sqlTable, dialect: sqlDialect, createTable: sqlCreate });
  }, [fakeRows, dataFmt, seed, locale, fields, csvBom, csvGuard, sqlTable, sqlDialect, sqlCreate]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Tabs<ToolTab>
        label="Placeholder, Mockup and Fake data"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'placeholder', label: 'Placeholder Images' },
          { id: 'mockup', label: 'Device Mockup' },
          { id: 'fakedata', label: 'Fake User Data' },
        ]}
      />

      {tab === 'placeholder' && (
        <div className="split">
          <section className="panel stack" aria-label="Placeholder settings">
            <div className="grid-2">
              <Field label="Width (px)">
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    className="input"
                    min={1}
                    max={MAX_PLACEHOLDER_SIDE}
                    value={phW}
                    onChange={(e) => setPhW(Math.max(1, Math.min(MAX_PLACEHOLDER_SIDE, Number(e.target.value) || 600)))}
                  />
                )}
              </Field>
              <Field label="Height (px)">
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    className="input"
                    min={1}
                    max={MAX_PLACEHOLDER_SIDE}
                    value={phH}
                    onChange={(e) => setPhH(Math.max(1, Math.min(MAX_PLACEHOLDER_SIDE, Number(e.target.value) || 400)))}
                  />
                )}
              </Field>
              <ColorInput label="Background" value={phBg} onValid={(_, c) => setPhBg(c)} />
              <ColorInput label="Text color" value={phFg} onValid={(_, c) => setPhFg(c)} />
            </div>

            <Field label="Custom label (leave empty for W × H)">
              {(id) => <input id={id} className="input" value={phLabel} onChange={(e) => setPhLabel(e.target.value)} placeholder={`${phW} × ${phH}`} />}
            </Field>

            <div className="field">
              <span className="label">Pattern</span>
              <SegmentedControl<PlaceholderPattern>
                label="Background pattern"
                value={phPattern}
                onChange={setPhPattern}
                options={[
                  { id: 'solid', label: 'Solid' },
                  { id: 'diagonal', label: 'Cross' },
                  { id: 'grid', label: 'Grid' },
                  { id: 'gradient', label: 'Gradient' },
                ]}
              />
            </div>

            {!phContrast.passesAA && (
              <Banner kind="warn">Label contrast is {phContrast.ratio}:1 (below WCAG AA 4.5:1).</Banner>
            )}

            <hr className="divider" />
            <Field label="Batch PNG sizes (one WxH per line)">
              {(id) => (
                <textarea
                  id={id}
                  className="textarea code"
                  style={{ minHeight: 80 }}
                  value={phBatchSizes}
                  onChange={(e) => setPhBatchSizes(e.target.value)}
                />
              )}
            </Field>
            <button type="button" className="btn sm" onClick={() => void downloadPlaceholderBatch()}>
              <Icon name="download" /> Download batch ZIP
            </button>
          </section>

          <section className="panel stack" aria-label="Placeholder preview and export">
            <div className={styles.previewStage}>
              { }
              <img src={phUri} alt={`Placeholder ${phW} by ${phH}`} />
            </div>
            <div className="row">
              <button type="button" className="btn primary" onClick={() => void downloadPlaceholder('svg')}>
                <Icon name="download" /> SVG
              </button>
              <button type="button" className="btn" disabled={!rasterAllowed} onClick={() => void downloadPlaceholder('png')}>
                <Icon name="download" /> PNG
              </button>
              <button type="button" className="btn" disabled={!rasterAllowed} onClick={() => void downloadPlaceholder('jpeg')}>
                <Icon name="download" /> JPG
              </button>
              <button type="button" className="btn" disabled={!rasterAllowed} onClick={() => void downloadPlaceholder('webp')}>
                <Icon name="download" /> WebP
              </button>
            </div>
            <div className="row">
              <CopyButton text={phUri} label="Copy data URI" />
              <CopyButton text={imgTagSnippet(phUri, phW, phH, phLabel)} label="Copy <img> tag" />
            </div>
          </section>
        </div>
      )}

      {tab === 'mockup' && (
        <div className="split">
          <section className="panel stack" aria-label="Mockup settings">
            <DropZone
              accept={['image/png', 'image/jpeg', 'image/webp', 'image/gif']}
              maxBytes={30 * 1024 * 1024}
              title="Drop a screenshot to place inside the device frame"
              hint="PNG, JPG, WebP · Uses generic unbranded frames, never uploaded"
              onFiles={(f) => void handleScreenshotFiles(f)}
              onReject={(m) => setMockupError(m)}
            />
            {mockupError && <ErrorBanner onDismiss={() => setMockupError(null)}>{mockupError}</ErrorBanner>}

            <div className="field">
              <span className="label">Generic device frame</span>
              <SegmentedControl<DeviceKind>
                label="Device frame"
                value={device}
                onChange={setDevice}
                options={Object.values(DEVICE_FRAMES).map((f) => ({ id: f.id, label: f.label.replace(' (generic)', '') }))}
              />
            </div>

            <div className="row">
              {(device === 'phone' || device === 'tablet') && (
                <label className="check">
                  <input type="checkbox" checked={landscape} onChange={(e) => setLandscape(e.target.checked)} />
                  Landscape orientation
                </label>
              )}
              <label className="check">
                <input type="checkbox" checked={shadow} onChange={(e) => setShadow(e.target.checked)} />
                Drop shadow
              </label>
            </div>

            <div className="field">
              <span className="label">Screenshot fit</span>
              <SegmentedControl<ScreenFit>
                label="Screenshot fit"
                value={fit}
                onChange={setFit}
                options={[
                  { id: 'cover', label: 'Fill (cover)' },
                  { id: 'contain', label: 'Fit (contain)' },
                ]}
              />
            </div>

            <div className="field">
              <span className="label">Backdrop</span>
              <SegmentedControl<FrameBackdrop>
                label="Backdrop type"
                value={backdrop}
                onChange={setBackdrop}
                options={[
                  { id: 'gradient', label: 'Gradient' },
                  { id: 'solid', label: 'Solid' },
                  { id: 'transparent', label: 'Transparent' },
                ]}
              />
            </div>

            {backdrop !== 'transparent' && (
              <div className="grid-2">
                <ColorInput label="Backdrop color 1" value={bgColor} onValid={(_, c) => setBgColor(c)} />
                {backdrop === 'gradient' && <ColorInput label="Backdrop color 2" value={bgColor2} onValid={(_, c) => setBgColor2(c)} />}
              </div>
            )}

            <div className="field">
              <span className="label">Export resolution</span>
              <SegmentedControl<string>
                label="Export scale"
                value={String(mockupScale)}
                onChange={(v) => setMockupScale(Number(v) as 1 | 2 | 3)}
                options={[
                  { id: '1', label: '1x' },
                  { id: '2', label: '2x' },
                  { id: '3', label: '3x' },
                ]}
              />
            </div>
          </section>

          <section className="panel stack" aria-label="Mockup preview and download">
            <div className={`${styles.previewStage} checker`}>
              <canvas ref={mockupCanvasRef} aria-label={`Device mockup preview (${device})`} />
            </div>
            <div className="row">
              <button type="button" className="btn primary" onClick={() => void exportMockup('png')}>
                <Icon name="download" /> Download PNG ({mockupScale}x)
              </button>
              <button type="button" className="btn" onClick={() => void exportMockup('webp')}>
                <Icon name="download" /> Download WebP ({mockupScale}x)
              </button>
            </div>
          </section>
        </div>
      )}

      {tab === 'fakedata' && (
        <div className="stack" style={{ gap: 16 }}>
          <Banner kind="info">
            All data is fake and generated locally with Faker {FAKER_VERSION_TAG} (reference date {FIXED_REF_DATE.slice(0, 10)}). Same seed + locale + fields produce identical data.
          </Banner>

          <section className="panel stack" aria-label="Fake data generator settings">
            <div className="grid-3">
              <Field label="Locale">
                {(id) => (
                  <select id={id} className="select" value={locale} onChange={(e) => setLocale(e.target.value as FakeLocale)}>
                    {FAKE_LOCALES.map((l) => (
                      <option key={l.id} value={l.id}>{l.label}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label={`Record count (1–${MAX_RECORDS.toLocaleString()})`}>
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    className="input"
                    min={1}
                    max={MAX_RECORDS}
                    value={recordCount}
                    onChange={(e) => setRecordCount(Math.max(1, Math.min(MAX_RECORDS, Number(e.target.value) || 10)))}
                  />
                )}
              </Field>
              <Field label="Reproducible seed">
                {(id) => (
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <input id={id} className="input mono grow" value={seed} onChange={(e) => setSeed(e.target.value)} />
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => {
                        const s = `seed-${Math.floor(Math.random() * 1_000_000)}`;
                        setSeed(s);
                        void generateData(s);
                      }}
                    >
                      Random
                    </button>
                  </div>
                )}
              </Field>
            </div>

            <div className="row" style={{ gap: 14 }}>
              {ALL_FIELDS.map((f) => {
                const checked = fields.includes(f.id);
                return (
                  <label key={f.id} className="check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setFields((prev) =>
                          checked ? (prev.length > 1 ? prev.filter((x) => x !== f.id) : prev) : [...prev, f.id],
                        )
                      }
                    />
                    {f.label}
                  </label>
                );
              })}
            </div>

            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn primary" disabled={generating} onClick={() => void generateData()}>
                {generating ? 'Generating…' : 'Generate data'}
              </button>
              <SegmentedControl<ExportDataFmt>
                label="Export format"
                value={dataFmt}
                onChange={setDataFmt}
                options={[
                  { id: 'json', label: 'JSON' },
                  { id: 'csv', label: 'CSV' },
                  { id: 'sql', label: 'SQL' },
                ]}
              />
            </div>

            {dataFmt === 'csv' && (
              <div className="row" style={{ gap: 18 }}>
                <label className="check">
                  <input type="checkbox" checked={csvBom} onChange={(e) => setCsvBom(e.target.checked)} />
                  Include UTF-8 BOM (for Excel non-Latin names)
                </label>
                <label className="check">
                  <input type="checkbox" checked={csvGuard} onChange={(e) => setCsvGuard(e.target.checked)} />
                  Guard formula-injection prefixes (=, +, -, @)
                </label>
              </div>
            )}

            {dataFmt === 'sql' && (
              <div className="grid-3">
                <Field label="Table name">
                  {(id) => <input id={id} className="input mono" value={sqlTable} onChange={(e) => setSqlTable(e.target.value)} />}
                </Field>
                <Field label="SQL dialect">
                  {(id) => (
                    <select id={id} className="select" value={sqlDialect} onChange={(e) => setSqlDialect(e.target.value as SqlDialect)}>
                      <option value="postgresql">PostgreSQL</option>
                      <option value="mysql">MySQL</option>
                      <option value="sqlite">SQLite</option>
                    </select>
                  )}
                </Field>
                <label className="check" style={{ alignSelf: 'flex-end', marginBottom: 8 }}>
                  <input type="checkbox" checked={sqlCreate} onChange={(e) => setSqlCreate(e.target.checked)} />
                  Include CREATE TABLE
                </label>
              </div>
            )}
          </section>

          {fakeRows.length > 0 && (
            <>
              <section className="panel stack" aria-label="Preview table (first 20 rows)">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2 className="panel-title" style={{ margin: 0 }}>
                    Preview (showing {Math.min(20, fakeRows.length)} of {fakeRows.length.toLocaleString()} rows)
                  </h2>
                  <div className="row">
                    <CopyButton text={exportedDataText} label={`Copy ${dataFmt.toUpperCase()}`} />
                    <button
                      type="button"
                      className="btn sm primary"
                      onClick={() => downloadText(exportedDataText, `users-${seed}.${dataFmt}`)}
                    >
                      <Icon name="download" /> Download .{dataFmt}
                    </button>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        {fields.map((f) => (
                          <th key={f} scope="col">{f}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fakeRows.slice(0, 20).map((row, idx) => (
                        <tr key={idx}>
                          {fields.map((f) => (
                            <td key={f} className={f === 'id' ? 'mono' : undefined}>
                              {f === 'avatar' ? (
                                 
                                <img src={row[f]} alt="Generated initials avatar" width={28} height={28} style={{ borderRadius: '50%' }} />
                              ) : (
                                row[f]
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="panel stack" aria-label="Export preview">
                <h3 className="panel-title" style={{ margin: 0 }}>Export snippet</h3>
                <pre className={styles.codeBox}>{exportedDataText.slice(0, 4000)}{exportedDataText.length > 4000 ? '\n… (truncated preview; download for full output)' : ''}</pre>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
