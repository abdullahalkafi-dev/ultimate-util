import { describe, expect, it } from 'vitest';
import {
  aggregate, addDays, computeStreaks, dayKey, diffDays, habitStreak, habitsCsv, sessionsCsv, summaryText, weekStart, type SessionLike,
} from './stats';
import {
  DEFAULT_SETTINGS, elapsedMs, formatClock, isFinished, lateByMs, nextKind, outcomeOf, pauseTimer, pausedTooLong, remainingMs,
  resumeTimer, sanitizeSettings, startTimer,
} from './timer';

describe('timer math from timestamps', () => {
  const t0 = 1_000_000;
  const timer = startTimer('focus', 'x', 25 * 60_000, t0);
  it('remaining depends only on timestamps (survives throttling and sleep)', () => {
    expect(remainingMs(timer, t0)).toBe(25 * 60_000);
    expect(remainingMs(timer, t0 + 10 * 60_000)).toBe(15 * 60_000);
    expect(isFinished(timer, t0 + 25 * 60_000)).toBe(true);
    // Computer slept for 3 hours: late by 2h35m, finished, remaining clamps to 0.
    expect(remainingMs(timer, t0 + 3 * 3_600_000)).toBe(0);
    expect(lateByMs(timer, t0 + 3 * 3_600_000)).toBe(3 * 3_600_000 - 25 * 60_000);
  });
  it('pause excludes paused time', () => {
    const p = pauseTimer(timer, t0 + 5 * 60_000);
    expect(remainingMs(p, t0 + 60 * 60_000)).toBe(20 * 60_000);
    expect(isFinished(p, t0 + 60 * 60_000)).toBe(false);
    const r = resumeTimer(p, t0 + 15 * 60_000);
    expect(r.pausedTotalMs).toBe(10 * 60_000);
    expect(remainingMs(r, t0 + 15 * 60_000)).toBe(20 * 60_000);
    expect(pausedTooLong(p, t0 + 5 * 60_000 + 31 * 60_000)).toBe(true);
  });
  it('outcomes', () => {
    expect(outcomeOf(timer, t0 + 10 * 60_000, false)).toEqual({ actualSeconds: 600, completed: false });
    expect(outcomeOf(timer, t0 + 99 * 60_000, true)).toEqual({ actualSeconds: 1500, completed: true });
    // Estimated from the last heartbeat when the tab was closed.
    expect(outcomeOf(timer, t0 + 99 * 60_000, false, t0 + 7 * 60_000).actualSeconds).toBe(420);
  });
  it('phase order and clock format', () => {
    const s = DEFAULT_SETTINGS;
    expect(nextKind('focus', 1, s)).toBe('short-break');
    expect(nextKind('focus', 4, s)).toBe('long-break');
    expect(nextKind('short-break', 1, s)).toBe('focus');
    expect(formatClock(24 * 60_000 + 12_000)).toBe('24:12');
    expect(formatClock(1)).toBe('00:01');
    expect(elapsedMs(timer, t0 - 5)).toBe(0);
  });
  it('sanitizes settings ranges', () => {
    const s = sanitizeSettings({ focusMin: 999, shortMin: 0, longEvery: 1, dayStartHour: 30 });
    expect([s.focusMin, s.shortMin, s.longEvery, s.dayStartHour]).toEqual([180, 1, 2, 11]);
  });
});

describe('day keys and time zones', () => {
  it('uses the zone, not UTC', () => {
    // 2026-06-10 02:30 UTC is still June 9 in New York.
    expect(dayKey(Date.parse('2026-06-10T02:30:00Z'), 'America/New_York')).toBe('2026-06-09');
    expect(dayKey(Date.parse('2026-06-10T02:30:00Z'), 'Asia/Tokyo')).toBe('2026-06-10');
  });
  it('midnight boundary and day-start hour', () => {
    const tz = 'Europe/Berlin'; // CEST, UTC+2 in June
    expect(dayKey(Date.parse('2026-06-09T21:59:59Z'), tz)).toBe('2026-06-09'); // 23:59:59
    expect(dayKey(Date.parse('2026-06-09T22:00:00Z'), tz)).toBe('2026-06-10'); // 00:00:00
    // 02:30 local with a 4:00 day start belongs to the previous day.
    expect(dayKey(Date.parse('2026-06-10T00:30:00Z'), tz, 4)).toBe('2026-06-09');
    expect(dayKey(Date.parse('2026-06-10T02:00:00Z'), tz, 4)).toBe('2026-06-10'); // 04:00
  });
  it('spring-forward day (23 hours) does not break a streak', () => {
    const tz = 'America/New_York';
    const days = [
      '2026-03-08T04:30:00Z', // Mar 7 23:30 EST
      '2026-03-09T03:30:00Z', // Mar 8 23:30 EDT (23 hour day)
      '2026-03-10T03:30:00Z', // Mar 9 23:30 EDT
    ].map((t) => dayKey(Date.parse(t), tz));
    expect(days).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
    expect(computeStreaks(days, '2026-03-09').current).toBe(3);
  });
  it('fall-back day (25 hours): both 1:30 occurrences are the same day', () => {
    const tz = 'America/New_York';
    expect(dayKey(Date.parse('2026-11-01T05:30:00Z'), tz)).toBe('2026-11-01'); // 1:30 EDT
    expect(dayKey(Date.parse('2026-11-01T06:30:00Z'), tz)).toBe('2026-11-01'); // 1:30 EST
    expect(dayKey(Date.parse('2026-11-02T04:59:00Z'), tz)).toBe('2026-11-01'); // 23:59 EST
    expect(dayKey(Date.parse('2026-11-02T05:00:00Z'), tz)).toBe('2026-11-02');
  });
  it('day arithmetic', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(diffDays('2026-01-01', '2026-03-01')).toBe(59);
    expect(weekStart('2026-03-08', 1)).toBe('2026-03-02'); // Sunday -> Monday start
    expect(weekStart('2026-03-08', 0)).toBe('2026-03-08');
  });
});

