---
id: F-006
slug: image-compressor
title: Image Compressor
category: media
tier: client
priority: P0
status: planned
depends_on: [F-010]
---

# Image Compressor

## 1. Summary
Shrink PNG, JPG, WebP and AVIF files by up to about 80% (results vary by image) with lossy or lossless compression, entirely in the browser. TinyPNG-style quality with no upload, no file-count cap tied to an account, and a before/after check before download.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Web developer | 40 hero and product images are slowing a page | Batch compress, download one ZIP, same filenames with a suffix |
| Blogger / marketer | Email platform rejects attachments over 1 MB | Target-size friendly output, visible savings per file |
| Designer | Delivers PNG logos with transparency | Lossless mode (or palette-quantized PNG) keeps transparency and sharp edges |
| Privacy-minded user | Photos are personal | Metadata (GPS, camera) stripped by default; nothing leaves the device |
| Phone user | Photo is a CMYK or HEIC file that other sites reject | Opens it, converts to sRGB JPG/WebP, and compresses (pure format conversion and resizing live in F-007) |

## 3. User flow
1. Empty state: `DropZone` ("Drop images here, or paste"), accepted types listed (PNG, JPG, WebP, AVIF, plus GIF/HEIC input), size limit, "Try an example" button.
2. Files appear in `FileList` with thumbnail, size and status "Ready". Settings panel shows mode, quality, output format, metadata toggle.
3. User picks mode (default **Smart**) and clicks **Compress**. With a single file, settings changes re-run live instead (see rules). `LibraryLoader` shows codec size once.
4. Working state: per-file `ProgressBar`, overall progress, Cancel. Files finish one by one and show "-62%".
5. Done: `ResultCard` per file with before/after sizes. Click a file to open `BeforeAfter` (draggable slider, 100% zoom option).
6. **Download all (ZIP)** or per-file download. "Re-run with different settings" keeps files loaded. "Start over" clears memory.

```
[Mode: Smart | Lossy | Lossless]  Quality [====o--] 78   Format [Keep | WebP | AVIF | JPG]
[x] Strip metadata   [ ] Keep color profile   Max width [____]
 file list ............................ before -> after  -62%   [Compare] [Download]
 [Download all (ZIP)]            Total saved: 14.2 MB (-61%)
```

## 4. Inputs and outputs
- **Inputs:** PNG, JPG/JPEG, WebP, AVIF (primary); GIF, HEIC/HEIF, BMP, TIFF as convert-on-input (verify support per decoder). HEIC conversion is shared with F-007 (the owner of format conversion); here it is only convert-on-input. Soft warning at 50 MB per file; hard limit 100 MB or 100 megapixels per image. Batch cap 50 (conventions); raising it to 200 behind a "large batch" confirm is an open question (section 12). SVG is not accepted here: point to F-015.
- **Outputs:** same format by default, or WebP/AVIF/JPG/PNG on choice. Name `<name>-compressed.<ext>`. ZIP named `images-compressed.zip`. Never larger than the input (see rules).
- Settings: mode, quality 1-100 (lossy), output format, strip metadata (on), keep ICC profile (off), max dimension (off), transparency background color (for PNG to JPG, default white).

## 5. Components and tech
- **UI:** `ToolShell`, `DropZone`, `FileList`, `SettingsPanel`, `SegmentedControl`, `Slider`/`NumberField`, `ProgressBar`, `ResultCard`, `BeforeAfter`, `ImageCanvas`, `DownloadButton`, `ColorField`, `LibraryLoader`, `ErrorBanner`, `Toast`, `EmptyState`, `HelpPopover`.
- **Libraries:** jSquash codecs (mozjpeg, oxipng, webp, avif; Apache-2.0/BSD, verify sizes, roughly 0.3-3 MB each, loaded per format on demand). `libimagequant`-style palette quantization for PNG lossy: verify license (GPL/commercial history); fallback to oxipng lossless plus own quantizer. HEIC: libheif-js (LGPL, verify) loaded lazily. `fflate` for ZIP. `pica` for optional resize.
- **Runs in:** worker pool (min(cores-1, 4)); each worker owns WASM codecs. Decode with `createImageBitmap` where possible, else WASM decoder.

