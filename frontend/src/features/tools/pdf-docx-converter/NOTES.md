# F-002 — PDF ⇄ DOCX Converter

Status: shipped (local client-side conversion using pdf.js and docx).

## Implementation notes
- Validates file signatures (`readFirstBytes` + `sniffType`), supports batch queues up to 20 files with password prompts for encrypted PDFs, page-range selection, structure detection (headings/lists/tables in `layout.ts`), and ZIP download.
- Emits a structured `FidelityReport` flagging scanned/no-text pages, low-confidence pages, and unsupported scripts (`findUnsupportedScripts`).

## Known limitations
- Scanned/image-only PDFs without an embedded text layer are reported as `scanned` (use F-005 OCR to extract text from scanned PDFs).
- Images, vector graphics, fillable form fields, digital signatures, and original custom font names are not carried across conversions (`toDocx.ts` notes these explicitly).
- Non-Latin text shaping in `docxToPdf` warns when characters are not supported by the bundled PDF font.
