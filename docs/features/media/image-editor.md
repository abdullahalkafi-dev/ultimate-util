---
id: F-008
slug: image-editor
title: Basic & Advanced Image Editor
category: media
tier: client
priority: P1
status: planned
depends_on: [F-006, F-007]
---

# Basic & Advanced Image Editor

## 1. Summary
A browser image editor with two modes. **Basic** covers crop, rotate, flip, resize and one-click filters. **Advanced** adds layers, curves and exposure, text, shapes, annotations, blur/pixelate redaction, undo history and a project file. A screenshot-annotation mode makes quick callouts. No upload.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Support agent | Needs to annotate a screenshot with arrows, numbers and a blurred email | Annotation mode, then PNG copied to clipboard |
| Blogger | Crops, brightens and resizes a photo to 1200 px | Basic mode in under a minute |
| Designer / marketer | Builds a quick banner with text over a photo | Layers, text, shapes, export WebP |
| Privacy-conscious user | Must hide a face or account number in a screenshot | Irreversible pixelate/blur or solid-fill box, baked into the pixels |
| Non-obvious: teacher | Marks up a scanned worksheet | Pen, highlighter and text over the image, saved as project to continue later |

## 3. User flow
1. Empty state: `DropZone`, "New blank canvas" (size/background), "Paste screenshot", sample image. A `SegmentedControl` for **Basic | Advanced | Annotate**.
2. Image loads into `ImageCanvas`. Basic toolbar: Crop (free, ratios, presets), Rotate 90/free, Flip, Resize, Adjust (brightness, contrast, saturation, warmth), Filters (grid of presets, intensity slider).
3. Advanced shows a left tool column, right panels (Layers, Properties, History), top bar (undo/redo, zoom, fit). Tools: move, select, crop, text, rectangle/ellipse/line/arrow, brush, eraser, blur/pixelate region, curves, exposure.
4. Annotate mode: reduced toolbar (arrow, box, numbered step, text, highlight, blur) with sticky tool and color; paste an image and annotate immediately.
5. Working state: edits are live on canvas; heavy filters show a short progress state; Cancel for a long operation.
6. **Export**: format (PNG/JPG/WebP/AVIF), quality, scale, flatten notice; Download, Copy to clipboard. Advanced also offers **Save project** (`.uuproj`, a ZIP of JSON plus layer images) and Open project.

```
[Basic|Advanced|Annotate] Undo Redo  Zoom [Fit]            [Export v] [Save project]
Tools | +--------- canvas ---------+ | Layers: Text 1 / Blur / Photo
      | |                         | | Properties: font, size, color
      | +-------------------------+ | History: (list, click to jump)
```

## 4. Inputs and outputs
- **Inputs:** JPG, PNG, WebP, AVIF, GIF (first frame), SVG (rasterized, see F-007), HEIC (verify), clipboard paste, `.uuproj` project. Max 50 MP working size (soft warning at 25 MP); soft 50 MB file.
- **Outputs:** PNG, JPG, WebP, AVIF, clipboard PNG, `.uuproj`. Name `<name>-edited.<ext>`. Export strips metadata by default (toggle to keep).

## 5. Components and tech
- **UI:** `ToolShell`, `DropZone`, `ImageCanvas`, `SegmentedControl`, `Tabs`, `Slider`/`NumberField`, `ColorField`, `SettingsPanel`, `ConfirmDialog`, `Toast`, `ProgressBar`, `DownloadButton`, `CopyButton`, `HelpPopover`, `ShortcutHint`, `Sheet`, `LibraryLoader`. New: `ToolPalette` (vertical tool buttons), `LayerPanel` (reorder, visibility, lock, opacity, blend), `HistoryPanel` (undo list), `CurvesEditor` (RGB curve with points), `CropOverlay`, `ProjectFileIO`.
- **Libraries:** Konva (MIT) or Fabric.js (MIT) for object canvas; choose in a spike. Image filters via WebGL shaders (own or `glfx`-style; verify) with canvas 2D fallback. `pica` resize. jSquash for AVIF/WebP export. `fflate` for project ZIP. Text uses system and bundled open fonts (Inter etc.), no Google Fonts fetch.
- **Runs in:** main thread for interaction; `OffscreenCanvas` worker for export and heavy filters; WebGL where available.

