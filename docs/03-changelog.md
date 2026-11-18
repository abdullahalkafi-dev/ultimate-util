# Changelog and command log

## 2026-11-19
- User pasted master feature spec (34 tools) and asked for suggestions; agent gave summary, DOCX feasibility, extra feature ideas.
- User command: keep project docs (AGENT.md + docs/) recording every change and command.
- User command: skip URL shortener, uptime monitor, currency rates.
- User command: clean light minimal style; card grid home with bookmarks bar from localStorage; mockup home page only, 3 variants to choose from.
- Created AGENT.md and docs/ (README, 00-context, 01-feature-spec, 02-decisions, 03-changelog, 04-ui-design).
- Built home page mockup artifact with 3 variants (A, B, C).
- User command: chose design A; colors look normal and boring, wanted more contrast.
- Built `design/home-a.html`: high-contrast variant A with 3 palette options. Updated 04-ui-design.md.
- User decision: palette = Ink + Electric Blue; design approved.
- User command: research every feature and write one spec doc per feature (use cases, edge cases, UX flow, components, outputs), extensible for future features; then audit and fix. Created `docs/features/` with README index, template, `_shared/` docs and 5 Documents specs.
- User command: use multiple agents to finish the remaining specs and for the audit. Launched 6 writing agents (media, design, developer, everyday, cloud, platform).
- Research round done (DOCX, PDF encryption, background removal licensing, ffmpeg.wasm isolation, Wake Lock/Fullscreen, PDF to DOCX limits). Findings in `features/_shared/research-notes.md`.
- Wrote 38 feature specs (33 tools + 5 platform) with 6 writing agents; audited and corrected them with 4 audit agents; final consistency pass (titles, links, guest-local rules, registry fields, shared components).
- Created `features/_shared/open-questions.md` (owner decisions needed before coding).
- Audit highlights: fixed wrong cron/EventBridge/Kubernetes rules, JWT/WebCrypto facts, F-007 vs F-011 GIF ownership, EXIF orientation contradiction, softbox range mismatch between F-012 and F-031, guest-local data rules, command palette never indexes encrypted notes/2FA by default.
