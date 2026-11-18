# Feature spec

_Updated: 2026-11-19 (final feature set: 33 tools + 5 platform features)_

Full per-feature specs live in `docs/features/` (index: [features/README.md](features/README.md)). This file is the short scope summary. Pending owner decisions: [features/_shared/open-questions.md](features/_shared/open-questions.md).

## Client-side tools: 27 (Local badge, no login)
**Documents (5):** F-001 DOCX viewer/editor with live preview + export to PDF/other (new), F-002 PDF<->DOCX, F-003 PDF merge/split/reorder, F-004 PDF compress + password, F-005 OCR.
**Image & media (6):** F-006 image compressor, F-007 bulk resizer/converter, F-008 basic+advanced editor, F-009 AI background remover, F-010 EXIF viewer/stripper, F-011 video/audio trimmer + GIF maker.
**Design (6):** F-012 Color Wheel + Fullscreen Softbox Light, F-013 palette + contrast checker, F-014 CSS/Tailwind generators, F-015 SVG optimizer + JSX, F-016 font pairer + type scale, F-017 placeholder + mockup generator.
**Developer (6):** F-018 JSON/YAML/XML formatter + diff, F-019 JWT decoder, F-020 regex tester, F-021 Base64/URL/hash, F-022 cron parser, F-023 SQL formatter + API webhook/cURL inspector.
**Everyday (4):** F-024 QR/barcode, F-025 unit + timezone converter, F-026 password generator, F-027 word counter.

F-012 and F-013 are `Local, optional sync`: fully usable as a guest, and they can save presets/palettes to the account (via F-031) when signed in. They count as Local.

## Cloud-synced tools: 6 (Synced badge, Google OAuth)
F-028 2FA authenticator (encrypted), F-029 encrypted scratchpad/secure notes, F-030 snippet/prompt manager, F-031 saved palettes + softbox presets, F-032 clipboard history + cross-device drop, F-033 habit/pomodoro tracker.

Total: **33 tools** (the home page shows "27 run locally, 6 sync with Google", derived from the tool registry).

## Platform features: 5 (site-wide, not tools)
P-001 home page (card grid, filters, stats, featured card), P-002 command palette (Ctrl/Cmd+K), P-003 bookmarks bar, favorites + recents (localStorage, synced on login), P-004 auth badging (Local / Synced), P-005 Google login, guest merge + sync.

## Removed (2026-11-19, user decision)
- URL shortener + click analytics
- Uptime and SSL monitor
- Currency exchange rates (unit + timezone converter stays; no currency category and no rate fetching)

## Idea backlog (not committed)
Offline PWA, Markdown editor, spreadsheet/PPTX viewers, image<->PDF, invoice/resume generator, PDF signer, tool chaining, per-tool SEO pages.

## Known constraints
- DOCX: staged build (viewer, then editor, then export). Complex layouts may shift on edit/re-export.
- PDF to DOCX locally is basic fidelity (text and structure).
- 2FA/notes encryption key must come from a user passphrase, not Google login.
- Local tools make no network requests with user content (enforced by a CI network audit); exceptions are listed per tool.
- Multi-thread video needs cross-origin isolation on one route only, which conflicts with popup sign-in, so login is redirect-based.
- Several features depend on library licenses that must be verified in spikes (see `features/_shared/research-notes.md`).
