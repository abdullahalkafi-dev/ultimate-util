'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Banner, CopyButton, Field, SegmentedControl, Tabs, useToast } from '@/components/ui';
import { readJson, removeKey, writeJson } from '@/lib/storage';
import { isFontInstalled } from './detect';
import {
  ALL_FONTS,
  PAIRINGS,
  PAIRING_SCRIPTS,
  SAMPLES,
  customFont,
  findFont,
  fontStack,
  isRtl,
  type FontChoice,
} from './fonts';
import {
  DEFAULT_FLUID,
  DEFAULT_SCALE,
  RATIO_PRESETS,
  computeScale,
  exportScale,
  validateScale,
  type FluidInput,
  type Naming,
  type ScaleFormat,
  type ScaleInput,
} from './scale';
import { GOOGLE_PRIVACY_NOTE, fontFamilyCss, fontsourceSnippet, googleLink, pairToJson, type Role } from './snippets';
import styles from './styles.module.css';

const KEY = 'uu.font-pairer.state';
const MAX_SAMPLE = 2000;

interface State {
  heading: string;
  headingWeight: number;
  body: string;
  bodyWeight: number;
  headingText: string;
  bodyText: string;
  measure: number;
  scale: ScaleInput;
  naming: Naming;
  format: ScaleFormat;
}

const en = SAMPLES[0];
const INITIAL: State = {
  heading: 'Playfair Display',
  headingWeight: 700,
  body: 'Source Sans 3',
  bodyWeight: 400,
  headingText: en?.heading ?? '',
  bodyText: en?.body ?? '',
  measure: 66,
  scale: DEFAULT_SCALE,
  naming: 'step',
  format: 'css-vars',
};

const isState = (v: unknown): v is State => typeof v === 'object' && v !== null && 'scale' in v && 'heading' in v && 'bodyText' in v;

type Main = 'pair' | 'scale';
type Script = 'any' | 'latin' | 'arabic' | 'bengali' | 'devanagari' | 'japanese';

function resolve(name: string, fallback: string): FontChoice {
  const trimmed = name.trim();
  return findFont(trimmed) ?? (trimmed ? customFont(trimmed) : (findFont(fallback) as FontChoice));
}

function nearestWeight(font: FontChoice, w: number): number {
  return font.weights.includes(w) ? w : font.weights.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a), font.weights[0] ?? 400);
}

