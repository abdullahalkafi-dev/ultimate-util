---
id: F-022
slug: cron-parser
title: Cron Expression Parser & Generator
category: developer
tier: client
priority: P1
status: planned
depends_on: []
---

# Cron Expression Parser & Generator

## 1. Summary
Type a cron expression and see it in plain English with the next 10 run times in any timezone, or build one with a visual editor. A dialect selector handles Unix 5-field, Quartz, AWS EventBridge and Kubernetes CronJob, whose rules differ in ways that cause real outages.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Developer | Inherits `0 2 * * 1-5` in a repo | "At 02:00 AM, Monday through Friday" and the next runs |
| DevOps | Writes a Kubernetes CronJob | Valid 5-field schedule, timezone note, YAML snippet to copy |
| AWS engineer | EventBridge rejects a Unix cron | Switches dialect, sees required 6 fields, `?` rules and exact error |
| Ops (non-obvious) | Job runs at the wrong time twice a year | Previews DST gap and overlap days for the chosen timezone |
| Beginner | Needs "every 15 minutes on weekdays" | Builds it visually and copies the line |

## 3. User flow
1. Empty state: expression field with a placeholder, dialect `SegmentedControl`, timezone select, **Try an example** list (every 5 min, weekdays 9:00, first Monday).
2. User types or edits. Live parse (debounce about 150 ms). Output card: human text, field-by-field breakdown (minute, hour, day-of-month, month, day-of-week), and warnings.
3. **Next runs** list (default 10, up to 50): date/time in selected timezone, plus UTC and relative ("in 3 h"). Toggle "Show UTC".
4. **Builder** `Tabs`: each field has Every / Specific values / Range / Step / (dialect extras like Last, Weekday, Nth). Changing it rewrites the expression, and typing in the expression updates the builder.
5. Errors: `ErrorBanner` with the exact field and reason ("Day-of-week: value 8 is out of range 0-7"). The faulty field is highlighted in the breakdown.
6. Done state: `CopyButton` for the expression, a `crontab` line (`<expr> command`), Kubernetes CronJob YAML, or EventBridge `cron(...)` form.

```
[ */15 9-17 * * 1-5 ]  Dialect [Unix 5-field v]  Timezone [Asia/Dhaka v]
"Every 15 minutes, between 09:00 and 17:59, Monday through Friday"
 min | hour | dom | month | dow         Next runs: Mon 19 Nov 09:00 ...
 Builder | Examples | Dialect notes        [Copy] [Copy as crontab] [Copy as K8s YAML]
```

## 4. Inputs and outputs
- **Inputs:** expression (5, 6 or 7 fields, or `@yearly @monthly @weekly @daily @midnight @hourly @reboot`), dialect, IANA timezone, start date/time (default now), run count (1 to 50).
- **Outputs:** English description (UI language, English first), next run list (copy as text/CSV/ICS later), normalized expression, copyable snippets (crontab line, Kubernetes YAML, EventBridge expression). No files required.

## 5. Components and tech
- **UI:** `ToolShell`, `CodeEditor` (single line) or plain field, `SegmentedControl`, `Tabs`, `SettingsPanel`, `NumberField`, `CopyButton`, `CodeOutput`, `ErrorBanner`, `EmptyState`, `HelpPopover`, `Tooltip`. New: `TimezoneSelect` (searchable IANA list via `Intl.supportedValuesOf('timeZone')`, with fallback list; verify support), `CronBuilder` (per-field editors), `RunList`.
- **Libraries:** `cronstrue` (MIT) for descriptions with locale support (verify dialect/Quartz coverage); `cron-parser` (MIT) for next runs (verify Quartz `L W #`, seconds, DST handling). A thin own validator and dialect layer is likely needed because libraries do not cover EventBridge or `?` rules fully (verify). `Intl.DateTimeFormat` for timezone display.
- **Where it runs:** main thread; computation is small.

