import { contrastRatio, compositeOver, formatRatio } from '../_shared-color/contrast';
import { clamp, hexToRgb, parseColor, rgbToHex, type RGB } from '../_shared-color/convert';

export type BuilderTab = 'grid' | 'flex' | 'shadow' | 'glass' | 'gradient' | 'radius';
export type UnitMode = 'px' | 'rem';
export type BackdropMode = 'light' | 'dark' | 'pattern';

export interface GridItem {
  id: number;
  label: string;
  colSpan: number;
  rowSpan: number;
  area: string;
}

export interface GridState {
  cols: number;
  rows: number;
  gapPx: number;
  colTrack: string;
  rowTrack: string;
  useAreas: boolean;
  items: GridItem[];
}

export interface FlexItem {
  id: number;
  label: string;
  grow: number;
  shrink: number;
  basis: string;
}

export interface FlexState {
  direction: 'row' | 'row-reverse' | 'column' | 'column-reverse';
  wrap: 'nowrap' | 'wrap' | 'wrap-reverse';
  justify: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around' | 'space-evenly';
  align: 'stretch' | 'flex-start' | 'center' | 'flex-end' | 'baseline';
  gapPx: number;
  items: FlexItem[];
}

export interface ShadowLayer {
  id: number;
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  alpha: number;
  inset: boolean;
}

export interface GlassState {
  tint: string;
  alpha: number;
  blur: number;
  saturation: number;
  borderAlpha: number;
  radius: number;
  textColor: string;
}

export interface GradientStop {
  id: number;
  color: string;
  pos: number;
}

export interface MeshPoint {
  id: number;
  color: string;
  x: number;
  y: number;
  size: number;
}

export interface GradientState {
  kind: 'linear' | 'radial' | 'conic' | 'mesh';
  angle: number;
  radialShape: 'circle' | 'ellipse';
  stops: GradientStop[];
  meshBase: string;
  meshPoints: MeshPoint[];
}

export type ClipPreset = 'none' | 'circle' | 'ellipse' | 'triangle' | 'diamond' | 'hexagon' | 'custom';

export interface RadiusState {
  linked: boolean;
  tl: number;
  tr: number;
  br: number;
  bl: number;
  organic: boolean;
  tlV: number;
  trV: number;
  brV: number;
  blV: number;
  clipPreset: ClipPreset;
  customPolygon: string;
}

export interface CssGenState {
  unit: UnitMode;
  logical: boolean;
  grid: GridState;
  flex: FlexState;
  shadows: ShadowLayer[];
  glass: GlassState;
  gradient: GradientState;
  radius: RadiusState;
}

export const MAX_SHADOW_LAYERS = 10;
export const MAX_SHADOW_BLUR = 500;
export const MAX_MESH_POINTS = 6;
export const MAX_IMPORT_BYTES = 102_400;

