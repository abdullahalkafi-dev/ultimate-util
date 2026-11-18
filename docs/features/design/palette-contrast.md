---
id: F-013
slug: palette-contrast
title: Palette Generator & Contrast Checker
category: design
tier: client
priority: P0
status: planned
depends_on: [F-031]
---

# Palette Generator & Contrast Checker

## 1. Summary
Generate color palettes from a base color or an image using color-theory harmonies, check WCAG 2.x contrast for text and UI, simulate color blindness, and export to CSS, Tailwind, SCSS, JSON or PNG. Suggests accessible alternatives when a pair fails.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Web designer | Starting a brand with one color | Harmonious 5-color palette, exported as CSS variables |
| Front-end dev | Button text fails review for contrast | Ratio, AA/AAA verdict, nearest passing color |
| Content creator | Wants colors matching a photo | Dominant colors extracted from the image |
| Accessibility auditor | Checks a design for color-blind users | Side-by-side simulation of protanopia/deuteranopia/tritanopia |
| Product team (non-obvious) | Needs dark-mode pairs for each brand color | Shades per color with contrast shown against both backgrounds |

## 3. User flow
1. Empty state: base color field with a random pleasant default, `EmptyState` button **Generate** and **From image**. Tabs: Palette | Contrast | Color blindness.
2. **Palette tab:** choose harmony (`SegmentedControl`: analogous, complementary, triadic, tetradic, split-complementary, monochrome), count (3 to 10). Swatches appear in a row.
3. Each swatch has lock, copy, edit, and remove. **Shuffle** regenerates unlocked swatches (Space key). Undo/redo available.
4. **From image:** drop an image, extract N dominant colors (default 5), shown as a palette.
5. **Contrast tab:** foreground and background `ColorField`, live sample text (normal, large, UI component), ratio like `4.78:1`, pass/fail chips for AA/AAA. **Suggest fix** lists the nearest passing foreground values (adjusts OKLCH lightness only).
6. Matrix view: every palette color against white, black, and each other, with failures marked by icon + text.
7. Done: **Export** menu (CSS vars, Tailwind config, SCSS, JSON, PNG strip) with `CodeOutput` preview and `CopyButton`/`DownloadButton`. Save to F-031 if signed in.

## 4. Inputs and outputs
- **Inputs:** HEX (3/4/6/8), rgb(), hsl(), oklch(), CSS named colors; image (PNG, JPG, WebP, GIF first frame, AVIF where decodable; soft 50 MB, downscaled to about 200 px before sampling).
- **Outputs:** CSS (`--color-1: #…`), Tailwind (`colors: { brand: {50..900} }`, version verify), SCSS variables, JSON (`name, hex, oklch`), PNG swatch strip (1200 x 300 default). Filenames `palette-<hex>.<ext>`.

## 5. Components and tech
- **UI:** `ToolShell`, `Tabs`, `ColorSwatch`/`ColorField`, `SegmentedControl`, `Slider`/`NumberField`, `DropZone`, `ImageCanvas`, `CodeOutput`, `CopyButton`, `DownloadButton`, `Toast`, `ErrorBanner`, `AuthBadge`, `ShortcutHint`. New: `PaletteRow`, `ContrastPanel`, `ColorBlindPreview`.
- **Libraries:** `culori` (MIT) for parsing, OKLCH, harmony math, gamut mapping and WCAG contrast; image quantization via median-cut or k-means implemented in-house or a small lib (verify, e.g. `colorthief`/`quantize` licenses); color-blind simulation via Machado matrices (via culori filters or own code, verify); APCA via `apca-w3` (verify license) shown as informational only.
- **Where it runs:** main thread for palettes; quantization in a Web Worker for images.