## 6. Behavior rules
- **Smart** (default): tries lossless first; if savings under 10% on a photo, applies perceptual lossy at quality chosen per image (e.g. start 80, binary-search against an SSIM/size target; verify metric cost). **Lossy**: user quality, fast. **Lossless**: oxipng / mozjpeg lossless re-pack, pixels identical.
- **Never output larger than input.** If the result is >= original bytes, keep the original bytes and mark "Already optimized (0%)". With format change, compare against the original and offer the original format.
- Metadata stripped by default (EXIF, XMP, GPS, thumbnails). **Orientation is applied to pixels before stripping** so photos do not rotate. ICC: convert to sRGB then drop profile unless "Keep color profile". Link to F-010 for inspection.
- PNG to JPG: flatten transparency onto chosen background color, with a warning chip "Transparency removed".
- Animated GIF/WebP/APNG: if output format is kept and codec supports animation, compress frames (gifsicle is GPL-2.0 as far as known; verify the WASM port's license before shipping); otherwise warn "Only the first frame will be kept" and require confirm, or skip. This tool optimizes existing animated images; making a GIF from a video clip is F-011.
- Originals untouched. Re-compressing the same file uses the original, never a previous result, to avoid generational loss.
- Settings persist in localStorage; file contents never persisted. Changing settings re-runs only after clicking Compress again (batch of many files) or live for a single file (debounced 300 ms).
- Parallelism limited by memory: max concurrent decoded pixels about 200 MP.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| No files / empty drop | Stays in empty state; hint with accepted types |
| Already optimized file | Keeps original bytes, status "Already optimized" with 0% |
| Renamed non-image (e.g. .jpg that is a PDF) | Magic-byte check; error "This looks like a PDF, not an image" with link to PDF tools |
| Corrupt/truncated JPEG | Item fails with plain message; rest of batch continues; Retry per item |
| 100+ MP photo or 80 MB PNG | Warn; decode downscaled preview, full-res compress in worker; refuse above hard limit with reason |
| Out of memory in worker | Catch, restart worker, mark item failed with suggestion "Resize first (F-007)", others proceed |
| CMYK JPEG / 16-bit PNG / grayscale | Convert to 8-bit sRGB; note "Converted from CMYK" on the item |
| HEIC (iPhone) | Decode via libheif-js; HDR/gain-map content may look flat, noted as limitation; unsupported variant gives clear error |
| Transparent PNG to JPG | Flatten on chosen color; warning chip; WebP/AVIF/PNG recommended |
| Animated GIF/WebP/APNG | Per rules; never silently flatten to one frame |
| Unsupported browser (no WASM, no AVIF encode path) | Feature-detect; AVIF option hidden/disabled with reason; WebP encode fallback via WASM |
| Cancel mid-batch | Workers terminated; finished files remain downloadable; unfinished marked "Cancelled" |
| Filenames with Unicode/RTL/emoji or duplicates | Preserved in output and ZIP (UTF-8 flag); duplicates get " (2)" suffix inside ZIP |
| Very small image (<10 KB) | Compress anyway; likely "Already optimized" |
| Mixed batch (JPG + PNG + WebP) | Each keeps own format unless a global format is set |
| Paste from clipboard | Accepted as `pasted-image.png` |
| iOS Safari canvas limit (about 16 MP area per canvas, verify) | Use tiled/WASM decode path; if impossible show size limit message |
| ZIP > 2 GB or memory too high | Offer per-file downloads or split ZIPs |
| 0-byte file | Item fails "File is empty"; batch continues |
| Phone / low memory | Worker pool of 1, decoded-pixel budget lowered (about 50 MP, verify), warning before large batches |
| SVG dropped | Not an input here; message links to F-015 |
| Output quality check fails (Smart mode cannot hit target) | Keeps best result under the never-larger rule and labels the item with the quality used |

## 8. Limits, performance, privacy
- Targets: 12 MP JPEG lossy in under 3 s on a mid-range laptop; 50-file batch of 2 MP images under 60 s (verify in spike).
- Network: none with user content. Codec WASM files are static assets loaded on tool open, then cached.
- Stored locally: settings only.

## 9. Accessibility and mobile
- Everything reachable by keyboard; `BeforeAfter` slider has arrow-key control, Home/End, and a labelled "Show original / Show compressed" toggle alternative.
- Results announced via `aria-live="polite"` ("12 of 20 done, saved 8 MB"); failures `role="alert"`. Savings shown as text, not color only.
- Mobile: single column, settings in a `Sheet`, files list scrolls, ZIP via share/download. Warn that very large batches may be slow on phones.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] On a reference set of 10 camera JPEGs (2 to 5 MB), Smart mode shrinks the median file by at least 50% with SSIM of 0.95 or higher against the original and no artifacts a reviewer can see at 100% zoom (targets to validate in the spike).
- [ ] No output file is ever larger than its input.
- [ ] GPS and camera metadata are absent from default outputs (verified with F-010).
- [ ] Portrait photos with EXIF orientation keep correct orientation after stripping.
- [ ] Lossless mode output is pixel-identical (hash of decoded pixels) to input.
- [ ] A failed or cancelled item does not block other items or ZIP download.
- [ ] 50-file batch finishes with the UI staying responsive (no main-thread task over 100 ms) and Cancel stops within 2 seconds.
- [ ] No network request is made after codecs are cached; offline works.
- [ ] PNG-with-alpha to JPG shows the transparency warning and uses the chosen background.

## 12. Future ideas and open questions
- Target file size ("under 200 KB"), per-image quality override, SVG minify link to F-015, folder drop, watch of clipboard history.
- Open: confirm PNG lossy quantizer license (libimagequant is GPL/commercial; verify). Animated image support in v1 or later? Batch cap 50 or 200?
