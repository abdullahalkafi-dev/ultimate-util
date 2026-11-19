# Image Editor: gaps and decisions

Implemented: Basic (crop with presets and numeric fields, rotate 90 and free, flip, resize, adjust, filters), Advanced (layers with order, visibility, lock, opacity, blend; adjustment layers with exposure, levels, curves, auto levels; text with RTL toggle; box, oval, line, arrow, pen, marker, step numbers; eraser; solid, pixelate and blur redaction; history panel; project save and open), Annotate mode, PNG/JPG/WebP export with quality and scale, copy PNG.

Not implemented or different from the spec:
- **Project format** is a single JSON `.uuproj` (layer model plus PNG data URLs), not a ZIP. Undo history is not stored in the file.
- **AVIF export**: not offered (no browser canvas encoder; `@jsquash/avif` not wired in).
- **Keep metadata toggle**: exports always drop EXIF because pixels are re-encoded from a canvas.
- **HEIC input**: refused with a message that points to the converter tool.
- **Crop handles**: the crop area is drawn by dragging or typed numerically; there are no corner handles to resize it afterwards (draw a new one or edit the numbers).
- **Geometry ops flatten**: crop, rotate, flip and resize merge all layers (and adjustments) into one image first.
- **Workers / Cancel**: all processing is synchronous on the main thread (no OffscreenCanvas worker), so a heavy operation cannot be cancelled mid-way; a "busy" indicator is shown. Filters are Canvas 2D, no WebGL.
- **Preview proxy**: the on-screen canvas is rendered at up to 2048 px on the long side. Exports render at full resolution. Images above 50 MP (or 16384 px per side) are downscaled on open.
- **Fonts**: system font stacks only (sans, serif, monospace). No bundled fonts, so projects do not embed fonts and a missing glyph shows as a box.
- **Autosave to IndexedDB, edge-case tabs for multiple dropped files, Space-to-pan, touch pinch zoom, ShortcutHint popover, per-brush smoothing**: not implemented. Two-finger gestures on touch are not handled; one finger draws.
- **Redaction scope**: redaction rewrites every visible image layer under the region; text, shapes and strokes above it are not changed (a toast says so). "Flatten" discards underlying layers.
- **Eraser** only works on image layers.
- **History memory**: each redact or erase stores a full copy of the affected layer bitmap; the 50-step cap bounds it. Bitmaps not referenced by any step are dropped.
