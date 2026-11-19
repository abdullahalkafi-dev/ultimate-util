/** Day keys, streaks, aggregation and CSV export. Pure; time zone and day-start are always explicit inputs. */

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' });
    fmtCache.set(tz, f);
  }
  return f;
}

export interface LocalParts { year: number; month: number; day: number; hour: number }

/** Wall-clock parts of an instant in an IANA zone (DST-aware). */
export function localParts(ms: number, tz: string): LocalParts {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(ms))) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return { year: out.year ?? 1970, month: out.month ?? 1, day: out.day ?? 1, hour: (out.hour ?? 0) % 24 };
}

const pad = (n: number) => String(n).padStart(2, '0');
export const keyOf = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  const t = (k: string) => { const [y, m, d] = k.split('-').map(Number) as [number, number, number]; return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86_400_000);
}

/** The "tracking day" (YYYY-MM-DD) an instant belongs to: local date, shifted back if before the day-start hour. */
export function dayKey(ms: number, tz: string, dayStartHour = 0): string {
  const p = localParts(ms, tz);
  const key = keyOf(p.year, p.month, p.day);
  return p.hour < dayStartHour ? addDays(key, -1) : key;
}

export interface StreakResult { current: number; longest: number }

/**
 * Consecutive-day streaks. Today being empty does not break the streak (the day is not over).
 * With grace on, one missed day in any 7-day window is forgiven; forgiven days do not add to the count.
 * Days after `today` are ignored.
 */
export function computeStreaks(days: Iterable<string>, today: string, grace = false): StreakResult {
  const set = new Set([...days].filter((d) => d <= today));
  if (set.size === 0) return { current: 0, longest: 0 };
  const first = [...set].sort()[0] as string;
  let run = 0;
  let longest = 0;
  let lastFreeze: string | null = null;
  for (let d = first; d <= today; d = addDays(d, 1)) {
    if (set.has(d)) {
      run++;
      longest = Math.max(longest, run);
    } else if (d === today) {
      // Still in progress: neither extends nor breaks.
    } else if (grace && run > 0 && (lastFreeze === null || diffDays(lastFreeze, d) >= 7)) {
      lastFreeze = d;
    } else {
      run = 0;
    }
  }
  return { current: run, longest };
}

/** Monday- or Sunday-based week start (YYYY-MM-DD) for a day key. */
export function weekStart(key: string, weekStartsOn: 0 | 1): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const back = weekStartsOn === 1 ? (dow + 6) % 7 : dow;
  return addDays(key, -back);
}

export interface HabitLike { targetPerWeek: number; checkins: string[] }

/**
 * Habit streak. Daily habits (target 7) count consecutive days; weekly targets count consecutive weeks
 * that reached the target. The current, unfinished week never breaks the streak.
 */
export function habitStreak(h: HabitLike, today: string, weekStartsOn: 0 | 1, grace = false): StreakResult {
  if (h.targetPerWeek >= 7) return computeStreaks(h.checkins, today, grace);
  const perWeek = new Map<string, number>();
  for (const c of new Set(h.checkins)) if (c <= today) perWeek.set(weekStart(c, weekStartsOn), (perWeek.get(weekStart(c, weekStartsOn)) ?? 0) + 1);
  if (perWeek.size === 0) return { current: 0, longest: 0 };
  const thisWeek = weekStart(today, weekStartsOn);
  const first = [...perWeek.keys()].sort()[0] as string;
  let run = 0;
  let longest = 0;
  for (let w = first; w <= thisWeek; w = addDays(w, 7)) {
    if ((perWeek.get(w) ?? 0) >= h.targetPerWeek) {
      run++;
      longest = Math.max(longest, run);
    } else if (w !== thisWeek) run = 0;
  }
  return { current: run, longest };
}

export interface SessionLike {
  id: string;
  kind: 'focus' | 'short-break' | 'long-break';
  label: string;
  startedAt: string;
  endedAt: string;
  plannedSeconds: number;
  actualSeconds: number;
  completed: boolean;
  timezone: string;
}

/** Completed focus sessions only. */
export const countsAsFocus = (s: SessionLike): boolean => s.kind === 'focus' && s.completed;

export function focusDays(sessions: SessionLike[], tz: string, dayStartHour: number): Set<string> {
  const out = new Set<string>();
  for (const s of sessions) if (countsAsFocus(s)) out.add(dayKey(Date.parse(s.startedAt), tz, dayStartHour));
  return out;
}

export type Range = 'day' | 'week' | 'month';
export interface Bucket { key: string; label: string; sessions: number; minutes: number }

/** Buckets: day = 24 hours of today, week = last 7 days, month = last 30 days. */
export function aggregate(sessions: SessionLike[], range: Range, tz: string, dayStartHour: number, nowMs: number): Bucket[] {
  const today = dayKey(nowMs, tz, dayStartHour);
  const focus = sessions.filter(countsAsFocus);
  if (range === 'day') {
    const buckets: Bucket[] = Array.from({ length: 24 }, (_, h) => ({ key: String(h), label: `${pad(h)}:00`, sessions: 0, minutes: 0 }));
    for (const s of focus) {
      const t = Date.parse(s.startedAt);
      if (dayKey(t, tz, dayStartHour) !== today) continue;
      const b = buckets[localParts(t, tz).hour];
      if (b) { b.sessions++; b.minutes += s.actualSeconds / 60; }
    }
    return buckets.map((b) => ({ ...b, minutes: Math.round(b.minutes) }));
  }
  const n = range === 'week' ? 7 : 30;
  const map = new Map<string, Bucket>();
  for (let i = n - 1; i >= 0; i--) {
    const k = addDays(today, -i);
    map.set(k, { key: k, label: k.slice(5), sessions: 0, minutes: 0 });
  }
  for (const s of focus) {
    const b = map.get(dayKey(Date.parse(s.startedAt), tz, dayStartHour));
    if (b) { b.sessions++; b.minutes += s.actualSeconds / 60; }
  }
  return [...map.values()].map((b) => ({ ...b, minutes: Math.round(b.minutes) }));
}

export function summaryText(range: Range, buckets: Bucket[]): string {
  const sessions = buckets.reduce((n, b) => n + b.sessions, 0);
  const minutes = buckets.reduce((n, b) => n + b.minutes, 0);
  const h = Math.floor(minutes / 60);
  const label = range === 'day' ? 'Today' : range === 'week' ? 'This week' : 'Last 30 days';
  return `${label}: ${sessions} session${sessions === 1 ? '' : 's'}, ${h}h ${minutes % 60}m of focus.`;
}

/** Prevents spreadsheet formula injection from user labels. */
const csvCell = (v: string | number | boolean): string => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function sessionsCsv(sessions: SessionLike[]): string {
  const head = ['id', 'started_at', 'ended_at', 'planned_minutes', 'actual_minutes', 'type', 'status', 'label', 'timezone'];
  const rows = sessions.map((s) => [
    s.id, s.startedAt, s.endedAt, +(s.plannedSeconds / 60).toFixed(2), +(s.actualSeconds / 60).toFixed(2), s.kind,
    s.completed ? 'completed' : 'abandoned', s.label, s.timezone,
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function habitsCsv(habits: { name: string; targetPerWeek: number; archived: boolean; checkins: string[] }[]): string {
  const head = ['name', 'target_per_week', 'archived', 'date'];
  const rows = habits.flatMap((h) => (h.checkins.length ? [...h.checkins].sort().map((d) => [h.name, h.targetPerWeek, h.archived, d]) : [[h.name, h.targetPerWeek, h.archived, '']]));
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
