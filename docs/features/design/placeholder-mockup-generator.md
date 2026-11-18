---
id: F-017
slug: placeholder-mockup-generator
title: Placeholder & Mockup Generator
category: design
tier: client
priority: P2
status: planned
depends_on: [F-013, F-007]
---

# Placeholder & Mockup Generator

## 1. Summary
Three tools in one: custom-size placeholder images (no external URL service), device mockups that place your screenshot inside a generic phone or laptop frame, and realistic fake user data (names, emails, addresses, avatars) exported as JSON, CSV or SQL from a seed.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Front-end dev | Needs 20 product images of 800x600 while the backend is not ready | Downloaded PNG/SVG set or inline data URIs |
| Designer | Wants a portfolio shot of an app screenshot | Screenshot in a clean phone frame with a background |
| QA / backend dev | Needs 500 test users for a DB | SQL inserts or CSV, same data again via the same seed |
| Trainer / teacher | Needs sample students in Bengali or Arabic names | Localized names and addresses |
| Privacy-minded dev (non-obvious) | Cannot use `placehold.co`-style URLs in an offline or private app | Self-contained data URIs, no network |

## 3. User flow
1. Empty state: `Tabs` Placeholder | Mockup | Fake data. Each has an example already rendered (a 600x400 grey placeholder; a sample screenshot in a frame; 10 sample users).
2. **Placeholder:** width and height (default 600x400), background, text color, label (default `600 x 400`), font size, optional shape/pattern (solid, diagonal cross, gradient), format (SVG, PNG, JPG, WebP). Preview live on `ImageCanvas`.
3. Output: **Download**, **Copy data URI**, **Copy `<img>` snippet**, batch list ("add sizes": e.g. 3 sizes) as ZIP.
4. **Mockup:** `DropZone` for screenshot; choose device (generic phone, tablet, laptop, browser window), orientation, background (solid, gradient, transparent), shadow, scale. Preview; export PNG (1x/2x/3x), WebP, or SVG frame.
5. **Fake data:** choose locale (en, bn, ar, hi, de, fr, ja, etc. verify faker locale list), record count (1 to 100,000), fields (name, email, phone, address, company, avatar, birthdate, lorem, UUID, custom), seed (number or text, with "random seed" button). Preview table of first 20 rows.
6. Output: JSON, CSV, SQL (table name, dialect, batched inserts), copy or download. Done toast shows seed so results can be reproduced.

## 4. Inputs and outputs
- **Inputs:** sizes 1 to 8000 px per side (soft 4000); screenshot images (PNG, JPG, WebP; soft 20 MB); locale, counts, fields, seed.
- **Outputs:** `placeholder-600x400.svg|png|jpg|webp`; data URI string; `mockup-<name>.png`; `users.json|csv|sql`. Avatars: generated initials SVG or procedural (no real faces); optional data URI embedding.

## 5. Components and tech
- **UI:** `ToolShell`, `Tabs`, `SettingsPanel`, `Slider`/`NumberField`, `SegmentedControl`, `ColorField`, `DropZone`, `ImageCanvas`, `CodeOutput`, `CopyButton`, `DownloadButton`, `ProgressBar`, `LibraryLoader`, `ErrorBanner`, `Toast`. New: `DeviceFramePicker`, `DataFieldPicker`, `DataTablePreview`, `SeedField`.
- **Libraries:** `@faker-js/faker` (MIT) **lazy-loaded** only on the Fake data tab, with a locale-specific import to keep size down (full package is large; verify); seeded via `faker.seed()`. Canvas 2D and `OffscreenCanvas` for raster; own SVG templates for placeholders and frames; `fflate` for ZIP.
- **Frames:** original generic artwork drawn in SVG (rounded rectangle phone with notch/island-free bezel, thin laptop). No manufacturer artwork.
- **Where it runs:** canvas on main thread (large exports in worker); data generation in a worker for counts over 1,000.

