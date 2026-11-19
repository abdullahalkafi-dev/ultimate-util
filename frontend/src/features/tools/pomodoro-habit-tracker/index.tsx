'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banner, ConfirmDialog, Dialog, EmptyState, ErrorBanner, Field, SegmentedControl, Tabs, useToast } from '@/components/ui';
import { downloadText } from '@/lib/files';
import { readJson, writeJson } from '@/lib/storage';
import { apiErrorCode, apiErrorMessage } from '@/store/api/base';
import {
  useCreateFocusSessionMutation, useCreateHabitMutation, useDeleteFocusSessionMutation, useDeleteHabitMutation,
  useListFocusSessionsQuery, useListHabitsQuery, useUpdateHabitMutation,
} from '@/store/api/resources.api';
import type { FocusSessionDto, HabitDto } from '@uu/shared';
import { aggregate, addDays, computeStreaks, dayKey, focusDays, habitStreak, habitsCsv, sessionsCsv, summaryText, type Range } from './stats';
import { DEFAULT_SETTINGS, formatClock, sanitizeSettings, type PhaseKind, type Settings } from './timer';
import { localZone, useFocusTimer } from './useFocusTimer';
import s from './styles.module.css';

const SETTINGS_KEY = 'uu-focus-settings';
const KIND_LABEL: Record<PhaseKind, string> = { focus: 'Focus', 'short-break': 'Short break', 'long-break': 'Long break' };
type View = 'timer' | 'habits' | 'stats';

function BarChart({ buckets, metric }: { buckets: { key: string; label: string; sessions: number; minutes: number }[]; metric: 'sessions' | 'minutes' }) {
  const max = Math.max(1, ...buckets.map((b) => b[metric]));
  const w = 600, h = 200, pad = 22, bw = (w - pad * 2) / buckets.length;
  return (
    <svg className={s.chart} viewBox={`0 0 ${w} ${h + 24}`} aria-hidden="true">
      {buckets.map((b, i) => {
        const bh = (b[metric] / max) * h;
        return (
          <g key={b.key}>
            <rect className={s.bar} x={pad + i * bw + 2} y={h - bh} width={Math.max(2, bw - 4)} height={bh} rx={2} />
            {(buckets.length <= 12 || i % 4 === 0) && <text className={s.axis} x={pad + i * bw + bw / 2} y={h + 14} textAnchor="middle">{b.label}</text>}
          </g>
        );
      })}
      <line x1={pad} x2={w - pad} y1={h} y2={h} stroke="currentColor" strokeOpacity=".3" />
      <text className={s.axis} x={2} y={10}>{max}</text>
    </svg>
  );
}

function EditSession({ session, onSave, onClose }: { session: FocusSessionDto; onSave: (label: string, minutes: number) => Promise<string | null>; onClose: () => void }) {
  const [label, setLabel] = useState(session.label);
  const [minutes, setMinutes] = useState(Math.round(session.actualSeconds / 60));
  const [err, setErr] = useState('');
  return (
    <Dialog open title="Edit session" onClose={onClose}
      actions={<>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" onClick={async () => {
          if (!(minutes >= 0 && minutes <= 720)) return setErr('Duration must be between 0 and 720 minutes (12 hours).');
          const e = await onSave(label.slice(0, 80), minutes);
          if (e) setErr(e); else onClose();
        }}>Save</button>
      </>}>
      <Field label="Label" hint="Up to 80 characters">{(id) => <input id={id} className="input" dir="auto" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} />}</Field>
      <Field label="Minutes actually focused">{(id) => <input id={id} className="input" type="number" min={0} max={720} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />}</Field>
      {err && <p className="error-text" role="alert">{err}</p>}
    </Dialog>
  );
}