## 6. Behavior rules
- **Dialects:** Unix 5-field (min hour dom month dow); Quartz 6-7 fields (sec min hour dom month dow [year]); AWS EventBridge rules `cron(min hour dom month dow year)`, 6 fields, requires `?` in either dom or dow, day-of-week 1-7 (1 = Sunday) or SUN-SAT, no seconds, times UTC (EventBridge Scheduler is a different service that accepts a timezone; verify); Kubernetes CronJob 5-field, supports `@yearly/@monthly/@weekly/@daily/@hourly` but not `@reboot`, no `L W #`, timezone set with `.spec.timeZone` (stable since v1.27; `CRON_TZ`/`TZ` inside the schedule string is not officially supported; verify), and without it the controller's timezone (usually UTC) applies. Each dialect has a notes panel listing differences. Dialect is auto-suggested from field count but never forced.
- **Day-of-month and day-of-week (Unix/Vixie):** if both fields are restricted, the job runs when **either** matches (OR). In Vixie/cronie the test is whether the field *starts with* `*`: with `*` or `*/2` in either field, both fields must match (AND), so `0 0 */2 * 5` means "every second day that is also a Friday", not an OR (verify against cronie and K8s/robfig behavior; implement as a named test fixture). Quartz and EventBridge differ: one of them must be `?` (AND is not offered), so the tool shows a clear warning whenever a Unix expression restricts both fields: "Runs on the 15th OR on Fridays, not only Friday the 15th."
- Day-of-week: 0 and 7 are both Sunday in Unix; in Quartz 1 = Sunday to 7 = Saturday; names (`MON-FRI`, `JAN`) accepted case-insensitively. The Vixie crontab(5) man page says ranges and lists of names are not allowed while most other schedulers accept them; the tool accepts them and shows a dialect note (verify). The breakdown shows numbers normalized and the dialect numbering used.
- Special tokens (Quartz/EventBridge): `L` (last day or last weekday), `W` (nearest weekday), `#` (nth weekday, e.g. `6#3`), `?`. Rejected in Unix mode with a message naming the dialect that supports them.
- Steps and ranges: `*/15`, `5-30/5`, `1-5/2`. `*/N` starts at the field minimum, not "every N from now". A note flags steps that do not divide evenly (`*/45` minutes runs at :00 and :45, then again at :00).
- Names and lists combined: `MON,WED-FRI`. Overlaps are deduplicated.
- Timezone: next runs computed in the chosen IANA timezone (default browser). EventBridge dialect forces UTC and says so.
- **DST:** spring-forward gap (a time that does not exist): Unix cron implementations vary; the tool shows the run as "skipped or shifted (depends on scheduler)" with a marker. Fall-back overlap (time occurs twice): marked "runs once or twice depending on scheduler". Preview highlights the next DST change dates for the zone.
- `@reboot` has no schedule: description says "At system startup", no run list.
- Run list is capped at 50 runs and searches up to 10 years ahead (or until none exist); "never runs" cases (`0 0 30 2 *`) are detected.
- Only settings (dialect, timezone) are saved; expressions are not persisted by default. Shareable link may carry expression, dialect and timezone (no secrets involved).

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Empty input | Empty state; example list |
| Wrong field count (4 or 8) | "Expected 5 fields (Unix), found 4" with dialect suggestion |
| Value out of range (`60 * * * *`, month 13) | Exact field and allowed range |
| Reversed range (`30-10`) | Error; some engines allow wrap for dow (`5-1`), tool states if dialect supports it |
| `*/0` or step larger than range | Error for zero; warning for step bigger than field span |
| Feb 30 / Apr 31 (`0 0 30 2 *`) | "Never runs: February has at most 29 days" |
| Feb 29 (`0 0 29 2 *`) | Runs only in leap years; list shows next at year X; search horizon extended |
| dom and dow both restricted | OR-semantics warning (see rules) |
| Quartz `?` used in both dom and dow | Error: only one may be `?` |
| `L`, `W`, `#` in Unix mode | Error naming Quartz/EventBridge; offer to switch dialect |
| `LW`, `L-3`, `15W` when 15th is Saturday/Sunday | Quartz semantics applied; description explains; W never crosses month boundary |
| Names in lowercase / mixed, `SUN-SAT` | Accepted |
| Sunday as 0 vs 7 vs 1 (Quartz) | Normalized and displayed per dialect |
| `@daily`, `@hourly`, `@reboot` | Expanded to equivalent; `@reboot` special-cased |
| Seconds field in 5-field dialect | Error; offer Quartz conversion |
| Spring-forward gap, e.g. `30 2 * * *` in `America/New_York` | Gap day flagged in run list |
| Fall-back overlap, `30 1 * * *` | Overlap day flagged |
| Timezone unsupported or abbreviation (`EST`) | Only IANA names accepted; suggest `America/New_York` |
| Half-hour/45-min offset zones (`Asia/Kathmandu`) | Handled via `Intl`; no hardcoded offsets |
| Browser lacks `Intl.supportedValuesOf`, or its list omits `UTC` (some browsers do) | Fallback bundled timezone list; `UTC` is always added |
| Vixie `*/2` in dom with dow restricted | AND semantics per the rule above, with a note explaining it |
| K8s dialect with `@reboot`, `L`, `W`, `#` or `CRON_TZ=` in the schedule | Error naming the limitation and pointing to `.spec.timeZone` |
| Date arithmetic across DST in a zone with a 30 or 45 minute shift (`Australia/Lord_Howe`) | Handled by `Intl`/library, not by assuming 1 hour; covered by a fixture |
| Mobile: expression field auto-capitalizes or inserts smart punctuation | Field sets `autocapitalize=off`, `autocorrect=off`, `spellcheck=false`; en/em dashes pasted are flagged |
| Non-ASCII/RTL characters in the expression | Error points to the character; description text in LTR |
| Very long input or 10,000-char paste | Rejected over 200 chars with message |
| Cancel/clear | Resets fields; keeps dialect and timezone |