export const DEFAULT_CSS_STATE: CssGenState = {
  unit: 'px',
  logical: false,
  grid: {
    cols: 3,
    rows: 2,
    gapPx: 16,
    colTrack: '1fr',
    rowTrack: 'minmax(88px, auto)',
    useAreas: false,
    items: [
      { id: 1, label: 'Hero', colSpan: 2, rowSpan: 1, area: 'hero' },
      { id: 2, label: 'Side', colSpan: 1, rowSpan: 2, area: 'side' },
      { id: 3, label: 'Card A', colSpan: 1, rowSpan: 1, area: 'a' },
      { id: 4, label: 'Card B', colSpan: 1, rowSpan: 1, area: 'b' },
    ],
  },
  flex: {
    direction: 'row',
    wrap: 'wrap',
    justify: 'space-between',
    align: 'center',
    gapPx: 16,
    items: [
      { id: 1, label: 'Nav', grow: 0, shrink: 1, basis: 'auto' },
      { id: 2, label: 'Main', grow: 1, shrink: 1, basis: '220px' },
      { id: 3, label: 'Action', grow: 0, shrink: 0, basis: 'auto' },
    ],
  },
  shadows: [
    { id: 1, x: 0, y: 2, blur: 6, spread: 0, color: '#0b0f19', alpha: 0.08, inset: false },
    { id: 2, x: 0, y: 12, blur: 28, spread: -4, color: '#0b0f19', alpha: 0.16, inset: false },
  ],
  glass: {
    tint: '#ffffff',
    alpha: 0.24,
    blur: 16,
    saturation: 150,
    borderAlpha: 0.35,
    radius: 16,
    textColor: '#0b0f19',
  },
  gradient: {
    kind: 'linear',
    angle: 135,
    radialShape: 'circle',
    stops: [
      { id: 1, color: '#2446f0', pos: 0 },
      { id: 2, color: '#7440e8', pos: 50 },
      { id: 3, color: '#d6246e', pos: 100 },
    ],
    meshBase: '#1b2547',
    meshPoints: [
      { id: 1, color: '#2446f0', x: 18, y: 24, size: 55 },
      { id: 2, color: '#d6246e', x: 82, y: 20, size: 50 },
      { id: 3, color: '#0a8a66', x: 55, y: 80, size: 60 },
    ],
  },
  radius: {
    linked: true,
    tl: 16,
    tr: 16,
    br: 16,
    bl: 16,
    organic: false,
    tlV: 24,
    trV: 24,
    brV: 24,
    blV: 24,
    clipPreset: 'none',
    customPolygon: '50% 0%, 100% 50%, 50% 100%, 0% 50%',
  },
};

export interface GeneratedOutput {
  css: string;
  tailwind: string;
  notes: string[];
}

export function fmtLen(px: number, unit: UnitMode): string {
  const n = Math.round(px * 100) / 100;
  if (n === 0) return '0';
  if (unit === 'rem') {
    const r = Math.round((n / 16) * 1000) / 1000;
    return `${r}rem`;
  }
  return `${n}px`;
}

export function clampShadowLayer(layer: ShadowLayer): ShadowLayer {
  return {
    ...layer,
    x: clamp(Math.round(layer.x), -200, 200),
    y: clamp(Math.round(layer.y), -200, 200),
    blur: clamp(Math.round(layer.blur), 0, MAX_SHADOW_BLUR),
    spread: clamp(Math.round(layer.spread), -100, 100),
    alpha: clamp(Math.round(layer.alpha * 100) / 100, 0, 1),
  };
}

function rgbaCss(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };
  const r = Math.round(rgb.r);
  const g = Math.round(rgb.g);
  const b = Math.round(rgb.b);
  const a = clamp(Math.round(alpha * 100) / 100, 0, 1);
  return `rgb(${r} ${g} ${b} / ${a})`;
}

const GAP_SCALE: Record<number, string> = {
  0: '0',
  2: '0.5',
  4: '1',
  6: '1.5',
  8: '2',
  10: '2.5',
  12: '3',
  14: '3.5',
  16: '4',
  20: '5',
  24: '6',
  28: '7',
  32: '8',
  36: '9',
  40: '10',
  44: '11',
  48: '12',
  56: '14',
  64: '16',
};

const RADIUS_SCALE: Record<number, string> = {
  0: 'rounded-none',
  2: 'rounded-xs',
  4: 'rounded-sm',
  6: 'rounded-md',
  8: 'rounded-lg',
  12: 'rounded-xl',
  16: 'rounded-2xl',
  24: 'rounded-3xl',
  9999: 'rounded-full',
};

const BLUR_SCALE: Record<number, string> = {
  0: 'backdrop-blur-none',
  4: 'backdrop-blur-xs',
  8: 'backdrop-blur-sm',
  12: 'backdrop-blur-md',
  16: 'backdrop-blur-lg',
  24: 'backdrop-blur-xl',
  40: 'backdrop-blur-2xl',
  64: 'backdrop-blur-3xl',
};

