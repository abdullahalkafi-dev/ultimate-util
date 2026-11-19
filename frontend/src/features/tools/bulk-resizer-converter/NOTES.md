# Bulk Image Resizer & Format Converter: gaps and decisions

- Implemented: Batch resize and format conversion (JPG, PNG, WebP, AVIF, plus GIF/BMP/HEIC/SVG input) up to 50 files via Web Worker pool (`ImagePool`), pixels/percent/long-edge/social presets (`PRESETS`), fit/cover/pad modes with 9-point anchor grid, "Do not enlarge" default guard, multi-size rows (up to 8), SVG rasterization at 1x/2x/3x scales (without running scripts or fetching external refs), live rename pattern validation, and flat or folder-per-size ZIP download.
- **SVG base fallback:** if an SVG lacks both `width`/`height` and `viewBox`, it defaults to `svgBaseWidth` (512 px) from settings.
- **AVIF decode/encode:** relies on jSquash WASM codecs in `_shared-images/codecs.ts`; very large files are capped at 100 MP and 100 MB.
- **Per-item live preview:** shows exact computed output dimensions and output count for the first image rather than a live re-encoded thumbnail image before running Convert.
