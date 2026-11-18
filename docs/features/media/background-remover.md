---
id: F-009
slug: background-remover
title: AI Background Remover
category: media
tier: client
priority: P1
status: planned
depends_on: [F-007, F-008]
---

# AI Background Remover

## 1. Summary
Remove or replace the background of a photo with an AI segmentation model that runs on the user's device (ONNX Runtime Web with WASM, WebGPU when available). Includes refine brushes, background replacement and batch mode. The image never leaves the browser.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Online seller | 30 product photos need a white or transparent background | Batch run, transparent PNG/WebP or white-filled JPG |
| Job seeker | Wants a clean ID or profile photo | Cutout over a solid color, fine hair cleanup with brushes |
| Designer / marketer | Needs a subject for a banner | Transparent PNG, opened in the editor (F-008) |
| Privacy-minded user | Photo is of family or a document | Confirmation that no upload happens; offline after model cache |
| Non-obvious: teacher | Makes classroom materials with cut-out objects | Quick cutouts from phone photos, shadow kept as an option |

## 3. User flow
1. Empty state: `DropZone`, sample image, text "Runs on your device. First use downloads a model (about N MB, verify)."
2. First run: `LibraryLoader` shows model name, size, progress, cached afterward; a quality/speed selector (**Fast** small model, **Quality** larger model, if both are shipped).
3. Working: per-file `ProgressBar` ("Finding the subject..."), Cancel. Result appears within the `ImageCanvas` on a checkerboard.
4. Refine panel: **Keep** brush (paint back), **Erase** brush, brush size/hardness, edge feather, edge shift (grow/shrink), zoom, undo/redo, `BeforeAfter` toggle.
5. Background panel: Transparent (default), solid color (`ColorField`), blur original background, image from file, gradient. Optional soft shadow.
6. Done: format (PNG/WebP with alpha, JPG with fill), `ResultCard`, Download, Copy, "Open in editor" (F-008). Batch: `FileList` with per-item status and a ZIP; one setting set applies to all; per-item "Refine" opens the editor view.

```
[Original|Result|Compare]   Background: [Transparent|Color|Blur|Image]
 canvas (checkerboard)       Brush [Keep|Erase] size[__] feather[__] edge shift[__]
 [Undo][Redo]   Model: Fast / Quality                   [Download v] [Open in editor]
```

## 4. Inputs and outputs
- **Inputs:** JPG, PNG, WebP, AVIF; HEIC: convert first with F-007 (this tool does not decode HEIC). Soft 25 MP per image (images are downscaled to the model input, typically about 1024 px, then the mask is upscaled to full resolution; verify per model). Batch cap 50.
- **Outputs:** PNG or WebP with alpha, JPG with solid/blur/image background; optional separate mask PNG. Name `<name>-nobg.png`.

## 5. Components and tech
- **UI:** `ToolShell`, `DropZone`, `FileList`, `ImageCanvas`, `BeforeAfter`, `SegmentedControl`, `Slider`/`NumberField`, `ColorField`, `ProgressBar`, `ResultCard`, `DownloadButton`, `LibraryLoader`, `ErrorBanner`, `Toast`, `Sheet`. New: `BrushTool` (paint mask with size/hardness/touch), `ModelStatus` (name, size, license, backend in use: WebGPU/WASM).
- **Model and runtime:** `onnxruntime-web` (MIT) with WebGPU provider when available, WASM (SIMD/threads) otherwise. Threads need cross-origin isolation (see F-011); default to single-thread WASM so no COOP/COEP is required (verify speed). Matting refinement can be done on the mask with a guided filter (own code).
- **Model license (critical):** Bria **RMBG-1.4 is non-commercial** and RMBG-2.0 is similar (verify) per research notes, so neither ships. Candidates to verify: U2-Net / U2-Netp (Apache-2.0 believed), ISNet (Apache-2.0 believed), MODNet (Apache-2.0 believed, portraits), others released under MIT/Apache. `@imgly/background-removal` is believed AGPL-3.0 (verify) so avoid unless counsel approves. Each shipped model must have its license text recorded in the repo plus the training-data/weights license checked (weights can differ from code license).
- **Runs in:** Web Worker; model cached via Cache Storage; image preprocessing on `OffscreenCanvas`.

### License verification tracker (fill during spike)
| Model | Code license | Weights license | Commercial OK? | Size | Quality (20-image test) | Status |
|---|---|---|---|---|---|---|
| U2-Net / U2-Netp | verify | verify | verify | verify | pending | open |
| ISNet (general-use) | verify | verify | verify | verify | pending | open |
| MODNet (portrait) | verify | verify | verify | verify | pending | open |
| RMBG-1.4 / 2.0 | non-commercial | non-commercial (verify) | No | n/a | n/a | rejected |