function twArbitrary(val: string): string {
  return val.trim().replace(/\s+/g, '_');
}

function twGapClass(gapPx: number, unit: UnitMode, notes: string[]): string {
  const exact = GAP_SCALE[gapPx];
  if (exact) return `gap-${exact}`;
  const len = fmtLen(gapPx, unit);
  notes.push(`gap-[${len}]: ${gapPx}px is not on the default spacing scale.`);
  return `gap-[${len}]`;
}

export function buildGridAreaMatrix(grid: GridState): string[] {
  const cols = clamp(Math.round(grid.cols), 1, 12);
  const rows = clamp(Math.round(grid.rows), 1, 12);
  const matrix: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => '.'));
  for (const item of grid.items) {
    const clean = item.area.trim().replace(/[^a-zA-Z0-9_-]/g, '') || `item${item.id}`;
    const cSpan = clamp(item.colSpan, 1, cols);
    const rSpan = clamp(item.rowSpan, 1, rows);
    let placed = false;
    for (let r = 0; r <= rows - rSpan && !placed; r++) {
      for (let c = 0; c <= cols - cSpan && !placed; c++) {
        let free = true;
        for (let rr = r; rr < r + rSpan; rr++) {
          for (let cc = c; cc < c + cSpan; cc++) {
            if (matrix[rr]![cc] !== '.') free = false;
          }
        }
        if (free) {
          for (let rr = r; rr < r + rSpan; rr++) {
            for (let cc = c; cc < c + cSpan; cc++) {
              matrix[rr]![cc] = clean;
            }
          }
          placed = true;
        }
      }
    }
  }
  return matrix.map((r) => `"${r.join(' ')}"`);
}

export function generateGrid(grid: GridState, unit: UnitMode): GeneratedOutput {
  const cols = clamp(Math.round(grid.cols), 1, 12);
  const rows = clamp(Math.round(grid.rows), 1, 12);
  const gapPx = clamp(Math.round(grid.gapPx), 0, 128);
  const notes: string[] = [];
  const colTrack = grid.colTrack.trim() || '1fr';
  const rowTrack = grid.rowTrack.trim() || 'auto';
  const lines = [
    '.grid-container {',
    '  display: grid;',
    `  grid-template-columns: repeat(${cols}, ${colTrack});`,
    `  grid-template-rows: repeat(${rows}, ${rowTrack});`,
    `  gap: ${fmtLen(gapPx, unit)};`,
  ];
  if (grid.useAreas) {
    const areas = buildGridAreaMatrix(grid);
    lines.push(`  grid-template-areas:\n    ${areas.join('\n    ')};`);
  }
  lines.push('}');
  grid.items.forEach((item, idx) => {
    if (grid.useAreas) {
      const area = item.area.trim().replace(/[^a-zA-Z0-9_-]/g, '') || `item${item.id}`;
      lines.push(`.grid-item-${idx + 1} { grid-area: ${area}; }`);
    } else if (item.colSpan > 1 || item.rowSpan > 1) {
      const parts: string[] = [];
      if (item.colSpan > 1) parts.push(`grid-column: span ${clamp(item.colSpan, 1, cols)};`);
      if (item.rowSpan > 1) parts.push(`grid-row: span ${clamp(item.rowSpan, 1, rows)};`);
      lines.push(`.grid-item-${idx + 1} { ${parts.join(' ')} }`);
    }
  });

  const twClasses = ['grid'];
  if (colTrack === '1fr') twClasses.push(`grid-cols-${cols}`);
  else {
    twClasses.push(`grid-cols-[repeat(${cols},${twArbitrary(colTrack)})]`);
    notes.push(`Custom column track "${colTrack}" uses an arbitrary grid-cols value.`);
  }
  if (rowTrack === '1fr') twClasses.push(`grid-rows-${rows}`);
  else if (rowTrack !== 'auto') {
    twClasses.push(`grid-rows-[repeat(${rows},${twArbitrary(rowTrack)})]`);
    notes.push(`Custom row track "${rowTrack}" uses an arbitrary grid-rows value.`);
  }
  twClasses.push(twGapClass(gapPx, unit, notes));

  return {
    css: lines.join('\n'),
    tailwind: `<div class="${twClasses.join(' ')}">\n${grid.items
      .map((it) => {
        const span: string[] = [];
        if (it.colSpan > 1) span.push(`col-span-${clamp(it.colSpan, 1, cols)}`);
        if (it.rowSpan > 1) span.push(`row-span-${clamp(it.rowSpan, 1, rows)}`);
        return `  <div${span.length ? ` class="${span.join(' ')}"` : ''}>${it.label}</div>`;
      })
      .join('\n')}\n</div>`,
    notes,
  };
}

