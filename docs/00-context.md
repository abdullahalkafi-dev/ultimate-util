# Current context

_Last updated: 2026-11-19_

## Status
Phase 2: feature specs written and audited (33 tools + 5 platform features in `docs/features/`). Home page design is approved: `design/home-a.html`, variant A, palette Ink + Electric Blue. No application code yet.

## Next steps (user-driven order)
1. Owner reviews the specs and answers the open questions in `docs/features/_shared/open-questions.md` (backend provider, licenses, platform support, scope, legal).
2. Owner shares preferred code structure.
3. Owner shares credentials; coding starts.
4. Owner shares deployment and domain access.

## Key facts
- Client-side tools need no login and never upload content. Cloud tools use Google OAuth (identity only); Class A data (2FA secrets, notes) is encrypted on the device with a separate vault passphrase.
- Every feature has a spec in `docs/features` (index in `docs/features/README.md`); the tool registry (`docs/features/_shared/conventions.md`) is the single source of truth for the home grid, counts, palette and badges.
- Home page: card grid, ink bookmarks strip backed by localStorage (synced after Google login), featured DOCX card.
- Visual direction: clean, light, minimal; high contrast Ink + Electric Blue; dark mode supported.
- Removed from scope by the owner: URL shortener, uptime/SSL monitor, currency rates.
