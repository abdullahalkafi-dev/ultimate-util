'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banner,
  CopyButton,
  DropZone,
  ErrorBanner,
  Field,
  Icon,
  SegmentedControl,
  SliderField,
  Tabs,
  useToast,
} from '@/components/ui';
import { downloadBlob, downloadText } from '@/lib/files';
import { readJson, removeKey, writeJson } from '@/lib/storage';
import { ColorInput } from '../_shared-color/ColorInput';
import { hexToRgb, rgbToHex, type RGB } from '../_shared-color/convert';
import { useCloudSave } from '../_shared-color/useCloudSave';
import { BlindTab } from './BlindTab';
import { ContrastTab } from './ContrastTab';
import {
  EXPORT_FORMATS,
  exportFileName,
  exportPalette,
  type ExportFormat,
  type NamedColor,
  uniqueSlugs,
} from './exports';
import {
  HARMONIES,
  MAX_COLORS,
  MIN_COLORS,
  applyGenerated,
  generatePalette,
  shadeScale,
  shuffle,
  type Harmony,
  type HarmonySpace,
  type Swatch,
} from './harmony';
import { extractFromFile } from './image';
import styles from './styles.module.css';

type TabId = 'palette' | 'contrast' | 'blind';

const STORAGE_KEY = 'uu-palette-contrast';
const DEFAULT_BASE = '#3a7bd5';
const DEFAULT_COUNT = 5;

interface SavedState {
  baseHex: string;
  harmony: Harmony;
  space: HarmonySpace;
  count: number;
  swatches: Swatch[];
}

function defaultSwatches(baseHex = DEFAULT_BASE, harmony: Harmony = 'analogous', count = DEFAULT_COUNT, space: HarmonySpace = 'oklch'): Swatch[] {
  const rgb = hexToRgb(baseHex) ?? { r: 58, g: 123, b: 213 };
  return generatePalette(rgb, harmony, count, space).map((g, i) => ({
    hex: g.hex,
    locked: false,
    name: `color-${i + 1}`,
  }));
}

function isSavedState(v: unknown): v is SavedState {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Partial<SavedState>;
  return (
    typeof o.baseHex === 'string' &&
    typeof o.harmony === 'string' &&
    typeof o.space === 'string' &&
    typeof o.count === 'number' &&
    Array.isArray(o.swatches) &&
    o.swatches.length > 0 &&
    o.swatches.every((s) => typeof s === 'object' && s !== null && typeof s.hex === 'string' && typeof s.locked === 'boolean')
  );
}

