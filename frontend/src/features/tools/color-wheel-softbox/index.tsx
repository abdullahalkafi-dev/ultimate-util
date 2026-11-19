'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banner, CopyButton, Dialog, Icon, SegmentedControl, SliderField, useToast } from '@/components/ui';
import { readJson, writeJson } from '@/lib/storage';
import { ColorInput } from '../_shared-color/ColorInput';
import { useCloudSave } from '../_shared-color/useCloudSave';
import { formatHsl, formatOklch, formatRgb, rgbToHex } from '../_shared-color/convert';
import { KELVIN_MAX, KELVIN_MIN } from '../_shared-color/kelvin';
import { ColorWheel } from './ColorWheel';
import { SoftboxStage } from './SoftboxStage';
import {
  acquireWakeLock,
  enterFullscreen,
  eyeDropperSupported,
  isFullscreenNow,
  leaveFullscreen,
  pickFromScreen,
  type FullscreenMode,
} from './device';
import {
  DEFAULT_SETTINGS,
  SHAPES,
  parsePresets,
  presetCloudData,
  sanitizeSettings,
  stageStyle,
  type LightMode,
  type Preset,
  type Shape,
  type SoftboxSettings,
} from './softbox';
import { resolve, stateFromRgb, type ColorState, type WheelMode } from './wheel';
import styles from './styles.module.css';

const LAST_KEY = 'uu.softbox.last';
const PRESETS_KEY = 'uu.softbox.presets';
const NOTICE_KEY = 'uu.softbox.noticeSeen';
const BURN_IN_MS = 30 * 60 * 1000;

type SoftOnly = Omit<SoftboxSettings, 'color'>;