## 6. Behavior rules
- Placeholder SVG is the canonical output (small, scalable); PNG/JPG/WebP rasterize it at the exact size. JPG has no transparency (background required).
- Label text auto-fits and wraps; non-Latin label text uses system or bundled Noto font; emoji allowed.
- Date fields (`past`, `future`, `recent`, birthdate) are relative to "now" by default, which breaks reproducibility. The tool always passes a fixed reference date (`refDate`, shown in the UI and stored with the seed, default 2026-01-01) so the same seed gives the same dates on any day.
- **Same seed + same locale + same fields + same reference date + same faker version = identical data.** The UI shows the faker version and warns that upgrading may change output. Changing the field order does not change values of other fields (each field seeded independently, verify design).
- Emails use reserved domains (`example.com`, `example.org`, `.test`) by default so no real inboxes are used; phone numbers use fictional ranges where the locale supports it (verify). Banner: "All data is fake. Any match with real people is accidental."
- SQL export: escape quotes, choose dialect (PostgreSQL, MySQL, SQLite), `CREATE TABLE` optional, batches of 500 rows per statement. CSV is RFC 4180 with UTF-8 BOM option (for Excel).
- Mockup: screenshot is scaled to fit the screen area with `object-fit: cover` or `contain` option; corner radius and bezels follow the frame. Original screenshot is never altered or uploaded.
- **Legal:** only generic, original frames ship. No Apple, Samsung or other brand artwork, names or logos unless the owner licenses them (open decision). Frame names are generic ("Phone", "Tablet", "Laptop").
- Settings persist in localStorage; screenshots and generated rows are not persisted.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Width/height 0, negative, non-number | Field error; minimum 1; last valid kept |
| Huge size (20000x20000) | Block raster above 8000 px side or 64 MP; SVG still allowed; message explains |
| Very small size (1x1, 10x10) | Allowed; label hidden when it cannot fit |
| Long/Unicode/RTL/emoji label | Wrapped and shaped correctly; RTL label aligned right; missing glyph shows fallback glyph with a note |
| Transparent background with JPG | Background forced to white with note |
| Screenshot not an image / corrupt | Magic-byte check; error with fix |
| Screenshot with wrong aspect for frame | Cover/contain choice; crop preview shown |
| Very large screenshot (50 MP) | Downscale to target export size; warn before memory use |
| Animated GIF/WebP screenshot | First frame used; note shown |
| HEIC screenshot | "Convert to JPG/PNG first" message (link to F-007 Bulk Resizer & Converter) |
| Canvas export blocked by memory | ErrorBanner: lower scale (3x to 2x), Retry |
| Faker locale missing a field (e.g. no state in a locale) | Field blank or fallback to English with a note; export has consistent columns |
| 10,000+ records | Worker generation with progress and Cancel; hard cap 100,000; table preview limited to 20 rows |
| Same seed after faker update | Output may differ; version stamp in export header comment/metadata (JSON `_meta`) |
| Invalid SQL identifiers (table name with space or quotes) | Name sanitized/quoted per dialect; warning shown |
| CSV injection (fields starting with `=`, `+`, `-`, `@`, tab or CR) | Prefixed with `'` option on by default for CSV; note that this alters the stored value, and phone numbers like `+880...` are affected |
| MySQL string escaping and emoji | MySQL dialect escapes backslashes as well as quotes (or sets `NO_BACKSLASH_ESCAPES` note); emoji need a `utf8mb4` table, noted in the `CREATE TABLE` output |
| Date fields on a different day | Output unchanged because a fixed reference date is used (see rules) |
| iPhone / Safari canvas area limit (about 16.7 MP; verify) | Raster cap lowered on iOS with a message; SVG output unaffected |
| RTL/Bengali/Arabic names in CSV opened in Excel | UTF-8 BOM option on by default for CSV |
| Avatar generation | Initials SVG; if the name is non-Latin, first grapheme cluster used (via `Intl.Segmenter`) |
| Unsupported browser (no OffscreenCanvas; Safari `toBlob('image/webp')` silently returns PNG) | Fallback to main canvas; WebP option hidden when the returned blob type is not `image/webp` |
| Cancel mid-export | Worker terminated; nothing downloaded |

## 8. Limits, performance, privacy
- Placeholder render under 100 ms; mockup export under 2 s at 2x for a 12 MP screenshot; 10,000 records under 3 s.
- Faker is lazy-loaded (size verify; locale-specific import); `LibraryLoader` shows size.
- Network: none for user content. Screenshots stay in the browser. Faker, fonts and frames are bundled, not fetched from third parties.
- Stored locally: settings and last seed.

## 9. Accessibility and mobile
- All numeric fields keyboard friendly; preview image has an `aria-label` describing size and colors. Data preview is a real table with headers.
- Placeholder default contrast between text and background must meet AA (warn otherwise, using F-013 logic).
- Mobile: tabs scroll, settings in `Sheet`, mockup preview pinch-zoom; large exports warn about memory on phones.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] A 600x400 placeholder downloads as SVG and PNG with exact pixel size and the label text.
- [ ] Data URI output renders in an `<img>` tag when pasted into a page, with no network request.
- [ ] A screenshot appears inside the chosen generic frame; exported PNG has the right dimensions at 1x/2x/3x.
- [ ] Same seed, locale and fields produce byte-identical JSON on two runs.
- [ ] Bengali and Arabic locales produce names in the correct script (if faker lacks a locale, it is not offered, or a small bundled name list is used; verify faker locale list), and the CSV opens correctly in Excel with BOM.
- [ ] Same seed produces identical date fields when run on two different days.
- [ ] Generating 10,000 records finishes in under 3 s and 100,000 can be cancelled within 1 s.
- [ ] SQL output runs without syntax error on SQLite, PostgreSQL and MySQL for fixtures (quotes, emoji in values).
- [ ] CSV injection guard prefixes risky cells.
- [ ] Faker is not downloaded until the Fake data tab opens.
- [ ] No brand-name or manufacturer artwork appears in frames or labels.

## 12. Future ideas and open questions
- Ideas: more frames (watch, TV), social-card templates, avatar styles, relational data (users with orders), custom schema builder, dummy PDF/CSV file generator.
- **Open decision (legal):** Apple, Samsung and Google device artwork may be trademarked or copyrighted; v1 uses only original generic frames. Should the owner license or commission branded-looking frames later?
- Open: field-level seeding scheme and faker version pinning policy; whether to offer a `.test`/reserved-domain-only email policy as a setting.