export function generateFlex(flex: FlexState, unit: UnitMode): GeneratedOutput {
  const gapPx = clamp(Math.round(flex.gapPx), 0, 128);
  const notes: string[] = [];
  const lines = [
    '.flex-container {',
    '  display: flex;',
    `  flex-direction: ${flex.direction};`,
    `  flex-wrap: ${flex.wrap};`,
    `  justify-content: ${flex.justify};`,
    `  align-items: ${flex.align};`,
    `  gap: ${fmtLen(gapPx, unit)};`,
    '}',
  ];
  flex.items.forEach((it, idx) => {
    if (it.grow !== 0 || it.shrink !== 1 || it.basis !== 'auto') {
      lines.push(`.flex-item-${idx + 1} { flex: ${it.grow} ${it.shrink} ${it.basis}; }`);
    }
  });

  const dirMap: Record<FlexState['direction'], string> = {
    row: 'flex-row',
    'row-reverse': 'flex-row-reverse',
    column: 'flex-col',
    'column-reverse': 'flex-col-reverse',
  };
  const wrapMap: Record<FlexState['wrap'], string> = {
    nowrap: 'flex-nowrap',
    wrap: 'flex-wrap',
    'wrap-reverse': 'flex-wrap-reverse',
  };
  const justMap: Record<FlexState['justify'], string> = {
    'flex-start': 'justify-start',
    center: 'justify-center',
    'flex-end': 'justify-end',
    'space-between': 'justify-between',
    'space-around': 'justify-around',
    'space-evenly': 'justify-evenly',
  };
  const alignMap: Record<FlexState['align'], string> = {
    stretch: 'items-stretch',
    'flex-start': 'items-start',
    center: 'items-center',
    'flex-end': 'items-end',
    baseline: 'items-baseline',
  };
  const twClasses = ['flex', dirMap[flex.direction], wrapMap[flex.wrap], justMap[flex.justify], alignMap[flex.align], twGapClass(gapPx, unit, notes)];
  return {
    css: lines.join('\n'),
    tailwind: `<div class="${twClasses.join(' ')}">\n${flex.items
      .map((it) => {
        const cls: string[] = [];
        if (it.grow === 1 && it.shrink === 1 && it.basis === '0%') cls.push('flex-1');
        else {
          if (it.grow === 1) cls.push('grow');
          else if (it.grow > 1) {
            cls.push(`grow-[${it.grow}]`);
            notes.push(`grow-[${it.grow}] uses an arbitrary grow factor.`);
          }
          if (it.shrink === 0) cls.push('shrink-0');
          if (it.basis !== 'auto') {
            cls.push(`basis-[${twArbitrary(it.basis)}]`);
            notes.push(`basis-[${it.basis}] uses an arbitrary flex-basis.`);
          }
        }
        return `  <div${cls.length ? ` class="${cls.join(' ')}"` : ''}>${it.label}</div>`;
      })
      .join('\n')}\n</div>`,
    notes,
  };
}