## 6. Behavior rules
- Harmonies are computed in OKLCH (even lightness feel), with HSL available as an option; hue offsets: analogous +/-30, complementary 180, triadic 120, tetradic 90, split 150/210, monochrome varies lightness/chroma.
- Locked colors never change on shuffle; changing the base color or harmony keeps locks when possible.
- Contrast uses the WCAG 2.x relative luminance formula. Thresholds: normal text AA 4.5, AAA 7; large text (18 pt or 14 pt bold) AA 3, AAA 4.5; UI components and graphical objects 3 (non-text). Ratios are shown to 2 decimals, truncated (not rounded) so a displayed value never implies a pass: 4.499 is shown as 4.49 and fails AA. The pass/fail verdict uses the unrounded value. WCAG 2.x grades only AA and AAA for text, and AA for non-text (1.4.11); there is no AAA level for UI components.
- APCA Lc value is shown as a secondary, clearly labelled "informational, not part of WCAG 2.x"; pass/fail chips use WCAG only.
- Colors with alpha are composited over the chosen background before contrast is computed; the tool says which background it assumed.
- Suggestions keep hue and chroma, change OKLCH lightness by the smallest step that passes, gamut-map to sRGB, then re-check with the WCAG formula (OKLCH lightness is only the search axis; the verdict is always the WCAG ratio of the final sRGB color). Chroma is reduced only if gamut mapping demands it, and the result says so. If no lightness at that hue passes (rare, mid-tone backgrounds at AAA), the list offers black or white instead and says so.
- When the foreground has alpha it is composited over the background; when the background has alpha it is composited over white (stated in the result), since WCAG defines contrast only for opaque colors.
- Color-blind simulation is approximate; shown with the caveat "a simulation, not a substitute for testing with people".
- Palette is never uploaded; last palette is kept in localStorage.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Empty base color | Uses default or random color; no error |
| Invalid input (`#gg0000`, `rgb(1,2)`, `foo`) | Inline error under field, previous valid color kept |
| Short hex (`#f60`, `#f608`) | Expanded to full form and shown normalized |
| Named color (`rebeccapurple`) | Resolved to HEX; shown with name in tooltip |
| Alpha colors | Composited over background for contrast; note displayed; exports keep 8-digit HEX/`oklch(... / a)` |
| OKLCH out of sRGB gamut | Gamut-mapped for display and HEX; badge "Clipped"; export option for `oklch()` original values |
| Image is fully one color or grayscale | Return fewer distinct colors; message "Only 2 distinct colors found" |
| Huge image (50 MP) | Downscale before sampling in worker; Cancel button; no tab freeze |
| Transparent PNG | Transparent pixels ignored in extraction |
| Animated GIF/WebP | First frame only; note shown |
| Unsupported/corrupt image | Magic-byte check; error with fix; HEIC says "convert first" (link to F-007 Bulk Resizer & Converter) |
| Image decode unsupported (AVIF on older Safari), or no `OffscreenCanvas`/`createImageBitmap` resize | Error names the format; if only `OffscreenCanvas` is missing, downscale on the main thread with a progress bar |
| Image with a non-sRGB profile (Display P3, CMYK JPG) | Browser converts to sRGB on decode; note that extracted values are sRGB approximations |
| Phone browser canvas area limit (iOS Safari about 16.7 MP; verify) | Decode with `createImageBitmap` resize options so the full-size canvas is never created |
| Touch device | Color pick via native `<input type="color">`; swatch action buttons are 44 px; no hover-only controls |
| Foreground equals background | Ratio 1:1, fail on all; suggestion list offered |
| Exactly on threshold (4.5) | Passes AA; 4.499 fails |
| Monochrome with 10 colors at extreme lightness | Clamp lightness 5 to 97% to keep distinct steps |
| Tailwind export when names collide | Names suffixed (`brand-500`, `accent-500`); user can rename |
| Clipboard blocked | `CopyButton` falls back to selection; message shown |
| RTL/Unicode names for colors | Names allowed; exported keys sanitized to ASCII slugs with a note |
| Cancel image processing | Worker terminated; previous palette kept |

## 8. Limits, performance, privacy
- Palette regeneration under 50 ms; image extraction under 2 s for a 12 MP photo on a mid-range laptop.
- Network: none for colors or images. Saving to F-031 sends palette data only to our API.
- Stored locally: last palette and settings. Images are never persisted.

## 9. Accessibility and mobile
- Swatches are buttons with accessible names ("Color 2, #3a7bd5, locked"). Lock state conveyed by icon + text, not color alone.
- Contrast results are text ("Passes AA, fails AAA") announced with `aria-live="polite"`. Pass/fail chips use icon + label.
- Mobile: swatches stack as a vertical list; contrast panel full width; export as a `Sheet`.

## 10. Data
Saved palettes sync via F-031 (fields and quotas defined there). Otherwise N/A, client-only.

## 11. Acceptance criteria
- [ ] All six harmonies produce the expected hue offsets (analogous +/-30, complementary 180, triadic 120, tetradic 90, split 150/210) within 0.5 degrees in OKLCH, checked by unit tests.
- [ ] Black on white shows 21:1; `#767676` on white shows 4.54:1 and passes AA normal text; `#777777` on white shows 4.48:1 and fails it.
- [ ] A pair at 4.499:1 is displayed as 4.49:1 and reported as failing AA (unit test with a constructed pair).
- [ ] Large-text thresholds apply at exactly 24 px regular or 18.66 px (14 pt) bold and above; 23.9 px regular uses the normal thresholds.
- [ ] Locked colors stay unchanged across 20 shuffles.
- [ ] Image extraction of a 12 MP JPG finishes under 2 s and the UI stays responsive.
- [ ] Each export format is valid: CSS parses, Tailwind config loads, JSON is valid, PNG downloads.
- [ ] Suggested alternatives always meet the selected threshold.
- [ ] Invalid and short-hex inputs behave as in the table.
- [ ] No network request carries color or image data except F-031 save.

## 12. Future ideas and open questions
- Ideas: full design-token export (W3C format), dark-mode auto-pairing, import from CSS/Tailwind file, shareable hash link, WCAG 3 / APCA as primary once standardized.
- Open: which Tailwind version to target for export (v3 `tailwind.config.js` vs v4 CSS `@theme`; verify)? Include APCA at all given licensing (verify)?
