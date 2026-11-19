import { parse, rgb } from 'culori';

export type LibKind = 'palette' | 'gradient' | 'softbox';
export const KINDS: LibKind[] = ['palette', 'gradient', 'softbox'];
export const SHAPES = ['flat', 'vignette', 'ring', 'panel'] as const;
export const LOCAL_KEY = 'uu-library-v1';
export const LOCAL_CAP = 50;
export const ACCOUNT_CAP = 100;
export const NAME_MAX = 60;
export const MAX_COLORS = 20;

/** The shape shared by local items and account items (PaletteDto). */
export interface LibItem {
  id: string;
  kind: LibKind;
  name: string;
  tags: string[];
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
export type LibDraft = Pick<LibItem, 'kind' | 'name' | 'tags' | 'data'>;

export const clampName = (name: string): string => Array.from(name.trim()).slice(0, NAME_MAX).join('');

export function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const t of tags) {
    const v = typeof t === 'string' ? Array.from(t.trim().toLowerCase()).slice(0, 40).join('') : '';
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, 10);
}

/** Hex (3/4/6/8 digits) or a CSS color name to canonical lowercase hex, or null. */
export function normalizeColor(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (/^[0-9a-f]{3,8}$/i.test(s)) return null; // culori accepts bare hex; we require the # prefix
  const c = parse(s);
const o = c ? rgb(c) : undefined;  if (!o) return null;  const h = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');  const alpha = o.alpha !== undefined && o.alpha < 1 ? h(o.alpha) : '';  return `#${h(o.r)}${h(o.g)}${h(o.b)}${alpha}`;
}

export interface SoftboxData {
  kelvin: number;
  brightness: number;
  shape: (typeof SHAPES)[number];
  color?: string;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; reason: string };

export function validateData(kind: LibKind, data: unknown): Validation<Record<string, unknown>> {
  if (!data || typeof data !== 'object') return { ok: false, reason: 'Missing data' };
  const d = data as Record<string, unknown>;
  if (kind === 'palette') {
    if (!Array.isArray(d.colors)) return { ok: false, reason: 'Palette needs a colors list' };
    const bad: string[] = [];
    const colors: string[] = [];
    for (const raw of d.colors) {
      const c = normalizeColor(raw);
      if (c) colors.push(c);
      else bad.push(String(raw));
    }
    if (bad.length) return { ok: false, reason: `Invalid color${bad.length > 1 ? 's' : ''}: ${bad.slice(0, 3).join(', ')}` };
    if (colors.length < 2) return { ok: false, reason: 'A palette needs at least 2 colors' };
    if (colors.length > MAX_COLORS) return { ok: false, reason: `At most ${MAX_COLORS} colors` };
    return { ok: true, value: { ...d, colors } };
  }
  if (kind === 'gradient') {
    const stops = d.stops;
    if (!Array.isArray(stops) || stops.length < 2 || stops.length > 12) return { ok: false, reason: 'A gradient needs 2 to 12 stops' };
    const out: { color: string; pos: number }[] = [];
    for (const s of stops) {
      const color = normalizeColor((s as { color?: unknown })?.color);
      const pos = Number((s as { pos?: unknown })?.pos);
      if (!color || !Number.isFinite(pos)) return { ok: false, reason: 'Invalid gradient stop' };
      out.push({ color, pos: Math.min(100, Math.max(0, pos)) });
    }
    const type = d.type === 'radial' || d.type === 'conic' ? d.type : 'linear';
    const angle = Number.isFinite(Number(d.angle)) ? Number(d.angle) : 90;
    return { ok: true, value: { ...d, type, angle, stops: out } };
  }
  const kelvin = Number(d.kelvin);
  const brightness = Number(d.brightness);
  if (!(kelvin >= 1000 && kelvin <= 10000)) return { ok: false, reason: 'Temperature must be 1000 to 10000 K' };
  if (!(brightness >= 5 && brightness <= 100)) return { ok: false, reason: 'Brightness must be 5 to 100' };
  if (!SHAPES.includes(d.shape as never)) return { ok: false, reason: 'Shape must be flat, vignette, ring or panel' };
  const next: Record<string, unknown> = { ...d, kelvin, brightness };
  if (d.color !== undefined) {
    const c = normalizeColor(d.color);
    if (!c) return { ok: false, reason: 'Invalid softbox color' };
    next.color = c;
  }
  return { ok: true, value: next };
}

