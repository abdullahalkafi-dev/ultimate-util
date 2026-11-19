'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readJson, removeKey, writeJson } from '@/lib/storage';
import { useCreateFocusSessionMutation } from '@/store/api/resources.api';
import type { FocusSessionBody } from '@uu/shared';
import {
  isFinished, lateByMs, nextKind, outcomeOf, pauseTimer, pausedTooLong, phaseMs, remainingMs, resumeTimer, startTimer,
  type PhaseKind, type Settings, type Timer,
} from './timer';

const ACTIVE_KEY = 'uu-focus-active';
const CYCLE_KEY = 'uu-focus-cycle';
const PENDING_KEY = 'uu-focus-pending';
const CHANNEL = 'uu-focus';
/** The owner tab writes a heartbeat; another tab may adopt the timer once it is this stale. */
const STALE_MS = 6000;
/** If a timer ended this long ago, ask before counting it (sleep, closed tab). */
const LATE_PROMPT_MS = 60_000;

interface Active { timer: Timer; owner: string; beat: number }
export interface LatePrompt { timer: Timer; lastBeat: number }

const tabId = () => Math.random().toString(36).slice(2);
export const localZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function chime(ctx: AudioContext | null): boolean {
  if (!ctx) return false;
  try {
    void ctx.resume();
    const t = ctx.currentTime;
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.25 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.25 + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(t + i * 0.25);
      o.stop(t + i * 0.25 + 0.25);
    });
    return ctx.state !== 'suspended';
  } catch {
    return false;
  }
}

