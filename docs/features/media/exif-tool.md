---
id: F-010
slug: exif-tool
title: EXIF Metadata Viewer & Stripper
category: media
tier: client
priority: P0
status: planned
depends_on: []
---

# EXIF Metadata Viewer & Stripper

## 1. Summary
See what a photo reveals (camera, lens, date, GPS, software, embedded thumbnail), then remove all of it or only selected fields, ideally without re-encoding the image. Works on single files and batches, in the browser.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Seller / marketplace user | Posting phone photos of items from home | GPS removed, image pixels untouched |
| Journalist / activist | Sharing a photo from the field | All metadata stripped, a before/after diff as proof |
| Photographer | Wants to keep camera and copyright but drop location | Remove GPS only, keep the rest |
| Parent | Posting kids' photos on a school group | Batch strip, ZIP |
| Non-obvious: security reviewer | Checks files for leaks (author, software, serial number, thumbnail) | Full field list with a risk flag per field |

## 3. User flow
1. Empty state: `DropZone` (JPG, PNG, WebP, HEIC, TIFF, AVIF), "Try an example" (sample with fake GPS). Note: "Nothing is uploaded."
2. File is read in a worker. Result: grouped metadata in `Tabs`: **Summary** (risk banner: "Contains GPS location, device model"), **Camera**, **Location**, **Dates**, **Software/Author**, **Thumbnail**, **All fields** (searchable table), **Raw**.
3. Location tab shows decimal and degrees/minutes coordinates, altitude, direction, timestamp, with `CopyButton`. **No map is loaded.** A button "Show on map (loads tiles from a map provider)" is opt-in and explains what is sent (the coordinates/tile requests) before it runs. Alternative: "Open in map app" link the user clicks themselves.
4. Strip options (`SegmentedControl`): **Remove everything**, **Remove location only (GPS)**, **Choose fields** (checkbox tree), **Edit GPS** (replace with chosen coordinates or blank). Extra toggles: keep orientation, ICC profile choice (keep / convert to sRGB and drop / drop), keep copyright/author.
5. Click **Clean**. Working: `ProgressBar` per file. Done: `ResultCard` with `DiffView` (before/after metadata, removed fields in red) and a status line "Lossless: pixels unchanged" or "Re-encoded: quality may change".
6. Download file or ZIP. Batch: `FileList` shows per-file risk chips (GPS, device) and status.

## 4. Inputs and outputs
- **Inputs:** JPEG, PNG, WebP, HEIC/HEIF, TIFF, AVIF (read; write support per format, see rules). Soft 50 MB per file; hard 200 MB (metadata parsing only reads headers, so large is fine). Batch cap 50.
- **Outputs:** cleaned file in same format, `<name>-clean.<ext>`; copyable metadata as JSON/text; ZIP for batches; optional report (CSV/JSON) of removed fields.

## 5. Components and tech
- **UI:** `ToolShell`, `DropZone`, `FileList`, `Tabs`, `SegmentedControl`, `SettingsPanel`, `DiffView`, `CopyButton`, `ResultCard`, `DownloadButton`, `ProgressBar`, `ConfirmDialog`, `ErrorBanner`, `Toast`, `EmptyState`, `ImageCanvas` (preview). New: `MetadataTree` (grouped, searchable, checkboxes, risk flags), `CoordinateDisplay` (decimal/DMS, copy, optional map opt-in), `RiskBanner`.
- **Libraries:** `exifr` (MIT) to read EXIF/XMP/IPTC/ICC/GPS (verify HEIC/AVIF/TIFF coverage). Writing: own small segment editors, tested in a spike: JPEG (remove APP1 Exif/XMP, APP13 IPTC, APP2 ICC selectively, COM), PNG (drop `eXIf`, `tEXt`/`iTXt`/`zTXt`, `tIME`, keep `iCCP`/`sRGB`/`gAMA` as chosen), WebP RIFF (drop `EXIF`, `XMP `, `ICCP` chunks and fix VP8X flags and sizes), TIFF/HEIC/AVIF (container box/IFD rewriting is complex; verify `piexifjs` (MIT, JPEG only) and libheif-based options). Canvas re-encode fallback via jSquash or `canvas.toBlob`.
- **Runs in:** worker; files are read as `ArrayBuffer`; only headers parsed for speed.

