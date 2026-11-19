# F-015 — SVG Optimizer & JSX

Status: shipped (sandboxed Web Worker SVG optimization and React/Vue component export).

## Implementation notes
- Runs optimization in a dedicated per-job Web Worker (`client.ts` + `svg.worker.ts`) with Cancel support and a 30-second timeout; supports `.svg` and gzip-limited `.svgz` decompression up to 20 MB (`gunzipLimited`).
- Sanitizes dangerous elements/URIs (`sanitize.ts`), optimizes paths/attributes (`optimize.ts`), performs raster visual diff (`raster.ts`), and outputs SVG, React JSX, React Native SVG, Vue SFC, Data URI, CSS `background`, or TypeScript barrel exports.

## Known limitations
- Hard limit of 20 MB per file (and 50 files per batch) protects worker memory on deeply nested vector exports.
- Visual diff requires browser canvas rasterization and skips if an SVG fails to load into an `<img>` element cleanly.
