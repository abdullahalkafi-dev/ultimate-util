---
id: F-015
slug: svg-optimizer-jsx
title: SVG Optimizer & JSX Converter
category: design
tier: client
priority: P1
status: planned
depends_on: []
---

# SVG Optimizer & JSX Converter

## 1. Summary
Shrink SVG files with SVGO in the browser, prove nothing changed visually, and convert the result to React JSX/TSX, React Native, Vue, or a data URI / CSS background. Untrusted SVGs are sanitized before any preview.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Front-end dev | Icon exported from Figma is 8 KB of metadata | 1 KB clean SVG and a typed React component |
| Designer | Illustrator SVG breaks in email/web | Cleaned SVG with `viewBox` kept and no editor metadata |
| Mobile dev | Needs icons for React Native | `react-native-svg` component code |
| Performance engineer | Wants inline CSS background icons | Minified, URL-encoded data URI |
| Security-aware dev (non-obvious) | Downloaded an SVG from the internet | Scripts and handlers stripped, report of what was removed |

## 3. User flow
1. Empty state: `DropZone` ("Drop SVG files or paste SVG code") with a sample SVG button. Accepts multiple files.
2. Working: file(s) parse and sanitize, SVGO runs in a worker with default preset. `ProgressBar` shows for batches.
3. Result view (`SplitPane`): left original, right optimized, with `BeforeAfter` slider, size chips ("12.4 KB to 3.1 KB, -75%"), and **visual diff** result ("Pixel diff: 0 pixels differ at 512 px").
4. `SettingsPanel` lists SVGO plugins as toggles, each with a one-line explanation and risk label (Safe / May change rendering). Changes re-run live.
5. **Output tabs:** SVG | React (JSX/TSX) | React Native | Vue | Data URI | CSS background. `CodeOutput` with `CopyButton`. SVGR options: memo, spread props, `currentColor` replacement, `title` prop, `ref` forwarding, `dimensions` handling, TypeScript.
6. Done: Download single file or ZIP (batch), names `icon-optimized.svg` / `Icon.tsx`. **Start over**.

## 4. Inputs and outputs
- **Inputs:** `.svg` files (soft 5 MB each, hard 20 MB), pasted code, `.svgz` (gzip) accepted. Batch up to 50.
- **Outputs:** optimized `.svg`; `.jsx`/`.tsx` component; React Native `.tsx`; Vue SFC; data URI (base64 or URL-encoded, with size for each); CSS `background-image` snippet. Report: bytes before/after, plugins that changed anything, items removed by sanitizer.

## 5. Components and tech
- **UI:** `ToolShell`, `DropZone`, `FileList`, `SplitPane`, `BeforeAfter`, `ImageCanvas`, `SettingsPanel`, `Tabs`, `SegmentedControl`, `CodeOutput`, `CodeEditor` (paste input), `ResultCard`, `DownloadButton`, `ProgressBar`, `ErrorBanner`, `Toast`, `LibraryLoader`. New: `PluginToggleList`, `PixelDiffBadge`, `SanitizeReport`.
- **Libraries:** `svgo` browser build (MIT, verify bundle size and browser entry); `@svgr/core` (+ `@svgr/plugin-jsx`, `@svgr/plugin-svgo`) MIT, verify it runs in the browser without Node APIs (Babel/prettier weight, may need own template instead); `DOMPurify` (Apache-2.0/MPL, verify) with SVG profile or own allow-list sanitizer; `fflate` for ZIP.
- **Where it runs:** SVGO and sanitize in a Web Worker; pixel diff on `OffscreenCanvas` or canvas on main thread.

