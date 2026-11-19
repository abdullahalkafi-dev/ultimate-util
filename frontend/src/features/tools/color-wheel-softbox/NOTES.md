# F-012 — Color Wheel & Softbox Light

Status: shipped (interactive HSL/OKLCH wheel and fullscreen studio softbox stage).

## Implementation notes
- `wheel.ts` implements HSL and OKLCH color spaces (`MAX_CHROMA = 0.32`) with pointer drag, keyboard arrow/PageUp/PageDown stepping, gamut-clipping detection, and accessible `hueName` narration.
- `softbox.ts` generates pure CSS radial/panel lighting (`flat`, `vignette`, `ring`, `panel`) with Kelvin temperature tinting (`kelvinToRgb`), brightness, softness, and size controls.
- `device.ts` supports native Fullscreen API with pseudo-fullscreen overlay fallback (e.g. iOS Safari), Screen Wake Lock acquisition, and browser `EyeDropper` when supported.

## Known limitations
- Screen-pixel sampling via `EyeDropper` is hidden/unavailable on browsers that do not implement the Web EyeDropper API.
- Cloud palette saving links to F-031 (`saved-palettes-presets`) when signed in; unauthenticated visitors keep local state only.
