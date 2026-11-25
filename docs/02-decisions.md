# Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-11-19 | Add client-side DOCX viewer/editor + PDF export | Open client docx without Word; create and send as PDF; no upload or DB |
| 2026-11-19 | Drop URL shortener, uptime monitor, currency rates | User choice; they need a server/cron anyway |
| 2026-11-19 | Visual style: clean, light, minimal | User choice |
| 2026-11-19 | Home page = card grid with localStorage bookmarks bar | User choice |
| 2026-11-19 | Home page layout = variant A (top bar + card grid) | User choice; palette made higher contrast |
| 2026-11-19 | Build UI mockup first (3 home variants), code later | User's staged workflow |
| 2026-11-19 | Palette = Ink + Electric Blue | User choice after comparing 3 palettes |
| 2026-11-19 | One spec file per feature in docs/features, template + shared docs | Easy to add features later; consistent quality |
| 2026-11-19 | PROPOSED (spec default, awaiting owner): Tool registry is the single source of truth (home grid, counts, palette, badges) | Adding a tool needs no edits to other screens |
| 2026-11-19 | PROPOSED (spec default, awaiting owner): Class A data (2FA, notes) encrypted on device with a separate vault passphrase + recovery key | Google login alone must not expose secrets |
| 2026-11-19 | PROPOSED (spec default, awaiting owner): Google login by redirect (not popup) | Avoids COOP/COEP conflict with the video tool route; confirm in spike |
| 2026-11-19 | PROPOSED (spec default, awaiting owner): Local tools make no network calls with user content, enforced by CI audit + CSP | Core privacy promise |

## 2026-11-26: production build uses webpack
`next build` with Turbopack hangs forever on this codebase (no error, low CPU, nothing written). `next build --webpack` finishes in under a minute and printed the real errors that Turbopack hid (a CSS module using `::highlight(...)`, and the qpdf wasm glue importing Node's `fs`). The build script now passes `--webpack`. `next dev` still uses Turbopack. Revisit when Next.js is upgraded.
