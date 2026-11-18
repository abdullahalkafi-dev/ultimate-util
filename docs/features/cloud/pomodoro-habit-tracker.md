---
id: F-033
slug: pomodoro-habit-tracker
title: Habit & Focus Pomodoro Tracker
category: cloud
tier: cloud
priority: P2
status: planned
depends_on: [_shared/cloud-conventions, _shared/components, P-005]
---

# Habit & Focus Pomodoro Tracker

## 1. Summary
A focus timer with history and streaks, plus simple daily and weekly habit check-ins. The timer works for guests; sign-in saves sessions and habits across devices. Timing is based on timestamps so it stays accurate in background tabs.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Student | Studies in 25-minute blocks | Timer, breaks, a weekly chart by subject |
| Freelancer | Bills by focused time | Sessions with task labels, CSV export |
| Person building habits | Wants "read 20 min daily" | Habit with check-ins and streak |
| Remote worker | Works on laptop and phone | One active timer everywhere, history in sync |
| Someone traveling | Crosses time zones | Days and streaks stay correct |

## 3. User flow
1. Guest: timer and local history work; banner "Sign in to sync and keep history on all devices". Habits and stats are previewed, saving locally is allowed for the timer only (habits need an account in v1; verify with owner).
2. Empty state: big timer (25:00), **Start**, preset chips (25/5, 50/10, custom), label field "What are you working on?", and a first-run hint to allow notifications.
3. **Start:** the first click (user gesture) unlocks audio and, if the user chooses, asks for notification permission with a `PermissionPrompt` explainer. Optional "Keep screen awake" toggle (Wake Lock).
4. Working state: countdown, label, session counter ("Focus 3 of 4"), **Pause**, **Skip**, **Stop** (asks "Abandon or save partial?"). Tab title shows remaining time.
5. End: sound plus notification; auto-switch to break (auto-start optional); after the 4th focus a long break (15 min).
6. Done: session appended to today's log; toast with **Edit**. Stats view: Day, Week, Month tabs with chart, table alternative, streak and goal progress.
7. Habits tab: list with today's check-in checkbox, target (daily, or N times per week), streak, calendar heat map.

```
[Timer] [Habits] [Stats]       Synced · This device is active
        24:12   Focus 3/4   "Write spec" #work
   [Pause] [Skip] [Stop]       Goal today: 6/8 sessions
```

## 4. Inputs and outputs
- **Inputs:** durations (focus 1 to 180 min, short break 1 to 60, long break 1 to 120, long break every 2 to 10), label (80 chars), tags, habit name, target, check-in times, goal (sessions or minutes per day).
- **Outputs:** CSV export `focus-sessions.csv` (id, start ISO with offset, end, planned and actual minutes, type, status, label, tags, timezone) and `habits.csv`; JSON via "Export my data". Chart images optional.

## 5. Components and tech
- **Reused:** `ToolShell`, `AuthBadge`, `SyncStatus`, `SettingsPanel`, `NumberField`, `SegmentedControl`, `Tabs`, `PermissionPrompt`, `DownloadButton`, `ConfirmDialog`, `Toast`, `ErrorBanner`, `EmptyState`, `HelpPopover`, `ShortcutHint`.
- **New:** `TimerRing`, `SessionLog`, `HabitRow`, `StreakBadge`, `HeatCalendar`, `AccessibleChart` (chart with data table toggle), `ActiveTimerBanner`.
- **Browser APIs:** `Date.now()`/`performance.now()`, Notification API, Web Audio API (short generated tone, no asset), Screen Wake Lock API (verify support), `BroadcastChannel`, Page Visibility. Optional Service Worker for a scheduled notification when the page is closed is not reliable; do not promise it (verify).
- **Charts:** lightweight SVG (own) or Chart.js (MIT, verify) with table fallback.
- **Runs:** main thread; ticking is rendering only.

