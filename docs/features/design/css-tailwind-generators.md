---
id: F-014
slug: css-tailwind-generators
title: CSS / Tailwind Visual Generators
category: design
tier: client
priority: P1
status: planned
depends_on: [F-013]
---

# CSS / Tailwind Visual Generators

## 1. Summary
A set of visual builders for tricky CSS: Grid, Flexbox, layered box shadows, glassmorphism, gradients (linear, radial, conic, mesh), border radius and clip-path. Each has a live preview and one-click copy as plain CSS or Tailwind classes.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Front-end dev | Cannot remember grid-template syntax | Builds the grid by dragging, copies CSS |
| Designer handing off | Has a soft layered shadow from Figma | Recreates it, gets exact CSS/Tailwind |
| Tailwind user | Wants a glass card | Copies `backdrop-blur` classes with arbitrary values where needed |
| Student | Learning flexbox | Toggles `justify-content`/`align-items` and sees the result |
| Marketer (non-obvious) | Needs a gradient background for a landing page | Builds mesh gradient and exports CSS without Photoshop |

## 3. User flow
1. Empty state: `Tabs` for Grid, Flexbox, Box shadow, Glass, Gradient, Radius, Clip-path (clip-path may ship later). A default example is already loaded in each; **Reset** returns to it.
2. User edits controls in a `SettingsPanel` (sliders, selects, `ColorField`). The preview updates live.
3. Grid: set columns/rows, gap, track sizes (`1fr`, `auto`, `minmax()`), drag to place and span items. Flexbox: direction, wrap, justify, align, gap, per-item grow/shrink/basis.
4. Box shadow: add/remove/reorder layers (offset, blur, spread, color with alpha, inset). Gradient: stops added on a bar, angle/position, mesh points.
5. Output panel: `SegmentedControl` **CSS | Tailwind**, `CodeOutput`, `CopyButton`. Tailwind output shows a note when arbitrary values are used.
6. Done: Copy, or **Share settings** link (hash). Preview background can be switched light/dark/custom to check contrast.

## 4. Inputs and outputs
- **Inputs:** numeric/select/color controls, optional paste of existing CSS for shadow/gradient to import (parsed best effort).
- **Outputs:** CSS declaration block; HTML+CSS snippet (optional); Tailwind class string. No files by default (optional `.css` download).

## 5. Components and tech
- **UI:** `ToolShell`, `Tabs`, `SplitPane`, `SettingsPanel`, `Slider`/`NumberField`, `ColorField`, `SegmentedControl`, `CodeOutput`, `CopyButton`, `Toast`, `HelpPopover`. New: `GridBuilder`, `FlexBuilder`, `StopBar` (gradient stops), `LayerList` (orderable layers), `PreviewStage`.
- **Libraries:** `culori` (MIT) for colors. A small own mapper CSS to Tailwind (scale tables); optional CSS value parser (e.g. `css-tree`, MIT, verify). Target Tailwind version: v3 vs v4 class names differ in places (verify at build; default to v4 syntax if confirmed stable).
- **Where it runs:** main thread; no network.

