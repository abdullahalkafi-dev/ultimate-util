# Shared conventions (apply to every tool)

_Created: 2026-11-19. Updated: 2026-11-19 (registry fields `status`, `sync`, `featuredRank`, `guestAccess`, `vault`, `optInNetwork`)._ Feature files only state differences from these rules.

## Tool registry
Every tool is one registry entry. The registry is the **single source of truth**: the home grid, stat counts, command palette, bookmarks, badges, routing, sitemap and the CI privacy audit all read from it. Nothing else hardcodes tool names, counts or badge state.

```ts
{
  id: 'F-001',            // matches the spec ID; never changes, even if slug or name change. Bookmarks and recents store this id.
  slug: 'docx-editor',    // URL: /tools/docx-editor (may be renamed; keep a redirect from the old slug)
  name: 'DOCX Viewer & Editor',
  category: 'documents',  // documents | media | design | developer | everyday | cloud
  tier: 'client',         // client | cloud
  icon: 'doc',            // key into the inline SVG sprite
  keywords: ['word','docx','pdf','editor','resume'],
  description: 'One line, under 90 characters.',
  status: 'live',         // live | soon | hidden
  isNew: true,            // optional, default false: shows the "New" pill
  featuredRank: 10,       // optional: higher number = more prominent; see field table
  sync: 'optional',       // optional, tier 'client' only: fully usable as a guest, can also save to the cloud
  guestAccess: 'gate',    // tier 'cloud' only: 'gate' (default) | 'local'
  vault: true,            // optional: tool uses the encrypted vault (Class A data or optional E2E)
  optInNetwork: '...',    // optional: one sentence for a user-confirmed network feature (see below)
  load: () => import('./tools/docx-editor')   // lazy, so the home page stays light
}
```

### Field semantics
| Field | Required | Meaning |
|---|---|---|
| `id`, `slug`, `name`, `category`, `tier`, `icon`, `keywords`, `description`, `status`, `load` | yes | Core identity. `id` and `slug` must equal the values in the spec front matter. Build fails on duplicates or missing values. `tier` is never defaulted. |
| `tier` | yes | `client`: runs in the browser, no account needed, badge **Local**. `cloud`: needs a Google account to save, badge **Synced**. Drives the two stat pills. |
| `status` | yes | `live`: shown, clickable, searchable, counted. `soon`: card dimmed with a "Coming soon" tag, not clickable, star disabled, **not** counted, not in the palette or sitemap; its route shows a coming-soon page. `hidden`: not rendered anywhere, not indexed, route returns 404. Build-time constant, never per user. Existing bookmarks of `soon`/`hidden` tools stay in storage but are not shown (P-003). |
| `isNew` | no | Shows a "New" pill. Intended to be removed after about 60 days. |
| `featuredRank` | no | Positive integer. The `live` tool with the highest value is shown as the featured card (double-width, accent fill) on the home page; ties are broken by registry order; if no tool sets it there is no featured card. Exactly zero or one tool is featured. The pill reads "New" if `isNew`, else "Featured". |
| `sync` | no | Only valid with `tier: 'client'`. `'optional'`: fully usable as a guest, and when signed in it may also save to the account (F-012 softbox presets and F-013 palettes through F-031). Badge becomes **Local, optional sync**. Counted as "run locally". Omit for pure Local tools. |
| `guestAccess` | cloud only | `'gate'` (default): a guest sees the preview and sign-in gate (P-004) and no local data is created. `'local'`: guests can use the tool with local-only storage and are invited to sign in; features that truly need an account are gated inline. Used by F-031 and F-033. |
| `vault` | no | `true` when the tool stores Class A data (F-028, F-029) or offers optional end-to-end encryption (F-032). Shows `VaultStatus`, requires `UnlockGate`, and lets the tool register a Class A `searchProvider` for the palette (off by default, see P-002). |
| `optInNetwork` | no | One sentence describing a **user-confirmed** feature that makes a network request revealing derived data, e.g. F-010 "Show on map" or F-016 "Use Google Fonts CDN in the exported snippet". The tool stays badged Local, the CI audit allows only that request and only after the confirmation step, and the tool's privacy footer repeats the sentence. |

Validation at build time: unique `id` and `slug`; `sync` only with `tier: client`; `guestAccess` only with `tier: cloud`; `featuredRank` a positive integer; a spec file exists for every `id`.

### Derived values (never stored, never hardcoded)
| Value | Rule |
|---|---|
| Stat pill "run locally" | count of `status: 'live'` tools with `tier: 'client'` (includes `sync: 'optional'`) |
| Stat pill "sync with Google" | count of `status: 'live'` tools with `tier: 'cloud'` |
| Search placeholder "Search N tools" | count of `status: 'live'` tools |
| Badge | `client` = Local; `client` + `sync: optional` = Local, optional sync; `cloud` = Synced (P-004) |
| Category chips | categories that contain at least one `live` or `soon` tool, in fixed order |
| Sitemap and palette | `live` tools only |

Adding a tool = spec file + registry entry. No edits to home, palette or nav. Changing `tier`, `status`, `sync` or `featuredRank` updates every surface at once.

## Standard tool shell (every tool page)
Header (name, Local/Synced badge, bookmark star, help popover) · workspace · optional settings panel · footer privacy line ("Runs in your browser. Files are not uploaded."). Same component, same position everywhere (see `ToolShell`).