export function shadowValue(layers: ShadowLayer[], unit: UnitMode): string {
  const safe = layers.slice(0, MAX_SHADOW_LAYERS).map(clampShadowLayer);
  return safe
    .map((l) => {
      const parts = [fmtLen(l.x, unit), fmtLen(l.y, unit), fmtLen(l.blur, unit)];
      if (l.spread !== 0) parts.push(fmtLen(l.spread, unit));
      parts.push(rgbaCss(l.color, l.alpha));
      if (l.inset) parts.unshift('inset');
      return parts.join(' ');
    })
    .join(', ');
}

export function generateShadow(layers: ShadowLayer[], unit: UnitMode): GeneratedOutput {
  const notes: string[] = [];
  if (layers.length === 0) return { css: 'box-shadow: none;', tailwind: 'shadow-none', notes };
  const val = shadowValue(layers, unit);
  const twPart = layers
    .slice(0, MAX_SHADOW_LAYERS)
    .map(clampShadowLayer)
    .map((l) => {
      const rgb = hexToRgb(l.color) ?? { r: 0, g: 0, b: 0 };
      const hex = rgbToHex(rgb);
      const colorTok = l.alpha < 1 ? `rgba(${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)},${l.alpha})` : hex;
      return `${l.inset ? 'inset_' : ''}${fmtLen(l.x, unit)}_${fmtLen(l.y, unit)}_${fmtLen(l.blur, unit)}_${fmtLen(l.spread, unit)}_${colorTok}`;
    })
    .join(',');
  notes.push('Layered or custom shadows use a Tailwind arbitrary shadow-[...] value so offsets, spread and alpha stay exact.');
  return {
    css: `.shadow-box {\n  box-shadow: ${val};\n}`,
    tailwind: `shadow-[${twPart}]`,
    notes,
  };
}

export function glassContrastInfo(glass: GlassState, backdropRgb: RGB): { ratio: string; passesAA: boolean } {
  const tintRgb = hexToRgb(glass.tint) ?? { r: 255, g: 255, b: 255 };
  const textRgb = hexToRgb(glass.textColor) ?? { r: 11, g: 15, b: 25 };
  const effectiveBg = compositeOver(tintRgb, glass.alpha, backdropRgb);
  const r = contrastRatio(textRgb, effectiveBg);
  return { ratio: formatRatio(r), passesAA: r >= 4.5 };
}

export function generateGlass(glass: GlassState, unit: UnitMode): GeneratedOutput {
  const blur = clamp(Math.round(glass.blur), 0, 64);
  const sat = clamp(Math.round(glass.saturation), 50, 200);
  const alpha = clamp(Math.round(glass.alpha * 100) / 100, 0, 1);
  const borderAlpha = clamp(Math.round(glass.borderAlpha * 100) / 100, 0, 1);
  const radius = clamp(Math.round(glass.radius), 0, 64);
  const bg = rgbaCss(glass.tint, alpha);
  const fallbackBg = rgbaCss(glass.tint, Math.min(0.95, Math.max(0.85, alpha + 0.5)));
  const borderCol = rgbaCss('#ffffff', borderAlpha);
  const notes: string[] = [];

  const filterExpr = `blur(${blur}px)${sat !== 100 ? ` saturate(${sat}%)` : ''}`;
  const css = [
    '.glass-card {',
    `  background: ${bg};`,
    `  -webkit-backdrop-filter: ${filterExpr};`,
    `  backdrop-filter: ${filterExpr};`,
    `  border: 1px solid ${borderCol};`,
    `  border-radius: ${fmtLen(radius, unit)};`,
    `  color: ${glass.textColor};`,
    '}',
    '@supports not (backdrop-filter: blur(1px)) {',
    '  .glass-card {',
    `    background: ${fallbackBg};`,
    '  }',
    '}',
  ].join('\n');

  const blurClass = BLUR_SCALE[blur] ?? `backdrop-blur-[${blur}px]`;
  if (!BLUR_SCALE[blur]) notes.push(`${blurClass}: blur ${blur}px uses an arbitrary backdrop-blur value.`);
  const radiusClass = RADIUS_SCALE[radius] ?? `rounded-[${fmtLen(radius, unit)}]`;
  if (!RADIUS_SCALE[radius]) notes.push(`${radiusClass}: radius ${radius}px is not on the default rounded scale.`);
  const twTint = hexToRgb(glass.tint) ?? { r: 255, g: 255, b: 255 };
  const bgClass = `bg-[${rgbToHex(twTint)}]/${Math.round(alpha * 100)}`;
  notes.push('Add a solid fallback background class (e.g. supports-not-[backdrop-filter]:bg-white/90) if older browsers must be supported.');

  return {
    css,
    tailwind: `${bgClass} ${blurClass} border border-white/${Math.round(borderAlpha * 100)} ${radiusClass}`,
    notes,
  };
}