export default function PaletteContrastTool() {
  const toast = useToast();
  const cloud = useCloudSave('palette');

  const [tab, setTab] = useState<TabId>('palette');
  const [baseHex, setBaseHex] = useState(DEFAULT_BASE);
  const [harmony, setHarmony] = useState<Harmony>('analogous');
  const [space, setSpace] = useState<HarmonySpace>('oklch');
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [swatches, setSwatches] = useState<Swatch[]>(() => defaultSwatches());
  const [history, setHistory] = useState<Swatch[][]>(() => [defaultSwatches()]);
  const [histIdx, setHistIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const [exportFormat, setExportFormat] = useState<ExportFormat>('css');
  const [includeShades, setIncludeShades] = useState(false);
  const [paletteName, setPaletteName] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [imageNote, setImageNote] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    const saved = readJson<SavedState | null>(STORAGE_KEY, null, (v): v is SavedState => isSavedState(v));
    if (saved) {
      setBaseHex(saved.baseHex);
      setHarmony(saved.harmony);
      setSpace(saved.space);
      setCount(Math.min(MAX_COLORS, Math.max(MIN_COLORS, saved.count)));
      setSwatches(saved.swatches);
      setHistory([saved.swatches]);
      setHistIdx(0);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    writeJson(STORAGE_KEY, { baseHex, harmony, space, count, swatches });
  }, [baseHex, harmony, space, count, swatches, loaded]);

  const commitSwatches = useCallback(
    (next: Swatch[]) => {
      setSwatches(next);
      setHistory((prev) => {
        const sliced = prev.slice(0, histIdx + 1);
        const updated = [...sliced, next].slice(-30);
        setHistIdx(updated.length - 1);
        return updated;
      });
    },
    [histIdx],
  );

  const regenerate = useCallback(
    (nextBase: string, nextHarmony: Harmony, nextCount: number, nextSpace: HarmonySpace, current: Swatch[]) => {
      const rgb = hexToRgb(nextBase);
      if (!rgb) return;
      const gen = generatePalette(rgb, nextHarmony, nextCount, nextSpace);
      const next = applyGenerated(current, gen, nextCount).map((s, i) => ({
        ...s,
        name: s.name || `color-${i + 1}`,
      }));
      commitSwatches(next);
    },
    [commitSwatches],
  );

  const doShuffle = useCallback(() => {
    setImageNote(null);
    setImageError(null);
    const next = shuffle(swatches, harmony, count, space).map((s, i) => ({
      ...s,
      name: s.name || `color-${i + 1}`,
    }));
    const first = next[0]?.hex;
    if (first && !next[0]?.locked) setBaseHex(first);
    commitSwatches(next);
  }, [swatches, harmony, count, space, commitSwatches]);

  const canUndo = histIdx > 0;
  const canRedo = histIdx < history.length - 1;

  function undo() {
    if (!canUndo) return;
    const nextIdx = histIdx - 1;
    const target = history[nextIdx];
    if (!target) return;
    setHistIdx(nextIdx);
    setSwatches(target);
    setCount(Math.min(MAX_COLORS, Math.max(MIN_COLORS, target.length)));
  }

  function redo() {
    if (!canRedo) return;
    const nextIdx = histIdx + 1;
    const target = history[nextIdx];
    if (!target) return;
    setHistIdx(nextIdx);
    setSwatches(target);
    setCount(Math.min(MAX_COLORS, Math.max(MIN_COLORS, target.length)));
  }

  useEffect(() => {
    if (tab !== 'palette') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName) || el.isContentEditable) return;
      e.preventDefault();
      doShuffle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, doShuffle]);

  async function handleImageFiles(files: File[]) {
    const file = files[0];
    if (!file) return;
    setExtracting(true);
    setImageError(null);
    setImageNote(null);
    try {
      const res = await extractFromFile(file, count);
      if (res.colors.length === 0) {
        setImageError('No opaque colors could be extracted from that image.');
        return;
      }
      const next: Swatch[] = res.colors.map((c, i) => ({
        hex: c.hex,
        locked: false,
        name: `color-${i + 1}`,
      }));
      setBaseHex(next[0]!.hex);
      commitSwatches(next);
      const notes: string[] = [];
      if (res.colors.length < count) notes.push(`Only ${res.colors.length} distinct colors found in this image.`);
      if (res.firstFrameOnly) notes.push('Animated image: extracted from the first frame only.');
      if (notes.length) setImageNote(notes.join(' '));
      toast(`Extracted ${res.colors.length} colors`, 'success');
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Could not extract colors from that image.');
    } finally {
      setExtracting(false);
    }
  }

  function updateSwatch(index: number, patch: Partial<Swatch>) {
    const next = swatches.map((s, i) => (i === index ? { ...s, ...patch } : s));
    commitSwatches(next);
  }

  function removeSwatch(index: number) {
    if (swatches.length <= 1) return;
    const next = swatches.filter((_, i) => i !== index);
    commitSwatches(next);
  }

  function addSwatch() {
    if (swatches.length >= MAX_COLORS) return;
    const last = swatches[swatches.length - 1]?.hex ?? baseHex;
    commitSwatches([...swatches, { hex: last, locked: false, name: `color-${swatches.length + 1}` }]);
    setCount(Math.min(MAX_COLORS, swatches.length + 1));
  }

  function clearSaved() {
    removeKey(STORAGE_KEY);
    const fresh = defaultSwatches();
    setBaseHex(DEFAULT_BASE);
    setHarmony('analogous');
    setSpace('oklch');
    setCount(DEFAULT_COUNT);
    setImageNote(null);
    setImageError(null);
    setSwatches(fresh);
    setHistory([fresh]);
    setHistIdx(0);
    toast('Saved palette cleared', 'info');
  }

  const namedColors: NamedColor[] = useMemo(
    () => swatches.map((s, i) => ({ name: s.name?.trim() || `color-${i + 1}`, hex: s.hex })),
    [swatches],
  );
  const slugInfo = useMemo(() => uniqueSlugs(namedColors.map((c) => c.name)), [namedColors]);
  const exportedCode = useMemo(
    () => exportPalette(namedColors, exportFormat, { shades: includeShades }),
    [namedColors, exportFormat, includeShades],
  );
  const activeFormatMeta = EXPORT_FORMATS.find((f) => f.id === exportFormat) ?? EXPORT_FORMATS[0]!;

  function downloadPngStrip() {
    if (swatches.length === 0) return;
    const width = 1200;
    const height = 300;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      toast('Canvas is not available in this browser.', 'error');
      return;
    }
    const w = width / swatches.length;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    swatches.forEach((s, i) => {
      const rgb: RGB = hexToRgb(s.hex) ?? { r: 128, g: 128, b: 128 };
      ctx.fillStyle = rgbToHex(rgb);
      ctx.fillRect(Math.floor(i * w), 0, Math.ceil(w), height);
      const lum = 0.2126 * (rgb.r / 255) + 0.7152 * (rgb.g / 255) + 0.0722 * (rgb.b / 255);
      ctx.fillStyle = lum > 0.45 ? '#0b0f19' : '#ffffff';
      ctx.fillText(s.hex.toUpperCase(), i * w + w / 2, height - 28);
    });
    canvas.toBlob((blob) => {
      if (!blob) {
        toast('Could not generate the PNG strip.', 'error');
        return;
      }
      downloadBlob(blob, exportFileName(namedColors, 'png'));
      toast('Saved PNG strip', 'success');
    }, 'image/png');
  }

  async function saveToCloud() {
    const name = paletteName.trim() || `Palette ${namedColors[0]?.hex ?? ''}`.trim();
    const ok = await cloud.save(name, { colors: namedColors, harmony, space });
    toast(ok ? 'Saved palette to your account' : 'Could not save to your account.', ok ? 'success' : 'error');
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Tabs<TabId>
        label="Palette and contrast sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'palette', label: 'Palette' },
          { id: 'contrast', label: 'Contrast' },
          { id: 'blind', label: 'Color blindness' },
        ]}
      />

      {tab === 'palette' && (
        <div className="stack" style={{ gap: 16 }}>
          <section className="panel stack" aria-label="Palette controls">
            <div className="split">
              <div className="stack">
                <ColorInput
                  label="Base color"
                  value={baseHex}
                  onValid={(_, hex) => {
                    setBaseHex(hex);
                    regenerate(hex, harmony, count, space, swatches);
                  }}
                />
                <div className="field">
                  <span className="label">Harmony</span>
                  <SegmentedControl<Harmony>
                    label="Color harmony"
                    value={harmony}
                    onChange={(h) => {
                      setHarmony(h);
                      regenerate(baseHex, h, count, space, swatches);
                    }}
                    options={HARMONIES}
                  />
                </div>
              </div>

              <div className="stack">
                <SliderField
                  label="Colors"
                  value={count}
                  min={MIN_COLORS}
                  max={MAX_COLORS}
                  onChange={(c) => {
                    setCount(c);
                    regenerate(baseHex, harmony, c, space, swatches);
                  }}
                />
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="field">
                    <span className="label">Color space</span>
                    <SegmentedControl<HarmonySpace>
                      label="Harmony color space"
                      value={space}
                      onChange={(sp) => {
                        setSpace(sp);
                        regenerate(baseHex, harmony, count, sp, swatches);
                      }}
                      options={[
                        { id: 'oklch', label: 'OKLCH' },
                        { id: 'hsl', label: 'HSL' },
                      ]}
                    />
                  </div>
                  <div className="row" style={{ alignSelf: 'flex-end' }}>
                    <button type="button" className="btn primary" onClick={doShuffle}>
                      <Icon name="refresh" /> Shuffle
                    </button>
                    <button type="button" className="btn sm" onClick={undo} disabled={!canUndo}>
                      Undo
                    </button>
                    <button type="button" className="btn sm" onClick={redo} disabled={!canRedo}>
                      Redo
                    </button>
                    <button type="button" className="btn sm ghost" onClick={clearSaved}>
                      Reset
                    </button>
                  </div>
                </div>
                <p className="hint" style={{ margin: 0 }}>
                  Press Space to shuffle unlocked colors. Locked swatches stay fixed.
                </p>
              </div>
            </div>
          </section>

          <section className="panel stack" aria-label="Extract colors from an image">
            <h2 className="panel-title" style={{ margin: 0 }}>From image</h2>
            <DropZone
              accept={['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']}
              maxBytes={50 * 1024 * 1024}
              title={extracting ? 'Extracting colors…' : 'Drop an image to extract its dominant colors'}
              hint="PNG, JPG, WebP, GIF or AVIF · processed in your browser, never uploaded"
              onFiles={(files) => void handleImageFiles(files)}
              onReject={(msg) => setImageError(msg)}
            />
            {imageError && <ErrorBanner onDismiss={() => setImageError(null)}>{imageError}</ErrorBanner>}
            {imageNote && <Banner kind="info" onDismiss={() => setImageNote(null)}>{imageNote}</Banner>}
          </section>

          <section className="stack" aria-label="Palette swatches" aria-live="polite">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 className="panel-title" style={{ margin: 0 }}>Swatches ({swatches.length})</h2>
              {swatches.length < MAX_COLORS && (
                <button type="button" className="btn sm" onClick={addSwatch}>
                  <Icon name="plus" /> Add swatch
                </button>
              )}
            </div>
            <div className={styles.swatches}>
              {swatches.map((s, i) => {
                const rgb = hexToRgb(s.hex) ?? { r: 128, g: 128, b: 128 };
                const pickerHex = rgbToHex(rgb).slice(0, 7).toLowerCase();
                const shades = shadeScale(rgb);
                return (
                  <article key={`${i}-${s.hex}`} className={styles.swatch} aria-label={`Color ${i + 1}, ${s.hex}${s.locked ? ', locked' : ''}`}>
                    <button
                      type="button"
                      className={styles.chip}
                      style={{ background: s.hex }}
                      aria-label={`Use ${s.hex} as base color`}
                      onClick={() => setBaseHex(s.hex)}
                    />
                    <div className={styles.swatchBody}>
                      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                        <code className="mono" style={{ fontWeight: 700 }}>{s.hex.toUpperCase()}</code>
                        <button
                          type="button"
                          className={`btn sm ${s.locked ? 'primary' : ''}`}
                          aria-pressed={s.locked}
                          onClick={() => updateSwatch(i, { locked: !s.locked })}
                        >
                          <Icon name={s.locked ? 'lock' : 'unlock'} />
                          {s.locked ? 'Locked' : 'Lock'}
                        </button>
                      </div>
                      <input
                        className="input"
                        style={{ minHeight: 34, padding: '4px 8px', fontSize: 13 }}
                        aria-label={`Name for color ${i + 1}`}
                        placeholder={`color-${i + 1}`}
                        value={s.name ?? ''}
                        maxLength={40}
                        onChange={(e) => updateSwatch(i, { name: e.target.value })}
                      />
                      <div className={styles.shades} aria-label={`Shade scale 50 to 900 for ${s.hex}`}>
                        {shades.map((st) => (
                          <span key={st.step} title={`${st.step}: ${st.hex}`} style={{ background: st.hex }} />
                        ))}
                      </div>
                      <div className={styles.swatchActions}>
                        <input
                          type="color"
                          aria-label={`Edit color ${i + 1}`}
                          value={pickerHex}
                          onChange={(e) => updateSwatch(i, { hex: e.target.value })}
                        />
                        <CopyButton text={s.hex} label="Copy" />
                        {swatches.length > 1 && (
                          <button
                            type="button"
                            className="btn sm ghost"
                            aria-label={`Remove color ${i + 1}`}
                            onClick={() => removeSwatch(i)}
                          >
                            <Icon name="trash" />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="panel stack" aria-label="Export palette">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 className="panel-title" style={{ margin: 0 }}>Export</h2>
              <SegmentedControl<ExportFormat>
                label="Export format"
                value={exportFormat}
                onChange={setExportFormat}
                options={EXPORT_FORMATS.map((f) => ({ id: f.id, label: f.label }))}
              />
            </div>

            {(exportFormat === 'tailwind3' || exportFormat === 'tailwind4') && (
              <label className="check">
                <input type="checkbox" checked={includeShades} onChange={(e) => setIncludeShades(e.target.checked)} />
                Include 50–900 shade scale for each color
              </label>
            )}

            {slugInfo.sanitized && (
              <p className="hint" style={{ margin: 0 }}>
                Non-ASCII or empty color names were converted to ASCII slugs ({slugInfo.names.join(', ')}).
              </p>
            )}

            <pre className={styles.code}>{exportedCode}</pre>

            <div className="row">
              <CopyButton text={exportedCode} label="Copy code" size="md" />
              <button
                type="button"
                className="btn"
                onClick={() => downloadText(exportedCode, exportFileName(namedColors, activeFormatMeta.ext))}
              >
                <Icon name="download" /> Download .{activeFormatMeta.ext}
              </button>
              <button type="button" className="btn" onClick={downloadPngStrip}>
                <Icon name="image" /> Download PNG strip
              </button>
            </div>

            <hr className="divider" />
            <div className="row">
              <Field label="Palette name for saved library">
                {(id) => (
                  <input
                    id={id}
                    className="input"
                    style={{ width: 220 }}
                    placeholder="My brand palette"
                    value={paletteName}
                    maxLength={80}
                    onChange={(e) => setPaletteName(e.target.value)}
                  />
                )}
              </Field>
              {cloud.isAuthed ? (
                <button
                  type="button"
                  className="btn"
                  style={{ alignSelf: 'flex-end' }}
                  disabled={cloud.saving}
                  onClick={() => void saveToCloud()}
                >
                  <Icon name="cloud" /> {cloud.saving ? 'Saving…' : 'Save to library'}
                </button>
              ) : (
                <span className="hint" style={{ alignSelf: 'flex-end' }}>
                  Last palette is kept in this browser. Sign in to save palettes to your cloud library.
                </span>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === 'contrast' && <ContrastTab palette={swatches.map((s) => s.hex)} />}

      {tab === 'blind' && <BlindTab palette={swatches.map((s) => s.hex)} />}
    </div>
  );
}
