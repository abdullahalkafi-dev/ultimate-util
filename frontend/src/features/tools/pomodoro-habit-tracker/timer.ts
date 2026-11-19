/** Timestamp-based focus timer math. Nothing here counts ticks; every value is derived from epoch ms. */

export type PhaseKind = 'focus' | 'short-break' | 'long-break';

export interface Settings {
  focusMin: number;
  shortMin: number;
  longMin: number;
  longEvery: number;
  autoStart: boolean;
  sound: boolean;
  notify: boolean;
  wakeLock: boolean;
  /** Hour (0-11) at which a "day" begins, so late-night work counts for the previous day. */
  dayStartHour: number;
  grace: boolean;
  weekStartsOn: 0 | 1;
}

export const DEFAULT_SETTINGS: Settings = {
  focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4,
  autoStart: false, sound: true, notify: false, wakeLock: false,
  dayStartHour: 4, grace: false, weekStartsOn: 1,
};

const clamp = (n: number, lo: number, hi: number, fallback: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback);

/** Applies the spec's ranges to anything read from storage or typed by the user. */
export function sanitizeSettings(raw: Partial<Settings> | null | undefined): Settings {
  const r = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  return {
    ...r,
    focusMin: clamp(r.focusMin, 1, 180, 25),
    shortMin: clamp(r.shortMin, 1, 60, 5),
    longMin: clamp(r.longMin, 1, 120, 15),
    longEvery: clamp(r.longEvery, 2, 10, 4),
    dayStartHour: clamp(r.dayStartHour, 0, 11, 4),
    weekStartsOn: r.weekStartsOn === 0 ? 0 : 1,
  };
}

export interface Timer {
  kind: PhaseKind;
  label: string;
  plannedMs: number;
  /** Epoch ms when the phase started. */
  startedAt: number;
  /** Epoch ms when paused, or null while running. */
  pausedAt: number | null;
  pausedTotalMs: number;
}

export const phaseMs = (kind: PhaseKind, s: Settings): number =>
  (kind === 'focus' ? s.focusMin : kind === 'short-break' ? s.shortMin : s.longMin) * 60_000;

export function startTimer(kind: PhaseKind, label: string, plannedMs: number, now: number): Timer {
  return { kind, label, plannedMs, startedAt: now, pausedAt: null, pausedTotalMs: 0 };
}

/** Active (unpaused) time spent so far. */
export function elapsedMs(t: Timer, now: number): number {
  const end = t.pausedAt ?? now;
  return Math.max(0, end - t.startedAt - t.pausedTotalMs);
}

export const remainingMs = (t: Timer, now: number): number => Math.max(0, t.plannedMs - elapsedMs(t, now));
export const isFinished = (t: Timer, now: number): boolean => t.pausedAt === null && elapsedMs(t, now) >= t.plannedMs;

export function pauseTimer(t: Timer, now: number): Timer {
  return t.pausedAt === null ? { ...t, pausedAt: now } : t;
}
export function resumeTimer(t: Timer, now: number): Timer {
  return t.pausedAt === null ? t : { ...t, pausedAt: null, pausedTotalMs: t.pausedTotalMs + Math.max(0, now - t.pausedAt) };
}

/** Epoch ms at which a running timer will finish (null while paused). */
export const endsAt = (t: Timer, now: number): number | null => (t.pausedAt === null ? now + remainingMs(t, now) : null);

/** How long ago a finished timer actually ended (0 if not finished). Used to detect sleep or a closed tab. */
export function lateByMs(t: Timer, now: number): number {
  return t.pausedAt === null ? Math.max(0, elapsedMs(t, now) - t.plannedMs) : 0;
}

export function nextKind(done: PhaseKind, completedFocusCount: number, s: Settings): PhaseKind {
  if (done !== 'focus') return 'focus';
  return completedFocusCount > 0 && completedFocusCount % s.longEvery === 0 ? 'long-break' : 'short-break';
}

/** A paused timer older than this is auto-abandoned. */
export const MAX_PAUSE_MS = 30 * 60_000;
export const pausedTooLong = (t: Timer, now: number): boolean => t.pausedAt !== null && now - t.pausedAt > MAX_PAUSE_MS;

export interface Outcome {
  actualSeconds: number;
  completed: boolean;
}

/** Outcome when a phase ends naturally (completed) or is stopped early (not completed). */
export function outcomeOf(t: Timer, now: number, finished: boolean, measuredAt?: number): Outcome {
  const at = measuredAt ?? now;
  const el = Math.min(elapsedMs(t, at), t.plannedMs);
  return { actualSeconds: Math.round((finished ? t.plannedMs : el) / 1000), completed: finished };
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