export default function ColorWheelSoftbox() {
  const toast = useToast();
  const cloud = useCloudSave('softbox');

  const [color, setColor] = useState<ColorState>(() => {
    const parsed = sanitizeSettings(DEFAULT_SETTINGS);
    const n = parseInt(parsed.color.slice(1), 16);
    return stateFromRgb({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }, 'hsl');
  });
  const [alpha, setAlpha] = useState(1);
  const [soft, setSoft] = useState<SoftOnly>(() => {
    const { color: _color, ...rest } = DEFAULT_SETTINGS;
    return rest;
  });
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState<FullscreenMode | null>(null);
  const [wakeFailed, setWakeFailed] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [pixelShift, setPixelShift] = useState(false);
  const [dropper, setDropper] = useState(false);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  const resolved = useMemo(() => resolve(color), [color]);
  const hex = rgbToHex(resolved.rgb, alpha);
  const settings: SoftboxSettings = useMemo(() => ({ ...soft, color: rgbToHex(resolved.rgb) }), [soft, resolved]);
  const preview = useMemo(() => stageStyle(settings), [settings]);

  // Restore the last session and presets after mount (storage is not available on the server).
  useEffect(() => {
    const last = sanitizeSettings(readJson<unknown>(LAST_KEY, null));
    const n = parseInt(last.color.slice(1), 16);
    const { color: _c, ...rest } = last;
    setSoft(rest);
    setColor(stateFromRgb({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }, 'hsl'));
    setPresets(parsePresets(readJson<unknown>(PRESETS_KEY, [])));
    setDropper(eyeDropperSupported());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const id = setTimeout(() => writeJson(LAST_KEY, settings), 150);
    return () => clearTimeout(id);
  }, [settings, loaded]);

  const patch = useCallback((p: Partial<SoftboxSettings>) => {
    const { color: nextColor, ...rest } = p;
    setSoft((s) => ({ ...s, ...rest }));
    if (nextColor) {
      const n = parseInt(nextColor.slice(1), 16);
      setColor((c) => stateFromRgb({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }, c.mode, c.h));
    }
  }, []);

  // ---- Fullscreen lifecycle ----
  const exit = useCallback(() => {
    setActive(null);
    void leaveFullscreen();
  }, []);

  async function begin() {
    setNoticeOpen(false);
    writeJson(NOTICE_KEY, true);
    // Requested on the root element straight from the click; the overlay covers the page.
    const mode = await enterFullscreen(document.documentElement);
    setActive(mode);
  }

  function start() {
    if (readJson<boolean>(NOTICE_KEY, false)) void begin();
    else setNoticeOpen(true);
  }

  // Browser UI (Esc, F11, system gesture) can leave fullscreen without our handlers running.
  useEffect(() => {
    if (active !== 'native') return;
    const onChange = () => {
      if (!isFullscreenNow()) setActive(null);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [active]);

  // Wake Lock: hold while active, re-acquire when the tab becomes visible again, release on exit.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    async function acquire() {
      const sentinel = await acquireWakeLock();
      if (cancelled) {
        void sentinel?.release();
        return;
      }
      wakeLock.current = sentinel;
      setWakeFailed(sentinel === null);
    }
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!wakeLock.current || wakeLock.current.released)) void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void wakeLock.current?.release().catch(() => undefined);
      wakeLock.current = null;
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => toast('Still using this? Static light can burn in OLED screens.', 'info'), BURN_IN_MS);
    return () => clearTimeout(id);
  }, [active, toast]);

  // F starts fullscreen from the editor.
  useEffect(() => {
    if (active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (t?.isContentEditable) return;
      start();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
     
  }, [active]);

  // ---- Presets ----
  const applySettings = useCallback(
    (s: SoftboxSettings) => {
      patch(s);
    },
    [patch],
  );

  function savePreset() {
    const name = presetName.trim() || `Preset ${presets.length + 1}`;
    const next = [...presets, { id: crypto.randomUUID(), name, settings }].slice(-50);
    setPresets(next);
    writeJson(PRESETS_KEY, next);
    setPresetName('');
    toast('Preset saved', 'success');
  }

  function removePreset(id: string) {
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    writeJson(PRESETS_KEY, next);
  }

  async function saveToAccount() {
    const name = presetName.trim() || `Softbox ${new Date().toLocaleDateString()}`;
    const ok = await cloud.save(name, presetCloudData(settings));
    toast(ok ? 'Saved to your account' : 'Could not save to your account. The preset is still available here.', ok ? 'success' : 'error');
  }

  const onPreset = useCallback(
    (index: number) => {
      const p = presets[index];
      if (p) applySettings(p.settings);
    },
    [presets, applySettings],
  );

  const onCopyHex = useCallback(
    (value: string) => {
      navigator.clipboard.writeText(value).then(
        () => toast(`Copied ${value}`, 'success'),
        () => toast('Copy was blocked by the browser.', 'error'),
      );
    },
    [toast],
  );

  // ---- Wheel mode / lightness ----
  function switchMode(mode: WheelMode) {
    if (mode !== color.mode) setColor(stateFromRgb(resolved.rgb, mode, color.h));
  }
  const lightness = color.mode === 'hsl' ? color.l : color.l * 100;
  function setLightness(v: number) {
    setColor(color.mode === 'hsl' ? { ...color, l: v } : { ...color, l: v / 100 });
  }

  async function eyedrop() {
    const picked = await pickFromScreen();
    if (!picked) return;
    const n = parseInt(picked.slice(1), 16);
    setColor((c) => stateFromRgb({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }, c.mode, c.h));
    setAlpha(1);
  }

  const rows: { label: string; value: string }[] = [
    { label: 'HEX', value: hex },
    { label: 'RGB', value: formatRgb(resolved.rgb, alpha) },
    { label: 'HSL', value: formatHsl(resolved.rgb, alpha) },
    { label: 'OKLCH', value: formatOklch(resolved.rgb, alpha) },
  ];

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="split">
        <div className="panel stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 className="panel-title" style={{ margin: 0 }}>Color wheel</h2>
            <SegmentedControl<WheelMode>
              label="Wheel type"
              value={color.mode}
              onChange={switchMode}
              options={[
                { id: 'hsl', label: 'HSL wheel' },
                { id: 'oklch', label: 'OKLCH wheel' },
              ]}
            />
          </div>
          <ColorWheel state={color} onChange={setColor} />
          <SliderField label="Lightness" value={Math.round(lightness)} onChange={setLightness} min={0} max={100} unit="%" />
          {color.mode === 'oklch' && (
            <p className="hint">The OKLCH wheel keeps perceived lightness equal around the circle. Areas outside sRGB are left empty.</p>
          )}
        </div>

        <div className="panel stack">
          <div className={styles.swatch} style={{ background: hex }} role="img" aria-label={`Current color ${hex}`} />
          <ColorInput label="Color (HEX, rgb(), hsl(), oklch() or a name)" value={hex} onValid={(parsed) => {
            setColor((c) => stateFromRgb(parsed.rgb, c.mode, c.h));
            setAlpha(parsed.alpha);
          }} />
          <div className="stack" style={{ gap: 6 }} aria-live="polite">
            {rows.map((r) => (
              <div key={r.label} className={styles.readout}>
                <span className="muted">{r.label}</span>
                <code>{r.value}</code>
                <CopyButton text={r.value} label={`Copy ${r.label}`} />
              </div>
            ))}
          </div>
          {resolved.clipped && <span className="tag"><Icon name="alert" /> Clipped to sRGB</span>}
          {alpha < 1 && <p className="hint">Transparency is shown in the readouts. Fullscreen uses the opaque color.</p>}
          <div className="row">
            {dropper ? (
              <button type="button" className="btn sm" onClick={() => void eyedrop()}>
                <Icon name="eye" /> Pick from screen
              </button>
            ) : (
              <span className="hint">Picking from the screen is not supported in this browser; paste a HEX instead.</span>
            )}
          </div>
          <p className="hint">Values are sRGB. A wide-gamut (P3) display may show the color more saturated.</p>
        </div>
      </div>

      <div className="panel stack">
        <h2 className="panel-title" style={{ margin: 0 }}>Softbox light</h2>
        <div className="split">
          <div className="stack">
            <div className="field">
              <span className="hint" id="sb-mode">Mode</span>
              <SegmentedControl<LightMode>
                label="Light mode"
                value={soft.mode}
                onChange={(mode) => setSoft((s) => ({ ...s, mode }))}
                options={[
                  { id: 'warm', label: 'Warm light' },
                  { id: 'color', label: 'Color' },
                ]}
              />
            </div>
            <SliderField label="Temperature (Kelvin)" value={soft.kelvin} min={KELVIN_MIN} max={KELVIN_MAX} step={100} unit="K"
              onChange={(kelvin) => setSoft((s) => ({ ...s, kelvin }))} />
            <SliderField label="Brightness" value={soft.brightness} min={5} max={100} unit="%"
              onChange={(brightness) => setSoft((s) => ({ ...s, brightness }))} />
            <div className="field">
              <span className="hint">Shape</span>
              <SegmentedControl<Shape>
                label="Shape"
                value={soft.shape}
                onChange={(shape) => setSoft((s) => ({ ...s, shape }))}
                options={SHAPES.map((s) => ({ id: s, label: s[0]?.toUpperCase() + s.slice(1) }))}
              />
            </div>
            {soft.shape !== 'flat' && (
              <>
                <SliderField label="Size" value={soft.size} min={20} max={100} unit="%" onChange={(size) => setSoft((s) => ({ ...s, size }))} />
                <SliderField label="Edge softness (minimum 10%)" value={soft.softness} min={10} max={100} unit="%"
                  onChange={(softness) => setSoft((s) => ({ ...s, softness }))} />
              </>
            )}
            {soft.mode === 'color' && (
              <label className="row">
                <input type="checkbox" checked={soft.applyWarmth} onChange={(e) => setSoft((s) => ({ ...s, applyWarmth: e.target.checked }))} />
                Apply warmth to the color
              </label>
            )}
            <label className="row">
              <input type="checkbox" checked={pixelShift} onChange={(e) => setPixelShift(e.target.checked)} />
              Slow pixel shift for OLED screens (moves the light a few pixels every minute)
            </label>
          </div>
          <div className="stack">
            <div className={styles.preview} style={{ background: preview.background }} role="img" aria-label="Preview of the softbox light">
              {preview.panel && (
                <div
                  className={styles.panelGlow}
                  style={{ inset: preview.panel.inset, borderRadius: preview.panel.borderRadius, background: preview.panel.background, boxShadow: preview.panel.boxShadow }}
                />
              )}
            </div>
            <button type="button" className="btn primary" onClick={start}>
              <Icon name="expand" /> Fullscreen softbox
            </button>
            <p className="hint">Shortcut: F. Inside: Up/Down brightness, Left/Right warmth, 1 to 9 presets, C copy color, ? help, Esc exit.</p>
            <p className="hint">Your screen cannot get brighter than your device allows. Multiple monitors: only the screen this browser window is on is covered.</p>
          </div>
        </div>
      </div>

      <div className="panel stack">
        <h2 className="panel-title" style={{ margin: 0 }}>Presets</h2>
        <div className="row">
          <input className="input grow" aria-label="Preset name" placeholder="Preset name" value={presetName} maxLength={60} onChange={(e) => setPresetName(e.target.value)} />
          <button type="button" className="btn" onClick={savePreset}>Save preset</button>
          {cloud.isAuthed && (
            <button type="button" className="btn" disabled={cloud.saving} onClick={() => void saveToAccount()}>
              <Icon name="cloud" /> Save to my account
            </button>
          )}
        </div>
        {!cloud.isAuthed && <p className="hint">Presets are kept in this browser. Clearing site data deletes them. Sign in to also save them to your account.</p>}
        {presets.length === 0 ? (
          <p className="muted">No presets yet. Number keys 1 to 9 switch presets in fullscreen.</p>
        ) : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 6 }}>
            {presets.map((p, i) => (
              <li key={p.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span>{i < 9 ? `${i + 1}. ` : ''}{p.name} <span className="faint">({p.settings.mode === 'warm' ? `${p.settings.kelvin} K` : p.settings.color}, {p.settings.brightness}%, {p.settings.shape})</span></span>
                <span className="row">
                  <button type="button" className="btn sm" onClick={() => applySettings(p.settings)}>Use</button>
                  <button type="button" className="btn sm ghost" aria-label={`Delete preset ${p.name}`} onClick={() => removePreset(p.id)}><Icon name="trash" /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {cloud.isAuthed && cloud.items.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <h3 className="panel-title" style={{ margin: 0 }}>In your account</h3>
            {cloud.items.map((item) => (
              <div key={item.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span>{item.name}</span>
                <button type="button" className="btn sm" onClick={() => applySettings(sanitizeSettings(item.data))}>Use</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Banner kind="info">
        Avoid long static sessions on OLED screens. This tool never flashes or animates the light.
      </Banner>

      <Dialog
        open={noticeOpen}
        title="Before you start"
        onClose={() => setNoticeOpen(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setNoticeOpen(false)}>Cancel</button>
            <button type="button" className="btn primary" onClick={() => void begin()}>Start light</button>
          </>
        }
      >
        <p>Your screen cannot get brighter than your device allows.</p>
        <p>Avoid long static sessions on OLED screens, they can burn in.</p>
        <p>This tool does not flash or flicker.</p>
      </Dialog>

      {active && (
        <SoftboxStage
          settings={settings}
          onChange={patch}
          fullscreen={active}
          onExit={exit}
          presetCount={presets.length}
          onPreset={onPreset}
          onCopy={onCopyHex}
          wakeLockFailed={wakeFailed}
          pixelShift={pixelShift}
        />
      )}
    </div>
  );
}