export function gradientCssValue(g: GradientState): string {
  const stops = [...g.stops].sort((a, b) => a.pos - b.pos).map((s) => `${s.color} ${clamp(s.pos, 0, 100)}%`).join(', ');
  if (g.kind === 'linear') return `linear-gradient(${clamp(Math.round(g.angle), 0, 360)}deg, ${stops})`;
  if (g.kind === 'radial') return `radial-gradient(${g.radialShape} at center, ${stops})`;
  if (g.kind === 'conic') return `conic-gradient(from ${clamp(Math.round(g.angle), 0, 360)}deg at 50% 50%, ${stops})`;
  const layers = g.meshPoints
    .slice(0, MAX_MESH_POINTS)
    .map((pt) => `radial-gradient(at ${clamp(pt.x, 0, 100)}% ${clamp(pt.y, 0, 100)}%, ${pt.color} 0px, transparent ${clamp(pt.size, 15, 95)}%)`);
  return layers.join(', ');
}

export function generateGradient(g: GradientState): GeneratedOutput {
  const val = gradientCssValue(g);
  const notes: string[] = [];
  const css =
    g.kind === 'mesh'
      ? `.gradient-bg {\n  background-color: ${g.meshBase};\n  background-image: ${val};\n}`
      : `.gradient-bg {\n  background-image: ${val};\n}`;
  const twVal = twArbitrary(val);
  notes.push('Gradients emit Tailwind v4 bg-[image:...] arbitrary values so exact color stops and angles are preserved.');
  const tailwind = g.kind === 'mesh' ? `bg-[${g.meshBase}] bg-[image:${twVal}]` : `bg-[image:${twVal}]`;
  return { css, tailwind, notes };
}

