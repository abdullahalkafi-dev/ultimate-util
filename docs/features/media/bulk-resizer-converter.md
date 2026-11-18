---
id: F-007
slug: bulk-resizer-converter
title: Bulk Image Resizer & Format Converter
category: media
tier: client
priority: P0
status: planned
depends_on: [F-006]
---

# Bulk Image Resizer & Format Converter

## 1. Summary
Convert many images between AVIF, WebP, PNG, JPG and SVG (rasterized), and resize them by pixels or percentage with fit, fill or pad modes, social-media presets, multi-size output and renaming. All in the browser, no upload.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Web developer | Needs 400/800/1600 px WebP + JPG fallbacks for 30 images | One run, 6 outputs per image, organized in ZIP folders |
| Social media manager | One photo for Instagram square, story and X header | Preset sizes with fill/pad and crop focus point |
| Designer | Has an SVG logo, needs PNGs for an app | Rasterize at 1x/2x/3x with named suffixes (`logo@2x.png`) |
| E-commerce seller | Marketplace requires 2000x2000 white-padded JPGs | Pad mode with background color, JPG at fixed quality |
| Non-obvious: archivist | Old BMP/TIFF scans in a folder | Batch to WebP/PNG with consistent names (`scan-001.webp`) |

## 3. User flow
1. Empty state: `DropZone` (images, SVG), "Try an example", accepted types and limits.
2. Files fill `FileList` (thumb, dimensions, size). Settings panel opens with three groups: **Resize**, **Format**, **Output**.
3. Resize: choose mode (None / Pixels / Percent / Preset), width and height `NumberField`s with lock-aspect toggle, fit mode (**Fit inside**, **Fill (crop)**, **Pad**), crop anchor (9-point grid), pad color.
4. Format: target (Keep / JPG / PNG / WebP / AVIF), quality, background for transparency, strip metadata.
5. Output: rename pattern (tokens `{name}`, `{w}`, `{h}`, `{n}`, `{preset}`, `{scale}`), multi-size list (add rows), ZIP structure (flat or folder per size).
6. Live **preview pane** shows the first file with the chosen result dimensions and output size estimate. Click **Convert**.
7. Working: overall and per-file `ProgressBar`, Cancel. Done: `ResultCard` with count, total size, **Download ZIP** and per-file download, "Convert more" keeps files.

```
Files (24) | Resize: [Pixels v] W[1200] H[auto] [lock]  Fit [Fit|Fill|Pad]  [x] Do not enlarge
Format: [WebP v] q[80]   Sizes: [+ 400w] [+ 800w] [+ 1600w]   Name: {name}-{w}w
Preview: IMG_001 -> 1200x800, ~140 KB                      [Convert]
```

## 4. Inputs and outputs
- **Inputs:** JPG, PNG, WebP, AVIF, GIF (first frame by default), BMP, SVG; HEIC/HEIF as convert-on-input (this tool owns HEIC conversion for the platform; decoder libheif-js is LGPL, verify license and size). Soft 50 MB per file; hard 100 MP; batch cap 50 (conventions; 200 with confirm is an open question).
- **Outputs:** JPG, PNG, WebP, AVIF. SVG is input only (rasterized); SVG to SVG is not offered (use F-015). Default name `<name>-<w>x<h>.<ext>` via rename pattern. Presets: Instagram 1080x1080 / 1080x1350 / 1080x1920, X header 1500x500, Facebook cover, LinkedIn banner, YouTube thumbnail 1280x720, favicon set, OG image 1200x630 (final list is data, editable).
- Multi-size: up to 8 size rows per run; total outputs shown before starting ("24 files x 3 sizes = 72 outputs").

## 5. Components and tech
- **UI:** `ToolShell`, `DropZone`, `FileList`, `SettingsPanel`, `Tabs`, `SegmentedControl`, `Slider`/`NumberField`, `ColorField`, `ImageCanvas`, `ProgressBar`, `ResultCard`, `DownloadButton`, `LibraryLoader`, `ConfirmDialog`, `ErrorBanner`. New: `PresetPicker` (grouped size presets), `CropAnchorGrid` (9-point focus), `RenamePatternField` (token input with live example).
- **Libraries:** `pica` (MIT) high-quality resize; jSquash codecs (verify sizes); `OffscreenCanvas`/`createImageBitmap`; SVG rasterized via browser (`<img>` + canvas) in a sandboxed way; `fflate` ZIP.
- **Runs in:** worker pool; SVG rasterization on main thread or worker with `OffscreenCanvas` if the browser supports it (verify), else main thread with queueing.