## Standard states
Every tool must define and design all of these:
1. **Empty:** what the tool does, a sample action ("Try an example"), the drop zone or input.
2. **Loading dependency:** a library, WASM module or model is downloading. Show name, size, progress. Cached afterward.
3. **Processing:** progress and a Cancel button for anything over about 1 second.
4. **Success:** result preview, primary action (Download/Copy), secondary actions, "Start over".
5. **Partial success (batch):** per-item status; failures never block the successes.
6. **Error:** plain-language cause, what to do, a Retry. Never a silent failure or a raw stack trace.
7. **Unsupported:** feature-detect first (e.g. no WebAssembly threads, no Wake Lock) and show a clear fallback or message.

Cloud tools add: **Gate** (guest, `guestAccess: 'gate'`), **Locked** (vault), **Offline/queued**, **Conflict** and **Signed out mid-use** (see `cloud-conventions.md` and P-004).

## Files
- Add by drag and drop, file picker, and paste (images, text) where it makes sense.
- Validate by **file signature (magic bytes)**, not only extension. A renamed file gets a clear message.
- Soft warning at 50 MB per file, tool-specific hard limits in each spec. Warn before the browser runs out of memory, not after.
- Batch: default cap 50 files unless the spec says otherwise. Multiple outputs download as one ZIP (also offer individual download).
- Output filename: `<original-name>-<action>.<ext>` (e.g. `report-compressed.pdf`). Never overwrite silently; the browser handles duplicates.
- Never mutate the user's original; all work is on copies in memory.

## Performance
- Heavy work (PDF parsing, image codecs, OCR, ffmpeg, ONNX) runs in a **Web Worker**. UI stays responsive; Cancel terminates the worker.
- Libraries load **on tool open**, not on home page load. Anything over 5 MB shows its size first. After the first load it is cached (Cache Storage/service worker) so the tool works offline.
- Transfer buffers instead of copying (transferable ArrayBuffers).
- Release object URLs and canvases when done. Large images: process in tiles or downscale previews; keep full resolution only for export.
- Live-update tools (formatters, regex, color) debounce about 150 ms and never block typing.

## Privacy and network
- Client tools (`tier: client`, including `sync: 'optional'` tools while signed out or not syncing) make **no network requests with user content**, including derived data such as file names or coordinates. Each spec lists any unavoidable request (e.g. model download) and what is sent (nothing user-specific). Allowed without an owner decision: static same-origin assets fetched by GET (JS chunks, WASM, fonts, models) and a user-confirmed `optInNetwork` feature declared in the registry. Enforced by a CI network audit and a per-route CSP (`connect-src 'self'`), see P-004.
- No analytics on file names or contents. Only anonymous page/tool counts if analytics is added at all.
- Strict Content-Security-Policy; no third-party scripts on tool pages.
- Cross-origin isolation headers (`COOP`/`COEP`, needed by multi-thread ffmpeg) apply only to the video tool route (F-011). That route must not host the sign-in callback and must not load third-party resources (including the Google avatar; use initials or an avatar served from our own origin). See P-005.
- Local tools persist only **settings** (localStorage) and explicit, user-visible saves: guest presets (F-012/F-031), saved regex examples (F-020), last-used palette (F-013), font sample text (F-016, documented exception). Each must be listed in the tool's privacy section with a Clear control. File contents are never persisted, except explicit, user-visible drafts (DOCX editor autosave) with a Clear button.
- Local keys shared by the platform are prefixed `uu-` (owned by P-001, P-002, P-003); tool keys use `uu-<slug>-...`. Per-tool settings stay on the device in v1 and are not synced.

## Errors and messages
Pattern: *what happened* + *why (if known)* + *what to do*. Example: "This PDF is password protected. Enter the password to continue." Avoid "Something went wrong."

## Accessibility
- Full keyboard operation; visible focus; logical tab order. Drag and drop always has a button alternative.
- Progress and results announced with `aria-live="polite"`. Errors with `role="alert"`.
- Contrast AA minimum for text and controls, in light and dark themes. Do not rely on color alone (use icon + text for status).
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.

## Mobile and touch
- Touch targets at least 44 px. Single-column layout under 640 px: workspace first, settings in a bottom sheet.
- Tools that cannot work well on phones (advanced editors) still open, show a notice, and offer the reduced mode.
- Camera/mic tools request permission only after a user tap, with an explanation first.

## Internationalization and text
- UTF-8 everywhere; test emoji, CJK, Bengali/Arabic/Hindi scripts, RTL text, combining characters.
- Use `Intl` for numbers, dates, plurals, segmentation. Never hardcode a locale.
- UI strings are kept in one place so a translation layer can be added later.

## URLs and sharing
- Route: `/tools/<slug>`. Settings (not data) may be mirrored in the hash for shareable links, e.g. `#size=1200&fmt=webp`. Never put file contents, tokens, keys or secrets in the URL.

## Testing expectations (per tool)
Unit tests for pure logic, a fixtures folder with tricky inputs (corrupt, huge, empty, Unicode), and one end-to-end happy path. Edge-case tables in each spec double as the test list.

## Browser support target
Latest two versions of Chrome, Edge, Firefox, Safari (including iOS Safari). Features that need newer APIs (Wake Lock, Fullscreen, SharedArrayBuffer, BarcodeDetector, File System Access) must feature-detect and degrade.
