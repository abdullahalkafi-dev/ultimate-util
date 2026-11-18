---
id: F-012
slug: color-wheel-softbox
title: Color Wheel & Fullscreen Softbox Light
category: design
tier: client
priority: P0
status: planned
depends_on: []        # optional soft link: F-031 (preset sync). F-012 works fully without it, so there is no circular dependency
---

# Color Wheel & Fullscreen Softbox Light

## 1. Summary
An interactive color wheel (HSL and perceptual OKLCH) with live HEX/RGB/HSL/OKLCH readouts and an eyedropper, plus a one-click Fullscreen mode that turns the monitor into a soft face light for video calls or an eye-comfort screen. Presets save to the cloud via F-031 when signed in; guests keep them locally.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Remote worker | Dark room, video call, weak webcam light | Warm, soft, edge-vignette light from the screen in one click |
| Designer | Needs a color from a reference on screen | Picks with eyedropper, copies HEX/OKLCH |
| Streamer / photographer | Needs a colored fill (e.g. magenta) for a portrait | Full-screen color with exact hue and brightness |
| Night reader | Wants a dim, warm screen, no blue light | 2700 K low-brightness fullscreen that never sleeps |
| Developer (non-obvious) | Testing how a UI looks under a flat color or dead-pixel check | Pure solid color fullscreen, any value |

## 3. User flow
1. Empty state: wheel at a default color (`#ff9a3c`), readouts filled, button **Try Softbox** and **Pick from screen**. No file needed.
2. User drags on the wheel (hue + saturation), a lightness slider, optional OKLCH mode toggle (`SegmentedControl`: HSL wheel / OKLCH wheel). All readouts update live; each has a `CopyButton`.
3. **Pick from screen** opens the EyeDropper; the chosen color replaces the current one.
4. Click **Fullscreen softbox**. Working state: screen fills with the color, UI hides after 3 s of no input, cursor hides, Wake Lock is requested. A small hint ("Esc to exit, ? for keys") shows for 3 s.
5. Inside fullscreen: arrow keys change brightness/warmth, number keys switch presets. Move the mouse or tap to reveal a minimal control bar.
6. Done state: Esc, **Exit** button, or swipe down (pseudo-fullscreen) returns to the editor with all settings kept. Toast "Preset saved" after **Save preset**.

```
[Wheel] [Lightness]  HEX RGB HSL OKLCH [copy]   Mode: Color | Warm light
[Eyedropper]  Temp 1000-10000 K  Brightness  Shape: Flat|Vignette|Ring|Panel  [Fullscreen]
```

## 4. Inputs and outputs
- **Inputs:** pointer/touch on wheel; typed HEX (3/4/6/8 digits), `rgb()`, `hsl()`, `oklch()`; sliders for Kelvin (1000 to 10000 K, default 4500 K), brightness (5 to 100%), vignette size/softness; shape selector.
- **Outputs:** copyable color strings in all four formats; saved presets `{name, color, kelvin, brightness, shape, params}`; no file output. URL hash may mirror settings (`#c=ff9a3c&k=4500`).

## 5. Components and tech
- **UI:** `ToolShell`, `ColorSwatch`/`ColorField`, `CopyButton`, `SegmentedControl`, `Slider`/`NumberField`, `SettingsPanel`, `Toast`, `ErrorBanner`, `HelpPopover`, `ShortcutHint`, `AuthBadge`, `ConfirmDialog`. New: `ColorWheel` (canvas/SVG wheel with keyboard support), `SoftboxStage` (fullscreen layer with gradients), `PresetBar`.
- **Libraries/APIs:** `culori` (MIT) for HSL/OKLCH conversion and gamut clipping; Fullscreen API; Screen Wake Lock API (secure context only); EyeDropper API (desktop Chromium only: Chrome/Edge, not Firefox, Safari or Android Chrome; needs a user gesture; verify current support); Page Visibility API. Kelvin to RGB uses a published approximation (Tanner Helland formula, valid about 1000 to 40000 K), verify accuracy against a reference table.
- **Where it runs:** main thread; no workers needed.