export const CLIP_PRESETS: Record<ClipPreset, { label: string; value: string }> = {
  none: { label: 'None', value: 'none' },
  circle: { label: 'Circle', value: 'circle(50% at 50% 50%)' },
  ellipse: { label: 'Ellipse', value: 'ellipse(48% 36% at 50% 50%)' },
  triangle: { label: 'Triangle', value: 'polygon(50% 0%, 0% 100%, 100% 100%)' },
  diamond: { label: 'Diamond', value: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' },
  hexagon: { label: 'Hexagon', value: 'polygon(25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%)' },
  custom: { label: 'Custom polygon', value: '' },
};

export function radiusCssValue(r: RadiusState, unit: UnitMode): string {
  if (r.linked && !r.organic) return fmtLen(r.tl, unit);
  const h = `${fmtLen(r.tl, unit)} ${fmtLen(r.tr, unit)} ${fmtLen(r.br, unit)} ${fmtLen(r.bl, unit)}`;
  if (!r.organic) return h;
  const v = `${fmtLen(r.tlV, unit)} ${fmtLen(r.trV, unit)} ${fmtLen(r.brV, unit)} ${fmtLen(r.blV, unit)}`;
  return `${h} / ${v}`;
}

export function clipPathValue(r: RadiusState): string {
  if (r.clipPreset === 'none') return 'none';
  if (r.clipPreset === 'custom') {
    const clean = r.customPolygon.trim();
    return clean ? `polygon(${clean.replace(/^polygon\(|\)$/gi, '')})` : 'none';
  }
  return CLIP_PRESETS[r.clipPreset].value;
}

export function generateRadius(r: RadiusState, unit: UnitMode): GeneratedOutput {
  const rad = radiusCssValue(r, unit);
  const clip = clipPathValue(r);
  const notes: string[] = [];
  const lines = ['.shaped-box {', `  border-radius: ${rad};`];
  if (clip !== 'none') lines.push(`  clip-path: ${clip};`);
  lines.push('}');

  let radTw: string;
  if (r.linked && !r.organic && RADIUS_SCALE[r.tl]) {
    radTw = RADIUS_SCALE[r.tl]!;
  } else {
    radTw = `rounded-[${twArbitrary(rad)}]`;
    notes.push(`${radTw}: custom corner values use an arbitrary border-radius class.`);
  }
  const tw = [radTw];
  if (clip !== 'none') {
    tw.push(`[clip-path:${twArbitrary(clip)}]`);
    notes.push('clip-path uses a Tailwind arbitrary property class.');
  }
  return { css: lines.join('\n'), tailwind: tw.join(' '), notes };
}

export interface CssImportResult<T> {
  ok: true;
  value: T;
  ignored: string[];
}
export interface CssImportError {
  ok: false;
  error: string;
}

function splitTopLevelCommas(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

function splitTokensTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '(') {
      depth++;
      cur += ch;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
      cur += ch;
    } else if (/\s/.test(ch) && depth === 0) {
      if (cur) {
        out.push(cur);
        cur = '';
      }
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function parsePxNumber(token: string): number | null {
  const t = token.trim().toLowerCase();
  if (t === '0') return 0;
  const px = /^(-?\d+(?:\.\d+)?)px$/.exec(t);
  if (px) return Number(px[1]);
  const rem = /^(-?\d+(?:\.\d+)?)rem$/.exec(t);
  if (rem) return Number(rem[1]) * 16;
  return null;
}

export function importBoxShadowCss(raw: string): CssImportResult<ShadowLayer[]> | CssImportError {
  if (raw.length > MAX_IMPORT_BYTES) return { ok: false, error: 'Pasted CSS is larger than 100 KB.' };
  const t0 = performance.now();
  const bodyMatch = /(?:box-shadow\s*:\s*)?([^;{}]+)(?:;|\}|$)/i.exec(raw.trim());
  const valueText = (bodyMatch ? bodyMatch[1]! : raw).trim();
  if (!valueText || /var\(|calc\(/i.test(valueText)) {
    return { ok: false, error: 'Could not import dynamic CSS expressions like var() or calc().' };
  }
  const chunks = splitTopLevelCommas(valueText);
  const ignored: string[] = [];
  if (chunks.length > MAX_SHADOW_LAYERS) {
    ignored.push(`Only the first ${MAX_SHADOW_LAYERS} shadow layers were imported.`);
  }
  const layers: ShadowLayer[] = [];
  for (let idx = 0; idx < Math.min(chunks.length, MAX_SHADOW_LAYERS); idx++) {
    if (performance.now() - t0 > 500) return { ok: false, error: 'Could not import CSS within the 500 ms parse limit.' };
    const tokens = splitTokensTopLevel(chunks[idx]!);
    let inset = false;
    const lengths: number[] = [];
    let colorHex = '#0b0f19';
    let alpha = 1;
    let bad = false;
    for (const tok of tokens) {
      if (tok.toLowerCase() === 'inset') {
        inset = true;
        continue;
      }
      const len = parsePxNumber(tok);
      if (len !== null) {
        lengths.push(len);
        continue;
      }
      const parsed = parseColor(tok);
      if (parsed.ok) {
        colorHex = rgbToHex(parsed.rgb);
        alpha = parsed.alpha;
        continue;
      }
      bad = true;
    }
    if (bad || lengths.length < 2 || lengths.length > 4) {
      ignored.push(`Skipped unrecognized shadow layer "${chunks[idx]}"`);
      continue;
    }
    layers.push(
      clampShadowLayer({
        id: idx + 1,
        x: lengths[0]!,
        y: lengths[1]!,
        blur: lengths[2] ?? 0,
        spread: lengths[3] ?? 0,
        color: colorHex,
        alpha,
        inset,
      }),
    );
  }
  if (layers.length === 0) return { ok: false, error: 'No valid box-shadow layers found.' };
  return { ok: true, value: layers, ignored };
}

export function importGradientCss(raw: string): CssImportResult<Partial<GradientState>> | CssImportError {
  if (raw.length > MAX_IMPORT_BYTES) return { ok: false, error: 'Pasted CSS is larger than 100 KB.' };
  const t0 = performance.now();
  if (/var\(|calc\(/i.test(raw)) return { ok: false, error: 'Could not import dynamic CSS expressions like var() or calc().' };
  const fnMatch = /(linear|radial|conic)-gradient\(([\s\S]+)\)/i.exec(raw.trim());
  if (!fnMatch) return { ok: false, error: 'Paste a linear-gradient(...), radial-gradient(...), or conic-gradient(...) value.' };
  const kind = fnMatch[1]!.toLowerCase() as 'linear' | 'radial' | 'conic';
  const args = splitTopLevelCommas(fnMatch[2]!);
  if (args.length < 2) return { ok: false, error: 'Gradient needs at least two color stops.' };

  let angle = 135;
  let stopStart = 0;
  const first = args[0]!;
  if (/^-?\d+(?:\.\d+)?deg$/i.test(first)) {
    angle = ((parseFloat(first) % 360) + 360) % 360;
    stopStart = 1;
  } else if (/^from\s+(-?\d+(?:\.\d+)?)deg/i.test(first)) {
    angle = ((parseFloat(RegExp.$1) % 360) + 360) % 360;
    stopStart = 1;
  } else if (/^to\s+(right|left|top|bottom)/i.test(first)) {
    const dirMap: Record<string, number> = {
      'to top': 0,
      'to right': 90,
      'to bottom': 180,
      'to left': 270,
      'to top right': 45,
      'to bottom right': 135,
      'to bottom left': 225,
      'to top left': 315,
    };
    angle = dirMap[first.toLowerCase()] ?? 180;
    stopStart = 1;
  } else if (kind === 'radial' && /^(circle|ellipse)/i.test(first)) {
    stopStart = 1;
  }

  const ignored: string[] = [];
  const rawStops = args.slice(stopStart);
  const stops: GradientStop[] = [];
  for (let i = 0; i < rawStops.length; i++) {
    if (performance.now() - t0 > 500) return { ok: false, error: 'Gradient parse exceeded 500 ms.' };
    const tokens = splitTokensTopLevel(rawStops[i]!);
    const col = parseColor(tokens[0] ?? '');
    if (!col.ok) {
      ignored.push(`Skipped stop "${rawStops[i]}"`);
      continue;
    }
    let pos = Math.round((i / Math.max(1, rawStops.length - 1)) * 100);
    if (tokens[1]) {
      const pct = /^(-?\d+(?:\.\d+)?)%$/.exec(tokens[1]);
      if (pct) pos = clamp(Math.round(Number(pct[1])), 0, 100);
      else ignored.push(`Converted non-% stop position "${tokens[1]}" automatically`);
    }
    stops.push({ id: i + 1, color: rgbToHex(col.rgb, col.alpha), pos });
  }
  if (stops.length < 2) return { ok: false, error: 'Could not find at least two valid color stops.' };
  return { ok: true, value: { kind, angle, stops }, ignored };
}
