# F-018 — JSON / YAML / XML Formatter

Status: shipped (local validation, formatting, conversion, tree/path view, and diff).

## Implementation notes
- Parses, validates, beautifies, minifies, converts between JSON, YAML (1.1 / 1.2), and XML, flags unsafe IEEE-754 integers (`countUnsafeNumbers` / `isUnsafeNumber`), and provides line and semantic diffs (`compare.ts`).
- Automatically offloads inputs larger than `WORKER_THRESHOLD` to a cancellable Web Worker (`pipeline.worker.ts`) to keep the UI responsive.

## Known limitations
- Very large multi-megabyte documents run synchronously inside the dedicated Web Worker, so progress updates remain indeterminate until completion or cancellation.