## 6. Behavior rules
- Wheel edits update readouts instantly (no debounce for color; presets debounce 150 ms).
- OKLCH mode keeps perceived lightness constant around the wheel; out-of-gamut values are clipped to sRGB with a small "clipped" badge.
- Warmth control multiplies the base color by the Kelvin tint; "Warm light" mode starts from white and applies only Kelvin + brightness.
- Softbox shapes: Flat (solid), Vignette (radial, bright center fading to edge), Ring (ring light), Panel (rounded rectangle glow on dark background). Edge softness has a minimum of 10% to avoid hard edges.
- Wake Lock is requested on entering fullscreen, released on exit, and **re-acquired on `visibilitychange` to visible** (the OS releases it when the tab is hidden).
- Cursor hides after 3 s idle; controls auto-hide after 3 s; any key/pointer move shows them.
- Brightness never animates faster than 1 step per frame and no flicker/strobe effect exists. No animated modes in v1.
- Shortcuts: `F` fullscreen, `Esc` exit, `Up/Down` brightness, `Left/Right` warmth, `1-9` presets, `C` copy color, `?` help.
- Signed in: presets sync via F-031. The tool stays badged "Local, optional sync" (registry `sync: optional`); only the preset save step uses the account. Guests: presets in localStorage, with a note that clearing site data deletes them.
- Show a one-time notice before first fullscreen: "Your screen cannot get brighter than your device allows. Avoid long static sessions on OLED screens. This tool does not flash."

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| iPhone Safari (no element Fullscreen API) | Use pseudo-fullscreen: fixed full-viewport overlay, UI hidden, hint to "Add to Home Screen" or scroll to hide the address bar; exit via visible corner button or double tap |
| iPad / desktop Safari fullscreen | Use Fullscreen API with `webkit` prefix fallback (`webkitRequestFullscreen`; verify which Safari versions still need it) |
| Wake Lock unsupported or rejected (battery saver, iOS home-screen web app) | Fullscreen still works; banner "Your device may dim or lock the screen. Change auto-lock in settings." |
| Tab hidden then shown | Wake Lock released by browser; re-requested on visible; if it fails, show the same banner |
| EyeDropper unsupported (Firefox, Safari, mobile browsers; detect with `'EyeDropper' in window`) | Hide the button; show "Not supported in this browser; paste a HEX instead" |
| User cancels the EyeDropper (Esc) | No change, no error |
| Invalid typed color (`#12`, `rgb(300,0,0)`, `banana`) | Field shows inline error; last valid color kept; 3-digit and 8-digit HEX accepted; out-of-range RGB clamped with note |
| Alpha channel in HEX/rgba | Readouts show alpha; fullscreen ignores alpha and uses opaque color; note shown |
| OKLCH out of sRGB gamut | Clipped via culori gamut mapping; badge "Clipped to sRGB" |
| User exits fullscreen via Esc, browser UI (F11/system gesture) | In real fullscreen the browser consumes Esc and the page may not receive the keydown. Listen to `fullscreenchange`, sync app state, release Wake Lock. The in-page Exit button and the Esc handler exist for pseudo-fullscreen only |
| Swipe down to exit in pseudo-fullscreen conflicts with browser pull-to-refresh or Safari bar gestures | Swipe is a secondary exit; the visible corner Exit button and double tap are primary. Set `overscroll-behavior: none` on the overlay |
| Typed color with spaces, uppercase, full-width digits or Unicode (`＃FF9A3C`, ` RGB(1 2 3) `) | Trimmed and case-insensitive; full-width characters rejected with the inline error, not silently converted |
| Display wider than sRGB (P3) | Colors are sRGB values; note in help that the shown color may look more saturated on wide-gamut screens |
| Fullscreen request denied (not triggered by a user gesture) | Only request from click/key; on failure fall back to pseudo-fullscreen |
| Extreme settings (brightness 5%, 10000 K) | Allowed; control bar stays readable with its own contrast-safe style |
| Photosensitive users / reduced motion | No flashing; fade between presets disabled when `prefers-reduced-motion` |
| OLED burn-in risk | After 30 min static, show a gentle "Still using this? Static light can burn in OLED" toast; optional slow pixel-shift toggle (off by default) |
| Cloud sync fails or user signed out | Preset saved locally, `SyncStatus` shows Offline; syncs later |
| RTL UI locale | Control bar mirrors; color strings stay LTR |
| Multiple monitors | Fullscreen covers the browser's current screen only; note in help |

## 8. Limits, performance, privacy
- 60 fps wheel drag on a mid-range phone; gradients are CSS, not per-pixel JS, in fullscreen.
- Network: none for colors or settings. Signed-in preset sync goes to our own API (F-031), preset data only.
- Stored locally: last color and settings (localStorage), guest presets.
- Safety copy: device or OS caps real brightness; the tool cannot override it.

## 9. Accessibility and mobile
- Wheel is a slider pair for keyboard (arrow keys hue/saturation, Page Up/Down lightness) with `aria-valuetext` of the color name and HEX. Hex input is always available as the accessible alternative.
- Fullscreen announces "Fullscreen light on, press Escape to exit" via `aria-live`. Exit button is focusable and has 44 px target.
- Mobile: wheel above, controls in a `Sheet`; fullscreen is portrait or landscape; touch gestures never rely on hover.

## 10. Data
Presets are synced by F-031 when signed in (see that spec for fields, encryption class, quotas). This tool itself stores nothing server-side.

## 11. Acceptance criteria
- [ ] Dragging the wheel updates HEX, RGB, HSL, OKLCH within one frame, and typed values round-trip within rounding.
- [ ] Fullscreen opens in one click on desktop Chrome, Edge, Firefox, Safari and iPad; on iPhone the pseudo-fullscreen opens and exits.
- [ ] Esc (or the Exit button) always exits and releases the Wake Lock.
- [ ] Wake Lock is re-acquired after the tab is hidden then shown (manual test on Android and desktop).
- [ ] Cursor and controls hide after 3 s idle and return on input.
- [ ] Kelvin to RGB (Tanner Helland formula) renders 2700 K within +/-6 per channel of (255, 167, 87) and 6500 K within +/-6 of (255, 255, 255); 1000 K to 10000 K is monotonic in the blue channel.
- [ ] No element flashes or animates faster than 1 Hz (well under WCAG's 3 flashes per second limit); with `prefers-reduced-motion` all fades are disabled.
- [ ] In the fullscreen-exit edge cases (Esc, F11, Exit button, swipe) app state and Wake Lock end up released in under 500 ms.
- [ ] Out-of-range or malformed typed colors never change the displayed color and show an inline error.
- [ ] Eyedropper button is hidden where unsupported and never throws.
- [ ] The safety notice shows before first fullscreen and mentions brightness cap, OLED, no flicker.
- [ ] No network request is made except preset sync when signed in.

## 12. Future ideas and open questions
- Ideas: scheduled warm-up, face-light shape with a camera-view hole, color-blind-safe wheel preview, import color from F-013.
- Open: ship OKLCH wheel as default or as an option? Enable pixel-shift for OLED by default? Verify real-device behavior of Wake Lock on iOS home-screen apps (spike 5 in research notes).
