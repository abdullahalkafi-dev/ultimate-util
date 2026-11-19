# Cron Expression Parser & Generator: gaps and decisions

- Implemented: 5 dialects (Unix 5-field, 6-field with seconds, Quartz 6–7 field, AWS EventBridge `cron(...)`, Kubernetes CronJob), plain-English summary (`cronstrue` with normalized day-of-week names), Vixie dom/dow AND vs OR rules with warnings, `L`/`W`/`#`/`?` validation, never-runs detection (`0 0 30 2 *`), DST gap & overlap detection (`Intl.DateTimeFormat`), searchable IANA timezone picker, next 1–50 runs, two-way per-field visual builder, and crontab / Kubernetes YAML / EventBridge snippet exports.
- **Locale descriptions:** descriptions are generated in English only in v1 (`cronstrue` default).
- **Calendar / text export of runs:** copyable snippets cover the expression, crontab line, Kubernetes YAML, and EventBridge; `.ics` calendar export is deferred to a future iteration.
- **Visual builder value lists:** Specific-values mode edits comma-separated values via a text field rather than per-value checkbox grids.
