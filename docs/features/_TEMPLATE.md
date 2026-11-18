---
id: F-000
slug: example-tool
title: Example Tool
category: documents | media | design | developer | everyday | cloud | platform   # tools use the first six; platform features use platform
tier: client | cloud | platform
priority: P0 | P1 | P2
status: planned
depends_on: []        # other feature IDs or shared docs
# Registry fields (tools only, see _shared/conventions.md): status live/soon/hidden (NOT the same as the spec status above), optional isNew, featuredRank, sync: optional, guestAccess, vault, optInNetwork
---

# Example Tool

## 1. Summary
One or two sentences: what it does and why it exists on this platform.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| (persona) | (real scenario) | (outcome) |

Aim for 3 to 5 rows, including at least one non-obvious use.

## 3. User flow
Numbered steps from landing on the tool to finishing. Include the empty state (what the user sees first), the working state, and the done state. Add a short layout sketch if the screen is non-trivial.

## 4. Inputs and outputs
- **Inputs:** accepted formats, size limits, typed values, defaults.
- **Outputs:** exact files or values produced, naming, formats, what is copyable/downloadable.

## 5. Components and tech
- **UI components** (from `_shared/components.md`; list new ones on a line starting `New:` with a one-line purpose each, and add them to the "Feature-introduced components" list).
- **Libraries / APIs / models** with license and size notes. Mark uncertain items "verify".
- **Where it runs** (main thread, worker, WASM).

## 6. Behavior rules
Precise statements of how it must work: defaults, ordering, live vs on-click updates, what is remembered, what is never stored.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| (what can go wrong or be odd) | (what the tool does and says) |

Cover: empty input, huge input, invalid input, unsupported browser, cancelled operation, mixed-quality input, Unicode/RTL, and tool-specific traps.

## 8. Limits, performance, privacy
Size/time budgets, memory guards, any network call (list it explicitly), what is stored locally.

## 9. Accessibility and mobile
Keyboard path, screen-reader announcements, touch behavior, small-screen layout.

## 10. Data (cloud tools only)
Entities, fields, encryption class, sync/conflict rules, quotas. Write "N/A, client-only" for local tools.

## 11. Acceptance criteria
- [ ] Testable statements. A reviewer can tick each one.

## 12. Future ideas and open questions
Things deliberately left out, and decisions still needed from the owner. Start open decisions with `Open:` and copy them into `_shared/open-questions.md` (theme, related IDs, recommended default).
