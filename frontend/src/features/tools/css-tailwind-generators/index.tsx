'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Banner,
  CopyButton,
  ErrorBanner,
  Field,
  Icon,
  SegmentedControl,
  SliderField,
  Tabs,
  useToast,
} from '@/components/ui';
import { downloadText } from '@/lib/files';
import { readJson, removeKey, writeJson } from '@/lib/storage';
import { ColorInput } from '../_shared-color/ColorInput';
import {
  CLIP_PRESETS,
  DEFAULT_CSS_STATE,
  MAX_MESH_POINTS,
  MAX_SHADOW_BLUR,
  MAX_SHADOW_LAYERS,
  buildGridAreaMatrix,
  clipPathValue,
  fmtLen,
  generateFlex,
  generateGlass,
  generateGradient,
  generateGrid,
  generateRadius,
  generateShadow,
  glassContrastInfo,
  gradientCssValue,
  importBoxShadowCss,
  importGradientCss,
  radiusCssValue,
  shadowValue,
  type BackdropMode,
  type BuilderTab,
  type ClipPreset,
  type CssGenState,
  type GradientState,
  type ShadowLayer,
  type UnitMode,
} from './generators';
import styles from './styles.module.css';

const STORAGE_KEY = 'uu-css-tailwind-generators';
type OutputKind = 'css' | 'tailwind';

