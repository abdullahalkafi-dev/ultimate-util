# F-011 — Video Trimmer & GIF Maker

Status: shipped (local FFmpeg single-thread WASM processing).

## Architecture notes
- Loads `@ffmpeg/core` single-thread assets directly from self-hosted `/vendor/ffmpeg/ffmpeg-core.js` and `/vendor/ffmpeg/ffmpeg-core.wasm` (zero CDN requests).
- Cross-origin isolation (`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`) is configured on `/tools/video-gif-maker` in `frontend/next.config.ts`.
- Cancellation terminates the active `@ffmpeg/ffmpeg` worker cleanly via `terminateFfmpeg()`.

## Known gaps vs full `docs/features/media/video-gif-maker.md`
- Timeline range editing uses accessible dual sliders, `MM:SS.mmm` numeric/text inputs, and playhead snap buttons rather than a custom draggable dual-thumb visual scrubber canvas with waveform/filmstrip thumbnails.
- Single-thread WASM `libvpx` / `libx264` encoding is CPU-bound in the browser; large >300 MB source files trigger a memory warning because Emscripten WASM linear memory is capped at ~2 GB (stream-copy trim remains fast).
- Audio-only merge/replace track workflow is omitted in favor of mute, extract (`mp3` / `wav` / `m4a`), `loudnorm`, and dB volume adjustments.
