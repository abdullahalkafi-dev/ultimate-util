# OCR (Image/PDF to Text): gaps and decisions

- Implemented: On-device OCR using `tesseract.js` v7 configured strictly to same-origin `/vendor/tesseract/worker.min.js`, `/vendor/tesseract/core/`, and `/vendor/tesseract/lang/eng.traineddata.gz` (no CDN requests), PDF embedded-text detection & instant extraction, PDF page rasterization via `pdfjs-dist`, preprocessing controls (grayscale, contrast, invert for dark screenshots, 90/180/270° rotation), word confidence bounding-box overlay, editable text output with paragraph joining, and exports to `.txt`, `.docx`, JSON word boxes, and searchable PDF.
- **Language packs:** Only English (`eng`, `4.0.0_best_int` 2.82 MB) is bundled locally in `public/vendor/tesseract/lang/`. Additional language packs are omitted in v1 to avoid fetching from external CDNs or bloating the container image.
- **Batch queue:** Processes one image or multi-page PDF (selectable page range) per run rather than a multi-file ZIP queue.
- **Non-Latin searchable PDF text:** Embedded standard Helvetica in `pdf-lib` only writes WinAnsi characters into the invisible PDF search layer; non-Latin scripts should use `.txt` or `.docx` export.