export function validateDraft(raw: unknown): Validation<LibDraft> {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'Not an object' };
  const r = raw as Record<string, unknown>;
  if (!KINDS.includes(r.kind as LibKind)) return { ok: false, reason: 'Unknown kind' };
  const kind = r.kind as LibKind;
  const name = typeof r.name === 'string' ? clampName(r.name) : '';
  if (!name) return { ok: false, reason: 'Missing name' };
  const data = validateData(kind, r.data);
  if (!data.ok) return data;
  return { ok: true, value: { kind, name, tags: cleanTags(r.tags), data: data.value } };
}

export interface ImportResult {
  drafts: LibDraft[];
  errors: { index: number; name: string; reason: string }[];
}

/** Accepts our export, a bare array of items, or a simple array of colors ("#fff" / "red"). */
export function parseImport(text: string): ImportResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { drafts: [], errors: [{ index: 0, name: 'File', reason: 'Not valid JSON' }] };
  }
  const list: unknown[] = Array.isArray(json)
    ? json
    : json && typeof json === 'object' && Array.isArray((json as { items?: unknown }).items)
      ? (json as { items: unknown[] }).items
      : json && typeof json === 'object'
        ? [json]
        : [];
  if (list.length && list.every((x) => typeof x === 'string')) {
    const colors: string[] = [];
    const errors: ImportResult['errors'] = [];
    list.forEach((x, i) => {
      const c = normalizeColor(x);
      if (c) colors.push(c);
      else errors.push({ index: i, name: String(x), reason: 'Invalid color, skipped' });
    });
    const drafts: LibDraft[] = colors.length >= 2 ? [{ kind: 'palette', name: 'Imported palette', tags: [], data: { colors } }] : [];
    if (colors.length < 2) errors.push({ index: 0, name: 'Colors', reason: 'Need at least 2 valid colors' });
    return { drafts, errors };
  }
  const drafts: LibDraft[] = [];
  const errors: ImportResult['errors'] = [];
  list.forEach((raw, index) => {
    const v = validateDraft(raw);
    if (v.ok) drafts.push(v.value);
    else errors.push({ index, name: String((raw as { name?: unknown })?.name ?? `Item ${index + 1}`), reason: v.reason });
  });
  if (!list.length) errors.push({ index: 0, name: 'File', reason: 'No items found' });
  return { drafts, errors };
}

/** Stable content key used for duplicate detection (ordered colors / stops / light settings). */
export function contentKey(item: Pick<LibItem, 'kind' | 'data'>): string {
  const d = item.data;
  if (item.kind === 'palette') return `p:${(d.colors as string[] | undefined)?.join(',')}`;
  if (item.kind === 'gradient') {
    const stops = (d.stops as { color: string; pos: number }[] | undefined) ?? [];
    return `g:${d.type}:${d.angle}:${stops.map((s) => `${s.color}@${s.pos}`).join(',')}`;
  }
  return `s:${d.kelvin}:${d.brightness}:${d.shape}:${d.color ?? ''}`;
}

export const findDuplicate = (items: LibItem[], draft: Pick<LibItem, 'kind' | 'data'>): LibItem | undefined =>
  items.find((i) => i.kind === draft.kind && contentKey(i) === contentKey(draft));

