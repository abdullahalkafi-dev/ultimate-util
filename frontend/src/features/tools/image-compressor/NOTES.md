# F-006 — Image Compressor

Status: shipped (local Web Worker compression pipeline via `_shared-images`).

## Implementation notes
- Supports Smart, Lossy, and Lossless modes (`compress.ts`, `runItem.ts`) across PNG, JPEG, WebP, AVIF, and HEIC inputs with optional max-dimension resizing and background flattening when converting transparent images to JPEG.
- Lossless JPEG mode strips metadata segments directly via `stripJpeg` while preserving pixels byte-for-byte.
- Never returns an output larger than the original file when size reduction is the goal (`decideOutcome` marks them `already-optimized`).

## Known limitations
- Animated GIF/WebP inputs are skipped unless "Allow first frame only" is checked; multi-frame animated re-encoding is not performed.
- Browser encoding support for AVIF depends on the host browser's `OffscreenCanvas`/`encode` codecs.