export default function PomodoroHabitTracker() {
  const toast = useToast();
  const [view, setView] = useState<View>('timer');
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [stopOpen, setStopOpen] = useState(false);
  const tz = useMemo(localZone, []);

  const sessionsQ = useListFocusSessionsQuery();
  const habitsQ = useListHabitsQuery();
  const [createSession] = useCreateFocusSessionMutation();
  const [deleteSession] = useDeleteFocusSessionMutation();
  const [createHabit] = useCreateHabitMutation();
  const [updateHabit] = useUpdateHabitMutation();
  const [deleteHabit] = useDeleteHabitMutation();
  const refetchSessions = sessionsQ.refetch;
  const onRecorded = useCallback(() => { void refetchSessions(); }, [refetchSessions]);

  useEffect(() => { setSettingsState(sanitizeSettings(readJson<Partial<Settings>>(SETTINGS_KEY, {}))); }, []);
  const setSettings = (patch: Partial<Settings>) => {
    const next = sanitizeSettings({ ...settings, ...patch });
    setSettingsState(next);
    writeJson(SETTINGS_KEY, next);
  };

  const timer = useFocusTimer(settings, onRecorded);
  const a = timer.active;
  const sessions = useMemo(() => sessionsQ.data ?? [], [sessionsQ.data]);
  const nowMs = timer.now;
  const today = dayKey(nowMs, tz, settings.dayStartHour);
  const todayCount = useMemo(() => sessions.filter((x) => x.kind === 'focus' && x.completed && dayKey(Date.parse(x.startedAt), tz, settings.dayStartHour) === today).length, [sessions, tz, settings.dayStartHour, today]);
  const streak = useMemo(() => computeStreaks(focusDays(sessions, tz, settings.dayStartHour), today, settings.grace), [sessions, tz, settings.dayStartHour, settings.grace, today]);

  const doStart = async (kind: PhaseKind, minutes?: number) => {
    const err = await timer.start(kind, label, minutes);
    setError(err ?? '');
  };

  // ---- Timer view ----
  const elapsedShare = a ? 1 - timer.remaining / a.timer.plannedMs : 0;
  const timerView = (
    <div className="stack" style={{ gap: 16 }}>
      <div className={`panel ${s.center}`}>
        <span className={s.badge}>{a ? KIND_LABEL[a.timer.kind] : `Next: ${KIND_LABEL[timer.next]}`}{a?.timer.pausedAt ? ' (paused)' : ''}</span>
        <p className={s.clock} aria-label={a ? `${Math.ceil(timer.remaining / 60000)} minutes remaining` : 'Timer ready'}>
          {formatClock(a ? timer.remaining : (timer.next === 'focus' ? settings.focusMin : timer.next === 'short-break' ? settings.shortMin : settings.longMin) * 60_000)}
        </p>
        {a && <progress value={elapsedShare} max={1} aria-label="Progress" style={{ width: '60%' }} />}
        {a ? (
          <>
            <div dir="auto" className="muted">{a.timer.label || 'No label'}</div>
            {!timer.ownerIsMe && <p className="hint">This timer is running in another tab on this device. This tab mirrors it.</p>}
            <div className={s.actions}>
              {a.timer.pausedAt ? <button type="button" className="btn primary" onClick={timer.resume}>Resume</button> : <button type="button" className="btn primary" onClick={timer.pause}>Pause</button>}
              <button type="button" className="btn" onClick={timer.skip}>Skip</button>
              <button type="button" className="btn danger" onClick={() => setStopOpen(true)}>Stop</button>
              <button type="button" className="btn" onClick={() => toast(`${formatClock(timer.remaining)} remaining`, 'info')}>Read remaining time</button>
            </div>
          </>
        ) : (
          <>
            <Field label="What are you working on?" hint="Optional, up to 80 characters">
              {(id) => <input id={id} className="input" dir="auto" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} />}
            </Field>
            <div className={s.actions}>
              <button type="button" className="btn primary" onClick={() => void doStart(timer.next)}>Start {KIND_LABEL[timer.next].toLowerCase()}</button>
              {timer.next !== 'focus' && <button type="button" className="btn" onClick={() => void doStart('focus')}>Start focus instead</button>}
            </div>
            <div className={s.actions} role="group" aria-label="Presets">
              {[[25, 5], [50, 10]].map(([f, b]) => (
                <button key={f} type="button" className="btn sm" onClick={() => setSettings({ focusMin: f, shortMin: b })}>{f}/{b}</button>
              ))}
              <button type="button" className="btn sm" onClick={() => setShowSettings(true)}>Custom</button>
            </div>
          </>
        )}
        {error && <p className="error-text" role="alert">{error}</p>}
        <p className="hint">Goal today: {todayCount} focus session{todayCount === 1 ? '' : 's'} done. Current streak: {streak.current} day{streak.current === 1 ? '' : 's'}.</p>
      </div>
      <div aria-live="polite" role="status">
        {timer.alertText && <Banner kind="ok" onDismiss={timer.clearAlert}>{timer.alertText}</Banner>}
        {timer.audioBlocked && <Banner kind="warn">Sound was blocked by the browser. <button type="button" className="btn sm" onClick={timer.enableSound}>Tap to enable sound</button></Banner>}
      </div>
      <Banner kind="info">
        The countdown is always exact because it is computed from timestamps. The end sound and notification in a hidden or sleeping tab are best effort and can arrive late; the time is correct as soon as you return.
      </Banner>
      {timer.pending > 0 && <Banner kind="warn">{timer.pending} finished session(s) are waiting to sync. <button type="button" className="btn sm" onClick={() => void timer.flush()}>Retry now</button></Banner>}
    </div>
  );

  // ---- Habits view ----
  const habits = habitsQ.data ?? [];
  const [newHabit, setNewHabit] = useState('');
  const [target, setTarget] = useState(7);
  const [showArchived, setShowArchived] = useState(false);
  const [habitErr, setHabitErr] = useState('');
  const [delHabit, setDelHabit] = useState<HabitDto | null>(null);
  const days7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  const addHabit = async () => {
    const name = newHabit.trim();
    if (!name) return setHabitErr('Give the habit a name.');
    if (habits.length >= 100) return setHabitErr('You reached the limit of 100 habits. Archive or delete some first.');
    try {
      await createHabit({ name: name.slice(0, 120), targetPerWeek: target, checkins: [], archived: false }).unwrap();
      setNewHabit(''); setHabitErr('');
    } catch (e) { setHabitErr(apiErrorCode(e) === 'QUOTA_EXCEEDED' ? 'Habit limit reached.' : apiErrorMessage(e)); }
  };
  const patchHabit = async (h: HabitDto, patch: Partial<Pick<HabitDto, 'checkins' | 'archived'>>) => {
    try { await updateHabit({ id: h.id, body: { name: h.name, targetPerWeek: h.targetPerWeek, checkins: h.checkins, archived: h.archived, ...patch } }).unwrap(); }
    catch (e) { toast(apiErrorMessage(e), 'error'); }
  };
  const toggleDay = (h: HabitDto, d: string) =>
    patchHabit(h, { checkins: h.checkins.includes(d) ? h.checkins.filter((x) => x !== d) : [...h.checkins, d].sort() });

  const habitsView = (
    <div className="stack" style={{ gap: 16 }}>
      <div className="panel">
        <div className={s.row}>
          <Field label="New habit">{(id) => <input id={id} className="input" dir="auto" maxLength={120} value={newHabit} onChange={(e) => setNewHabit(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addHabit()} />}</Field>
          <Field label="Target days per week">{(id) => (
            <select id={id} className="select" value={target} onChange={(e) => setTarget(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n === 7 ? 'Every day' : `${n} per week`}</option>)}
            </select>
          )}</Field>
          <button type="button" className="btn primary" onClick={() => void addHabit()}>Add habit</button>
        </div>
        {habitErr && <p className="error-text" role="alert">{habitErr}</p>}
      </div>
      <label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
      {habitsQ.error && <ErrorBanner onRetry={() => void habitsQ.refetch()}>{apiErrorMessage(habitsQ.error, 'Could not load habits.')}</ErrorBanner>}
      {habitsQ.isLoading ? <p className="muted" role="status">Loading habits...</p> : habits.filter((h) => showArchived || !h.archived).length === 0 ? (
        <EmptyState icon="check" title="No habits yet">Add a habit above, then check in each day. Streaks follow your local time zone ({tz}) and day start ({settings.dayStartHour}:00).</EmptyState>
      ) : (
        <ul className={s.list}>
          {habits.filter((h) => showArchived || !h.archived).map((h) => {
            const st = habitStreak(h, today, settings.weekStartsOn, settings.grace);
            const unit = h.targetPerWeek >= 7 ? 'day' : 'week';
            return (
              <li key={h.id} className={`panel ${s.habit}`}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <strong dir="auto">{h.name}{h.archived ? ' (archived)' : ''}</strong>
                  <span className={s.badge}>Streak {st.current} {unit}{st.current === 1 ? '' : 's'} (best {st.longest})</span>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>Target: {h.targetPerWeek >= 7 ? 'every day' : `${h.targetPerWeek} days per week`}</div>
                <div className={s.days} role="group" aria-label={`Check-ins for ${h.name}, last 7 days`}>
                  {days7.map((d) => {
                    const on = h.checkins.includes(d);
                    return <button key={d} type="button" className={`btn sm ${on ? 'primary' : ''}`} aria-pressed={on} onClick={() => void toggleDay(h, d)}>{d === today ? 'Today' : d.slice(5)}{on ? ': done' : ''}</button>;
                  })}
                </div>
                <div className={s.days}>
                  <button type="button" className="btn sm" onClick={() => void patchHabit(h, { archived: !h.archived })}>{h.archived ? 'Unarchive' : 'Archive'}</button>
                  <button type="button" className="btn sm danger" onClick={() => setDelHabit(h)}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  // ---- Stats view ----
  const [range, setRange] = useState<Range>('week');
  const [metric, setMetric] = useState<'sessions' | 'minutes'>('minutes');
  const [asTable, setAsTable] = useState(false);
  const [editing, setEditing] = useState<FocusSessionDto | null>(null);
  const [removed, setRemoved] = useState<FocusSessionDto | null>(null);
  const buckets = useMemo(() => aggregate(sessions, range, tz, settings.dayStartHour, nowMs), [sessions, range, tz, settings.dayStartHour, nowMs]);
  const recent = useMemo(() => [...sessions].sort((x, y) => y.startedAt.localeCompare(x.startedAt)).slice(0, 50), [sessions]);

  const body = (x: FocusSessionDto) => ({ kind: x.kind, label: x.label, startedAt: x.startedAt, endedAt: x.endedAt, plannedSeconds: x.plannedSeconds, actualSeconds: x.actualSeconds, completed: x.completed, timezone: x.timezone });
  const removeSession = async (x: FocusSessionDto) => {
    try { await deleteSession(x.id).unwrap(); setRemoved(x); } catch (e) { toast(apiErrorMessage(e), 'error'); }
  };
  const undoRemove = async () => {
    if (!removed) return;
    try { await createSession(body(removed)).unwrap(); setRemoved(null); } catch (e) { toast(apiErrorMessage(e), 'error'); }
  };
  // The API has no update endpoint for sessions: an edit is a re-create followed by a delete.
  const editSession = async (x: FocusSessionDto, newLabel: string, minutes: number): Promise<string | null> => {
    try {
      await createSession({ ...body(x), label: newLabel, actualSeconds: Math.round(minutes * 60) }).unwrap();
      await deleteSession(x.id).unwrap();
      return null;
    } catch (e) { return apiErrorMessage(e, 'Could not save the change.'); }
  };

  const statsView = (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span className={s.badge}>Current streak: {streak.current} day{streak.current === 1 ? '' : 's'}</span>
        <span className={s.badge}>Longest: {streak.longest}</span>
        <span className={s.badge}>Zone: {tz}</span>
      </div>
      {sessionsQ.error && <ErrorBanner onRetry={() => void sessionsQ.refetch()}>{apiErrorMessage(sessionsQ.error, 'Could not load your sessions.')}</ErrorBanner>}
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Tabs<Range> label="Range" value={range} onChange={setRange} tabs={[{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }]} />
          <SegmentedControl label="Metric" value={metric} onChange={setMetric} options={[{ id: 'minutes', label: 'Minutes' }, { id: 'sessions', label: 'Sessions' }]} />
          <button type="button" className="btn sm" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>{asTable ? 'Show chart' : 'Show as table'}</button>
        </div>
        <p role="status" aria-live="polite">{summaryText(range, buckets)}</p>
        {asTable ? (
          <table className={s.table}>
            <caption className="sr-only">Focus by {range}</caption>
            <thead><tr><th scope="col">{range === 'day' ? 'Hour' : 'Date'}</th><th scope="col">Sessions</th><th scope="col">Minutes</th></tr></thead>
            <tbody>{buckets.map((b) => <tr key={b.key}><th scope="row">{b.label}</th><td>{b.sessions}</td><td>{b.minutes}</td></tr>)}</tbody>
          </table>
        ) : (
          <div role="img" aria-label={summaryText(range, buckets)}><BarChart buckets={buckets} metric={metric} /></div>
        )}
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="btn" disabled={!sessions.length} onClick={() => downloadText(sessionsCsv(sessions), 'focus-sessions.csv', 'text/csv')}>Export sessions CSV</button>
        <button type="button" className="btn" disabled={!habits.length} onClick={() => downloadText(habitsCsv(habits), 'habits.csv', 'text/csv')}>Export habits CSV</button>
      </div>
      {removed && <Banner kind="info" onDismiss={() => setRemoved(null)}>Session deleted. <button type="button" className="btn sm" onClick={() => void undoRemove()}>Undo</button></Banner>}
      <h2 className="panel-title">Session log</h2>
      {sessionsQ.isLoading ? <p className="muted" role="status">Loading...</p> : recent.length === 0 ? (
        <EmptyState icon="timer" title="No sessions yet">Finish a focus session and it appears here.</EmptyState>
      ) : (
        <ul className={s.list}>
          {recent.map((x) => (
            <li key={x.id} className={`panel ${s.session}`}>
              <span>
                <strong dir="auto">{x.label || KIND_LABEL[x.kind]}</strong>{' '}
                <span className="muted">{KIND_LABEL[x.kind]}, {Math.round(x.actualSeconds / 60)} of {Math.round(x.plannedSeconds / 60)} min, {x.completed ? 'completed' : 'not completed'}, {new Date(x.startedAt).toLocaleString()}</span>
              </span>
              <span className={s.days}>
                <button type="button" className="btn sm" onClick={() => setEditing(x)} aria-label={`Edit session ${x.label || x.startedAt}`}>Edit</button>
                <button type="button" className="btn sm danger" onClick={() => void removeSession(x)} aria-label={`Delete session ${x.label || x.startedAt}`}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const num = (key: keyof Settings, label: string, min: number, max: number) => (
    <Field label={label}>{(id) => <input id={id} className="input" type="number" min={min} max={max} value={Number(settings[key])} onChange={(e) => setSettings({ [key]: Number(e.target.value) } as Partial<Settings>)} />}</Field>
  );
  const check = (key: keyof Settings, label: string, extra?: React.ReactNode) => (
    <label className="check"><input type="checkbox" checked={Boolean(settings[key])} onChange={(e) => setSettings({ [key]: e.target.checked } as Partial<Settings>)} /> {label}{extra}</label>
  );

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Tabs<View> label="Sections" value={view} onChange={setView} tabs={[{ id: 'timer', label: 'Timer' }, { id: 'habits', label: 'Habits' }, { id: 'stats', label: 'Stats' }]} />
        <button type="button" className="btn" onClick={() => setShowSettings(true)}>Settings</button>
      </div>
      {view === 'timer' ? timerView : view === 'habits' ? habitsView : statsView}

      <Dialog open={showSettings} title="Timer settings" onClose={() => setShowSettings(false)} actions={<button type="button" className="btn primary" onClick={() => setShowSettings(false)}>Done</button>}>
        <div className="grid-2">
          {num('focusMin', 'Focus (minutes, 1-180)', 1, 180)}
          {num('shortMin', 'Short break (1-60)', 1, 60)}
          {num('longMin', 'Long break (1-120)', 1, 120)}
          {num('longEvery', 'Long break every N focus sessions (2-10)', 2, 10)}
          {num('dayStartHour', 'Day starts at hour (0-11)', 0, 11)}
        </div>
        {check('autoStart', 'Start the next phase automatically')}
        {check('sound', 'Play a chime at the end')}
        {check('notify', 'Show a notification at the end', <span className="hint"> (permission is asked when you press Start)</span>)}
        {'wakeLock' in (typeof navigator === 'undefined' ? {} : navigator)
          ? check('wakeLock', 'Keep the screen awake while running', <span className="hint"> (uses more battery)</span>)
          : <p className="hint">Keeping the screen awake is not supported in this browser.</p>}
        {check('grace', 'Grace day: forgive one missed day per 7 in streaks')}
        <SegmentedControl label="Week starts on" value={String(settings.weekStartsOn)} onChange={(v) => setSettings({ weekStartsOn: v === '0' ? 0 : 1 })} options={[{ id: '1', label: 'Monday' }, { id: '0', label: 'Sunday' }]} />
        <p className="hint">Notifications and sound in a hidden tab are best effort. Unsupported browsers (for example iOS Safari outside an installed web app) fall back to the in-page alert and the tab title.</p>
      </Dialog>

      <ConfirmDialog open={stopOpen} title="Stop this session?" confirmLabel="Abandon"
        danger
        message={a && a.timer.kind === 'focus' && timer.remaining <= a.timer.plannedMs / 2
          ? <>You are past halfway. Abandon it (recorded as not completed), or{' '}<button type="button" className="btn sm" onClick={() => { setStopOpen(false); timer.stop(true); }}>Save as completed</button></>
          : 'It will be recorded as not completed, with the time you focused.'}
        onCancel={() => setStopOpen(false)} onConfirm={() => { setStopOpen(false); timer.stop(false); }} />

      <ConfirmDialog open={Boolean(timer.late)} title="A session ended while you were away"
        confirmLabel="Count it"
        message={<>The timer ran out while this page was closed or the computer was asleep. Count it as completed ({timer.late ? Math.round(timer.late.timer.plannedMs / 60000) : 0} min)? Choosing Cancel records it as not completed.</>}
        onCancel={() => timer.resolveLate(false)} onConfirm={() => timer.resolveLate(true)} />

      <ConfirmDialog open={Boolean(delHabit)} danger title="Delete this habit?" confirmLabel="Delete"
        message={`"${delHabit?.name ?? ''}" and its check-ins are removed. Consider archiving instead.`}
        onCancel={() => setDelHabit(null)}
        onConfirm={() => { const h = delHabit; setDelHabit(null); if (h) void deleteHabit(h.id).unwrap().catch((e) => toast(apiErrorMessage(e), 'error')); }} />

      {editing && <EditSession session={editing} onClose={() => setEditing(null)} onSave={(l, m) => editSession(editing, l, m)} />}
    </div>
  );
}
