/** Time zone math (Intl only, no hardcoded offsets) and the next-run search. */
import type { FieldSpec, Parsed } from './parse';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

export interface Wall {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Only region names such as Europe/Paris, plus UTC. Abbreviations like EST are ambiguous. */
export function checkTimeZone(tz: string): string | null {
  if (tz === 'UTC' || tz === 'Etc/UTC') return null;
  if (!tz.includes('/')) return `"${tz}" is an abbreviation, not an IANA time zone. Use a name such as America/New_York.`;
  return isValidTimeZone(tz) ? null : `"${tz}" is not a known IANA time zone.`;
}

export function wallOf(tz: string, utcMs: number): Wall {
  const parts = formatter(tz).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

/** UTC offset in minutes at an instant (can be fractional-hour zones such as +05:45). */
export function offsetMinutes(tz: string, utcMs: number): number {
  const w = wallOf(tz, utcMs);
  const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

export interface WallResolution {
  /** Instants (ms) at which the wall clock shows this time: 0 in a gap, 2 in an overlap. */
  instants: number[];
  gap: boolean;
  /** For a gap: the instant just after the jump where schedulers typically catch up. */
  shifted?: number;
}

const DAY = 86_400_000;

export function resolveWall(tz: string, y: number, mo: number, d: number, h: number, mi: number, s: number): WallResolution {
  const w = Date.UTC(y, mo - 1, d, h, mi, s);
  const before = offsetMinutes(tz, w - DAY);
  const after = offsetMinutes(tz, w + DAY);
  const offsets = before === after ? [before] : [before, after];
  const instants = offsets
    .map((o) => w - o * 60_000)
    .filter((t, i) => offsetMinutes(tz, t) === offsets[i])
    .sort((a, b) => a - b);
  if (instants.length) return { instants, gap: false };
  return { instants: [], gap: true, shifted: w - before * 60_000 };
}

export interface DstChange {
  instant: number;
  kind: 'gap' | 'overlap';
  fromOffset: number;
  toOffset: number;
  wall: Wall;
}

/** Upcoming offset changes found by daily sampling and bisection to the second. */
export function upcomingDstChanges(tz: string, from: number, count = 4, days = 800): DstChange[] {
  const out: DstChange[] = [];
  let prev = offsetMinutes(tz, from);
  for (let i = 1; i <= days && out.length < count; i++) {
    const t = from + i * DAY;
    const o = offsetMinutes(tz, t);
    if (o !== prev) {
      let lo = t - DAY;
      let hi = t;
      while (hi - lo > 1000) {
        const mid = Math.floor((lo + hi) / 2);
        if (offsetMinutes(tz, mid) === prev) lo = mid;
        else hi = mid;
      }
      out.push({ instant: hi, kind: o > prev ? 'gap' : 'overlap', fromOffset: prev, toOffset: o, wall: wallOf(tz, hi - 1000) });
      prev = o;
    }
  }
  return out;
}

const daysIn = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

function nearestWeekday(y: number, mo: number, day: number): number | null {
  const dim = daysIn(y, mo);
  if (day > dim) return null;
  const dow = new Date(Date.UTC(y, mo - 1, day)).getUTCDay();
  if (dow === 6) return day === 1 ? 3 : day - 1;
  if (dow === 0) return day === dim ? day - 2 : day + 1;
  return day;
}

function lastWeekday(y: number, mo: number): number {
  const dim = daysIn(y, mo);
  const dow = new Date(Date.UTC(y, mo - 1, dim)).getUTCDay();
  return dow === 6 ? dim - 1 : dow === 0 ? dim - 2 : dim;
}

function domMatches(f: FieldSpec, y: number, mo: number, d: number): boolean {
  if (f.values.includes(d)) return true;
  const dim = daysIn(y, mo);
  return f.specials.some((s) => {
    if (s.kind === 'last') return d === dim;
    if (s.kind === 'lastMinus') return d === dim - s.n;
    if (s.kind === 'lastWeekday') return d === lastWeekday(y, mo);
    if (s.kind === 'nearestWeekday') return nearestWeekday(y, mo, s.day) === d;
    return false;
  });
}

function dowMatches(f: FieldSpec, y: number, mo: number, d: number): boolean {
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  if (f.values.includes(dow)) return true;
  const dim = daysIn(y, mo);
  return f.specials.some((s) => {
    if (s.kind === 'lastDow') return s.dow === dow && d + 7 > dim;
    if (s.kind === 'nth') return s.dow === dow && Math.ceil(d / 7) === s.n;
    return false;
  });
}

export function dayMatches(p: Parsed, y: number, mo: number, d: number): boolean {
  const dom = p.fields.find((f) => f.key === 'dom')!;
  const dow = p.fields.find((f) => f.key === 'dow')!;
  switch (p.dayRule) {
    case 'any':
      return true;
    case 'dom':
      return domMatches(dom, y, mo, d);
    case 'dow':
      return dowMatches(dow, y, mo, d);
    case 'and':
      return domMatches(dom, y, mo, d) && dowMatches(dow, y, mo, d);
    case 'or':
      return domMatches(dom, y, mo, d) || dowMatches(dow, y, mo, d);
  }
}

export interface Run {
  instant: number;
  wall: Wall;
  /** gap: the wall time does not exist that day. overlap: it happens twice. */
  dst?: 'gap' | 'overlap';
}

export interface RunSearch {
  runs: Run[];
  /** Set when fewer runs than requested exist. */
  reason?: 'none' | 'horizon' | 'timeout';
}

const valuesOf = (p: Parsed, key: string, fallback: number[]) => p.fields.find((f) => f.key === key)?.values ?? fallback;

export function nextRuns(p: Parsed, opts: { tz: string; from: number; count: number; budgetMs?: number }): RunSearch {
  if (p.reboot) return { runs: [], reason: 'none' };
  const { tz, from, count } = opts;
  const seconds = valuesOf(p, 'second', [0]);
  const minutes = valuesOf(p, 'minute', [0]);
  const hours = valuesOf(p, 'hour', [0]);
  const months = valuesOf(p, 'month', []);
  const yearField = p.fields.find((f) => f.key === 'year');
  const years = yearField && !yearField.any ? new Set(yearField.values) : null;

  const dom = p.fields.find((f) => f.key === 'dom')!;
  const febOnly = months.length === 1 && months[0] === 2 && dom.values.includes(29);
  const horizonDays = febOnly ? 366 * 30 : 366 * 10;
  const start = wallOf(tz, from);
  const budget = opts.budgetMs ?? 200;
  const t0 = performance.now();

  const runs: Run[] = [];
  for (let i = 0; i < horizonDays && runs.length < count; i++) {
    if ((i & 31) === 0 && performance.now() - t0 > budget) return { runs, reason: 'timeout' };
    const date = new Date(Date.UTC(start.y, start.mo - 1, start.d + i));
    const y = date.getUTCFullYear();
    const mo = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    if (years && !years.has(y)) continue;
    if (!months.includes(mo) || !dayMatches(p, y, mo, d)) continue;
    for (const h of hours) {
      for (const mi of minutes) {
        for (const s of seconds) {
          const r = resolveWall(tz, y, mo, d, h, mi, s);
          if (r.gap) {
            if (r.shifted! > from) runs.push({ instant: r.shifted!, wall: { y, mo, d, h, mi, s }, dst: 'gap' });
          } else {
            const t = r.instants.find((x) => x > from);
            if (t !== undefined) runs.push({ instant: t, wall: { y, mo, d, h, mi, s }, dst: r.instants.length > 1 ? 'overlap' : undefined });
          }
          if (runs.length >= count) return { runs };
        }
      }
    }
  }
  return { runs, reason: runs.length ? 'horizon' : 'none' };
}

/** Wall-clock text for a run, with the UTC offset it ran at. */
export function formatRun(tz: string, instant: number, withSeconds: boolean): { local: string; utc: string } {
  const w = wallOf(tz, instant);
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(w.y, w.mo - 1, w.d)).getUTCDay()];
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][w.mo - 1];
  const p2 = (n: number) => String(n).padStart(2, '0');
  const off = offsetMinutes(tz, instant);
  const sign = off < 0 ? '-' : '+';
  const abs = Math.abs(off);
  const time = `${p2(w.h)}:${p2(w.mi)}${withSeconds ? ':' + p2(w.s) : ''}`;
  const u = new Date(instant);
  return {
    local: `${dow} ${w.d} ${month} ${w.y} ${time} (UTC${sign}${p2(Math.floor(abs / 60))}:${p2(abs % 60)})`,
    utc: `${u.getUTCFullYear()}-${p2(u.getUTCMonth() + 1)}-${p2(u.getUTCDate())} ${p2(u.getUTCHours())}:${p2(u.getUTCMinutes())}${withSeconds ? ':' + p2(u.getUTCSeconds()) : ''} UTC`,
  };
}