export default function FontPairerTypeScale() {
  const toast = useToast();
  const [main, setMain] = useState<Main>('pair');
  const [st, setSt] = useState<State>(INITIAL);
  const [script, setScript] = useState<Script>('any');
  const [exportKind, setExportKind] = useState<'css' | 'google' | 'fontsource' | 'json'>('css');
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const hydrated = useRef(false);

  useEffect(() => {
    const saved = readJson<State | null>(KEY, null, (v): v is State | null => v === null || isState(v));
    if (saved) setSt({ ...INITIAL, ...saved, scale: { ...DEFAULT_SCALE, ...saved.scale } });
    hydrated.current = true;
  }, []);
  useEffect(() => {
    if (hydrated.current) writeJson(KEY, st);
  }, [st]);

  const set = <K extends keyof State>(k: K, v: State[K]) => setSt((s) => ({ ...s, [k]: v }));

  const heading = resolve(st.heading, INITIAL.heading);
  const body = resolve(st.body, INITIAL.body);
  const hRole: Role = { font: heading, weight: nearestWeight(heading, st.headingWeight) };
  const bRole: Role = { font: body, weight: nearestWeight(body, st.bodyWeight) };
  const sameFamily = heading.name === body.name;
  const rtl = isRtl(st.headingText + st.bodyText);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const f of [heading, body]) if (!f.system) next[f.name] = isFontInstalled(f.name);
    setInstalled(next);
  }, [heading, body]);

  const fontOptions = useMemo(
    () => ALL_FONTS.filter((f) => script === 'any' || (PAIRING_SCRIPTS[f.name] ?? 'latin') === script),
    [script],
  );

  const errors = useMemo(() => validateScale(st.scale), [st.scale]);
  const steps = useMemo(() => (errors.length ? computeScale(DEFAULT_SCALE) : computeScale(st.scale)), [errors, st.scale]);
  const scaleCode = useMemo(() => exportScale(steps, { format: st.format, naming: st.naming, prefix: '' }), [steps, st.format, st.naming]);

  const exportText = useMemo(() => {
    switch (exportKind) {
      case 'css':
        return fontFamilyCss(hRole, bRole);
      case 'google':
        return googleLink(hRole, bRole) ?? '<!-- Both fonts are system fonts: nothing to load. -->';
      case 'fontsource':
        return fontsourceSnippet(hRole, bRole) ?? '/* Both fonts are system fonts: nothing to install. */';
      case 'json':
        return pairToJson(hRole, bRole, st.bodyText);
    }
  }, [exportKind, hRole, bRole, st.bodyText]);

  const setScale = (patch: Partial<ScaleInput>) => setSt((s) => ({ ...s, scale: { ...s.scale, ...patch } }));
  const setFluid = (patch: Partial<FluidInput>) => setSt((s) => ({ ...s, scale: { ...s.scale, fluid: { ...(s.scale.fluid ?? DEFAULT_FLUID), ...patch } } }));
  const num = (v: string, fallback: number) => (v.trim() === '' || Number.isNaN(Number(v)) ? fallback : Number(v));

  const shuffle = () => {
    const pick = PAIRINGS[Math.floor(Math.random() * PAIRINGS.length)];
    if (pick) setSt((s) => ({ ...s, heading: pick.heading, headingWeight: pick.headingWeight, body: pick.body, bodyWeight: pick.bodyWeight }));
  };

  const loadSample = (id: string) => {
    const s = SAMPLES.find((x) => x.id === id);
    if (s) setSt((p) => ({ ...p, headingText: s.heading, bodyText: s.body }));
  };

  const warnFallback = (f: FontChoice) => !f.system && installed[f.name] === false;

  const specimenFont = fontStack(body);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Tabs
        label="Tool section"
        value={main}
        onChange={setMain}
        tabs={[
          { id: 'pair', label: 'Font pairing' },
          { id: 'scale', label: 'Type scale' },
        ]}
      />

      {main === 'pair' && (
        <>
          <Banner kind="info">
            Nothing is loaded from Google. Previews use fonts installed on your device and fall back to a generic family otherwise. Export snippets are for your own site.
          </Banner>

          <div className="grid-2">
            {(
              [
                ['Heading font', 'heading', 'headingWeight', heading] as const,
                ['Body font', 'body', 'bodyWeight', body] as const,
              ]
            ).map(([label, nameKey, weightKey, font]) => (
              <div key={nameKey} className="panel stack" style={{ gap: 10 }}>
                <Field label={label} hint={font.system ? 'System stack: always available.' : 'Type a Google Fonts family or pick from the list.'}>
                  {(id) => (
                    <>
                      <input id={id} className="input" list={`fonts-${nameKey}`} value={st[nameKey]} onChange={(e) => set(nameKey, e.target.value)} autoComplete="off" spellCheck={false} />
                      <datalist id={`fonts-${nameKey}`}>
                        {fontOptions.map((f) => (
                          <option key={f.name} value={f.name}>{`${f.category}${f.system ? ', system' : ''}`}</option>
                        ))}
                      </datalist>
                    </>
                  )}
                </Field>
                <Field label="Weight">
                  {(id) => (
                    <select id={id} className="select" value={nearestWeight(font, st[weightKey])} onChange={(e) => set(weightKey, Number(e.target.value))}>
                      {font.weights.map((w) => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  )}
                </Field>
                {warnFallback(font) && (
                  <span className="hint">
                    {font.name} is not installed on this device, so a fallback family is shown. The export snippets still work on your site.
                  </span>
                )}
                {!findFont(font.name) && font.name && <span className="hint">Custom family: only shown if installed locally.</span>}
              </div>
            ))}
          </div>

          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn sm" onClick={shuffle}>Try a curated pair</button>
            <Field label="Script filter">
              {(id) => (
                <select id={id} className="select" value={script} onChange={(e) => setScript(e.target.value as Script)}>
                  <option value="any">Any script</option>
                  <option value="latin">Latin</option>
                  <option value="arabic">Arabic</option>
                  <option value="bengali">Bengali</option>
                  <option value="devanagari">Devanagari</option>
                  <option value="japanese">Japanese</option>
                </select>
              )}
            </Field>
            <Field label="Sample language">
              {(id) => (
                <select id={id} className="select" defaultValue="" onChange={(e) => e.target.value && loadSample(e.target.value)}>
                  <option value="">Choose...</option>
                  {SAMPLES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={`Line length: ${st.measure} characters`} hint={st.measure < 45 || st.measure > 75 ? 'Outside the comfortable 45 to 75 range.' : 'Within the comfortable 45 to 75 range.'}>
              {(id) => <input id={id} type="range" min={30} max={100} value={st.measure} onChange={(e) => set('measure', Number(e.target.value))} />}
            </Field>
          </div>
          {sameFamily && <Banner kind="info">Same family for both roles: contrast comes from weight and size only.</Banner>}

          <div className="grid-2">
            <Field label="Heading text">
              {(id) => <input id={id} className="input" value={st.headingText} maxLength={200} onChange={(e) => set('headingText', e.target.value)} />}
            </Field>
            <Field label={`Body text (${st.bodyText.length}/${MAX_SAMPLE})`} hint="Saved only in this browser. Do not paste confidential text.">
              {(id) => (
                <textarea id={id} className="textarea" style={{ minHeight: 80 }} value={st.bodyText} onChange={(e) => set('bodyText', e.target.value.slice(0, MAX_SAMPLE))} />
              )}
            </Field>
          </div>
          <div className="row">
            <button type="button" className="btn sm" onClick={() => { removeKey(KEY); setSt(INITIAL); toast('Saved text and settings cleared.', 'success'); }}>
              Clear saved text
            </button>
          </div>

          <section className={styles.card} dir={rtl ? 'rtl' : 'ltr'} aria-label="Preview">
            <h2 className={styles.heading} style={{ fontFamily: fontStack(heading), fontWeight: hRole.weight }}>
              {st.headingText.trim() || en?.heading}
            </h2>
            <p className={styles.body} style={{ fontFamily: fontStack(body), fontWeight: bRole.weight, maxWidth: `${st.measure}ch` }}>
              {st.bodyText.trim() || en?.body}
            </p>
          </section>

          <section className="panel stack" aria-label="Curated pairings">
            <h2 className="panel-title" style={{ margin: 0 }}>Curated pairings</h2>
            <div className={styles.pairs}>
              {PAIRINGS.map((p) => {
                const active = p.heading === st.heading && p.body === st.body && p.headingWeight === st.headingWeight;
                return (
                  <button
                    key={`${p.heading}-${p.headingWeight}-${p.body}`}
                    type="button"
                    className={styles.pair}
                    aria-pressed={active}
                    onClick={() => setSt((s) => ({ ...s, heading: p.heading, headingWeight: p.headingWeight, body: p.body, bodyWeight: p.bodyWeight }))}
                  >
                    <strong>{p.heading} + {p.body}</strong>
                    <span className="muted">{p.reason}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel stack" aria-label="Export">
            <h2 className="panel-title" style={{ margin: 0 }}>Use this pair</h2>
            <SegmentedControl
              label="Export"
              value={exportKind}
              onChange={setExportKind}
              options={[
                { id: 'css', label: 'CSS' },
                { id: 'fontsource', label: 'Self-hosted (Fontsource)' },
                { id: 'google', label: 'Google Fonts link' },
                { id: 'json', label: 'Pair as JSON' },
              ]}
            />
            {exportKind === 'google' && <Banner kind="warn">{GOOGLE_PRIVACY_NOTE}</Banner>}
            <pre className={styles.code} tabIndex={0}>{exportText}</pre>
            <div><CopyButton text={exportText} label="Copy" /></div>
          </section>
        </>
      )}

      {main === 'scale' && (
        <>
          <div className="grid-3">
            <Field label="Base size (px)" error={st.scale.base < 10 || st.scale.base > 32 ? 'Use 10 to 32.' : undefined}>
              {(id) => <input id={id} className="input" type="number" min={10} max={32} step={0.5} value={st.scale.base} onChange={(e) => setScale({ base: num(e.target.value, st.scale.base) })} />}
            </Field>
            <Field label="Ratio preset">
              {(id) => (
                <select id={id} className="select" value={RATIO_PRESETS.find((r) => r.value === st.scale.ratio)?.id ?? 'custom'} onChange={(e) => { const r = RATIO_PRESETS.find((x) => x.id === e.target.value); if (r) setScale({ ratio: r.value }); }}>
                  {RATIO_PRESETS.map((r) => (
                    <option key={r.id} value={r.id}>{`${r.label} (${r.value})`}</option>
                  ))}
                  <option value="custom">Custom</option>
                </select>
              )}
            </Field>
            <Field label="Custom ratio" error={st.scale.ratio < 1.01 || st.scale.ratio > 2 ? 'Use 1.01 to 2.' : undefined}>
              {(id) => <input id={id} className="input" type="number" min={1.01} max={2} step={0.001} value={st.scale.ratio} onChange={(e) => setScale({ ratio: num(e.target.value, st.scale.ratio) })} />}
            </Field>
            <Field label="First step">
              {(id) => <input id={id} className="input" type="number" min={-6} max={0} value={st.scale.minStep} onChange={(e) => setScale({ minStep: Math.trunc(num(e.target.value, st.scale.minStep)) })} />}
            </Field>
            <Field label="Last step">
              {(id) => <input id={id} className="input" type="number" min={0} max={12} value={st.scale.maxStep} onChange={(e) => setScale({ maxStep: Math.trunc(num(e.target.value, st.scale.maxStep)) })} />}
            </Field>
            <div className="stack" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <label className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={st.scale.roundToPixel} onChange={(e) => setScale({ roundToPixel: e.target.checked })} />
                Round to whole pixels
              </label>
              <label className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={st.scale.fluid !== null} onChange={(e) => setScale({ fluid: e.target.checked ? DEFAULT_FLUID : null })} />
                Fluid (clamp) output
              </label>
            </div>
          </div>

          {st.scale.fluid && (
            <div className="grid-3" role="group" aria-label="Fluid settings">
              {(
                [
                  ['Min viewport (px)', 'minViewport'],
                  ['Max viewport (px)', 'maxViewport'],
                  ['Base at min viewport (px)', 'minBase'],
                  ['Base at max viewport (px)', 'maxBase'],
                  ['Ratio at min viewport', 'minRatio'],
                  ['Ratio at max viewport', 'maxRatio'],
                ] as const
              ).map(([label, key]) => (
                <Field key={key} label={label}>
                  {(id) => <input id={id} className="input" type="number" step="any" value={st.scale.fluid?.[key] ?? 0} onChange={(e) => setFluid({ [key]: num(e.target.value, st.scale.fluid?.[key] ?? 0) })} />}
                </Field>
              ))}
              {st.scale.fluid.minViewport > st.scale.fluid.maxViewport && (
                <button type="button" className="btn sm" onClick={() => setFluid({ minViewport: st.scale.fluid?.maxViewport ?? 0, maxViewport: st.scale.fluid?.minViewport ?? 0 })}>
                  Swap viewports
                </button>
              )}
            </div>
          )}

          {errors.length > 0 && (
            <Banner kind="error">
              {errors.map((e) => (
                <div key={e}>{e}</div>
              ))}
              <div>Showing the default scale until this is fixed.</div>
            </Banner>
          )}
          {st.scale.fluid && (st.scale.fluid.minViewport < 320 || st.scale.fluid.maxViewport > 2560) && (
            <Banner kind="warn">Very small or very large viewports are allowed. WCAG 1.4.4 needs text to reach 200% zoom, so the output always keeps a rem term next to the vw term.</Banner>
          )}

          <div className={styles.scroll}>
            <table className={styles.table}>
              <caption className="muted" style={{ textAlign: 'left', paddingBottom: 6 }}>
                Each size is base × ratio^step. Rem assumes a 16 px root.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col">{st.scale.fluid ? 'px (max)' : 'px'}</th>
                  <th scope="col">rem</th>
                  <th scope="col">Line height</th>
                  <th scope="col">Specimen</th>
                </tr>
              </thead>
              <tbody>
                {[...steps].reverse().map((s) => (
                  <tr key={s.step}>
                    <th scope="row" className="tabular">{s.step}</th>
                    <td className="tabular">{s.minPx !== undefined ? `${s.minPx} to ${s.maxPx}` : s.px}</td>
                    <td className="tabular">{s.rem}</td>
                    <td className="tabular">{s.lineHeight}</td>
                    <td>
                      <div className={styles.specimen} style={{ fontSize: `${Math.min(s.px, 72)}px`, lineHeight: s.lineHeight, fontFamily: specimenFont }}>
                        Hamburgefonstiv
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="panel stack" aria-label="Scale export">
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <SegmentedControl
                label="Format"
                value={st.format}
                onChange={(v) => set('format', v)}
                options={[
                  { id: 'css-vars', label: 'CSS variables' },
                  { id: 'plain-css', label: 'CSS classes' },
                  { id: 'tailwind-v4', label: 'Tailwind v4' },
                  { id: 'tailwind-v3', label: 'Tailwind v3' },
                  { id: 'json', label: 'JSON' },
                ]}
              />
              <SegmentedControl
                label="Names"
                value={st.naming}
                onChange={(v) => set('naming', v)}
                options={[
                  { id: 'step', label: 'step-n' },
                  { id: 'tshirt', label: 'xs, sm, base...' },
                ]}
              />
            </div>
            {st.naming === 'tshirt' && st.format.startsWith('tailwind') && (
              <span className="hint">These names match Tailwind defaults (text-sm, text-lg...) and will override them. Use step-n to avoid that.</span>
            )}
            <pre className={styles.code} tabIndex={0}>{scaleCode}</pre>
            <div><CopyButton text={scaleCode} label="Copy" /></div>
          </section>

          <section className="panel stack" aria-label="Readability guidance">
            <h2 className="panel-title" style={{ margin: 0 }}>Readability</h2>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>Body text: 16 px or larger, set in rem so it follows the reader&apos;s font-size setting.</li>
              <li>Line height 1.4 to 1.6 for body, tightening toward 1.1 to 1.25 for large headings (shown per step above).</li>
              <li>Line length 45 to 75 characters, about 66ch ideal.</li>
              <li>Layouts should survive users raising line height to 1.5 and adding letter and word spacing (WCAG 1.4.12).</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
