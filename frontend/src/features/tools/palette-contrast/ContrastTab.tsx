'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui';
import { ColorInput } from '../_shared-color/ColorInput';
import {
  compositeOver,
  contrastRatio,
  formatRatio,
  isLargeText,
  passes,
  suggestFixes,
  type Level,
  type TextKind,
} from '../_shared-color/contrast';
import { hexToRgb, parseColor, rgbToHex, type RGB } from '../_shared-color/convert';
import styles from './styles.module.css';

const WHITE: RGB = { r: 255, g: 255, b: 255 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };

const TARGETS: { id: string; label: string; kind: TextKind; level: Level; need: number }[] = [
  { id: 'normal-AA', label: 'Normal text, AA (4.5:1)', kind: 'normal', level: 'AA', need: 4.5 },
  { id: 'normal-AAA', label: 'Normal text, AAA (7:1)', kind: 'normal', level: 'AAA', need: 7 },
  { id: 'large-AA', label: 'Large text, AA (3:1)', kind: 'large', level: 'AA', need: 3 },
  { id: 'large-AAA', label: 'Large text, AAA (4.5:1)', kind: 'large', level: 'AAA', need: 4.5 },
  { id: 'ui-AA', label: 'UI component or graphic, AA (3:1)', kind: 'ui', level: 'AA', need: 3 },
];

function Verdict({ label, ok }: { label: string; ok: boolean | null }) {
  if (ok === null) return <span className={`${styles.verdict} ${styles.na}`}>{label}: not defined in WCAG 2.x</span>;
  return (
    <span className={`${styles.verdict} ${ok ? styles.pass : styles.fail}`}>
      <Icon name={ok ? 'check' : 'x'} /> {label}: {ok ? 'Pass' : 'Fail'}
    </span>
  );
}

interface Props {
  palette: string[];
  initialFg?: string;
  initialBg?: string;
}

