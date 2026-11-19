# Palette Generator & Contrast Checker: gaps and decisions

- Implemented: OKLCH and HSL harmonies (analogous, complementary, triadic, tetradic, split, monochrome), swatch locking, undo/redo, Space shuffle, median-cut extraction from uploaded images (downscaled to 200 px via `createImageBitmap` / Canvas), WCAG 2.x contrast checker with alpha compositing, OKLCH lightness suggestions, palette contrast matrix, Machado color-blindness simulation, CSS/Tailwind v3/Tailwind v4/SCSS/JSON/PNG strip export, and optional cloud save when signed in.
- **APCA informational score:** omitted in v1 (only WCAG 2.x AA/AAA ratios and verdicts are computed and displayed).
- **Image quantization thread:** `extractFromFile` downscales the image to 200 px width via `createImageBitmap` and runs median-cut on the main thread (typically < 10 ms for <= 60,000 samples) rather than spawning a dedicated Worker; there is no mid-run Cancel button for image extraction.
- **OKLCH unclipped export:** exported CSS/JSON values reflect the sRGB-gamut-mapped colors shown in the palette.
