# F-001 — DOCX Viewer & Editor

Status: shipped (local DOCX preview, TipTap rich editor, and client export).

## Implementation notes
- Validates DOCX magic bytes and size limits via `openDocx`, detects fidelity parts, and sanitizes Mammoth HTML output with DOMPurify (external image URLs are never fetched).
- Supports read-only viewer zoom/find, TipTap editing with IndexedDB draft recovery and cross-tab `BroadcastChannel` awareness, plus PDF, DOCX (`docx` package), HTML, Markdown, and plain-text export (`exporters.ts`).

## Known limitations
- Client PDF export renders HTML with the shared PDF exporter rather than running a full Microsoft Word layout engine, so complex DOCX positioning, headers/footers, macros, and non-Latin script shaping can simplify on round-trip.
- Edits above 20 MB on mobile trigger size guardrails in the UI.
