---
id: F-016
slug: font-pairer-type-scale
title: Font Pairer & Type Scale Calculator
category: design
tier: client
priority: P2
status: planned
depends_on: []
---

# Font Pairer & Type Scale Calculator

## 1. Summary
Preview two Google fonts side by side with your own text, browse curated pairings, and generate a modular type scale with rem, px or fluid `clamp()` output, ready for CSS variables or a Tailwind config. Includes line-height and line-length guidance.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Designer | Choosing heading + body fonts | Sees real text in both, swaps until it feels right |
| Developer | Needs consistent font sizes | Scale of 8 sizes as CSS variables |
| Blogger | Wants readable long-form text | Suggested line height and max width in characters |
| Bilingual site owner (non-obvious) | Needs Arabic or Bengali body font with a Latin heading | Filters fonts by script and previews mixed text |
| Privacy-focused team | Cannot call Google from visitors' browsers | Self-hosted font snippet via Fontsource names |

## 3. User flow
1. Empty state: two preview cards (Heading, Body) with a default pairing and sample text already filled; **Try a curated pair** shuffles.
2. User picks a font for each role from a searchable `FontPicker` (family, category, script filter, variable badge). Weights/styles selectable.
3. User edits the sample text (heading, paragraph) or picks a sample language. Preview updates live.
4. **Curated pairings** tab: 30 to 50 hand-picked pairs with a reason line ("geometric heading, humanist body"). One click loads them.
5. **Type scale** tab: base size (default 16 px), ratio preset (minor second 1.067, major second 1.125, minor third 1.2, major third 1.25, perfect fourth 1.333, augmented fourth 1.414, perfect fifth 1.5, golden 1.618) or custom, steps (-2 to +6). Optional fluid mode: min and max viewport widths with min/max base sizes.
6. Output: table of steps with live specimen, `CodeOutput` as CSS variables, Tailwind `fontSize`, or plain CSS. Line-height and measure panel shows suggestions.
7. Done: copy CSS plus the font-loading snippet (self-hosted import or Google link, user's choice).

## 4. Inputs and outputs
- **Inputs:** two font choices, weights, sample text (up to 2,000 characters), base size 10 to 32 px, ratio, step range, viewport range for fluid.
- **Outputs:** CSS variables (`--step-0: 1rem`), `clamp(1rem, 0.9rem + 0.5vw, 1.25rem)` fluid values, Tailwind config snippet (version verify), font-loading snippet (Fontsource `npm` import or `<link>`), saved pair as JSON. No downloads of fonts in v1.

## 5. Components and tech
- **UI:** `ToolShell`, `Tabs`, `SplitPane`, `SettingsPanel`, `Slider`/`NumberField`, `SegmentedControl`, `CodeOutput`, `CopyButton`, `Toast`, `ErrorBanner`, `EmptyState`, `HelpPopover`, `LibraryLoader`. New: `FontPicker`, `FontPreviewCard`, `TypeScaleTable`, `ConsentNotice` (third-party request notice).
- **Data/fonts:** bundled font **metadata** index (family, category, scripts, weights, variable axes) generated at build time from open Google Fonts data (verify license: fonts are OFL/Apache; metadata terms verify). Font files: **Fontsource** self-hosted packages (MIT wrapper, fonts under OFL, verify per font) loaded lazily from our own origin or CDN we control.
- **Math:** own code; fluid formula `clamp(min, intercept + slope*vw, max)`.
- **Where it runs:** main thread; font loading via CSS Font Loading API (`document.fonts.load`).

## 6. Behavior rules
- **Default: no third-party requests.** Fonts load from our own origin (Fontsource files, lazy per font on selection). A "Use Google Fonts CDN" option is offered only for the *exported snippet*, with a note that it sends visitors' IP addresses to Google (privacy and GDPR concern; verify legal advice). If the tool itself ever loads from Google, it must show `ConsentNotice` and ask opt-in first.
- Font files load only on selection; each shows size and uses `font-display: swap` in the preview with a "loading" skeleton to avoid layout jump (FOUT handled visibly).
- Scale math: `size(n) = base * ratio^n`; px and rem (16 px root) both displayed, rounded to 3 decimals, never to whole pixels unless the user chooses "round to pixel".
- Line-height guidance: body 1.4 to 1.6, tightening toward about 1.1 to 1.25 for large headings; shown per step and computed from font size. Measure: 45 to 75 characters per line (66 ideal); preview container width shown in `ch`.
- Heading and body can share a family (weight contrast) and the tool states when a pair is "same family".
- Tailwind export names steps `xs`..`6xl`-style or `step-n`; naming option avoids overriding defaults unintentionally.
- Settings and last pairing persist in localStorage; sample text is persisted too (an explicit exception to "settings only", since it is short preview text; never uploaded; a Clear button removes it). Users are told not to paste confidential text.
- Signed-in saving of pairs is out of scope for v1 (see Future).

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Font fails to load (offline, blocked) | Preview shows fallback stack with a banner "Could not load X"; Retry button; export still works |
| Font name not found / removed from index | Removed from search; saved pair shows "font unavailable" and falls back |
| Variable fonts | Weight slider enabled over the available axis range; other axes (width, optical size) shown only if supported; export notes variable file |
| Static font missing a weight | Weight option disabled with tooltip; nearest weight not faked |
| Non-Latin text (Arabic, Bengali, Devanagari, CJK) | Script filter lists only fonts that cover it; text outside coverage falls back and is flagged "missing glyphs" |
| CJK font file is huge (several MB) | Show size on pick; load a subset/unicode-range slice when available (verify Fontsource subsets); progress shown |
| RTL sample text | Preview toggles `dir="rtl"`; type scale unaffected |
| Empty sample text | Placeholder sample restored; no blank preview |
| Very long sample (2,000+ chars) | Truncated at limit with counter |
| Emoji / combining marks | Rendered with system fallback; noted that the chosen font may not include emoji |
| FOUT when switching fonts | Keep previous font until new one is ready, then swap with 150 ms fade (none under reduced motion) |
| Ratio or base invalid (0, negative, text) | Field error; last valid kept; ratio min 1.01 and max 2 |
| Fluid min greater than max viewport | Error and auto-swap suggestion |
| Fluid output at extreme zoom | Notes that `vw`-only values can break user zoom; formula always includes a `rem` term |
| Cancel font download | Request aborted; previous font stays |
| Browser lacks CSS `clamp()` or Font Loading API | Static rem output; message with support notes (very rare) |
| User wants a proprietary/paid font | Not in list; explained as out of scope |
| Many pair tests (memory) | Only the two active fonts plus last three cached are kept in memory |
| Touch device | Weight/axis sliders have numeric fields; font search opens full-screen; touch targets 44 px |
| Font request times out (over 10 s) | Treated as a load failure: fallback stack, banner with Retry |
| Fluid values for viewport range below 320 px or above 2560 px | Allowed; warning that WCAG 1.4.4 needs text to scale to 200% zoom, so the `rem` term stays in the formula |

## 8. Limits, performance, privacy

_Registry flag: `optInNetwork: ["Google Fonts CDN (only if the tool itself loads from Google; default is self-hosted)"]`._
- Metadata index under 300 KB gzipped (verify). Each Latin font file about 20 to 100 KB; CJK much larger.
- **Network:** font files from our own origin only (static, no user content). Optional Google Fonts CDN is **third-party**, opt-in, and only used if the owner decides to allow it; nothing user-specific is sent besides the standard request data.
- Stored locally: last pairing, scale settings, sample text.

## 9. Accessibility and mobile
- Font picker is a combobox with arrow-key navigation; preview text is real selectable text. Scale table is a proper `<table>`.
- Guidance mentions minimum body size 16 px, respecting user font-size settings (use `rem`), and that layouts must survive users overriding line height to 1.5 and letter/word spacing (WCAG 1.4.12 Text Spacing).
- Mobile: previews stack, controls in `Sheet`; font search full-screen.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] Selecting a font loads it and updates both preview cards in under 1 s on broadband, and the controls around the preview move 0 px during the swap (preview cards have a fixed minimum height).
- [ ] With the default setup, DevTools shows no request to `fonts.googleapis.com` or `fonts.gstatic.com`.
- [ ] Scale at base 16 and ratio 1.25 yields 16, 20, 25, 31.25, 39.0625 px (to rounding).
- [ ] Fluid output uses `clamp()` with a `rem` term and matches the chosen min/max at the two viewport widths.
- [ ] Script filter hides fonts without coverage for the chosen script.
- [ ] Font load failure shows a visible error with Retry.
- [ ] CSS variables and Tailwind snippets copy and parse correctly.
- [ ] Variable font weight slider works across the axis range.

## 12. Future ideas and open questions
- Ideas: save pairs to cloud (via F-031 style storage), import a site URL to detect fonts (needs server, out of scope), contrast check of text on background (F-013), font subsetting snippet, pairing suggestions by mood.
- Open: self-host all fonts (storage/bandwidth cost) or opt-in Google CDN? Which curated list source and who maintains it? Tailwind version target (verify).
