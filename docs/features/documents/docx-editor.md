---
id: F-001
slug: docx-editor
title: DOCX Viewer & Editor
category: documents
tier: client
priority: P0
status: planned
depends_on: [F-003]
---

# DOCX Viewer & Editor

## 1. Summary
Open a client's `.docx` without Microsoft Word, read it with a faithful page-style view, edit it with a live preview, or write a new document from scratch, then save it as PDF (or DOCX, HTML, Markdown, TXT). Everything happens in the browser. Nothing is uploaded or saved to a database.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Freelancer | Client emails a contract/brief as .docx, no Word installed | Opens it instantly, reads it as pages, adds notes, exports PDF |
| Job seeker | Needs a quick resume or letter, then a PDF to send | Writes in a clean editor, exports PDF in one click |
| Student | Receives a Word assignment template on a phone or library PC | Fills it in and downloads DOCX/PDF |
| Business owner | Sends a quotation to many people | Edits a saved template file, exports PDF each time |
| Privacy-minded user | Document is confidential | Confirms nothing leaves the device (offline works after first load) |

## 3. User flow
1. Land on tool. Empty state: big `DropZone` ("Open a .docx") and two buttons: **Open file** and **New blank document**. A sample document link.
2. After opening: **Viewer mode** by default for opened files (read-only page view, zoom, page count, search). Toolbar button **Edit** switches to editor mode. New documents start in editor mode.
3. **Editor mode:** split layout. Left or main: editor with formatting toolbar. Right (toggle): live **page preview** that updates as you type (debounced). On mobile, preview is a tab, not a split.
4. User edits: headings, bold/italic/underline, lists, tables, links, images, alignment, page breaks, undo/redo, find/replace.
5. **Export menu:** PDF (primary), DOCX, HTML, Markdown, plain text, Print. Choose page size (A4/Letter), margins, include page numbers.
6. Done state: file downloads; toast "Saved as report.pdf". Draft stays in the browser (autosave) with a visible **Clear draft** button.

```
[ Open ] [ New ]   Viewer | Edit        Zoom  Find   [Export ▾]
+------------------------------+  +-------------------+
|  Formatting toolbar          |  |  Page preview     |
|  ----------------------------|  |  (live, paginated)|
|  Editor surface              |  |                   |
+------------------------------+  +-------------------+
 Local · Not uploaded · Autosaved on this device
```

## 4. Inputs and outputs
- **Inputs:** `.docx` (also `.dotx`), drag-drop/paste/picker; images to insert (PNG, JPG, GIF, WebP, SVG); typed content. Max 50 MB docx (soft), 20 MB per inserted image (soft).
- **Outputs:** PDF (selectable text, embedded fonts where possible), DOCX, HTML (cleaned), Markdown, TXT. Filename keeps the original: `contract-edited.pdf`.
- Old `.doc` (binary) is **not** supported; show message with how to resave as .docx.

## 5. Components and tech
- **UI:** `ToolShell`, `DropZone`, `Tabs` (Viewer/Edit/Preview), `SplitPane`, `ProgressBar`, `DownloadButton`, `ConfirmDialog`, `Toast`, `ErrorBanner`, `HelpPopover`, `LibraryLoader`. New: `RichTextToolbar`, `PagePreview`, `ExportDialog`, `FidelityNotice`, `DraftBanner`.
- **Viewer:** `docx-preview` (Apache-2.0) renders pages with headers/footers, tables, images. Fallback: `mammoth` HTML.
- **Editor:** TipTap/ProseMirror (MIT) with tables, lists, images, links extensions. Import via DOCX to editor-JSON conversion (own mapper over mammoth/OOXML parsing). Evaluate SuperDoc for higher-fidelity round trip (see research notes); its license (AGPL vs commercial) and fidelity claims are unverified, so do not adopt before the DOCX spike.
- **Export DOCX:** `docx` library (MIT). **Export PDF:** paginated HTML rendered through a print-style layout engine to PDF (pdf-lib/jsPDF + html layout; the exact engine is a spike decision). Risk: simple PDF libraries do not shape complex scripts (Arabic, Bengali, Devanagari) or handle bidi; the spike must prove correct glyphs or pick another engine. `window.print` is only a fallback.
- **Storage:** IndexedDB for autosave draft only.
- **Where it runs:** editing on the main thread; DOCX parsing and DOCX/ZIP writing in a worker. PDF layout needs a DOM, so it runs on the main thread (chunked, with Cancel) or an offscreen iframe; heavy font/PDF writing may go to a worker. Decide in the spike.

