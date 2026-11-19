# F-009 — Background Remover

Status: shipped (local Classical cutout by default; optional BYO-model ONNX AI inference).

## Architecture notes
- **Classical Fast Cutout** runs immediately with zero model downloads using `classicalMask` (edge flood fill or global chroma distance), color sampling (`sampleBackground` / interactive `Sample BG` eyedropper), and edge color decontamination (`decontaminate`).
- **ONNX AI Mode** configures `onnxruntime-web` with self-hosted WASM files under `/vendor/ort/` (`ort-wasm-simd-threaded.mjs` and `.wasm`) and tries WebGPU with fallback to single-thread WASM so no COOP/COEP headers are required on this route.
- In keeping with the repository license policy (no non-commercial RMBG weights bundled), users can either host a permissive segmentation `.onnx` file at `/models/background-removal.onnx` or load any local `.onnx` segmentation model from disk directly in the browser.

## Known gaps vs full `docs/features/media/background-remover.md`
- Working images larger than 1600px on the longest edge are scaled to 1600px during editing/export for responsive canvas memory usage rather than running full multi-tile 4K inference.
- Batch processing runs sequentially over the queue and applies current settings rather than storing per-file independent settings.
- Live brush dab preview is committed on pointer release (full stroke replay) rather than compositing incremental brush previews mid-drag.