## 6. Behavior rules
- **Do not enlarge** is on by default: a target larger than the source keeps source size and shows a notice; user can turn it off (then a quality warning chip appears). SVG sources are exempt (vector).
- Aspect ratio locked by default. Percent mode computes per file; pixel mode with only width computes height per file.
- **Fit** = whole image inside box; **Fill** = covers box, crop around anchor; **Pad** = fit then extend canvas with color (transparent when output supports alpha).
- EXIF orientation applied before resize; metadata stripped by default; ICC converted to sRGB.
- Transparent source to JPG: flatten on chosen color with chip. Animated GIF to still format: first frame, with explicit notice.
- SVG rasterize scale options 1x/2x/3x (multi-select, each becomes an output); base size from `width/height` or `viewBox`; if neither, ask for a width. External references inside SVG (images, fonts, `href`) are never fetched; SVG scripts never run.
- Rename pattern validated live; illegal filename characters replaced; duplicate names within ZIP get ` (2)`. Output order is stable.
- Settings (not files) remembered. Same-image-same-size dedupe: identical output name collisions flagged before run.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| No files | Empty state; Convert disabled |
| Target larger than source (do-not-enlarge on) | Keeps source size, per-file note "Not enlarged"; summary count |
| Width and height both set with lock on | Fit/Fill/Pad decides; show resulting size in preview |
| Percent resulting in 0 px or > 16384 px | Clamp with message; refuse above hard canvas limit |
| Huge image (100+ MP) / many multi-size outputs | Warn about estimated memory; process sequentially per image; refuse above limit |
| SVG without viewBox/size | Prompt for base width; default 512 |
| SVG with external refs, embedded script, `foreignObject` | Refs not loaded, scripts disabled; raster may differ; warn "Some content was not rendered" |
| SVG with custom fonts or text | Uses system fonts; warn that text may differ; suggest converting text to paths |
| Very large SVG scale (3x of 4000 px) | Cap at canvas limit; skip that scale with message |
| Animated GIF/WebP | First frame by default; notice; animated output is not produced here. Compressing an existing animated image is F-006; making a GIF from a video clip is F-011 |
| 0-byte file | Item fails "File is empty"; batch continues |
| Phone / low memory | Pool of 1, lower decoded-pixel budget (about 50 MP, verify), multi-size runs processed one output at a time |
| Privacy: SVG or image that references remote URLs | Never fetched (SVG drawn via `<img>`, which blocks external loads; verify per browser); no request leaves the page with user content |
| CMYK/16-bit/HEIC | Converted to 8-bit sRGB; note on item (HEIC per verify) |
| AVIF encode unsupported or slow | Feature-detect; show estimated time; allow WebP instead |
| Renamed/corrupt files | Magic-byte check; per-item error, batch continues |
| Rename pattern produces blank or duplicate names | Block Convert with inline error and live example |
| Unicode/RTL/emoji filenames | Preserved (UTF-8 ZIP names); `{name}` token never mangled |
| Cancel mid-run | Workers terminated; completed outputs downloadable, rest "Cancelled" |
| Output larger than input (e.g. PNG to higher-quality PNG) | Allowed here (it is a conversion tool) but shown in red text with "+" and a tip to use F-006 |
| iOS canvas size limit | Tiled path or clear size limit message |
| Browser has no WASM | Message with supported browsers; basic canvas JPG/PNG/WebP still offered if available |

## 8. Limits, performance, privacy
- Target: 50 images at 12 MP resized to 1600 px WebP in under 90 s on a mid-range laptop (verify in spike).
- Memory guard: estimated decoded pixels in flight capped (about 200 MP); items queue beyond that.
- Network: none with user content; codecs are static, cached assets. Stored locally: settings and custom presets only.

## 9. Accessibility and mobile
- All controls labelled; size inputs announce computed result ("Result 1200 by 800"). `CropAnchorGrid` is a radio grid with arrow keys. Preview has text alt describing output size.
- Progress via `aria-live="polite"`; errors `role="alert"`.
- Mobile: settings in bottom `Sheet`, preview on top; multi-size editor collapses to a list. Warn on large batches on phones.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] 20 JPGs to 3 WebP sizes produce 60 correctly named files in one ZIP.
- [ ] 50 images of 12 MP resized to 1600 px WebP finish in under 90 seconds on a mid-range laptop (target) and Cancel stops within 2 seconds.
- [ ] A HEIC fixture converts to JPG with correct orientation, or shows a clear "unsupported variant" message.
- [ ] With "Do not enlarge" on, no output is wider or taller than its source (except SVG).
- [ ] Fill mode output is exactly the target size; Pad mode output equals target size with the chosen color.
- [ ] SVG at 1x/2x/3x yields dimensions in exact 1:2:3 ratio.
- [ ] Rename tokens render as in the live example for all files; blank names are blocked.
- [ ] EXIF orientation is respected and metadata absent by default.
- [ ] A corrupt file fails alone; other files complete.
- [ ] No network call carries user content; works offline after first load.

## 12. Future ideas and open questions
- Smart crop (face/subject detection), watermark overlay, HEIC output, responsive `<picture>`/srcset snippet export, save/load preset files, ICO/favicon pack.
- Open: allow animated WebP/GIF conversion here, in F-006, or neither in v1? Final preset list and update process? Output SVG optimization link to F-015?