## 6. Behavior rules
- Opened files open in **Viewer first** so the original is never altered by accident. Editing creates a working copy; the original file is untouched.
- **Fidelity notice** (dismissible, once per file) appears when the doc contains features the editor cannot preserve (text boxes, SmartArt, equations, tracked changes, complex fields, macros). It lists which and offers "Keep Viewer only" or "Edit anyway (some items may be simplified)".
- Preview updates on pause in typing (about 300 ms), keeps scroll position, and shows page breaks as pages.
- Export PDF text stays selectable (not a screenshot). Fonts: use embedded fonts if present; otherwise map to closest web-safe/open font and show which fonts were substituted.
- Autosave every few seconds to IndexedDB under a random draft ID. On reopening the tool: banner "Restore your last draft?" with Restore / Discard.
- Nothing is sent over the network. External images referenced in the docx are **not** fetched (show placeholder and a note).
- Macros/scripts in `.docm` are never executed; `.docm` rejected or opened with macros stripped, with a notice.
- Tracked changes: viewer shows them (insertions/deletions colored); export option "Accept all" or "Keep as comments in PDF" (default: show final text).
- Comments: shown in a side list in viewer; not editable in v1.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Password-protected / encrypted docx | Detect; message "This file is password protected. Remove the password in Word first." (v1 does not decrypt) |
| Corrupt or not really a docx (renamed zip/pdf) | Magic-byte check; clear error naming the detected type; if it is a PDF, link to F-002 (PDF to DOCX) or F-003 |
| Legacy `.doc` | Reject with how-to; suggest saving as .docx |
| 300-page document | Virtualize page rendering, load first pages first, progress for the rest; warn that live preview is paused above N pages and updates on demand |
| Huge embedded images | Downscale for preview only; full resolution kept in export (option "Compress images" for PDF) |
| Missing fonts (Calibri, Cambria, Arabic/Bengali fonts) | Substitute metrics-compatible open fonts (Carlito, Caladea); non-Latin scripts use Noto fonts; list substitutions in export dialog |
| RTL and mixed-direction text, Bengali/Arabic shaping | Preserve direction attributes; verify PDF export renders correct glyphs; if a script is unsupported in PDF export, warn before export |
| Tables with merged cells, nested tables | Preserve in view; editor supports merge/split; deeply nested tables flagged in notice |
| Headers/footers, page numbers, section breaks | Shown in viewer; editor keeps them read-only in v1 and re-exports them intact when possible |
| Text boxes, shapes, SmartArt, charts, equations | Viewer shows best effort or placeholder; editor shows locked placeholder block and keeps original XML when exporting DOCX where possible |
| Track changes + comments present | Fidelity notice; export defaults to final text |
| Pasting from Word/Google Docs/web | Clean paste: keep structure, drop inline junk styles; "Paste as plain text" shortcut |
| Very long single paragraph / no line breaks | Still renders; no freeze (chunked layout) |
| User closes tab with unsaved edits | Autosave covers it; `beforeunload` warning only if last autosave failed |
| IndexedDB blocked (private mode) | Banner "Autosave is off in private mode"; still works |
| Export fails midway (out of memory) | Error with suggestion: compress images, split document; draft preserved |
| Offline | Works after first load (PWA cache); message in `LibraryLoader` if first load offline |
| Browser print dialog blocked | Use direct PDF generation, not `window.print` as the primary path |
| Two tabs editing the same draft | Last tab to save wins; show "Draft changed in another tab" with reload option |
| Empty (0-byte) file | Error "This file is empty"; no viewer opened |
| Zip-bomb docx (tiny file, huge decompressed XML/media) | Cap total uncompressed size (target 500 MB) and entry count while unzipping in the worker; refuse with message |
| Hyperlinks in the document | Rendered as links with `rel="noopener noreferrer"`; never followed or prefetched; `file:` and `javascript:` URLs shown as plain text |
| Cancel during open or export | Worker/layout stopped, no partial download, document stays as it was |
| No Worker/WASM/IndexedDB support | Viewer and export degrade with a clear message; autosave off |
| Mobile, low memory | Viewer pages rendered on demand; editor refuses documents above ~20 MB docx on phones with a "use desktop" notice (verify limit) |

## 8. Limits, performance, privacy
- Open time target: under 2 seconds for a 100-page text document on a mid-range laptop. Docx over 50 MB: warn; over about 150 MB: refuse with explanation.
- Libraries (about 1 to 3 MB total, verify) load on tool open; PDF export engine loads on first export.
- Network: none for user content. Font substitutes are bundled, not fetched.
- Stored locally: autosaved draft (documents may be large; cap at 100 MB total, oldest draft pruned with notice).

## 9. Accessibility and mobile
- Editor fully keyboard operable with standard shortcuts (Ctrl+B/I/U/Z/Y, Ctrl+F). Toolbar is a roving-tabindex toolbar with labels. Viewer pages have `role="document"` and headings navigable.
- Screen readers: document outline panel (headings list) jumpable.
- Mobile: viewer is the main mode; editor available with simplified toolbar; preview as a tab; export from a bottom sheet. Pinch zoom in viewer.

## 10. Data
N/A, client-only. Drafts are local to the device.

## 11. Acceptance criteria
- [ ] On a fixture set of 10 real client docx files (tables, images, headers), at least 8 open with correct text, table structure and image placement and no overlapping or missing content (target to validate in the DOCX spike).
- [ ] Original file bytes are never modified by opening or editing.
- [ ] New blank doc to PDF takes under 5 clicks and the PDF text is selectable.
- [ ] Live preview reflects edits within 1 second for documents up to 30 pages.
- [ ] Unsupported content produces a visible, specific notice, never silent data loss.
- [ ] Works offline after first load; no network request contains document content.
- [ ] Draft restore works after a tab crash.
- [ ] Non-Latin text (Bengali, Arabic) exports to PDF with correct glyphs or shows a warning first.
- [ ] Cancel during export returns to the editor within 2 seconds with no download.
- [ ] A zip-bomb fixture and a 0-byte file are rejected with a message and no tab freeze.

## 12. Future ideas and open questions
- DOCX comments editing, tracked-change accept/reject UI, templates gallery (invoice, resume, letter), mail-merge from CSV, fill-in form fields, e-signature block, PPTX/XLSX viewers (separate tools).
- Open: ship SuperDoc if license and fidelity pass the spike? Accept "viewer fidelity high, editor fidelity medium" as the v1 promise?