export function relativeTime(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 0) return 'in the past';
  if (s < 60) return `in ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `in ${h} h ${m % 60} min` : `in ${h} h`;
  const d = Math.floor(h / 24);
  return d < 365 ? `in ${d} days` : `in ${(d / 365).toFixed(1)} years`;
}

/** Fallback when Intl.supportedValuesOf is missing. */
export const FALLBACK_ZONES = [
  'UTC', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi', 'America/Anchorage', 'America/Argentina/Buenos_Aires',
  'America/Bogota', 'America/Chicago', 'America/Denver', 'America/Halifax', 'America/Los_Angeles', 'America/Mexico_City', 'America/New_York',
  'America/Sao_Paulo', 'America/Toronto', 'Asia/Baghdad', 'Asia/Bangkok', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Jakarta',
  'Asia/Karachi', 'Asia/Kathmandu', 'Asia/Kolkata', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tehran', 'Asia/Tokyo',
  'Atlantic/Reykjavik', 'Australia/Adelaide', 'Australia/Lord_Howe', 'Australia/Perth', 'Australia/Sydney', 'Europe/Amsterdam',
  'Europe/Berlin', 'Europe/Istanbul', 'Europe/London', 'Europe/Madrid', 'Europe/Moscow', 'Europe/Paris', 'Pacific/Auckland', 'Pacific/Honolulu',
];

export function listTimeZones(): string[] {
  let zones: string[] = [];
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    zones = fn ? fn('timeZone') : [];
  } catch {
    zones = [];
  }
  if (!zones.length) zones = FALLBACK_ZONES;
  return zones.includes('UTC') ? zones : ['UTC', ...zones];
}