## 6. Behavior rules
- **Sanitize first, always.** Remove `<script>`, `on*` event attributes, `<foreignObject>`, `javascript:` URLs, `<iframe>/<embed>/<object>`, external references (`href`/`xlink:href` to `http(s)`, `@import`, external `url()` in styles), and `<use>` pointing outside the document. Show a `SanitizeReport` listing each removal. An option "Keep external references" is not offered.
- Preview renders via an `<img>` with a `blob:` or data URL of the sanitized SVG, or a sandboxed iframe, **never** inserted as inner HTML. Code output is shown as text only.
- Default SVGO preset: remove metadata, comments, editor namespaces (Figma/Illustrator/Inkscape/Sketch), empty groups, unused defs; minify styles and numbers. `removeViewBox` is **off** and viewBox is always preserved; if missing and width/height exist, viewBox is added.
- Risky plugins (`convertPathData` precision, `mergePaths`, `removeHiddenElems`, `cleanupIds`) are labelled and have a precision control (default 3 decimals).
- After optimization, rasterize original and optimized at 512 px (and optionally 64 px) and compare. Differences above 0 are shown as a count and a diff overlay; if difference exceeds a tolerance of 0.1%, the tool warns and suggests turning off the last-changed plugin.
- JSX conversion: attributes to camelCase (`stroke-width` to `strokeWidth`, `class` to `className`), `style` strings to objects, namespaces handled. `currentColor` option replaces fills/strokes with `currentColor` (user picks which colors, default: only single-color icons).
- Accessibility option: add `<title>` and `aria-labelledby` via `title` prop, or `aria-hidden="true"` for decorative icons.
- Unique IDs: `cleanupIds` prefix per file to avoid collisions when inlined twice.
- The exported SVG, JSX and data URI are the sanitized output; scripts and external references removed in preview are removed from downloads too. The report says so before download.
- Nothing is uploaded; files are never stored.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Empty file / pasted empty text | EmptyState message; nothing processed |
| Not an SVG (PNG renamed `.svg`, HTML) | Content check (root element `<svg>`); error naming detected type |
| Malformed XML | Error with line/column when available; no output |
| `<!DOCTYPE>` with `<!ENTITY>` (XXE or entity-expansion bomb) | DOCTYPE and entity declarations are stripped before parsing and reported; external entities are never resolved; expansion capped |
| `.svgz` that expands far beyond its size (decompression bomb) | Decompress with `DecompressionStream` and abort above 20 MB expanded, with a message |
| SVGO runs over 30 s on one file | Offer Cancel; on timeout the worker is terminated and the file is marked failed, others continue |
| Mobile device / low memory | Batch workers limited to 2; files over 5 MB warn about memory |
| SVG with `<script>` or `onload` | Removed and reported; preview safe; never executed |
| `<foreignObject>` with HTML | Removed with warning "may change what you see" |
| External image/font references | Removed (privacy); warning that these elements will not render |
| Embedded base64 raster image | Kept; shown as large contributor; offer note to use a real image format |
| No `viewBox`, only width/height | viewBox added; if neither, warn that scaling may fail |
| Huge SVG (20 MB, 200k nodes) | Hard limit message; Cancel terminates worker; suggest simplifying in the design tool |
| CSS `<style>` with classes and selectors | Inlined or minified per plugin; if conversion would change specificity, plugin skipped with note |
| IDs collide across multiple inlined SVGs | Prefix IDs; user option for a custom prefix |
| `currentColor` on multicolor logos | Warning that replacement flattens colors; default off for multi-color |
| Text elements and fonts | Text kept as text; note that missing fonts alter rendering; suggest "convert text to outlines" in the design tool |
| RTL/Unicode text, emoji in SVG | Preserved as UTF-8; export keeps `xml:lang`/`dir` attributes |
| Animation (SMIL, CSS animation) | Preserved; note that some plugins can break it; optimizer warns when animation detected |
| Diff tool shows tiny anti-aliasing differences | Tolerance threshold avoids false alarms; user can raise the resolution |
| `OffscreenCanvas` unsupported | Fallback to main-thread canvas |
| JSX output requested for 50 files | ZIP of components plus `index.ts` barrel (optional) |
| Cancel mid-batch | Worker terminated; finished files remain downloadable |

## 8. Limits, performance, privacy
- Target: under 1 s for a 100 KB SVG; batch runs in parallel up to 4 workers (verify device cores).
- Libraries load on tool open (SVGO + SVGR; combined size verify, large if Babel is bundled).
- Network: none for user content. Sanitizer blocks all external fetches during preview (CSP `img-src blob: data:`).
- Stored locally: plugin toggles and SVGR options only.

## 9. Accessibility and mobile
- Plugin toggles are labelled switches with the explanation as `aria-describedby`. Before/after slider is keyboard operable (arrow keys) and has size info as text.
- Results and sanitizer removals announced via `aria-live`.
- Mobile: tabs scroll horizontally; settings in a `Sheet`; code output wraps.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] A Figma export fixture with metadata shrinks by at least 30% with at most 0.1% of pixels differing at 512 px (the exact count is shown).
- [ ] `viewBox` is present in every output.
- [ ] An SVG containing `<script>`, `onload`, `foreignObject`, and an external `href` yields sanitized output, a report listing all four, and no script execution in the preview.
- [ ] Toggling any plugin re-runs and updates size and diff within 1 s for a 100 KB file.
- [ ] A 5 MB SVG processes in a worker while main-thread tasks stay under 100 ms, and Cancel stops it within 1 s.
- [ ] TSX output compiles in a React 18+ project (tested with a fixture) and supports props spreading.
- [ ] `currentColor` option replaces chosen colors and leaves gradients intact.
- [ ] Data URI output renders when pasted into a CSS `background-image`.
- [ ] Batch ZIP contains one output per input with the naming pattern.
- [ ] No network request is made during processing.

## 12. Future ideas and open questions
- Ideas: sprite sheet (`<symbol>`) builder, icon-set naming and index export, Svelte/Angular/Solid output, SVG to PNG export, path simplification preview.
- Open: use full `@svgr/core` or own lightweight JSX writer if bundle is too heavy (verify)? Should "Keep scripts" ever be allowed for animation demos (recommended: no)?