## 6. Behavior rules
- **Lossless first:** remove metadata by editing container segments so image data bytes are untouched. Show "Lossless" label only when verified (decoded pixel hash equal in tests; at runtime, by construction). If the format has no safe lossless path in v1 (verify for HEIC/TIFF/AVIF), offer **re-encode fallback** with a warning "Re-encoding may reduce quality. Choose quality" and default to a high setting; never switch to fallback silently.
- **Orientation:** default **keep** the Orientation tag so the image displays correctly. Option "Apply rotation to pixels and remove tag": lossless for JPEG only when dimensions are multiples of the MCU, otherwise re-encode (verify; show which). When removing everything including orientation without applying it, warn "Image may appear rotated."
- **ICC profile:** choose Keep (default for Remove selected), Convert to sRGB (re-encode) or Remove (colors may shift on wide-gamut images, warn). Stripping "everything" keeps ICC by default with an explicit toggle, since removing it changes appearance.
- **GPS only:** removes the GPSInfo IFD and GPS XMP properties (`exif:GPS*`), plus matching fields in MakerNotes where parsed. **Edit GPS:** write user coordinates into EXIF; validates range; blank to remove.
- Embedded thumbnails (EXIF/IFD1, preview images) are listed and removed with "everything" because they can contain the uncropped original.
- MakerNotes and vendor blobs: shown as "opaque, N bytes", removed on strip-all, optionally preserved; never edited.
- Report of what was removed is generated from a before/after read of the output (re-parse the result) to confirm removal.
- Originals untouched; no map or other network call unless the user opts in per session; stored locally: settings only.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| File without metadata | Summary says "No metadata found"; Clean disabled or output identical, with message |
| Non-image or renamed file | Magic-byte detection; clear error naming real type |
| Corrupt EXIF (bad offsets) | Show partial data with warning; strip by segment removal still possible; if the container is broken, offer re-encode fallback |
| Multiple metadata copies (EXIF + XMP + IPTC with GPS in each) | List all; strip-all removes all; GPS-only removes GPS from every copy, and re-verifies output |
| GPS hidden in XMP, MakerNotes or a sidecar-like field | Post-clean re-parse; any remaining GPS keys flagged with a warning |
| Photo with embedded thumbnail with different content | Thumbnail shown and removed; note why |
| HEIC/AVIF/TIFF with no lossless writer | Offer re-encode fallback with quality warning, or "Read only" per format; never silently re-encode |
| Animated WebP/GIF/APNG | Metadata chunks stripped without touching frames; if not possible, say so |
| Multi-page TIFF / multi-image HEIC | Show per-image metadata; strip applies to all frames; verify |
| Huge file (200 MB) | Parse headers only; cleaned output streams through a blob; warn on memory |
| Unicode/RTL author, caption, keywords | Displayed in correct direction; copy preserves Unicode; encoding errors (invalid UTF-8) shown as escaped bytes |
| Tricky date fields and time zones | Show raw plus interpreted value with offset if present; never reformat silently |
| Cancel | Worker terminated; completed files stay downloadable |
| Batch mixed formats | Per-file path; each shows Lossless or Re-encoded status |
| Opt-in map clicked | Dialog lists what will be requested; user must confirm; "Don't ask again this session" only |
| Unsupported browser (no workers/ArrayBuffer APIs) | Rare; clear message |
| Editing GPS with invalid values | Inline validation (lat -90..90, lon -180..180) |
| ICC removed from wide-gamut photo | Warning with preview of color shift if canvas is available |
| 0-byte file | Error "File is empty"; batch continues |
| Phone / low memory | Headers-only parse keeps memory low; strip one file at a time above ~50 MB on mobile (verify); ZIP via per-file downloads if memory is short |
| Output viewed in social platform | Note: some platforms re-add or strip metadata themselves; this tool does not control them |

## 8. Limits, performance, privacy

_Registry flag: `optInNetwork: ["map tiles (Show on map)"]`. Nothing is requested unless the user clicks the opt-in button._
- Parse 20 MB JPEG metadata in under 200 ms; strip lossless in under 1 s; batch of 50 under 30 s (verify).
- **Network:** none by default. Optional map feature (opt-in) sends map tile requests that reveal approximate coordinates to the map provider; provider decided with the owner; the privacy line must say so. No coordinates in URLs of our own pages.
- Stored locally: settings only; no metadata is stored or logged.

## 9. Accessibility and mobile
- `MetadataTree` is a keyboard-operable tree/table with proper headers; copy buttons labelled per field; risk flags use icon + text.
- `DiffView` announces counts ("14 fields removed"); status messages `aria-live`.
- Mobile: tabs scroll horizontally, strip options in a bottom `Sheet`, one-tap "Remove all and download"; works on iOS Safari (note that sharing from the Photos app may already strip location).

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] A JPEG with GPS, camera and thumbnail: "Remove everything" output re-parsed by an independent tool shows zero EXIF/XMP/IPTC fields (the Orientation tag is kept by default and is the only exception, unless the user turns that toggle off), and decoded pixels are identical.
- [ ] "Remove GPS only" leaves camera, lens, date and copyright intact and shows no GPS in any metadata block (EXIF, XMP, MakerNotes where parsed).
- [ ] Orientation default keeps portrait photos upright in all major browsers.
- [ ] Lossless vs re-encoded status is correct and visible for every output; fallback never runs without a warning.
- [ ] No network request is made while using the tool unless the user confirms the opt-in map.
- [ ] Before/after diff lists exactly the removed fields.
- [ ] PNG, WebP and JPEG fixtures with metadata all clean successfully; HEIC/TIFF behavior matches the documented per-format table.
- [ ] Batch of 50 with one corrupt file completes with that item marked failed.
- [ ] Parsing a 20 MB JPEG takes under 200 ms and a lossless strip under 1 second on a mid-range laptop (targets to validate).
- [ ] Cancel stops within 2 seconds; finished files stay downloadable.

## 12. Future ideas and open questions
- Edit general fields (author, copyright, caption), copy metadata from one file to another, timestamp shifting, video file metadata (F-011), CLI-style presets ("Social safe").
- Open: which map provider (if any) for the opt-in, or none at all? Is HEIC write in v1 or read-only plus re-encode? Default ICC behavior on "everything": keep or ask?
