---
id: F-003
slug: pdf-merge-split-reorder
title: PDF Merge, Split & Reorder
category: documents
tier: client
priority: P0
status: planned
depends_on: []
---

# PDF Merge, Split & Reorder

## 1. Summary
Combine several PDFs into one, extract or split pages, rotate, delete and reorder pages by drag and drop, all locally.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Job applicant | Needs one PDF of CV + certificates | Merged, ordered PDF |
| Accountant | 200-page statement, only pages 5 to 9 needed | Extracted range |
| Student | Scanned pages in wrong order, some upside down | Reordered and rotated file |
| Office | Contract split by signer | Split into separate files |

## 3. User flow
1. `DropZone` accepts multiple PDFs (and images, converted to pages). Empty state explains the three modes.
2. Files show as `FileList` with page counts; **Page view** shows `PageThumbGrid` of all pages from all files, color-tagged by source file.
3. Tabs: **Merge/Arrange** (default), **Split**, **Extract**.
   - Arrange: drag pages, rotate (90°), delete, duplicate, insert blank page, select multiple.
   - Split: by every N pages, by page ranges (`1-3, 5, 8-`), by bookmarks/outline, by file size.
   - Extract: type ranges or click pages, get one new PDF.
4. **Export** (`DownloadButton`): single PDF, or ZIP of split parts. Names: `<first-name>-merged.pdf`, `<name>-part-1.pdf`, `<name>-extract.pdf`; ZIP `<name>-split.zip`.
5. Undo/redo for page operations.

## 4. Inputs and outputs
- **Inputs:** PDFs (each up to 200 MB soft, total 500 MB soft), JPG/PNG images (each becomes a page, sized to fit A4/Letter or original; HEIC must be converted first with F-007). Up to 50 files per session (conventions). Ranges typed as text.
- **Outputs:** PDF(s) preserving page content and text selectability; links, bookmarks and form fields are best effort (see section 5); ZIP for multi-output.

## 5. Components and tech
- **UI:** `ToolShell`, `DropZone`, `FileList`, `PageThumbGrid` (lazy), `Tabs`, `SegmentedControl`, `NumberField`, `ProgressBar`, `ResultCard`, `DownloadButton`, `PasswordPrompt`, `Toast` (undo).
- **Tech:** pdf.js (Apache-2.0) to render thumbnails; pdf-lib (MIT) to copy pages and write output; fflate for ZIP. Worker for copy/write.
- **Known pdf-lib limits (verify in spike):** it does not decrypt (encrypted files must be decrypted first, using the qpdf-wasm module shared with F-004), copying pages may drop the outline/bookmarks and AcroForm field structure, and internal link destinations pointing to pages that were not copied break. Bookmarks, form handling and link repair therefore need own code or are best effort; the UI must not promise them until the spike confirms.

## 6. Behavior rules
- Thumbnails render lazily; selecting does not re-render.
- Reordering across source files is allowed; output follows visible order.
- Rotation is stored as page rotation metadata (non-destructive).
- Page size mismatches are preserved (no forced resizing) unless user picks "Normalize page size".
- Range syntax: commas, dashes, open ends (`5-`), `last`, whitespace tolerant; invalid input highlights the exact token.
- Metadata: title from first file by default; editable; option to strip metadata.
- Bookmarks/outline merged with file names as top-level entries (option).

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Encrypted PDF (owner password only) | Opens without a password by design; show a notice that the source had restrictions and that the output is unrestricted (owner decision, see section 12) |
| User-password protected | `PasswordPrompt`; decrypt in worker (qpdf-wasm, verify); skip file if cancelled; wrong password allows retry |
| Empty/0-byte file or renamed non-PDF | Magic-byte check (`%PDF-`); that file fails with the detected type, others continue |
| Unsupported browser (no Worker/WASM) | Clear message; tool disabled |
| Non-Latin file names or bookmark titles (CJK, Arabic, Bengali) | Preserved as UTF-8 in file names and outline titles; thumbnails and labels render RTL correctly |
| Phone / low memory | Cap thumbnail resolution, render few at a time, suggest processing per file; warn before merging above ~200 MB total on mobile (verify) |
| Corrupt PDF in the batch | Mark that file failed with reason; continue others |
| Range beyond page count (`1-999`) | Clamp with message "Document has 12 pages" |
| Overlapping/duplicate ranges | Allowed for extract (duplicates pages); warn |
| Empty selection on export | Disable export, show hint |
| Mixed orientations/sizes | Preserved; preview shows true aspect |
| 1,000+ pages total | Virtualized grid; warn on memory; allow processing by file |
| Fillable forms in merged files | Field names may collide: rename with suffix or flatten (option) |
| Images with transparency / CMYK / huge dimensions | Convert to RGB, downscale above 8000 px with notice |
| Signed PDFs | Merging/splitting invalidates signatures: show notice before |
| Cancel during export | Worker stopped, no partial download |
| Same file added twice | Allowed; labeled `(2)` |

## 8. Limits, performance, privacy
Target: merge 5 PDFs of 20 pages each in under 5 seconds on a mid-range laptop (validate). Memory guard: warn when estimated usage exceeds about 1 GB. No network request carries file content; files are never persisted.

## 9. Accessibility and mobile
Keyboard reordering (select page, Alt+Arrow to move), screen-reader labels "Page 3 of file X". Mobile: tap to select, a "Move" sheet replaces drag; two-column thumbnail grid.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] Merge of 5 fixture PDFs keeps text selectable (search finds the same words) and external links clickable; internal links/bookmarks behave per the spike outcome and the UI claims nothing more.
- [ ] Merging 5 x 20-page PDFs takes under 5 seconds (target).
- [ ] Cancel during export stops within 2 seconds with no download.
- [ ] A 0-byte file and a renamed non-PDF fail alone in a batch.
- [ ] Drag reorder and keyboard reorder both work.
- [ ] Split by ranges, every N pages and by size produce correct files in a ZIP.
- [ ] Invalid range input highlights the error and does not export.
- [ ] A failed file never blocks the rest.

## 12. Future ideas and open questions
Page numbers/watermark/header stamping, crop pages, N-up printing layout, compare two PDFs, extract images.
Open: should owner-password-only PDFs be mergeable (restrictions dropped)? Bookmark preservation: build own outline copier or drop the feature?