## 6. Behavior rules
- Non-destructive in Advanced: layers keep original pixels; adjustments are adjustment layers or layer filters, rasterized only on export. Basic applies edits as a short stack that can be undone.
- **Blur/pixelate redaction is irreversible by design:** when applied, pixels under the region are replaced on the pixel layer (not kept as a removable filter) and the tool shows "Cannot be undone after you export or save." Pixelate block size minimum scales with image size; blur radius minimum enforced so text is unreadable. A **solid fill** redaction option is offered and recommended for sensitive data, because blur and pixelate can sometimes be partly reversed. Saved projects warn that earlier history/layers may still hold unredacted pixels; export flattens. A "Flatten and redact" button discards underlying data.
- History: at least 50 steps (memory bounded, older steps drop with notice). Undo/redo shortcuts standard.
- Crop and resize respect EXIF orientation applied on load. Export flattens; JPG export flattens transparency on a chosen color.
- Autosave of the current project to IndexedDB is optional (off by default, since images can be large); when on, shows a Clear button.
- Mobile: Annotate and Basic fully supported; Advanced opens with a notice and a reduced toolbar.
- Keyboard shortcuts shown in `HelpPopover` (V move, T text, C crop, Ctrl/Cmd+Z/Shift+Z, Space pan, Ctrl+wheel zoom).

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| No image loaded | Empty state; tools disabled |
| Huge image (>50 MP) | Warn; offer downscale on open; refuse beyond the browser's canvas limit (commonly 16384 px per side or a total area cap that varies by browser; verify) |
| Canvas memory exhausted | Catch; show "Not enough memory"; keep project state; suggest reducing size or closing layers |
| WebGL unavailable or context lost | Fallback to 2D canvas filters (slower); on context loss, restore from layer data and notify |
| Unsupported or corrupt file | Magic-byte check and clear error |
| Empty/0-byte or renamed non-image file | Magic-byte check; clear error naming the detected type |
| Batch input (several files dropped) | Single-image tool: opens the first and offers the rest as separate tabs/projects, or points to F-007 for bulk work |
| Unsupported browser (no canvas 2D or OffscreenCanvas) | Main-thread export fallback; if canvas itself is missing, message and no broken UI |
| Phone / low memory | Working size capped lower (about 12 MP, verify), layer count reduced, Annotate/Basic only |
| Redaction then undo | Undo allowed before export/save; after export, the exported file is irreversible; message shown |
| Redaction on a layer above a photo | Warns that the photo layer below is unchanged in the project file; offers "Flatten and redact" |
| Text with RTL, Bengali/Arabic, emoji, combining marks | Uses canvas text with proper shaping (verify per browser); bundled fallback fonts; direction toggle; warn if a glyph is missing |
| Custom/system font missing on another device | Project embeds fonts used (bundled open fonts only); substitution noted when opening |
| Animated GIF input | First frame; notice |
| Paste of huge screenshot (retina) | Option to halve to 1x; default keeps pixels |
| Project file from a newer version | Refuse with version message; never partially load silently |
| Tab closed with unsaved edits | `beforeunload` prompt when history changed since last export/save |
| Cancel a heavy filter | Operation aborted, canvas unchanged |
| Clipboard write denied | Falls back to download; message |
| Touch with pinch zoom vs drawing | Two fingers pan/zoom, one finger draws; palm rejection is best effort |
| Export JPG of transparent canvas | Flatten color dialog with preview |

## 8. Limits, performance, privacy
- Interaction target: 60 fps pan/zoom on 12 MP; filter preview under 200 ms on a downscaled proxy, full-resolution on export.
- Memory guard: layer count cap (about 50) and total pixel budget (about 300 MP across layers, verify) with warning.
- Network: none with user content. Bundled fonts; no remote fonts. Stored locally: settings, optional autosave.

## 9. Accessibility and mobile
- Canvas drawing is inherently pointer-based; provide keyboard alternatives for the essentials: numeric crop fields, rotate buttons, slider adjustments, layer panel operable by keyboard, nudge selected object with arrows (Shift for 10 px), text edited in a labelled field. State changes announced ("Layer Text 1 moved").
- Not all drawing can be made accessible; document this in help and ensure Basic mode is fully operable without a pointer.
- Mobile: bottom toolbar with big targets (44 px), panels as `Sheet`s, pinch/zoom, Annotate mode as default for narrow screens.

## 10. Data
N/A, client-only. Project files live where the user saves them.

## 11. Acceptance criteria
- [ ] Basic: crop, rotate, resize and a filter completed on a 12 MP photo in under 1 minute by at least 4 of 5 first-time users (usability test, target).
- [ ] Redacted regions in the exported file contain no recoverable original pixels (export bytes checked: region pixels differ from source and, for pixelate, block size is at least the enforced minimum). A reviewer test with a public de-pixelation or deblur tool fails to read a sample line of text (target; blur and pixelate reduce information but are not a guarantee against all recovery, so the help text recommends a solid fill for sensitive data).
- [ ] Cancel of a heavy filter or export returns within 2 seconds with the canvas unchanged.
- [ ] Undo/redo works across all tools for at least 50 steps.
- [ ] Save then reopen a `.uuproj` restores layers, text and positions exactly.
- [ ] Annotate mode: paste screenshot, add arrow and blur, copy to clipboard in 5 actions or fewer.
- [ ] Exported files carry no EXIF unless the user opted in.
- [ ] Works without WebGL (slower) and shows an out-of-memory message rather than crashing.
- [ ] Basic mode fully keyboard operable; Advanced shows a documented limitation notice.
- [ ] No network request carries image content.

## 12. Future ideas and open questions
- Healing/clone stamp, masks, selection by color, gradient tool, PSD import (verify), templates, shared annotation styles, GIF/video frame import.
- Open: Konva vs Fabric after spike; one-time vs optional autosave; whether Advanced is blocked or reduced on phones.
