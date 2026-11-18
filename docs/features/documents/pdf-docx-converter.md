---
id: F-002
slug: pdf-docx-converter
title: PDF ⇄ DOCX Converter
category: documents
tier: client
priority: P1
status: planned
depends_on: [F-001, F-005]
---

# PDF ⇄ DOCX Converter

## 1. Summary
Convert DOCX to PDF (high quality, via the same engine as F-001) and PDF to DOCX (text and structure conversion) locally, so confidential documents are never uploaded.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Office worker | Has a PDF contract, needs to edit a clause | Editable DOCX with the text and basic structure |
| Freelancer | Client's Word proposal must go out as PDF | One-click PDF |
| Student | PDF worksheet to fill in | DOCX to type into |
| Anyone | Scanned PDF | Prompt to run OCR first (F-005) |

## 3. User flow
1. Tool opens with a `SegmentedControl`: **DOCX to PDF** | **PDF to DOCX**, and one `DropZone`. Dropping a file auto-picks the direction.
2. Options panel: for DOCX to PDF (page size, margins, embed fonts, compress images). For PDF to DOCX (page range, detect headings/lists, keep images, "Treat as scanned (OCR)").
3. Click **Convert**. `ProgressBar` with steps (reading, analyzing layout, building file).
4. `ResultCard`: preview thumbnail of first pages, sizes, **Download**, and a **Fidelity report** ("Converted 12 pages: 3 tables detected, 2 images kept, 1 page looks scanned").
5. Batch: several files convert in sequence, results ZIP.

## 4. Inputs and outputs
- **Inputs:** `.pdf` (up to 100 MB soft), `.docx` (50 MB soft, as F-001). Batch up to 20 (lower than the default 50 because each conversion is heavy).
- **Outputs:** `.docx` or `.pdf`. Name: `<name>-converted.<ext>`; batches download as ZIP (conventions).

## 5. Components and tech
- **UI:** `ToolShell`, `SegmentedControl`, `DropZone`, `FileList`, `SettingsPanel`, `ProgressBar`, `ResultCard`, `DownloadButton`, `ErrorBanner`. New: `FidelityReport`.
- **PDF to DOCX:** pdf.js (text positions, fonts, images) then own layout heuristics (lines to paragraphs, columns, lists, tables by ruling lines/alignment) then `docx` (MIT). Runs in a worker.
- **DOCX to PDF:** F-001 export pipeline (inherits its main-thread/DOM constraint and its complex-script shaping risk; see F-001 section 5).
- OCR path hands off to Tesseract (F-005).
- **Where it runs:** PDF to DOCX in a worker (pdf.js worker plus own heuristics). Layout heuristics are own code and a quality risk: spike on 10 real PDFs before promising anything.

## 6. Behavior rules
- Honest promise shown in UI: "Text and structure are converted. Complex layouts may differ."
- Reading order is determined per page; multi-column pages are detected and flattened in column order.
- Images are placed inline at their original position where possible.
- Scanned pages (no text layer) are detected; user is offered **Run OCR** (language picker) instead of producing an empty DOCX.
- Fonts: output uses closest standard fonts; original font names preserved as metadata when known.
- Conversion never alters the source file.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Password-protected PDF | Ask password via `PasswordPrompt`; if wrong, retry; never stored |
| Scanned/image-only PDF | Detect, warn, offer OCR |
| Mixed (some pages scanned) | Convert text pages, flag scanned pages in report, offer OCR for those |
| Multi-column, sidebars, footnotes | Best-effort flow order; report lists pages with low confidence |
| Tables without borders | Heuristic alignment detection; if low confidence, output as tabbed paragraphs and say so |
| Complex forms (fillable fields) | Fields flattened to text; notice |
| Vector charts/diagrams | Rasterized as images at 150 dpi |
| Right-to-left / Indic scripts | Preserve text order; warn if shaping or font is uncertain |
| 500-page PDF | Process in chunks with progress; allow page range; warn about memory |
| Corrupt PDF | pdf.js repair attempt; otherwise clear error |
| DOCX with unsupported content (macros, external links) | Ignored/noted in report |
| User cancels mid-way | Worker terminated, nothing downloaded |
| Embedded fonts not available | Substituted; listed in report |
| Empty/0-byte file or wrong type (renamed file) | Magic-byte check; error names the detected type |
| Batch partial failure | Failed files listed with reason; ZIP contains the successes |
| Digitally signed PDF | Signature is not carried over; report notes it |
| Hyperlinks, external links in DOCX | Kept as link text only; never fetched |
| Unsupported browser (no Worker/WASM) | Clear message; tool disabled, no broken UI |
| Phone / low memory | Page range suggested above ~50 pages; process one page at a time; "best on desktop" tip |
| Non-Latin filename or content | UTF-8 names preserved; text order preserved, shaping warning per the RTL/Indic row |

## 8. Limits, performance, privacy
- Target: 20-page text PDF to DOCX in under 15 seconds on a mid-range laptop.
- No network for content. Libraries load on demand.

## 9. Accessibility and mobile
Same patterns as shared conventions. Mobile: single column; very large PDFs show a "best on desktop" tip but still work.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] On 10 text-based single-column fixture PDFs, extracted text matches the source at 98% or better character accuracy and paragraph breaks are correct on at least 90% of paragraphs (targets to validate).
- [ ] Scanned PDF triggers the OCR offer, never an empty file.
- [ ] Report lists pages that may differ.
- [ ] DOCX to PDF output has the same page count and fonts as the F-001 export of the same file.
- [ ] A 20-page text PDF converts in under 15 seconds (target) and Cancel stops within 2 seconds.
- [ ] A corrupt file in a batch fails alone; the ZIP holds the rest.
- [ ] No network request carries file content.
- [ ] Wrong password shows retry, correct password proceeds.

## 12. Future ideas and open questions
- Better table reconstruction, PDF forms to DOCX content controls, layout-faithful mode via a paid/server engine as an optional add-on (would break the "no upload" promise, so only with explicit opt-in).
