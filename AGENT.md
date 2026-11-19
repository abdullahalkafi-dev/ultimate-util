# AGENT.md

Entry point for any AI agent working on this project. Read this first, then `docs/`.

## Project
Ultimate Util: one fast, searchable web platform of utility tools.
- Client-side tools: run 100% in the browser, no login, nothing uploaded.
- Cloud-synced tools: Google OAuth, encrypted/personal data in a database.

## Current phase
**Build phase (2026-11-19).** Specs and design are approved. Backend and frontend foundation are pushed; tools are partly built. See `docs/handoff/2026-11-19-status-and-next-steps.md` before doing anything.

## Rules
1. Do not start coding until the user gives: (a) preferred code structure, (b) credentials, (c) deployment and domain access, in that order.
2. Every decision, change, idea and user command is recorded in `docs/` with a date (YYYY-MM-DD). Update docs in the same turn as the change.
3. Client-side tools never send files to a server and never store them in a database.
4. Never store secrets in docs. Record only where they live.
5. Keep answers as short summaries unless the user asks for detail.
6. Every feature has a spec in docs/features; update the spec and the changelog with any scope change.

## Docs map
- `docs/README.md`: index
- `docs/handoff/`: dated status reports. The newest one says what is done, what is not and what to do next
- `docs/00-context.md`: current context and status (dated)
- `docs/01-feature-spec.md`: tool list and scope summary (33 tools + 5 platform features)
- `docs/02-decisions.md`: decision log
- `docs/03-changelog.md`: dated changes and user commands
- `docs/04-ui-design.md`: UI direction and approved design notes
- `docs/features/README.md`: feature index, badge semantics, how to add a feature (spec + registry entry)
- `docs/features/<category>/*.md`: one spec per feature (`_TEMPLATE.md` is the template)
- `docs/features/_shared/conventions.md`: rules for every tool, including the tool registry fields
- `docs/features/_shared/components.md`: reusable component catalog
- `docs/features/_shared/cloud-conventions.md`: auth, encryption, sync and quotas for cloud tools
- `docs/features/_shared/research-notes.md`: library findings, risks, spikes
- `docs/features/_shared/open-questions.md`: owner decisions needed before coding
- `design/home-a.html`: approved home page mockup (visual source of truth)