export function useFocusTimer(settings: Settings, onRecorded?: () => void) {
  const me = useRef(tabId());
  const audio = useRef<AudioContext | null>(null);
  const worker = useRef<Worker | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [late, setLate] = useState<LatePrompt | null>(null);
  const [next, setNext] = useState<PhaseKind>('focus');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [alertText, setAlertText] = useState('');
  const [pending, setPending] = useState(() => 0);
  const [createFocusSession] = useCreateFocusSessionMutation();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const activeRef = useRef<Active | null>(null);
  activeRef.current = active;

  const save = useCallback((a: Active | null) => {
    setActive(a);
    if (a) writeJson(ACTIVE_KEY, a); else removeKey(ACTIVE_KEY);
    channel.current?.postMessage('changed');
  }, []);

  const flush = useCallback(async () => {
    const queue = readJson<FocusSessionBody[]>(PENDING_KEY, []);
    const left: FocusSessionBody[] = [];
    for (const body of queue) {
      try { await createFocusSession(body).unwrap(); } catch { left.push(body); }
    }
    if (left.length) writeJson(PENDING_KEY, left); else removeKey(PENDING_KEY);
    setPending(left.length);
    if (left.length !== queue.length) onRecorded?.();
  }, [createFocusSession, onRecorded]);

  const record = useCallback(async (t: Timer, completed: boolean, measuredAt: number, endedAt: number) => {
    const o = outcomeOf(t, measuredAt, completed, completed ? undefined : measuredAt);
    const body: FocusSessionBody = {
      kind: t.kind,
      label: t.label.slice(0, 80),
      startedAt: new Date(t.startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      plannedSeconds: Math.max(1, Math.min(86400, Math.round(t.plannedMs / 1000))),
      actualSeconds: Math.min(86400, o.actualSeconds),
      completed: o.completed,
      timezone: localZone(),
    };
    try {
      await createFocusSession(body).unwrap();
      onRecorded?.();
    } catch {
      // Offline or signed out: keep it and retry later, so a finished session is never lost.
      const q = readJson<FocusSessionBody[]>(PENDING_KEY, []);
      q.push(body);
      writeJson(PENDING_KEY, q);
      setPending(q.length);
    }
  }, [createFocusSession, onRecorded]);

  const afterPhase = useCallback((t: Timer, completed: boolean) => {
    const s = settingsRef.current;
    let count = readJson<number>(CYCLE_KEY, 0);
    if (t.kind === 'focus' && completed) count++;
    if (t.kind === 'long-break') count = 0;
    writeJson(CYCLE_KEY, count);
    const n = nextKind(t.kind, count, s);
    setNext(n);
    save(null);
    if (completed && s.autoStart) {
      const nowMs = Date.now();
      save({ timer: startTimer(n, n === 'focus' ? t.label : '', phaseMs(n, s), nowMs), owner: me.current, beat: nowMs });
    }
  }, [save]);

  const announce = useCallback((t: Timer) => {
    const s = settingsRef.current;
    const text = t.kind === 'focus' ? 'Focus session finished. Time for a break.' : 'Break is over. Ready to focus?';
    setAlertText(text);
    if (s.sound && !chime(audio.current)) setAudioBlocked(true);
    if (s.notify && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification('Pomodoro', { body: text }); } catch { /* unsupported (e.g. Android Chrome needs a service worker) */ }
    }
    try { navigator.vibrate?.(200); } catch { /* optional */ }
  }, []);

  const complete = useCallback((a: Active, nowMs: number) => {
    const late = lateByMs(a.timer, nowMs);
    if (late > LATE_PROMPT_MS) {
      setLate({ timer: a.timer, lastBeat: a.beat });
      save(null);
      return;
    }
    announce(a.timer);
    void record(a.timer, true, nowMs, nowMs);
    afterPhase(a.timer, true);
  }, [announce, record, afterPhase, save]);

  const tick = useCallback(() => {
    const nowMs = Date.now();
    setNow(nowMs);
    const a = activeRef.current;
    if (!a) return;
    const mine = a.owner === me.current;
    const stale = nowMs - a.beat > STALE_MS;
    if (!mine && !stale) return; // another tab owns it; just mirror
    let cur = a;
    if (!mine) { cur = { ...a, owner: me.current, beat: nowMs }; save(cur); }
    if (pausedTooLong(cur.timer, nowMs)) {
      void record(cur.timer, false, cur.timer.pausedAt ?? nowMs, nowMs);
      afterPhase(cur.timer, false);
      setAlertText('A paused session was abandoned after 30 minutes.');
      return;
    }
    if (isFinished(cur.timer, nowMs)) { complete(cur, nowMs); return; }
    if (nowMs - cur.beat > 2000) save({ ...cur, beat: nowMs });
  }, [save, record, afterPhase, complete]);

  // Load persisted state, listen to other tabs, tick.
  useEffect(() => {
    const load = () => setActive(readJson<Active | null>(ACTIVE_KEY, null));
    load();
    setNext(nextKind('long-break', 0, settingsRef.current));
    setPending(readJson<FocusSessionBody[]>(PENDING_KEY, []).length);
    void flush();
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(CHANNEL);
      ch.onmessage = load;
      channel.current = ch;
    }
    const onStorage = (e: StorageEvent) => { if (e.key === ACTIVE_KEY) load(); };
    const onVis = () => tick();
    const onOnline = () => void flush();
    window.addEventListener('storage', onStorage);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(tick, 250);
    return () => {
      clearInterval(id);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVis);
      channel.current?.close();
    };
     
  }, []);

  // A Worker timer fires near the end time even when the page timers are throttled in a hidden tab (best effort).
  const endAt = active && active.timer.pausedAt === null ? Date.now() + remainingMs(active.timer, Date.now()) : null;
  useEffect(() => {
    worker.current?.terminate();
    worker.current = null;
    if (endAt === null) return;
    try {
      const src = 'onmessage=e=>setTimeout(()=>postMessage(1),e.data)';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const w = new Worker(url);
      URL.revokeObjectURL(url);
      w.onmessage = () => tick();
      w.postMessage(Math.max(0, endAt - Date.now()) + 50);
      worker.current = w;
    } catch { /* workers unavailable: visibilitychange still recovers on return */ }
    return () => { worker.current?.terminate(); worker.current = null; };
  }, [endAt, tick]);

  // Screen wake lock while running (re-requested after the tab becomes visible again).
  const running = Boolean(active && active.timer.pausedAt === null);
  useEffect(() => {
    if (!running || !settings.wakeLock || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let dead = false;
    const get = async () => {
      try { lock = await navigator.wakeLock.request('screen'); if (dead) void lock.release(); } catch { /* denied */ }
    };
    void get();
    const onVis = () => { if (document.visibilityState === 'visible') void get(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { dead = true; document.removeEventListener('visibilitychange', onVis); void lock?.release(); };
  }, [running, settings.wakeLock]);

  // Tab title.
  useEffect(() => {
    if (!active) return;
    const original = document.title;
    return () => { document.title = original; };
  }, [active]);
  useEffect(() => {
    if (active) document.title = `${Math.ceil(remainingMs(active.timer, now) / 60000)} min - ${active.timer.kind === 'focus' ? 'Focus' : 'Break'}`;
  }, [active, now]);

  /** Must be called from a click: unlocks audio and (once) asks for notification permission. */
  const prepare = useCallback(async () => {
    try {
      audio.current ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      await audio.current.resume();
      setAudioBlocked(false);
    } catch { /* no Web Audio */ }
    if (settingsRef.current.notify && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* ignore */ }
    }
  }, []);

  const otherDeviceTabActive = useMemo(
    () => Boolean(active && active.owner !== me.current && now - active.beat <= STALE_MS),
    [active, now],
  );

  const start = useCallback(async (kind: PhaseKind, label: string, minutes?: number): Promise<string | null> => {
    const cur = readJson<Active | null>(ACTIVE_KEY, null);
    if (cur && Date.now() - cur.beat <= STALE_MS) return 'A timer is already running on this device (another tab).';
    await prepare();
    setAlertText('');
    const t = Date.now();
    save({ timer: startTimer(kind, label.trim().slice(0, 80), minutes ? minutes * 60_000 : phaseMs(kind, settingsRef.current), t), owner: me.current, beat: t });
    return null;
  }, [prepare, save]);

  const pause = useCallback(() => { const a = activeRef.current; if (a) save({ ...a, timer: pauseTimer(a.timer, Date.now()), beat: Date.now() }); }, [save]);
  const resume = useCallback(() => { const a = activeRef.current; if (a) save({ ...a, timer: resumeTimer(a.timer, Date.now()), beat: Date.now() }); }, [save]);
  /** Stop early. `asCompleted` is only offered once half the time has elapsed. */
  const stop = useCallback((asCompleted: boolean) => {
    const a = activeRef.current;
    if (!a) return;
    const t = Date.now();
    void record(a.timer, asCompleted, t, t);
    afterPhase(a.timer, asCompleted);
  }, [record, afterPhase]);
  const skip = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    if (a.timer.kind !== 'focus') afterPhase(a.timer, false); else stop(false);
  }, [afterPhase, stop]);

  const resolveLate = useCallback((count: boolean) => {
    if (!late) return;
    const end = late.timer.startedAt + late.timer.plannedMs + late.timer.pausedTotalMs;
    void record(late.timer, count, count ? end : late.lastBeat, end);
    afterPhase(late.timer, count);
    setLate(null);
  }, [late, record, afterPhase]);

  return {
    active, now, late, next, audioBlocked, alertText, pending, otherDeviceTabActive,
    start, pause, resume, stop, skip, resolveLate, flush, prepare,
    remaining: active ? remainingMs(active.timer, now) : 0,
    ownerIsMe: active?.owner === me.current,
    clearAlert: () => setAlertText(''),
    enableSound: () => { void prepare().then(() => chime(audio.current)); },
  };
}