/** "Name", "Name (2)", "Name (3)" ... keeping within the name limit. */
export function uniqueName(name: string, existing: string[]): string {
  const base = clampName(name) || 'Untitled';
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n < 1000; n++) {
    const suffix = ` (${n})`;
    const candidate = Array.from(base).slice(0, NAME_MAX - suffix.length).join('') + suffix;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

export interface MergePlan {
  create: LibDraft[];
  update: { id: string; draft: LibDraft }[];
  /** Local items identical to an account item, or older than the account copy of the same name. */
  skipped: number;
  /** Local items that did not fit under the account limit. */
  overflow: number;
}

/**
 * Keep both, newest wins on same kind+name, identical content is deduped,
 * and never exceeds the account cap.
 */
export function planMerge(local: LibItem[], remote: LibItem[], cap = ACCOUNT_CAP): MergePlan {
  const plan: MergePlan = { create: [], update: [], skipped: 0, overflow: 0 };
  let room = cap - remote.length;
  const touched = new Set<string>();
  const sorted = [...local].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const seenKeys = new Set<string>();
  for (const item of sorted) {
    const key = `${item.kind}|${contentKey(item)}`;
    const draft: LibDraft = { kind: item.kind, name: item.name, tags: item.tags, data: item.data };
    if (seenKeys.has(key) || findDuplicate(remote, item)) {
      plan.skipped++;
      continue;
    }
    seenKeys.add(key);
    const sameName = remote.find((r) => r.kind === item.kind && r.name.toLowerCase() === item.name.toLowerCase() && !touched.has(r.id));
    if (sameName) {
      if (item.updatedAt > sameName.updatedAt) {
        touched.add(sameName.id);
        plan.update.push({ id: sameName.id, draft });
      } else plan.skipped++;
      continue;
    }
    if (room <= 0) {
      plan.overflow++;
      continue;
    }
    room--;
    plan.create.push(draft);
  }
  return plan;
}

const slug = (name: string): string =>
  name.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'item';

export function gradientCss(data: Record<string, unknown>): string {
  const stops = ((data.stops as { color: string; pos: number }[] | undefined) ?? []).map((s) => `${s.color} ${s.pos}%`).join(', ');
  const angle = Number(data.angle ?? 90);
  if (data.type === 'radial') return `radial-gradient(circle, ${stops})`;
  if (data.type === 'conic') return `conic-gradient(from ${angle}deg, ${stops})`;
  return `linear-gradient(${angle}deg, ${stops})`;
}

function colorVars(item: LibItem, used: Map<string, number>): [string, string][] {
  let base = slug(item.name);
  const n = (used.get(base) ?? 0) + 1;
  used.set(base, n);
  if (n > 1) base = `${base}-${n}`;
  if (item.kind === 'palette') return ((item.data.colors as string[]) ?? []).map((c, i) => [`${base}-${i + 1}`, c]);
  if (item.kind === 'gradient') return [[base, gradientCss(item.data)]];
  return [];
}

export function exportCss(items: LibItem[]): string {
  const used = new Map<string, number>();
  const lines = items.flatMap((i) => colorVars(i, used)).map(([k, v]) => `  --${k}: ${v};`);
  return `:root {\n${lines.join('\n')}\n}\n`;
}

export function exportTailwind(items: LibItem[]): string {
  const used = new Map<string, number>();
  const lines = items
    .filter((i) => i.kind === 'palette')
    .flatMap((i) => colorVars(i, used))
    .map(([k, v]) => `        '${k}': '${v}',`);
  return `// tailwind.config.js\nmodule.exports = {\n  theme: {\n    extend: {\n      colors: {\n${lines.join('\n')}\n      },\n    },\n  },\n};\n`;
}

export function exportJson(items: LibItem[]): string {
  const out = items.map(({ kind, name, tags, data }) => ({ kind, name, tags, data }));
  return JSON.stringify({ app: 'ultimate-util', type: 'library', version: 1, items: out }, null, 2);
}

/** Approximate blackbody color (Tanner Helland) for a softbox preview. */
export function kelvinToHex(kelvin: number): string {
  const t = Math.min(10000, Math.max(1000, kelvin)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** CSS background for a softbox preset thumbnail. Brightness scales the light toward black. */
export function softboxBackground(data: Record<string, unknown>): string {
  const base = typeof data.color === 'string' ? data.color : kelvinToHex(Number(data.kelvin ?? 6500));
  const level = Math.min(100, Math.max(5, Number(data.brightness ?? 100)));
  const lit = `color-mix(in srgb, ${base} ${level}%, #000)`;
  switch (data.shape) {
    case 'vignette': return `radial-gradient(circle at 50% 50%, ${lit} 25%, #000 100%)`;
    case 'ring': return `radial-gradient(circle at 50% 50%, #000 0 30%, ${lit} 34% 62%, #000 70%)`;
    case 'panel': return `radial-gradient(ellipse at 50% 40%, ${lit} 30%, #000 100%)`;
    default: return lit;
  }
}

export function describeItem(item: LibItem): string {
  const d = item.data;
  if (item.kind === 'palette') return ((d.colors as string[]) ?? []).join(' ');
  if (item.kind === 'gradient') return gradientCss(d);
  return `${d.kelvin} K, ${d.brightness}% brightness, ${d.shape}${d.color ? `, ${d.color}` : ''}`;
}

// ---- guest-local storage -------------------------------------------------
export function isLibItemArray(v: unknown): v is LibItem[] {
  return Array.isArray(v) && v.every((x) => x && typeof x.id === 'string' && validateDraft(x).ok);
}

export function newLocalId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function searchItems(items: LibItem[], query: string, tag: string | null): LibItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((i) => (!tag || i.tags.includes(tag)) && (!q || i.name.toLowerCase().includes(q) || i.tags.some((t) => t.includes(q))));
}