## 6. Behavior rules
- No model is used in production until its row in the tracker is complete and the owner signs off. The UI shows the model name and license in `ModelStatus`.
- Mask computed once per image; refine brush edits only the mask. Background changes and feathering re-render from the stored mask and original (non-destructive, original never mutated).
- Use WebGPU if `navigator.gpu` exists and the adapter initializes; otherwise WASM. Show which backend is active. If WebGPU fails mid-run, fall back to WASM automatically and retry once.
- Output keeps original resolution (mask upscaled with edge-aware filtering); hair/fur edges decontaminated (reduce color fringe) where feasible.
- Batch uses one model session sequentially (GPU/WASM memory), with throttled UI updates.
- Orientation applied before inference; metadata stripped by default.
- Model download only on first use, after a file is added, and always behind an explicit "Download model (N MB)" button when the model is over 20 MB (`navigator.connection.saveData` respected). Smaller models download automatically with a visible `LibraryLoader`.
- Weights are hosted on our own origin: redistribution rights of each model's weights must be confirmed in the tracker (weights license can differ from code license).

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| No image / empty batch | Empty state; no model download until a file is added |
| Model download fails or offline first run | Error with Retry and size; works offline once cached |
| Model download interrupted | Resume or restart; partial cache entries discarded |
| Unsupported browser (no WASM/WebGL/WebGPU) | Feature-detect; clear message; no broken UI |
| Low memory device / tab crash risk | Use the smaller model; downscale input further; warn before first run |
| Large image (25+ MP) | Run at model resolution and upscale mask; if canvas memory still fails show suggestion to resize (F-007) |
| Multiple subjects / no clear subject | Result may keep all or none; hint "Use Keep brush to add or Erase to remove"; no silent failure |
| Transparent PNG as input | Existing alpha ignored or composited on white for inference, noted in help |
| Glass, smoke, fine hair, fur, thin objects | Quality limits documented; brushes and edge shift to fix; do not promise perfection |
| Screenshots/graphics/logos | Warn that the model is for photos; suggest color-based removal as a future feature |
| Cancel during inference | Worker terminated; model session recreated on next run |
| WebGPU device lost | Fall back to WASM, notify with Toast |
| Batch partial failure | Failed items marked; others complete; ZIP of successes |
| Unicode/RTL filenames | Preserved in output names |
| Empty/0-byte or renamed non-image file | Magic-byte check; item fails with the detected type; batch continues |
| Privacy | No request carries image or mask data; only the model file is fetched, from our origin |
| Replacement image of different aspect ratio | Cover-fit with anchor choice; preview before download |
| Output JPG chosen with transparent bg | Flatten with fill color; warning chip |
| Memory leak over long sessions | Release tensors and bitmaps after each image; test with 50 items |
| Very small subject in frame | Optional "Crop to subject" toggle after removal |

## 8. Limits, performance, privacy
- Target (verify in spike): 12 MP photo in under 3 s with WebGPU on a recent laptop, under 15 s with WASM on a mid-range laptop; model size ideally under 50 MB per model, shipped via static assets or cache.
- **Network:** model files download once from our own static host (not a third-party CDN, to meet the strict CSP and so no third party sees usage). No image or mask data is ever sent.
- Stored locally: settings and cached model (Cache Storage); "Clear model cache" button shows size.

## 9. Accessibility and mobile
- Brush mode has keyboard-accessible alternatives: Edge shift and feather sliders, "Select area" via rectangle numeric fields. Pure brush painting remains pointer-only; document it.
- `aria-live` for progress ("Processing 3 of 12"); errors `role="alert"`; compare toggle as a button.
- Mobile: supported on recent phones with the Fast model; first-run model size warning; brushes with two-finger pan/zoom; cap batch to 10 on mobile (verify memory).

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] The shipped model(s) have a completed license tracker row showing commercial use is permitted; reviewer sign-off recorded.
- [ ] No network request after model cache contains image data; works offline.
- [ ] A portrait and a product photo each produce a usable cutout on the 20-image test set (at least 80% rated "usable without edits", target to confirm).
- [ ] Keep/Erase brushes fix a deliberate bad mask; undo/redo works.
- [ ] Transparent PNG and white-fill JPG outputs keep original resolution.
- [ ] WebGPU failure falls back to WASM without user action.
- [ ] Batch of 20 completes with one failure not blocking the rest.
- [ ] Cancel stops inference within 2 seconds; the next run works.
- [ ] Inference timing meets the section 8 targets (verify on the spike devices) and memory stays flat over a 50-image run (no growth beyond the first image's peak by more than 10%, target).
- [ ] Original file is unchanged; metadata stripped by default.

## 12. Future ideas and open questions
- Click-to-select subject (SAM-style, verify model license), color-key removal for graphics, hair refinement matting model, video background removal, shadow generation, passport photo sizes.
- Open: which model pair (Fast/Quality) passes license and quality? Can we host weights ourselves and afford the bandwidth? Is single-thread WASM speed acceptable without COOP/COEP?
