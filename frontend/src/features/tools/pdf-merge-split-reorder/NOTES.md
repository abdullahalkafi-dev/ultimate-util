# PDF Merge, Split & Reorder: gaps

- Not run in a real browser by the author: UI, drag and drop, thumbnails and the qpdf/pdf.js workers are type-checked but only the pure logic (ranges, arrange ops, pdf-lib build, qpdf encrypt/decrypt in node) is unit tested.
- Bookmarks/outline are not copied to the output (pdf-lib does not do it; no own copier written). Merge option "bookmarks with file names" is therefore absent. Splitting BY bookmarks works (reads top-level outline of the first PDF, positions refer to original order).
- Form fields: no rename-on-collision and no flatten option. Internal links to pages that are not copied are not repaired.
- "Normalize page size" is not implemented (page sizes are always preserved).
- Page thumbnails are lazily rendered (IntersectionObserver, 2 at a time) but the card list itself is not windowed; 1,000+ pages render as plain cards. No mobile-specific memory warning beyond the 200 MB / 500 MB banner.
- Split by size uses per-source average page size as an estimate, not measured sizes.
- Encrypted PDFs are decrypted with the shared qpdf worker in `_pdf-shared/`; owner-only files open without a prompt and a notice is shown.
- Export runs in a worker; Cancel terminates it. Source bytes are copied into the worker for each export.
- HEIC is rejected with a message (convert first); images >8000 px are downscaled through a canvas.