## 6. Behavior rules
- Preview is the real CSS, applied to a sandbox element, so what you see is what you copy.
- Tailwind mapping: use a standard utility only when it matches exactly (e.g. `gap-4` = 1rem, `rounded-lg`, `shadow-md` if values equal the framework default, verify per version). Otherwise emit arbitrary values: `shadow-[0_10px_30px_rgba(0,0,0,0.2)]`, `grid-cols-[200px_1fr_2fr]`, `bg-[conic-gradient(...)]`. Underscores replace spaces in arbitrary values. A tooltip says why each arbitrary value was used.
- Multi-layer shadows keep order (first layer on top). Gradients with 2+ stops; stop positions kept 0 to 100% and sorted.
- Glassmorphism emits `background: rgba()`, `backdrop-filter: blur()`, optional `border` and `-webkit-backdrop-filter` for Safari (verify need on current versions), plus a solid-color fallback via `@supports not (backdrop-filter: blur(1px))`.
- Mesh gradient is built from layered radial gradients (pure CSS, no image); node count limited to 6.
- Values are generated with units (`px`, `rem`, `%`); a rem/px switch uses a 16 px base.
- Settings persist in localStorage per generator; never any user data sent anywhere.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Empty/invalid number (`abc`, negative blur) | Field error; blur and spread minimum 0 (spread may be negative); previous value kept |
| Huge values (blur 9999 px, 100 shadow layers) | Cap layers at 10 and blur at 500 px with message to protect performance |
| `backdrop-filter` unsupported (older Firefox, some browsers; verify) | Preview shows fallback and notes "No blur in this browser; solid fallback applied" |
| Glass over a plain background | Note: glass needs a busy background; preview offers sample backgrounds |
| Low contrast text on glass | Contrast warning using F-013 logic against the chosen background |
| Grid item overlap/spans beyond tracks | Auto-add implicit tracks or flag overlap with outline; no silent drop |
| Named grid areas | Generated only if the user enables Areas mode; names validated (no spaces) |
| Flex `gap` in older Safari | Note on support (verify) |
| Tailwind: value has no exact utility | Arbitrary value used; copy never silently rounds |
| Tailwind: dynamic class warning | Note: generated class strings must be written whole in source so Tailwind can detect them; do not build them by concatenation |
| Conic gradient unsupported | Rare; show warning from feature check (`CSS.supports`) |
| Pasted CSS with unsupported syntax (`var()`, `calc()`) | Import best effort; unparsed parts listed; nothing lost silently |
| Alpha colors | Output `rgb(r g b / a)` or `rgba()` toggle; Tailwind uses `/` opacity or arbitrary |
| Clipboard blocked | Selection fallback and message |
| RTL layout | Preview has an LTR/RTL toggle; output uses logical properties (`margin-inline`) when chosen |
| `prefers-reduced-motion` | No preview animation; any animated preview off |
| Mobile drag precision | Larger handles and numeric inputs as the alternative |
| Clip-path custom polygon with points outside the box | Allowed (valid CSS) with a note |
| Pasted CSS very large (over 100 KB) or pathological (thousands of layers) | Rejected over 100 KB with a message; import parse time-boxed to 500 ms, then "could not import" and nothing changes |
| Unicode / emoji / RTL in grid area names, custom property names or `content` strings | Unicode identifiers are valid CSS and kept; names starting with a digit or containing spaces are rejected inline; Tailwind arbitrary values escape what they must |
| Tailwind arbitrary value contains a comma or `url()` | Output keeps it valid (no spaces, underscores as needed); if type inference is ambiguous use the `image:` / `length:` hint (e.g. `bg-[image:conic-gradient(...)]`, verify) |

## 8. Limits, performance, privacy
- Preview updates within one frame; nothing blocks typing. Generators lazy-load by tab.
- Network: none. Pasted CSS is parsed locally and not stored. Stored locally: generator settings only. Share links carry settings only.
- Bundle target: under 150 KB gzipped per generator (verify).

## 9. Accessibility and mobile
- Every drag interaction (grid cell sizing, gradient stops, clip-path points) has numeric inputs and arrow-key nudging (Shift = 10x).
- Output is real text so screen readers read it; preview marked `aria-hidden` with a text description of the settings.
- Mobile: preview on top, controls in a `Sheet`; code output collapsible.
- Accessibility notes shown inline: do not rely on shadow alone to convey focus; keep text contrast on gradients and glass; respect reduced transparency (`prefers-reduced-transparency` is new and not in all browsers; verify support, treat as optional enhancement).

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] Copied CSS pasted into a blank page renders within 1% pixel difference of the preview (screenshot comparison, fixture per generator) in Chrome, Firefox, Safari.
- [ ] A 3-layer shadow keeps layer order in CSS and Tailwind output.
- [ ] Tailwind output uses a standard utility when equal and an arbitrary value otherwise, with a visible note.
- [ ] Glass output includes a fallback for no `backdrop-filter`.
- [ ] Every draggable control has a keyboard/numeric alternative.
- [ ] Out-of-range values are clamped with a message, never produce broken CSS.
- [ ] Pasted CSS imports without loss for: `box-shadow` with 1 to 10 layers (including `inset`, negative spread, hex/rgb/rgba/hsl colors) and `linear-gradient`/`radial-gradient`/`conic-gradient` with `%` or `px` stops. Anything else is listed as not imported.
- [ ] Preview updates within 16 ms (one frame) per control change on a mid-range laptop.
- [ ] No network requests are made.

## 12. Future ideas and open questions
- Ideas: animation/keyframe builder, grid-to-Tailwind-layout presets, Figma-style shadow import, export as CSS module or styled-components, neumorphism preset.
- Open: which Tailwind version first (verify v4 syntax)? Is clip-path in v1 or later? Include an HTML snippet output?