describe('streaks', () => {
  const today = '2026-05-10';
  it('counts consecutive days; today empty does not break', () => {
    expect(computeStreaks(['2026-05-07', '2026-05-08', '2026-05-09'], today)).toEqual({ current: 3, longest: 3 });
    expect(computeStreaks(['2026-05-07', '2026-05-08', '2026-05-09', today], today).current).toBe(4);
  });
  it('a missed full day breaks it', () => {
    expect(computeStreaks(['2026-05-07', '2026-05-08'], today).current).toBe(0);
    expect(computeStreaks(['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-09'], today)).toEqual({ current: 1, longest: 3 });
  });
  it('ignores future dates', () => {
    expect(computeStreaks(['2026-05-09', '2026-05-11', '2026-05-12'], today).current).toBe(1);
  });
  it('grace forgives one miss per 7 days', () => {
    const d = ['2026-05-05', '2026-05-06', '2026-05-08', '2026-05-09']; // 7th missed
    expect(computeStreaks(d, today, false).current).toBe(2);
    expect(computeStreaks(d, today, true).current).toBe(4);
    // Two misses within 7 days: second one breaks it.
    const d2 = ['2026-05-05', '2026-05-07', '2026-05-09'];
    expect(computeStreaks(d2, today, true).current).toBe(1);
    // Freeze available again after a week.
    const d3 = ['2026-04-20', '2026-04-22', '2026-04-23', '2026-04-24', '2026-04-25', '2026-04-26', '2026-04-27', '2026-04-28', '2026-04-30'];
    expect(computeStreaks(d3, '2026-04-30', true).longest).toBe(9 - 0);
  });
  it('editing past entries recalculates (pure function of the set)', () => {
    const base = ['2026-05-07', '2026-05-09'];
    expect(computeStreaks(base, today).current).toBe(1);
    expect(computeStreaks([...base, '2026-05-08'], today).current).toBe(3);
  });
  it('weekly-target habits count weeks', () => {
    // Target 3/week, Monday weeks. Week of Apr 27 and May 4 met; current week (May 4) in progress.
    const h = { targetPerWeek: 3, checkins: ['2026-04-27', '2026-04-28', '2026-04-30', '2026-05-04', '2026-05-05', '2026-05-07'] };
    expect(habitStreak(h, '2026-05-08', 1)).toEqual({ current: 2, longest: 2 });
    expect(habitStreak({ ...h, checkins: h.checkins.slice(0, 3) }, '2026-05-05', 1).current).toBe(1); // current week still open
    expect(habitStreak({ targetPerWeek: 7, checkins: ['2026-05-09'] }, today, 1).current).toBe(1);
  });
});

describe('aggregation and export', () => {
  const mk = (iso: string, mins: number, completed = true, kind: SessionLike['kind'] = 'focus', label = ''): SessionLike => ({
    id: iso, kind, label, startedAt: iso, endedAt: iso, plannedSeconds: mins * 60, actualSeconds: mins * 60, completed, timezone: 'UTC',
  });
  const now = Date.parse('2026-05-10T12:00:00Z');
  it('weekly buckets skip abandoned and breaks, group by local day', () => {
    const sessions = [mk('2026-05-10T09:00:00Z', 25), mk('2026-05-10T10:00:00Z', 25), mk('2026-05-09T23:00:00Z', 25), mk('2026-05-10T11:00:00Z', 10, false), mk('2026-05-10T11:30:00Z', 5, true, 'short-break')];
    const w = aggregate(sessions, 'week', 'UTC', 0, now);
    expect(w).toHaveLength(7);
    expect(w[6]).toMatchObject({ key: '2026-05-10', sessions: 2, minutes: 50 });
    expect(w[5]).toMatchObject({ key: '2026-05-09', sessions: 1 });
    expect(summaryText('week', w)).toBe('This week: 3 sessions, 1h 15m of focus.');
    expect(aggregate(sessions, 'month', 'UTC', 0, now)).toHaveLength(30);
    const d = aggregate(sessions, 'day', 'UTC', 0, now);
    expect(d[9]?.sessions).toBe(1);
  });
  it('csv escapes and neutralises formulas', () => {
    const csv = sessionsCsv([mk('2026-05-10T09:00:00Z', 25, true, 'focus', '=HYPERLINK("x"), a')]);
    expect(csv.split('\r\n')[0]).toContain('started_at');
    expect(csv).toContain('"\'=HYPERLINK(""x""), a"');
    expect(habitsCsv([{ name: 'Read', targetPerWeek: 7, archived: false, checkins: ['2026-05-02', '2026-05-01'] }])).toContain('Read,7,false,2026-05-01');
  });
});
