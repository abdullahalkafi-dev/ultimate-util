---
id: F-005
slug: ocr
title: OCR (Image/PDF to Text)
category: documents
tier: client
priority: P1
status: planned
depends_on: []
---

# OCR (Image/PDF to Text)

## 1. Summary
Extract selectable, copyable text from photos, screenshots and scanned PDFs using on-device OCR. Optionally produce a searchable PDF.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Student | Photo of a textbook page | Copyable text |
| Office | Scanned invoice PDF | Searchable PDF and text |
| Traveler | Screenshot in another script | Text in that language to copy |
| Developer | Error message in a screenshot | Text to paste |

## 3. User flow
1. Empty state: `EmptyState` with purpose, "Try an example" and a `DropZone` for images (PNG, JPG, WebP, BMP, TIFF) and PDFs; paste from clipboard works. HEIC is not read directly: convert it first with F-007.
2. **Language picker** (multi-select, default from browser language + English). Shows size of each language pack before first download.
3. Options: auto-rotate, preprocess (grayscale, contrast, denoise), page range for PDFs, output type.
4. **Recognize** starts; per-page `ProgressBar`; text appears page by page in a result pane next to the page image, with word boxes highlighted on hover.
5. Done state: edit text inline; **Copy**, **Download .txt**, **Download searchable PDF**, **Download .docx** (built with the `docx` library; an "Open in editor" link loads it in F-001). **Start over** clears everything.
6. Confidence indicator per word/line; low confidence shown underlined.
7. Cancel is available during recognition and keeps the pages already done.

## 4. Inputs and outputs
- **Inputs:** images up to 30 MB each, PDFs up to 100 pages soft cap per run (page range selectable); up to 50 files per batch (conventions).
- **Outputs:** plain text, searchable PDF (invisible text layer over image), DOCX, optional JSON with word boxes. Names `<name>-ocr.txt`, `<name>-ocr.pdf`, `<name>-ocr.docx`; multiple files as ZIP.

## 5. Components and tech
- **UI:** `ToolShell`, `DropZone`, `FileList`, `SettingsPanel`, `ImageCanvas` (with boxes), `ProgressBar`, `CodeOutput`-like text pane, `CopyButton`, `DownloadButton`, `LibraryLoader`. New: `LanguagePicker`.
- **Tech:** tesseract.js (Apache-2.0) in a worker, language data from own host (cached, `tessdata_fast`), pdf.js to rasterize PDF pages at about 200 to 300 dpi, pdf-lib for searchable PDF. tesseract.js defaults to loading its worker, core and language data from a public CDN: configure all three paths to our own origin (conventions: no third-party requests). Searchable PDF with non-Latin text needs an embedded font for the invisible layer (CJK/Indic fonts are large; verify approach, tesseract.js also has its own PDF output to compare).
- **Where it runs:** OCR in a Web Worker (WASM); page rasterization in the pdf.js worker; searchable-PDF assembly in a worker.

## 6. Behavior rules
- First use downloads the engine and language data from **our own origin** (not a third-party CDN) and caches it; show sizes.
- Pages processed sequentially in one worker (or small pool, based on `hardwareConcurrency`), cancellable.
- Preprocessing preview lets the user see the cleaned image before running.
- Reading order follows detected layout; columns best-effort.
- Output text preserves line breaks; option "Join lines into paragraphs".

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Wrong/missing language | Show low-confidence warning and suggest picking the language |
| Handwriting | Notice that handwriting accuracy is low |
| Rotated/skewed/photographed page | Auto-rotate/deskew; manual rotate control |
| Low resolution (< 150 dpi) | Warn, offer upscale |
| Very large image (e.g. 12000 px) | Downscale working copy |
| Text-based PDF (already has text) | Detect and offer "Extract existing text" (instant, accurate) instead of OCR |
| Dark mode screenshots (light on dark) | Auto-invert option |
| Right-to-left and Indic scripts | Supported only if language pack chosen; warn that accuracy varies |
| Tables | Text only; mention table structure is not reconstructed |
| Memory pressure on mobile | Process one page at a time, free canvases |
| Offline after first run | Works if language data cached |
| User cancels | Stop worker, keep text recognized so far |
| Empty/0-byte, corrupt or renamed non-image file | Magic-byte check; clear error naming the detected type |
| Password-protected PDF | `PasswordPrompt`; retry on wrong password; never stored |
| Batch partial failure | Failed files marked with reason and Retry; successes still downloadable |
| Unsupported browser (no Worker/WASM) | Clear message; tool disabled |
| Non-Latin file names | Preserved in output names (UTF-8, ZIP flag) |
| HEIC dropped | Message pointing to F-007 to convert first |
| First run offline, language data missing | Error naming the missing pack with Retry; no partial silent run |

## 8. Limits, performance, privacy
Speed estimate: about 2 to 8 seconds per page on desktop. Data downloads: engine about 2 to 4 MB plus language packs (about 2 to 15 MB each; verify). No image or text leaves the device.

## 9. Accessibility and mobile
Result text is a real text area (screen-reader friendly). Mobile: process fewer pages at once; camera capture via file input `capture` attribute.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] On 10 clear printed English pages at 300 dpi, at least 95% of words are correct (target; measure against ground-truth text).
- [ ] Text PDF offers extraction without OCR.
- [ ] Language data cached after first download; works offline later.
- [ ] Searchable PDF highlights match positions correctly when searched.
- [ ] Cancel stops within 2 seconds and keeps partial results.
- [ ] No request goes to a third-party host (engine, worker and language data come from our origin); no request carries image or text content.
- [ ] A corrupt file in a batch fails alone.

## 12. Future ideas and open questions
Table detection to CSV, receipt/invoice field extraction, live camera OCR, translate result (needs network, opt-in).