## 6. Behavior rules
- **Timestamp timing:** a running timer stores `startedAt` (epoch ms) and `plannedMs`; remaining = plannedMs - (now - startedAt - pausedTotal). The display refreshes by `requestAnimationFrame` or a 250 ms interval but the value is always recomputed. Hidden tabs update when visible again. Browsers throttle timers in background tabs (about 1 per second, and Chromium's intensive throttling can delay them to about once a minute after 5 minutes hidden; verify), so the end alert is scheduled from a dedicated Worker timer plus a check on `visibilitychange`. The displayed time is always exact; the alert in a hidden tab is best effort and may be late.
- **Command palette (P-002):** labels, tags and habit names are never passed to the palette indexer; the palette offers only static actions ("Start focus timer").
- **One active timer rule:** a user has one active timer record (`ActiveTimer`). Starting a timer on device B while A is running asks "Take over from Pixel 8?"; takeover stops A's timer (A shows "Moved to Work laptop"). Active timer syncs so every device displays the same countdown; only the owning device plays the end sound unless a device opts in.
- Notifications: ask only after the user starts a session and chooses "Notify me" (permission request needs a user gesture; on Android Chrome use the service worker `showNotification`, since `new Notification()` is not allowed there; iOS needs an installed PWA, verify). If denied, show in-page alert, title flash and sound. Sound needs a prior user gesture; if the browser blocks audio, show "Tap to enable sound".
- Session states: `completed`, `abandoned` (stopped before 50% or user chose Abandon, not counted in stats by default), `interrupted` (page closed while running and past end: recorded as completed if the end time passed and user confirms on return; otherwise abandoned with the elapsed time).
- Pause allowed; total paused time is stored. A session paused over 30 min is auto-abandoned (setting).
- **Day boundaries:** each session stores UTC start and the IANA timezone name plus offset at start; "day" in stats uses the user's current timezone setting (default device zone) with an optional day start hour (default 4:00 for late-night work, verify).
- **Streaks:** a day counts if goal met (default at least 1 completed focus session or the habit checked). Grace rule: one missed day per 7 is forgiven ("freeze") if enabled (default off); streak never counts future dates; editing past entries recalculates streaks.
- Habits: daily or N-per-week targets (week starts Monday or Sunday by setting); check-ins have a date (local day) and optional note; edit/undo for past 30 days with sync-safe dates.
- Edit and delete sessions: change label, tags, duration (cannot exceed 12 h), delete with Undo.
- Retention: unlimited (small data, about 200 bytes per session).

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Background tab throttling | Remaining time recomputed from timestamps, exact on return; end alert best effort (see rules) |
| Passphrase lost | Not applicable: class B, no vault |
| Quota or huge item | 100 habits cap blocks adding with a message; labels over 80 characters are rejected at input; export offered |
| Computer sleeps during a session | On wake, if end time passed: prompt "Session ended while asleep: count it?" with the planned time or elapsed active time |
| Device clock changed during a session | Detect jump over 2 min vs monotonic clock; mark session "time adjusted" and ask to keep or discard |
| DST change inside a day | Sessions use UTC; day grouping uses zone rules; a 23 or 25 hour day is handled; streak not broken by the shift |
| Traveling to a new time zone | Old sessions keep their stored zone for display; stats grouping follows the current zone setting with a banner offering "Group by zone at the time" (verify demand) |
| Midnight crossing | Session counts toward the day it started, with a setting to split; chart tooltips show both |
| Two devices start timers | Takeover prompt; if offline concurrently, both sessions are kept and flagged "overlapping" for the user to fix |
| Offline | Timer and logging work fully; sessions queue; `SyncStatus` pending; conflicts resolved per record |
| Same session edited on two devices | Last write wins per field set by `updatedAt`; delete beats edit with an Undo window |
| Token expiry or sign-out | Local logging continues; sign-out warns about unsynced items, then wipes cache |
| Notification permission denied or unsupported (iOS Safari non-PWA) | Fallback to title, sound and in-page banner; help link |
| Audio blocked by autoplay policy | "Tap to enable sound"; silent end otherwise has visual flash |
| Multi-tab | `BroadcastChannel` makes one tab the ticker owner; others mirror; duplicate end sounds suppressed |
| Habit target changed mid-week | New target applies from the change date; past weeks keep the old target |
| Huge history (10 years) | Stats are aggregated in a worker with cached daily rollups; list virtualized |
| Unicode or emoji labels and RTL tags | Stored UTF-8, normalized for search, `dir="auto"` |
| Account deleted | Server data purged within 30 days; local cache cleared on next check |
| Charts for screen-reader users | Table view toggle and text summary ("This week: 14 sessions, 5h 50m") |

## 8. Limits, performance, privacy
- Displayed time accurate within 1 s over 4 hours; stats for 5 years of data render under 300 ms from cached rollups.
- Network: auth and sync only. No third-party analytics on labels. Labels may reveal work habits, so class B is stated plainly.
- Wake Lock is released at session end; the browser also releases it when the tab is hidden, so it is requested again on `visibilitychange` while a session runs. Battery use is noted in the toggle help.

## 9. Accessibility and mobile
- Timer announces start, pause, end through `role="status"`; remaining time is not announced every second (a "Read remaining time" button instead). Keyboard: Space start/pause, S skip, Esc stop dialog. Color is never the only status signal; respects `prefers-reduced-motion` (ring animation off).
- Charts: `AccessibleChart` with table alternative; heat map cells have text values.
- Mobile: full-width ring, thumb-reach controls, PWA install for better notifications (verify), haptic vibrate at end where supported.

## 10. Data

_Registry flags: `guestAccess: local` is NOT used in v1: habits and history need an account (guest timer use is allowed but not logged); `vault: false`. Data class B. If guest-local logging is added later, set `guestAccess: local` and merge on sign-in via `MergeLocalDialog`._
- **Class B.**
- **Entities:** `FocusSession` (`id`, `ownerId`, `type` focus/short/long, `status`, `startedAt`, `endedAt`, `plannedMs`, `activeMs`, `pausedMs`, `tz`, `utcOffsetMin`, `label`, `tags[]`, `deviceId`, `adjusted`, `updatedAt`, `version`, `deleted`), `ActiveTimer` (one per user: `sessionId`, `startedAt`, `plannedMs`, `pausedAt`, `ownerDeviceId`), `Habit` (`id`, `name`, `cadence`, `targetPerWeek`, `archived`, `createdAt`), `HabitCheckIn` (`habitId`, `localDate` YYYY-MM-DD, `note`, `updatedAt`, `deleted`), `Settings` (class C: durations, auto-start, sound, day-start hour, week start, grace rule, timezone).
- **Sync:** local-first; per-record last-write-wins; `ActiveTimer` uses compare-and-set on `ownerDeviceId` and `version` to enforce one timer. Check-ins keyed by habit and date to avoid duplicates.
- **Quotas:** history unlimited (about 200 B per session); 100 habits.
- **Offline:** full. **Export:** CSV and JSON anytime. **Delete:** per session or habit (soft delete 30 days), "Clear all history" with typed confirmation, account deletion purges within 30 days.
- **Signed-out gate:** guests use the timer with local-only history (kept up to 90 days); habits and cross-device features need sign-in. On first login local sessions merge by id. **Deliberate deviation from cloud-conventions** ("no class A/B data exists for guests"): guest timer history is local-only class B data, needed so the timer is usable before sign-up; P-005 must cover this merge. **Sign-out:** account cache wiped, active timer stops after confirm. **Session expiry:** local logging continues. **Account deletion:** local cache cleared on next check.

## 11. Acceptance criteria
- [ ] A 25-minute timer left in a background tab shows the exact remaining time when the tab is shown again, and the end alert fires within 5 s in Chrome, Firefox and Safari (verify; record any browser that is later and document it).
- [ ] Putting the laptop to sleep and waking after the end prompts to count the session.
- [ ] Starting on a second device triggers a takeover prompt; only one `ActiveTimer` exists.
- [ ] Streak stays intact across a DST change and a time-zone change with the documented rule.
- [ ] Notification, sound and Wake Lock each degrade gracefully when denied or unsupported.
- [ ] Offline sessions appear on another device after reconnect with no duplicates.
- [ ] CSV export opens correctly in a spreadsheet with ISO timestamps and zone columns.
- [ ] Every chart has a table alternative reachable by keyboard.
- [ ] Editing or deleting a past session recalculates the streak and offers Undo.
- [ ] Guest sessions merge into the account at first sign-in without duplicates.

## 12. Future ideas and open questions
- Ambient sounds, task lists, Todoist-like integration, weekly email summary, focus rooms (out of scope), calendar blocks export, habit reminders by push.
- Open: guest habits allowed locally? Default day start hour (midnight vs 4:00)? Grace-day default? Whether to promise notifications when the tab is closed (needs push, provider-dependent).
