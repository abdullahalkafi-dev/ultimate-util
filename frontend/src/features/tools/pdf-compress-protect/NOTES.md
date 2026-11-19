# PDF Compress & Protect: gaps and decisions

- Implemented: Local PDF image recompression (Light/Balanced/Strong presets, custom DPI & JPEG quality, Target Size iterative ladder, metadata stripping, structural object-stream optimization via same-origin `/vendor/qpdf/qpdf.wasm`, never-larger original guard, Page 1 before/after visual comparison), AES-256 PDF encryption with configurable permissions via `qpdf-wasm`, PDF unlock (including automatic removal of owner-only restrictions), signed/PDF-A warnings, encrypted-input password prompt, batch processing up to 50 PDFs with ZIP download, and worker Cancel support.
- **Font subsetting / vector recompression:** Ghostscript and MuPDF are AGPL and intentionally excluded; compression re-encodes embedded raster images (`DCTDecode`, 8-bit `FlateDecode` RGB/Gray) and optimizes object streams via qpdf rather than subsetting embedded fonts.
- **JBIG2 / JPX / masked images:** skipped and kept untouched so quality/transparency is preserved.
- **Annotate flattening:** annotation flattening toggle is not included in v1.