export default function CssTailwindGenerators() {
  const toast = useToast();
  const [tab, setTab] = useState<BuilderTab>('grid');
  const [outputKind, setOutputKind] = useState<OutputKind>('css');
  const [backdrop, setBackdrop] = useState<BackdropMode>('light');
  const [rtl, setRtl] = useState(false);
  const [state, setState] = useState<CssGenState>(DEFAULT_CSS_STATE);
  const [loaded, setLoaded] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotes, setImportNotes] = useState<string[]>([]);

  useEffect(() => {
    const saved = readJson<Partial<CssGenState> | null>(STORAGE_KEY, null);
    if (saved && typeof saved === 'object') {
      setState((prev) => ({ ...prev, ...saved }));
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    writeJson(STORAGE_KEY, state);
  }, [state, loaded]);

  const out = useMemo(() => {
    switch (tab) {
      case 'grid':
        return generateGrid(state.grid, state.unit);
      case 'flex':
        return generateFlex(state.flex, state.unit);
      case 'shadow':
        return generateShadow(state.shadows, state.unit);
      case 'glass':
        return generateGlass(state.glass, state.unit);
      case 'gradient':
        return generateGradient(state.gradient);
      case 'radius':
        return generateRadius(state.radius, state.unit);
    }
  }, [tab, state]);

  const backdropRgb =
    backdrop === 'dark' ? { r: 11, g: 15, b: 25 } : backdrop === 'pattern' ? { r: 116, g: 64, b: 232 } : { r: 244, g: 246, b: 251 };
  const glassContrast = useMemo(() => glassContrastInfo(state.glass, backdropRgb), [state.glass, backdropRgb]);

  function resetAll() {
    removeKey(STORAGE_KEY);
    setState(DEFAULT_CSS_STATE);
    toast('Reset generators to defaults', 'info');
  }

  function runImport() {
    setImportError(null);
    setImportNotes([]);
    if (tab === 'shadow') {
      const r = importBoxShadowCss(importText);
      if (!r.ok) {
        setImportError(r.error);
        return;
      }
      setState((s) => ({ ...s, shadows: r.value }));
      setImportNotes(r.ignored);
      setImportOpen(false);
      toast(`Imported ${r.value.length} shadow layer(s)`, 'success');
    } else if (tab === 'gradient') {
      const r = importGradientCss(importText);
      if (!r.ok) {
        setImportError(r.error);
        return;
      }
      setState((s) => ({ ...s, gradient: { ...s.gradient, ...r.value } }));
      setImportNotes(r.ignored);
      setImportOpen(false);
      toast('Imported CSS gradient', 'success');
    }
  }

  function updateShadow(id: number, patch: Partial<ShadowLayer>) {
    setState((s) => ({
      ...s,
      shadows: s.shadows.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  }

  function moveShadow(index: number, dir: -1 | 1) {
    setState((s) => {
      const next = [...s.shadows];
      const target = index + dir;
      if (target < 0 || target >= next.length) return s;
      const [item] = next.splice(index, 1);
      if (!item) return s;
      next.splice(target, 0, item);
      return { ...s, shadows: next };
    });
  }

  const stageBgClass = backdrop === 'dark' ? styles.darkBg : backdrop === 'pattern' ? styles.patternBg : styles.lightBg;
  const codeText = outputKind === 'css' ? out.css : out.tailwind;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Tabs<BuilderTab>
          label="CSS and Tailwind generators"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setImportOpen(false);
            setImportError(null);
          }}
          tabs={[
            { id: 'grid', label: 'Grid' },
            { id: 'flex', label: 'Flexbox' },
            { id: 'shadow', label: 'Box shadow' },
            { id: 'glass', label: 'Glass' },
            { id: 'gradient', label: 'Gradient' },
            { id: 'radius', label: 'Radius & Clip' },
          ]}
        />
        <div className="row">
          <SegmentedControl<UnitMode>
            label="CSS units"
            value={state.unit}
            onChange={(unit) => setState((s) => ({ ...s, unit }))}
            options={[
              { id: 'px', label: 'px' },
              { id: 'rem', label: 'rem' },
            ]}
          />
          <button type="button" className="btn sm" onClick={resetAll}>
            Reset
          </button>
        </div>
      </div>

      <div className="split">
        <section className="panel stack" aria-label="Generator controls">
          {tab === 'grid' && (
            <div className="stack">
              <SliderField label="Columns" value={state.grid.cols} min={1} max={12} onChange={(cols) => setState((s) => ({ ...s, grid: { ...s.grid, cols } }))} />
              <SliderField label="Rows" value={state.grid.rows} min={1} max={12} onChange={(rows) => setState((s) => ({ ...s, grid: { ...s.grid, rows } }))} />
              <SliderField label="Gap" value={state.grid.gapPx} min={0} max={64} unit="px" onChange={(gapPx) => setState((s) => ({ ...s, grid: { ...s.grid, gapPx } }))} />
              <div className="grid-2">
                <Field label="Column track size">
                  {(id) => (
                    <input
                      id={id}
                      className="input mono"
                      value={state.grid.colTrack}
                      onChange={(e) => setState((s) => ({ ...s, grid: { ...s.grid, colTrack: e.target.value } }))}
                    />
                  )}
                </Field>
                <Field label="Row track size">
                  {(id) => (
                    <input
                      id={id}
                      className="input mono"
                      value={state.grid.rowTrack}
                      onChange={(e) => setState((s) => ({ ...s, grid: { ...s.grid, rowTrack: e.target.value } }))}
                    />
                  )}
                </Field>
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={state.grid.useAreas}
                  onChange={(e) => setState((s) => ({ ...s, grid: { ...s.grid, useAreas: e.target.checked } }))}
                />
                Generate named grid-template-areas
              </label>
              <div className="stack" style={{ gap: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="label">Grid items ({state.grid.items.length})</span>
                  <button
                    type="button"
                    className="btn sm"
                    disabled={state.grid.items.length >= 12}
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        grid: {
                          ...s.grid,
                          items: [...s.grid.items, { id: Date.now(), label: `Item ${s.grid.items.length + 1}`, colSpan: 1, rowSpan: 1, area: `item${s.grid.items.length + 1}` }],
                        },
                      }))
                    }
                  >
                    <Icon name="plus" /> Add item
                  </button>
                </div>
                {state.grid.items.map((it, idx) => (
                  <div key={it.id} className={`${styles.layerRow} row`}>
                    <input
                      className="input"
                      style={{ width: 90, minHeight: 34 }}
                      aria-label={`Grid item ${idx + 1} label`}
                      value={it.label}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          grid: { ...s.grid, items: s.grid.items.map((x) => (x.id === it.id ? { ...x, label: e.target.value } : x)) },
                        }))
                      }
                    />
                    <label className="row" style={{ gap: 4 }}>
                      <span className="hint">Col</span>
                      <input
                        type="number"
                        className="input"
                        style={{ width: 64, minHeight: 34 }}
                        min={1}
                        max={state.grid.cols}
                        value={it.colSpan}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            grid: {
                              ...s.grid,
                              items: s.grid.items.map((x) => (x.id === it.id ? { ...x, colSpan: Math.max(1, Number(e.target.value) || 1) } : x)),
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="row" style={{ gap: 4 }}>
                      <span className="hint">Row</span>
                      <input
                        type="number"
                        className="input"
                        style={{ width: 64, minHeight: 34 }}
                        min={1}
                        max={state.grid.rows}
                        value={it.rowSpan}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            grid: {
                              ...s.grid,
                              items: s.grid.items.map((x) => (x.id === it.id ? { ...x, rowSpan: Math.max(1, Number(e.target.value) || 1) } : x)),
                            },
                          }))
                        }
                      />
                    </label>
                    {state.grid.items.length > 1 && (
                      <button
                        type="button"
                        className="btn sm ghost"
                        aria-label={`Remove ${it.label}`}
                        onClick={() =>
                          setState((s) => ({ ...s, grid: { ...s.grid, items: s.grid.items.filter((x) => x.id !== it.id) } }))
                        }
                      >
                        <Icon name="trash" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'flex' && (
            <div className="stack">
              <div className="grid-2">
                <Field label="Direction">
                  {(id) => (
                    <select
                      id={id}
                      className="select"
                      value={state.flex.direction}
                      onChange={(e) => setState((s) => ({ ...s, flex: { ...s.flex, direction: e.target.value as CssGenState['flex']['direction'] } }))}
                    >
                      <option value="row">row</option>
                      <option value="row-reverse">row-reverse</option>
                      <option value="column">column</option>
                      <option value="column-reverse">column-reverse</option>
                    </select>
                  )}
                </Field>
                <Field label="Wrap">
                  {(id) => (
                    <select
                      id={id}
                      className="select"
                      value={state.flex.wrap}
                      onChange={(e) => setState((s) => ({ ...s, flex: { ...s.flex, wrap: e.target.value as CssGenState['flex']['wrap'] } }))}
                    >
                      <option value="nowrap">nowrap</option>
                      <option value="wrap">wrap</option>
                      <option value="wrap-reverse">wrap-reverse</option>
                    </select>
                  )}
                </Field>
                <Field label="Justify content">
                  {(id) => (
                    <select
                      id={id}
                      className="select"
                      value={state.flex.justify}
                      onChange={(e) => setState((s) => ({ ...s, flex: { ...s.flex, justify: e.target.value as CssGenState['flex']['justify'] } }))}
                    >
                      <option value="flex-start">flex-start</option>
                      <option value="center">center</option>
                      <option value="flex-end">flex-end</option>
                      <option value="space-between">space-between</option>
                      <option value="space-around">space-around</option>
                      <option value="space-evenly">space-evenly</option>
                    </select>
                  )}
                </Field>
                <Field label="Align items">
                  {(id) => (
                    <select
                      id={id}
                      className="select"
                      value={state.flex.align}
                      onChange={(e) => setState((s) => ({ ...s, flex: { ...s.flex, align: e.target.value as CssGenState['flex']['align'] } }))}
                    >
                      <option value="stretch">stretch</option>
                      <option value="flex-start">flex-start</option>
                      <option value="center">center</option>
                      <option value="flex-end">flex-end</option>
                      <option value="baseline">baseline</option>
                    </select>
                  )}
                </Field>
              </div>
              <SliderField label="Gap" value={state.flex.gapPx} min={0} max={64} unit="px" onChange={(gapPx) => setState((s) => ({ ...s, flex: { ...s.flex, gapPx } }))} />
              <div className="stack" style={{ gap: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="label">Flex items</span>
                  <button
                    type="button"
                    className="btn sm"
                    disabled={state.flex.items.length >= 10}
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        flex: {
                          ...s.flex,
                          items: [...s.flex.items, { id: Date.now(), label: `Item ${s.flex.items.length + 1}`, grow: 0, shrink: 1, basis: 'auto' }],
                        },
                      }))
                    }
                  >
                    <Icon name="plus" /> Add item
                  </button>
                </div>
                {state.flex.items.map((it) => (
                  <div key={it.id} className={`${styles.layerRow} row`}>
                    <input
                      className="input"
                      style={{ width: 90, minHeight: 34 }}
                      value={it.label}
                      onChange={(e) =>
                        setState((s) => ({ ...s, flex: { ...s.flex, items: s.flex.items.map((x) => (x.id === it.id ? { ...x, label: e.target.value } : x)) } }))
                      }
                    />
                    <label className="row" style={{ gap: 4 }}>
                      <span className="hint">Grow</span>
                      <input
                        type="number"
                        className="input"
                        style={{ width: 64, minHeight: 34 }}
                        min={0}
                        max={8}
                        value={it.grow}
                        onChange={(e) =>
                          setState((s) => ({
                            ...s,
                            flex: { ...s.flex, items: s.flex.items.map((x) => (x.id === it.id ? { ...x, grow: Math.max(0, Number(e.target.value) || 0) } : x)) },
                          }))
                        }
                      />
                    </label>
                    <label className="row" style={{ gap: 4 }}>
                      <span className="hint">Basis</span>
                      <input
                        className="input mono"
                        style={{ width: 84, minHeight: 34 }}
                        value={it.basis}
                        onChange={(e) =>
                          setState((s) => ({ ...s, flex: { ...s.flex, items: s.flex.items.map((x) => (x.id === it.id ? { ...x, basis: e.target.value } : x)) } }))
                        }
                      />
                    </label>
                    {state.flex.items.length > 1 && (
                      <button
                        type="button"
                        className="btn sm ghost"
                        aria-label={`Remove ${it.label}`}
                        onClick={() => setState((s) => ({ ...s, flex: { ...s.flex, items: s.flex.items.filter((x) => x.id !== it.id) } }))}
                      >
                        <Icon name="trash" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'shadow' && (
            <div className="stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="label">Shadow layers ({state.shadows.length} / {MAX_SHADOW_LAYERS})</span>
                <div className="row">
                  <button type="button" className="btn sm" onClick={() => setImportOpen((o) => !o)}>
                    Import CSS
                  </button>
                  <button
                    type="button"
                    className="btn sm primary"
                    disabled={state.shadows.length >= MAX_SHADOW_LAYERS}
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        shadows: [...s.shadows, { id: Date.now(), x: 0, y: 8, blur: 20, spread: 0, color: '#0b0f19', alpha: 0.14, inset: false }],
                      }))
                    }
                  >
                    <Icon name="plus" /> Add layer
                  </button>
                </div>
              </div>
              {state.shadows.map((l, idx) => (
                <div key={l.id} className={`${styles.layerRow} stack`} style={{ gap: 8 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>Layer {idx + 1}</strong>
                    <div className="row">
                      <label className="check">
                        <input type="checkbox" checked={l.inset} onChange={(e) => updateShadow(l.id, { inset: e.target.checked })} />
                        Inset
                      </label>
                      <button type="button" className="btn sm" disabled={idx === 0} onClick={() => moveShadow(idx, -1)}>Up</button>
                      <button type="button" className="btn sm" disabled={idx === state.shadows.length - 1} onClick={() => moveShadow(idx, 1)}>Down</button>
                      <button
                        type="button"
                        className="btn sm ghost"
                        aria-label={`Remove layer ${idx + 1}`}
                        onClick={() => setState((s) => ({ ...s, shadows: s.shadows.filter((x) => x.id !== l.id) }))}
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  </div>
                  <div className="grid-2">
                    <SliderField label="Offset X" value={l.x} min={-80} max={80} unit="px" onChange={(x) => updateShadow(l.id, { x })} />
                    <SliderField label="Offset Y" value={l.y} min={-80} max={80} unit="px" onChange={(y) => updateShadow(l.id, { y })} />
                    <SliderField label="Blur" value={l.blur} min={0} max={MAX_SHADOW_BLUR} unit="px" onChange={(blur) => updateShadow(l.id, { blur })} />
                    <SliderField label="Spread" value={l.spread} min={-60} max={60} unit="px" onChange={(spread) => updateShadow(l.id, { spread })} />
                  </div>
                  <div className="grid-2">
                    <ColorInput label="Color" value={l.color} onValid={(_, color) => updateShadow(l.id, { color })} />
                    <SliderField label="Opacity" value={Math.round(l.alpha * 100)} min={0} max={100} unit="%" onChange={(pct) => updateShadow(l.id, { alpha: pct / 100 })} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'glass' && (
            <div className="stack">
              <div className="grid-2">
                <ColorInput label="Glass tint" value={state.glass.tint} onValid={(_, tint) => setState((s) => ({ ...s, glass: { ...s.glass, tint } }))} />
                <ColorInput label="Text color" value={state.glass.textColor} onValid={(_, textColor) => setState((s) => ({ ...s, glass: { ...s.glass, textColor } }))} />
              </div>
              <SliderField label="Backdrop blur" value={state.glass.blur} min={0} max={64} unit="px" onChange={(blur) => setState((s) => ({ ...s, glass: { ...s.glass, blur } }))} />
              <SliderField label="Fill opacity" value={Math.round(state.glass.alpha * 100)} min={0} max={100} unit="%" onChange={(pct) => setState((s) => ({ ...s, glass: { ...s.glass, alpha: pct / 100 } }))} />
              <SliderField label="Saturation" value={state.glass.saturation} min={50} max={200} unit="%" onChange={(saturation) => setState((s) => ({ ...s, glass: { ...s.glass, saturation } }))} />
              <SliderField label="Border opacity" value={Math.round(state.glass.borderAlpha * 100)} min={0} max={100} unit="%" onChange={(pct) => setState((s) => ({ ...s, glass: { ...s.glass, borderAlpha: pct / 100 } }))} />
              <SliderField label="Corner radius" value={state.glass.radius} min={0} max={48} unit="px" onChange={(radius) => setState((s) => ({ ...s, glass: { ...s.glass, radius } }))} />
              {!glassContrast.passesAA && (
                <Banner kind="warn">
                  Text contrast over this glass surface on the current preview backdrop is {glassContrast.ratio}:1 (below WCAG AA 4.5:1).
                </Banner>
              )}
              {backdrop === 'light' && (
                <p className="hint" style={{ margin: 0 }}>
                  Tip: switch the preview backdrop to Gradient/Busy to see backdrop blur clearly.
                </p>
              )}
            </div>
          )}

          {tab === 'gradient' && (
            <div className="stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <SegmentedControl<GradientState['kind']>
                  label="Gradient type"
                  value={state.gradient.kind}
                  onChange={(kind) => setState((s) => ({ ...s, gradient: { ...s.gradient, kind } }))}
                  options={[
                    { id: 'linear', label: 'Linear' },
                    { id: 'radial', label: 'Radial' },
                    { id: 'conic', label: 'Conic' },
                    { id: 'mesh', label: 'Mesh' },
                  ]}
                />
                {state.gradient.kind !== 'mesh' && (
                  <button type="button" className="btn sm" onClick={() => setImportOpen((o) => !o)}>
                    Import CSS
                  </button>
                )}
              </div>

              {state.gradient.kind !== 'mesh' ? (
                <>
                  {(state.gradient.kind === 'linear' || state.gradient.kind === 'conic') && (
                    <SliderField
                      label="Angle"
                      value={state.gradient.angle}
                      min={0}
                      max={360}
                      unit="deg"
                      onChange={(angle) => setState((s) => ({ ...s, gradient: { ...s.gradient, angle } }))}
                    />
                  )}
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="label">Color stops</span>
                    <button
                      type="button"
                      className="btn sm"
                      disabled={state.gradient.stops.length >= 8}
                      onClick={() =>
                        setState((s) => ({
                          ...s,
                          gradient: { ...s.gradient, stops: [...s.gradient.stops, { id: Date.now(), color: '#0a8a66', pos: 100 }] },
                        }))
                      }
                    >
                      <Icon name="plus" /> Add stop
                    </button>
                  </div>
                  {state.gradient.stops.map((st, idx) => (
                    <div key={st.id} className={`${styles.layerRow} stack`} style={{ gap: 8 }}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <ColorInput
                          label={`Stop ${idx + 1}`}
                          value={st.color}
                          onValid={(_, color) =>
                            setState((s) => ({
                              ...s,
                              gradient: { ...s.gradient, stops: s.gradient.stops.map((x) => (x.id === st.id ? { ...x, color } : x)) },
                            }))
                          }
                        />
                        {state.gradient.stops.length > 2 && (
                          <button
                            type="button"
                            className="btn sm ghost"
                            aria-label={`Remove stop ${idx + 1}`}
                            onClick={() =>
                              setState((s) => ({ ...s, gradient: { ...s.gradient, stops: s.gradient.stops.filter((x) => x.id !== st.id) } }))
                            }
                          >
                            <Icon name="trash" />
                          </button>
                        )}
                      </div>
                      <SliderField
                        label="Position"
                        value={st.pos}
                        min={0}
                        max={100}
                        unit="%"
                        onChange={(pos) =>
                          setState((s) => ({
                            ...s,
                            gradient: { ...s.gradient, stops: s.gradient.stops.map((x) => (x.id === st.id ? { ...x, pos } : x)) },
                          }))
                        }
                      />
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <ColorInput
                    label="Base color"
                    value={state.gradient.meshBase}
                    onValid={(_, meshBase) => setState((s) => ({ ...s, gradient: { ...s.gradient, meshBase } }))}
                  />
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="label">Mesh nodes ({state.gradient.meshPoints.length} / {MAX_MESH_POINTS})</span>
                    <button
                      type="button"
                      className="btn sm"
                      disabled={state.gradient.meshPoints.length >= MAX_MESH_POINTS}
                      onClick={() =>
                        setState((s) => ({
                          ...s,
                          gradient: {
                            ...s.gradient,
                            meshPoints: [...s.gradient.meshPoints, { id: Date.now(), color: '#8fa6ff', x: 50, y: 50, size: 50 }],
                          },
                        }))
                      }
                    >
                      <Icon name="plus" /> Add node
                    </button>
                  </div>
                  {state.gradient.meshPoints.map((pt, idx) => (
                    <div key={pt.id} className={`${styles.layerRow} stack`} style={{ gap: 8 }}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <ColorInput
                          label={`Node ${idx + 1}`}
                          value={pt.color}
                          onValid={(_, color) =>
                            setState((s) => ({
                              ...s,
                              gradient: {
                                ...s.gradient,
                                meshPoints: s.gradient.meshPoints.map((x) => (x.id === pt.id ? { ...x, color } : x)),
                              },
                            }))
                          }
                        />
                        {state.gradient.meshPoints.length > 1 && (
                          <button
                            type="button"
                            className="btn sm ghost"
                            aria-label={`Remove node ${idx + 1}`}
                            onClick={() =>
                              setState((s) => ({
                                ...s,
                                gradient: { ...s.gradient, meshPoints: s.gradient.meshPoints.filter((x) => x.id !== pt.id) },
                              }))
                            }
                          >
                            <Icon name="trash" />
                          </button>
                        )}
                      </div>
                      <div className="grid-2">
                        <SliderField label="X %" value={pt.x} min={0} max={100} unit="%" onChange={(x) => setState((s) => ({ ...s, gradient: { ...s.gradient, meshPoints: s.gradient.meshPoints.map((p) => (p.id === pt.id ? { ...p, x } : p)) } }))} />
                        <SliderField label="Y %" value={pt.y} min={0} max={100} unit="%" onChange={(y) => setState((s) => ({ ...s, gradient: { ...s.gradient, meshPoints: s.gradient.meshPoints.map((p) => (p.id === pt.id ? { ...p, y } : p)) } }))} />
                      </div>
                      <SliderField label="Spread" value={pt.size} min={20} max={90} unit="%" onChange={(size) => setState((s) => ({ ...s, gradient: { ...s.gradient, meshPoints: s.gradient.meshPoints.map((p) => (p.id === pt.id ? { ...p, size } : p)) } }))} />
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {tab === 'radius' && (
            <div className="stack">
              <div className="row">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={state.radius.linked}
                    onChange={(e) => setState((s) => ({ ...s, radius: { ...s.radius, linked: e.target.checked } }))}
                  />
                  Link all corners
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={state.radius.organic}
                    onChange={(e) => setState((s) => ({ ...s, radius: { ...s.radius, organic: e.target.checked, linked: e.target.checked ? false : s.radius.linked } }))}
                  />
                  8-value organic radius
                </label>
              </div>
              {state.radius.linked && !state.radius.organic ? (
                <SliderField
                  label="Border radius"
                  value={state.radius.tl}
                  min={0}
                  max={120}
                  unit="px"
                  onChange={(v) => setState((s) => ({ ...s, radius: { ...s.radius, tl: v, tr: v, br: v, bl: v } }))}
                />
              ) : (
                <div className="grid-2">
                  <SliderField label="Top-left" value={state.radius.tl} min={0} max={120} unit="px" onChange={(tl) => setState((s) => ({ ...s, radius: { ...s.radius, tl } }))} />
                  <SliderField label="Top-right" value={state.radius.tr} min={0} max={120} unit="px" onChange={(tr) => setState((s) => ({ ...s, radius: { ...s.radius, tr } }))} />
                  <SliderField label="Bottom-right" value={state.radius.br} min={0} max={120} unit="px" onChange={(br) => setState((s) => ({ ...s, radius: { ...s.radius, br } }))} />
                  <SliderField label="Bottom-left" value={state.radius.bl} min={0} max={120} unit="px" onChange={(bl) => setState((s) => ({ ...s, radius: { ...s.radius, bl } }))} />
                </div>
              )}
              {state.radius.organic && (
                <div className="grid-2">
                  <SliderField label="Top-left V" value={state.radius.tlV} min={0} max={120} unit="px" onChange={(tlV) => setState((s) => ({ ...s, radius: { ...s.radius, tlV } }))} />
                  <SliderField label="Top-right V" value={state.radius.trV} min={0} max={120} unit="px" onChange={(trV) => setState((s) => ({ ...s, radius: { ...s.radius, trV } }))} />
                  <SliderField label="Bottom-right V" value={state.radius.brV} min={0} max={120} unit="px" onChange={(brV) => setState((s) => ({ ...s, radius: { ...s.radius, brV } }))} />
                  <SliderField label="Bottom-left V" value={state.radius.blV} min={0} max={120} unit="px" onChange={(blV) => setState((s) => ({ ...s, radius: { ...s.radius, blV } }))} />
                </div>
              )}
              <Field label="Clip-path shape">
                {(id) => (
                  <select
                    id={id}
                    className="select"
                    value={state.radius.clipPreset}
                    onChange={(e) => setState((s) => ({ ...s, radius: { ...s.radius, clipPreset: e.target.value as ClipPreset } }))}
                  >
                    {Object.entries(CLIP_PRESETS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                )}
              </Field>
              {state.radius.clipPreset === 'custom' && (
                <Field label="Polygon coordinates (CSS)">
                  {(id) => (
                    <input
                      id={id}
                      className="input mono"
                      value={state.radius.customPolygon}
                      onChange={(e) => setState((s) => ({ ...s, radius: { ...s.radius, customPolygon: e.target.value } }))}
                    />
                  )}
                </Field>
              )}
            </div>
          )}

          {importOpen && (
            <div className="panel stack" style={{ background: 'var(--bg)' }}>
              <Field label={`Paste existing CSS ${tab === 'shadow' ? 'box-shadow' : 'gradient'}`}>
                {(id) => (
                  <textarea
                    id={id}
                    className="textarea code"
                    style={{ minHeight: 84 }}
                    value={importText}
                    placeholder={tab === 'shadow' ? 'box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);' : 'linear-gradient(135deg, #2446f0 0%, #d6246e 100%)'}
                    onChange={(e) => setImportText(e.target.value)}
                  />
                )}
              </Field>
              {importError && <ErrorBanner>{importError}</ErrorBanner>}
              <div className="row">
                <button type="button" className="btn sm primary" onClick={runImport}>Apply CSS</button>
                <button type="button" className="btn sm" onClick={() => setImportOpen(false)}>Cancel</button>
              </div>
            </div>
          )}
          {importNotes.length > 0 && <Banner kind="info" onDismiss={() => setImportNotes([])}>{importNotes.join(' ')}</Banner>}
        </section>

        <div className="stack">
          <section className="panel stack" aria-label="Live preview">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 className="panel-title" style={{ margin: 0 }}>Preview</h2>
              <div className="row">
                <SegmentedControl<BackdropMode>
                  label="Preview backdrop"
                  value={backdrop}
                  onChange={setBackdrop}
                  options={[
                    { id: 'light', label: 'Light' },
                    { id: 'dark', label: 'Dark' },
                    { id: 'pattern', label: 'Busy' },
                  ]}
                />
                {(tab === 'grid' || tab === 'flex') && (
                  <button type="button" className="btn sm" aria-pressed={rtl} onClick={() => setRtl((v) => !v)}>
                    {rtl ? 'RTL' : 'LTR'}
                  </button>
                )}
              </div>
            </div>

            <div className={`${styles.stage} ${stageBgClass}`} dir={rtl ? 'rtl' : 'ltr'} aria-hidden="true">
              {tab === 'grid' && (
                <div
                  className={styles.gridDemoBox}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${state.grid.cols}, ${state.grid.colTrack || '1fr'})`,
                    gridTemplateRows: `repeat(${state.grid.rows}, ${state.grid.rowTrack || 'auto'})`,
                    gap: fmtLen(state.grid.gapPx, state.unit),
                    ...(state.grid.useAreas ? { gridTemplateAreas: buildGridAreaMatrix(state.grid).join(' ') } : {}),
                  }}
                >
                  {state.grid.items.map((it) => (
                    <div
                      key={it.id}
                      className={styles.gridDemoCell}
                      style={
                        state.grid.useAreas
                          ? { gridArea: it.area.trim().replace(/[^a-zA-Z0-9_-]/g, '') || `item${it.id}` }
                          : { gridColumn: `span ${Math.min(state.grid.cols, it.colSpan)}`, gridRow: `span ${Math.min(state.grid.rows, it.rowSpan)}` }
                      }
                    >
                      {it.label}
                    </div>
                  ))}
                </div>
              )}

              {tab === 'flex' && (
                <div
                  className={styles.gridDemoBox}
                  style={{
                    display: 'flex',
                    flexDirection: state.flex.direction,
                    flexWrap: state.flex.wrap,
                    justifyContent: state.flex.justify,
                    alignItems: state.flex.align,
                    gap: fmtLen(state.flex.gapPx, state.unit),
                  }}
                >
                  {state.flex.items.map((it) => (
                    <div key={it.id} className={styles.gridDemoCell} style={{ flex: `${it.grow} ${it.shrink} ${it.basis}` }}>
                      {it.label}
                    </div>
                  ))}
                </div>
              )}

              {tab === 'shadow' && (
                <div
                  className={styles.previewCard}
                  style={{
                    background: '#ffffff',
                    color: '#0b0f19',
                    boxShadow: state.shadows.length ? shadowValue(state.shadows, state.unit) : 'none',
                  }}
                >
                  Layered box shadow
                </div>
              )}

              {tab === 'glass' && (
                <div
                  className={styles.previewCard}
                  style={{
                    background: `rgba(255, 255, 255, ${state.glass.alpha})`,
                    backdropFilter: `blur(${state.glass.blur}px) saturate(${state.glass.saturation}%)`,
                    WebkitBackdropFilter: `blur(${state.glass.blur}px) saturate(${state.glass.saturation}%)`,
                    border: `1px solid rgba(255, 255, 255, ${state.glass.borderAlpha})`,
                    borderRadius: fmtLen(state.glass.radius, state.unit),
                    color: state.glass.textColor,
                  }}
                >
                  Frosted glass card
                </div>
              )}

              {tab === 'gradient' && (
                <div
                  className={styles.previewCard}
                  style={{
                    color: '#ffffff',
                    backgroundColor: state.gradient.kind === 'mesh' ? state.gradient.meshBase : undefined,
                    backgroundImage: gradientCssValue(state.gradient),
                  }}
                >
                  Gradient preview
                </div>
              )}

              {tab === 'radius' && (
                <div
                  className={styles.previewCard}
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--accent-fg)',
                    borderRadius: radiusCssValue(state.radius, state.unit),
                    clipPath: clipPathValue(state.radius) === 'none' ? undefined : clipPathValue(state.radius),
                  }}
                >
                  Shape preview
                </div>
              )}
            </div>
          </section>

          <section className="panel stack" aria-label="Generated code output">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <SegmentedControl<OutputKind>
                label="Code format"
                value={outputKind}
                onChange={setOutputKind}
                options={[
                  { id: 'css', label: 'CSS' },
                  { id: 'tailwind', label: 'Tailwind' },
                ]}
              />
              <div className="row">
                <CopyButton text={codeText} label={`Copy ${outputKind.toUpperCase()}`} size="md" />
                {outputKind === 'css' && (
                  <button type="button" className="btn" onClick={() => downloadText(out.css + '\n', `${tab}-styles.css`, 'text/css')}>
                    <Icon name="download" /> Download .css
                  </button>
                )}
              </div>
            </div>
            <pre className={styles.codeBox}>{codeText}</pre>
            {outputKind === 'tailwind' && out.notes.length > 0 && (
              <div className="stack" style={{ gap: 4 }}>
                {out.notes.map((n) => (
                  <p key={n} className="hint" style={{ margin: 0 }}>{n}</p>
                ))}
                <p className="hint" style={{ margin: 0 }}>
                  Write Tailwind class strings completely in your source files so Tailwind detects them at build time.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