export function ContrastTab({ palette, initialFg = '#3a3a3a', initialBg = '#ffffff' }: Props) {
  const [fg, setFg] = useState(initialFg);
  const [bg, setBg] = useState(initialBg);
  const [px, setPx] = useState(16);
  const [bold, setBold] = useState(false);
  const [targetId, setTargetId] = useState('normal-AA');

  const parsed = useMemo(() => {
    const f = parseColor(fg), b = parseColor(bg);
    if (!f.ok || !b.ok) return null;
    const bgRgb = compositeOver(b.rgb, b.alpha, WHITE);
    const fgRgb = compositeOver(f.rgb, f.alpha, bgRgb);
    return { fgRgb, bgRgb, fgAlpha: f.alpha < 1, bgAlpha: b.alpha < 1 };
  }, [fg, bg]);

  const ratio = parsed ? contrastRatio(parsed.fgRgb, parsed.bgRgb) : 1;
  const target = TARGETS.find((t) => t.id === targetId) ?? TARGETS[0]!;
  const fixes = useMemo(
    () => (parsed && passes(ratio, target.kind, target.level) === false ? suggestFixes(parsed.fgRgb, parsed.bgRgb, target.need) : []),
    [parsed, ratio, target],
  );
  const large = isLargeText(px, bold);
  const pairText = `${formatRatio(ratio)}:1`;
  const summary = parsed
    ? `Contrast ${pairText}. Normal text: AA ${passes(ratio, 'normal', 'AA') ? 'passes' : 'fails'}, AAA ${passes(ratio, 'normal', 'AAA') ? 'passes' : 'fails'}. Large text: AA ${passes(ratio, 'large', 'AA') ? 'passes' : 'fails'}, AAA ${passes(ratio, 'large', 'AAA') ? 'passes' : 'fails'}. UI: AA ${passes(ratio, 'ui', 'AA') ? 'passes' : 'fails'}.`
    : 'Enter two valid colors.';

  const palRgb = palette.map((h) => hexToRgb(h)).filter((c): c is RGB => c !== null);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="split">
        <div className="panel stack">
          <h2 className="panel-title" style={{ margin: 0 }}>Colors</h2>
          <ColorInput label="Text / foreground" value={fg} onValid={(_, hex) => setFg(hex)} />
          <ColorInput label="Background" value={bg} onValid={(_, hex) => setBg(hex)} />
          <div className="row">
            <button type="button" className="btn sm" onClick={() => { setFg(bg); setBg(fg); }}>
              <Icon name="swap" /> Swap
            </button>
            {palette.length > 0 && (
              <>
                <label className="muted" htmlFor="pal-fg">Use palette color as text</label>
                <select id="pal-fg" className="select" value="" onChange={(e) => e.target.value && setFg(e.target.value)}>
                  <option value="">Choose</option>
                  {palette.map((h, i) => <option key={`${h}-${i}`} value={h}>{`Color ${i + 1} ${h}`}</option>)}
                </select>
              </>
            )}
          </div>
          <div className="row">
            <label className="field" style={{ width: 140 }}>
              Sample size (px)
              <input className="input" type="number" min={8} max={96} value={px} onChange={(e) => setPx(Math.min(96, Math.max(8, Number(e.target.value) || 16)))} />
            </label>
            <label className="row">
              <input type="checkbox" checked={bold} onChange={(e) => setBold(e.target.checked)} /> Bold
            </label>
          </div>
          <p className="hint">
            Large text means 24 px or more, or 18.66 px (14 pt) or more in bold. Your sample counts as {large ? 'large' : 'normal'} text.
          </p>
          {parsed?.bgAlpha && <p className="hint">The background has transparency; it was composited over white.</p>}
          {parsed?.fgAlpha && <p className="hint">The text has transparency; it was composited over the background above.</p>}
        </div>

        <div className="panel stack" aria-live="polite">
          <h2 className="panel-title" style={{ margin: 0 }}>Result</h2>
          <div className={styles.ratio} aria-label={`Contrast ratio ${pairText}`}>{pairText}</div>
          <p className="sr-only">{summary}</p>
          <div className="row">
            <Verdict label="Normal AA" ok={passes(ratio, 'normal', 'AA')} />
            <Verdict label="Normal AAA" ok={passes(ratio, 'normal', 'AAA')} />
            <Verdict label="Large AA" ok={passes(ratio, 'large', 'AA')} />
            <Verdict label="Large AAA" ok={passes(ratio, 'large', 'AAA')} />
            <Verdict label="UI AA" ok={passes(ratio, 'ui', 'AA')} />
          </div>
          <p className="hint">
            Ratios are truncated to two decimals, never rounded up, and pass or fail uses the exact value. WCAG 2.x has no AAA level for UI components.
          </p>
          {parsed && (
            <div className={styles.sample} style={{ background: rgbToHex(parsed.bgRgb), color: rgbToHex(parsed.fgRgb) }}>
              <span style={{ fontSize: px, fontWeight: bold ? 700 : 400 }}>The quick brown fox jumps over the lazy dog</span>
              <span className={styles.uiSample}>UI component</span>
            </div>
          )}
        </div>
      </div>

      <div className="panel stack">
        <h2 className="panel-title" style={{ margin: 0 }}>Accessible alternatives</h2>
        <div className="row">
          <label htmlFor="target" className="muted">Target</label>
          <select id="target" className="select" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        {!parsed ? (
          <p className="muted">Enter two valid colors to get suggestions.</p>
        ) : passes(ratio, target.kind, target.level) ? (
          <p role="status"><Icon name="check" /> This pair already meets {target.label}.</p>
        ) : fixes.length === 0 ? (
          <p role="status">No text color can reach {target.need}:1 on this background.</p>
        ) : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {fixes.map((s) => {
              const hex = rgbToHex(s.rgb);
              return (
                <li key={hex} className="row">
                  <span className={styles.sample} style={{ background: rgbToHex(parsed.bgRgb), color: hex, padding: '6px 12px' }}>Aa {hex}</span>
                  <span className="tabular">{formatRatio(s.ratio)}:1</span>
                  <button type="button" className="btn sm" onClick={() => setFg(hex)}>Use this</button>
                  <span className="hint">
                    {s.fallback ? 'No lightness at this hue passes, so this is plain black or white. ' : ''}
                    {s.chromaReduced ? 'Color intensity was reduced to fit sRGB.' : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {palRgb.length > 0 && (
        <div className="panel stack">
          <h2 className="panel-title" style={{ margin: 0 }}>Palette matrix (normal text, AA 4.5:1)</h2>
          <div className={styles.matrixWrap}>
            <table className={styles.matrix}>
              <caption className="sr-only">Contrast of each palette color, as text, against every background</caption>
              <thead>
                <tr>
                  <th scope="col">Text \ Background</th>
                  <th scope="col">White</th>
                  <th scope="col">Black</th>
                  {palRgb.map((_, i) => <th scope="col" key={i}>Color {i + 1}</th>)}
                </tr>
              </thead>
              <tbody>
                {palRgb.map((row, r) => (
                  <tr key={r}>
                    <th scope="row" style={{ background: rgbToHex(row) }}>
                      <span style={{ background: '#fff', color: '#000', padding: '1px 4px', borderRadius: 4 }}>Color {r + 1}</span>
                    </th>
                    {[WHITE, BLACK, ...palRgb].map((col, c) => {
                      if (c >= 2 && c - 2 === r) return <td key={c}>-</td>;
                      const v = contrastRatio(row, col);
                      const ok = v >= 4.5;
                      return (
                        <td key={c} className={ok ? styles.pass : styles.fail}>
                          {formatRatio(v)} {ok ? '✓ Pass' : '✗ Fail'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