## 8. Limits, performance, privacy
- Parse and describe under 20 ms; next-run search bounded (max 50 runs, 10-year horizon, time-boxed to 200 ms with "searching" message).
- Network: none. Timezone data comes from the browser's `Intl`.
- Stored locally: dialect, timezone, builder preferences.

## 9. Accessibility and mobile
- Each field of the breakdown is a labeled output; errors are tied to the input with `aria-describedby`. Run list is a real list; relative times have full dates available. Builder controls are standard selects and checkboxes.
- Mobile: breakdown stacks; builder in a bottom `Sheet`; run list scrolls inside a card; numeric keypad hint avoided (expression needs symbols), symbol buttons row provided.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] `*/15 9-17 * * 1-5` shows correct English and the next 10 runs equal the output of a reference implementation (e.g. Python `croniter`, generated once as a fixture) for 5 different start times and 3 timezones.
- [ ] `0 0 */2 * 5` follows the documented AND rule, and `0 0 15 * 5` follows the OR rule.
- [ ] `0 0 15 * 5` shows the OR warning and runs on both the 15th and Fridays.
- [ ] Quartz `0 0 12 ? * 6#3` is described as "third Friday" and rejected in Unix mode.
- [ ] EventBridge mode rejects an expression without `?` and shows UTC.
- [ ] The next-run search for any valid expression returns or reports "none" within 200 ms.
- [ ] `0 0 30 2 *` reports "never runs".
- [ ] DST gap and overlap dates are flagged for `America/New_York`.
- [ ] Invalid input names the exact field and allowed range.
- [ ] Copy as crontab and Kubernetes YAML produce valid text.
- [ ] No network request is made.

## 12. Future ideas and open questions
- Compare two expressions, export runs to calendar (ICS), systemd timer (`OnCalendar`) and GitHub Actions/Jenkins/Spring variants, runs-per-day heat map, plain-English to cron input.
- Open: confirm which Kubernetes versions to document for `timeZone`. How should DST gap/overlap be described by default (skip, shift, or "depends")?
