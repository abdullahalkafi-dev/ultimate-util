# Docs index

Living documentation. Every change, thought and command becomes part of these files, with dates.

| File | Purpose |
|---|---|
| 00-context.md | Where the project is right now |
| 01-feature-spec.md | Tool list, scope, removed items (short summary) |
| 02-decisions.md | Decisions and reasons |
| 03-changelog.md | Dated log of changes and user commands |
| 04-ui-design.md | UI direction, approved home page design |
| handoff/ | Dated status and audit reports for whoever continues the work (newest: 2026-11-19-audit-1.md) |
| features/ | One spec per feature (33 tools + 5 platform features), template, shared conventions, component catalog, cloud rules, research notes and the open questions the owner must answer. Start at [features/README.md](features/README.md) |
| features/_shared/open-questions.md | Owner decisions needed before coding |

Add new nested docs as folders when a topic grows. A new feature = a spec in `features/<category>/` + a row in `features/README.md` + a changelog line.
