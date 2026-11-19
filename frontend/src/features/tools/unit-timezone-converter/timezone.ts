import { ABBREVIATIONS, CITIES, FALLBACK_ZONES, type AbbrCandidate } from './zones-data';

/** A place on the clock: an IANA zone (follows DST rules) or a fixed UTC offset. */
export type ZoneRef = { kind: 'iana'; id: string } | { kind: 'offset'; minutes: number };

export const UTC_ZONE: ZoneRef = { kind: 'iana', id: 'UTC' };

export interface LocalTime {
  y: number;
  mo: number; // 1..12
  d: number;
  h: number;
  mi: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function dtf(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    formatters.set(zone, f);
  }
  return f;
}

export function isValidZoneId(id: string): boolean {
  try {
    dtf(id);
    return true;
  } catch {
    return false;
  }
}

/** Offset from UTC in minutes for an IANA zone at an instant (east is positive). */
export function ianaOffsetAt(utcMs: number, zone: string): number {
  const parts = dtf(zone).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

export function offsetAt(utcMs: number, zone: ZoneRef): number {
  return zone.kind === 'offset' ? zone.minutes : ianaOffsetAt(utcMs, zone.id);
}

export function localTimeAt(utcMs: number, zone: ZoneRef): LocalTime {
  const d = new Date(utcMs + offsetAt(utcMs, zone) * 60000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}

/** "UTC+5:30", "UTC-8", "UTC". */
export function formatOffset(minutes: number): string {
  if (minutes === 0) return 'UTC';
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

export function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

export function isValidDate(y: number, mo: number, d: number): boolean {
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export type Resolution =
  | { status: 'ok'; utcMs: number }
  /** Wall time does not exist (spring forward); utcMs is the shifted instant. */
  | { status: 'gap'; utcMs: number; shiftedBy: number }
  /** Wall time happens twice (fall back). */
  | { status: 'overlap'; earlier: number; later: number };

/** Turns a wall-clock time in a zone into UTC, detecting DST gaps and overlaps. */
export function resolveLocal(t: LocalTime, zone: ZoneRef): Resolution {
  const wall = Date.UTC(t.y, t.mo - 1, t.d, t.h, t.mi);
  if (zone.kind === 'offset') return { status: 'ok', utcMs: wall - zone.minutes * 60000 };
  const before = ianaOffsetAt(wall - 86400000, zone.id);
  const after = ianaOffsetAt(wall + 86400000, zone.id);
  const candidates = [...new Set([before, after])]
    .map((o) => wall - o * 60000)
    .filter((utc) => {
      const local = localTimeAt(utc, zone);
      return Date.UTC(local.y, local.mo - 1, local.d, local.h, local.mi) === wall;
    })
    .sort((a, b) => a - b);
  if (candidates.length === 1) return { status: 'ok', utcMs: candidates[0]! };
  if (candidates.length >= 2) return { status: 'overlap', earlier: candidates[0]!, later: candidates[candidates.length - 1]! };
  // Gap: interpret with the offset in force before the jump, which lands after the gap.
  const utcMs = wall - before * 60000;
  return { status: 'gap', utcMs, shiftedBy: after - before };
}

export interface Formatted {
  time: string;
  date: string;
  offset: string;
  abbr: string;
}

export function formatZoned(utcMs: number, zone: ZoneRef, hour12: boolean, locale?: string): Formatted {
  const off = offsetAt(utcMs, zone);
  const shifted = new Date(utcMs + off * 60000);
  const time = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', hour: 'numeric', minute: '2-digit', hour12 }).format(shifted);
  const date = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(shifted);
  let abbr = formatOffset(off);
  if (zone.kind === 'iana') {
    try {
      const name = new Intl.DateTimeFormat('en-US', { timeZone: zone.id, timeZoneName: 'short' })
        .formatToParts(new Date(utcMs))
        .find((p) => p.type === 'timeZoneName')?.value;
      if (name) abbr = name;
    } catch {
      /* keep offset */
    }
  }
  return { time, date, offset: formatOffset(off), abbr };
}

export function zoneLabel(zone: ZoneRef): string {
  if (zone.kind === 'offset') return formatOffset(zone.minutes);
  if (zone.id === 'UTC') return 'UTC';
  return zone.id.replace(/_/g, ' ');
}

// ---------- zone lookup ----------

let zoneCache: string[] | null = null;
export function allZones(): string[] {
  if (zoneCache) return zoneCache;
  let list: string[] = [];
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (typeof fn === 'function') list = fn.call(Intl, 'timeZone');
  } catch {
    list = [];
  }
  if (list.length === 0) list = FALLBACK_ZONES;
  if (!list.includes('UTC')) list = [...list, 'UTC'];
  zoneCache = list;
  return list;
}

/** True when the browser has no zone database listing, so only a bundled subset is available. */
export function usingFallbackZones(): boolean {
  const fn = (Intl as unknown as { supportedValuesOf?: unknown }).supportedValuesOf;
  return typeof fn !== 'function';
}

export interface ZoneOption {
  id: string;
  label: string;
  offsetLabel: string;
}

export type ZoneResolution =
  | { kind: 'ok'; zone: ZoneRef; label: string }
  | { kind: 'ambiguous'; abbr: string; options: (AbbrCandidate & { offsetLabel: string })[] }
  | { kind: 'unknown' };

const normalizeName = (s: string) => s.toLowerCase().replace(/[.,]/g, '').replace(/[_\s]+/g, ' ').trim();

/**
 * Resolves what a person typed into a zone. Ambiguous abbreviations (IST, CST...) are never
 * guessed: they return the candidates unless `choices` already holds an answer.
 */
export function resolveZoneText(text: string, atUtcMs: number, choices: Record<string, string> = {}): ZoneResolution {
  const raw = text.trim();
  if (!raw) return { kind: 'unknown' };
  const offsetMatch = /^(?:utc|gmt|z)\s*(?:([+-−])\s*(\d{1,2})(?::?(\d{2}))?)?$/i.exec(raw);
  if (offsetMatch) {
    if (!offsetMatch[1]) return { kind: 'ok', zone: UTC_ZONE, label: 'UTC' };
    const h = Number(offsetMatch[2]);
    const m = Number(offsetMatch[3] ?? 0);
    if (h > 14 || m > 59) return { kind: 'unknown' };
    const minutes = (offsetMatch[1] === '+' ? 1 : -1) * (h * 60 + m);
    return { kind: 'ok', zone: { kind: 'offset', minutes }, label: formatOffset(minutes) };
  }
  const upper = raw.toUpperCase();
  const candidates = ABBREVIATIONS[upper];
  if (candidates) {
    const picked = candidates.find((c) => c.id === choices[upper]);
    if (picked || candidates.length === 1) {
      const c = picked ?? candidates[0]!;
      return { kind: 'ok', zone: { kind: 'iana', id: c.id }, label: `${upper} (${c.label})` };
    }
    return {
      kind: 'ambiguous',
      abbr: upper,
      options: candidates.map((c) => ({ ...c, offsetLabel: formatOffset(ianaOffsetAt(atUtcMs, c.id)) })),
    };
  }
  const zones = allZones();
  const id = zones.find((z) => z.toLowerCase() === raw.toLowerCase());
  if (id) return { kind: 'ok', zone: { kind: 'iana', id }, label: zoneLabel({ kind: 'iana', id }) };
  const key = normalizeName(raw);
  const city = CITIES[key];
  if (city && isValidZoneId(city)) return { kind: 'ok', zone: { kind: 'iana', id: city }, label: zoneLabel({ kind: 'iana', id: city }) };
  // Last path segment of an IANA id ("Kathmandu", "Buenos Aires").
  const byTail = zones.filter((z) => normalizeName(z.split('/').pop()!) === key);
  if (byTail.length === 1) return { kind: 'ok', zone: { kind: 'iana', id: byTail[0]! }, label: zoneLabel({ kind: 'iana', id: byTail[0]! }) };
  return { kind: 'unknown' };
}

export function searchZones(query: string, limit = 12): ZoneOption[] {
  const q = normalizeName(query);
  if (!q) return [];
  const now = Date.now();
  const out = new Map<string, ZoneOption>();
  const add = (id: string, label: string) => {
    if (!isValidZoneId(id) || out.has(id)) return;
    out.set(id, { id, label, offsetLabel: formatOffset(ianaOffsetAt(now, id)) });
  };
  for (const [name, id] of Object.entries(CITIES)) if (name.includes(q)) add(id, `${name.replace(/\b\w/g, (c) => c.toUpperCase())} (${id})`);
  for (const id of allZones()) if (normalizeName(id).includes(q)) add(id, id.replace(/_/g, ' '));
  return [...out.values()].slice(0, limit);
}

// ---------- meeting planner ----------

export interface PlannerRow {
  zone: ZoneRef;
  /** 48 half-hour slots starting at the base zone's midnight. */
  slots: { localHour: number; localMinute: number; working: boolean; dayOffset: number }[];
}

export interface Planner {
  rows: PlannerRow[];
  /** Slot indexes where every zone is inside its working hours. */
  overlap: number[];
  startUtc: number;
}

export function buildPlanner(zones: ZoneRef[], base: ZoneRef, day: { y: number; mo: number; d: number }, workStart = 9, workEnd = 17): Planner {
  const first = resolveLocal({ ...day, h: 0, mi: 0 }, base);
  const startUtc = first.status === 'overlap' ? first.earlier : first.utcMs;
  const baseDate = Date.UTC(day.y, day.mo - 1, day.d);
  const rows = zones.map((zone): PlannerRow => ({
    zone,
    slots: Array.from({ length: 48 }, (_, i) => {
      const utc = startUtc + i * 30 * 60000;
      const lt = localTimeAt(utc, zone);
      const hourFloat = lt.h + lt.mi / 60;
      const dayOffset = Math.round((Date.UTC(lt.y, lt.mo - 1, lt.d) - baseDate) / 86400000);
      return { localHour: lt.h, localMinute: lt.mi, working: hourFloat >= workStart && hourFloat < workEnd, dayOffset };
    }),
  }));
  const overlap: number[] = [];
  for (let i = 0; i < 48; i++) if (rows.length > 0 && rows.every((r) => r.slots[i]!.working)) overlap.push(i);
  return { rows, overlap, startUtc };
}

/** Groups consecutive slot indexes into [startSlot, endSlotExclusive] windows. */
export function slotWindows(slots: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const s of slots) {
    const last = out[out.length - 1];
    if (last && last[1] === s) last[1] = s + 1;
    else out.push([s, s + 1]);
  }
  return out;
}

export function localZoneId(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
