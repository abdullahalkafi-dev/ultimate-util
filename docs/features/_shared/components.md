# Shared component catalog

_Created: 2026-11-19. Updated: 2026-11-19 (platform components, promoted shared components, feature-introduced components)._ Feature specs refer to these by name. Build each once, reuse everywhere. If a spec needs something new that two or more tools could use, add it here.

Rule: a component introduced by one feature lives in "Feature-introduced components" below, owned by that feature. When a second feature needs it, move it to the main table and rename it generically.

## Core components
| Component | Purpose | Key behavior |
|---|---|---|
| `ToolShell` | Page frame for every tool | Header with name, `AuthBadge`, `BookmarkStar`, help; workspace slot; settings slot; privacy footer |
| `AuthBadge` | Shows Local (lock), Local + optional sync (lock + small cloud) or Synced (cloud) | Derived from registry `tier`/`sync` only (P-004); tooltip explains; text + icon, never color alone; same on cards, palette, tool header |
| `BookmarkStar` | Toggle bookmark | Writes to localStorage; synced after login (P-003) |
| `DropZone` | File input | Drag, click, paste; accept list; magic-byte validation; multiple flag; focusable; shows accepted types and size limit |
| `FileList` | Queue of added files | Thumb/icon, name, size, status, remove, reorder (drag + keyboard) |
| `ProgressBar` | Determinate/indeterminate progress | Percent, step label, Cancel; `aria-live` |
| `ResultCard` | Output summary | Before/after sizes, preview, Download, Copy, Start over |
| `DownloadButton` | Save one file or ZIP | Blob download; ZIP via fflate for multiple; filename pattern |
| `CopyButton` | Copy text/code/color | Clipboard API with fallback selection; "Copied" feedback; failure message |
| `CodeEditor` | Editable code/text area | Monospace, line numbers, syntax highlight, error markers, find; CodeMirror 6 (MIT) |
| `CodeOutput` | Read-only code block | Copy, download, language label, wrap toggle |
| `SplitPane` | Input/output side by side | Draggable divider; stacks vertically on mobile |
| `DiffView` | Side-by-side or inline diff | Added/removed highlighting, jump to next change |
| `SettingsPanel` | Option controls | Sliders, selects, toggles; reset to defaults; persists settings |
| `Slider` / `NumberField` | Numeric input | Linked pair; units; min/max; keyboard arrows; validation message |
| `SegmentedControl` | Mode switch | Radio semantics; keyboard arrows |
| `ColorSwatch` / `ColorField` | Show/edit a color | HEX, RGB, HSL, OKLCH inputs; eyedropper where supported; copy |
| `ImageCanvas` | Display/zoom/pan image | Fit/100%, zoom, pan, checkerboard for transparency, before/after slider |
| `BeforeAfter` | Compare two images | Draggable divider, keyboard operable |
| `PageThumbGrid` | PDF page thumbnails | Lazy render, select, drag reorder, rotate, delete |
| `Toast` | Short feedback | Auto-dismiss; `role="status"`; Undo option when destructive |
| `ErrorBanner` | Blocking/inline error | Cause + fix + Retry; `role="alert"` |
| `ConfirmDialog` | Confirm destructive action | Built in-page (no `window.confirm`); focus trap; Esc cancels |
| `EmptyState` | First-run content | One-line purpose, sample button, accepted inputs |
| `Tabs` | Switch panels | Roving tabindex; arrow keys |
| `HelpPopover` | Short how-to and shortcuts | Per tool; keyboard `?` |
| `ShortcutHint` | Show key combos | Platform-aware (Ctrl vs Cmd) |
| `PasswordPrompt` | Ask for a password/passphrase | Show/hide, optional `StrengthMeter`, never stored in plain text |
| `UnlockGate` | Vault passphrase entry (cloud) | Derives key locally; lockout feedback; auto-lock timer |
| `SyncStatus` | Cloud sync state | Synced / Syncing (N pending) / Offline / Conflict / Error; last synced time |
| `UsageMeter` | Quota display | Used/total with warning thresholds |
| `PermissionPrompt` | Camera/mic/clipboard explainer | Shown before browser prompt; recovery help if denied |
| `LibraryLoader` | Lazy dependency load | Name, size, progress, retry; remembers cached state |
| `Tooltip` | Short hint | Hover and focus, not for essential info |

## Shared components promoted from features (used by two or more)
| Component | First owner | Also used by | Purpose and behavior |
|---|---|---|---|
| `StrengthMeter` | F-026 | `PasswordPrompt`, P-005 vault wizard, F-028, F-029 | Entropy bits + text label (not color only), zxcvbn-ts based, announced politely |
| `PrivacyNotice` | F-019 | F-021 (`SecurityNote`), F-023, F-016 (`ConsentNotice`), F-010 (map opt-in), F-011 (`CapabilityNotice`) | Inline notice block with variants `info`, `caution`, `consent` (consent has Confirm/Cancel); used for "stays in your browser", secret warnings and opt-in network features (`optInNetwork`) |
| `TreeView` | F-018 | F-010 (`MetadataTree` is built on it) | Virtualized, collapsible, keyboard navigable tree; copy path; optional checkboxes and search |
| `ZonePicker` | F-025 | F-022 (`TimezoneSelect`) | Searchable IANA timezone/city picker via `Intl.supportedValuesOf('timeZone')` with fallback list |
| `TagInput` | F-029 | F-030 | Add/remove tags with autocomplete from existing tags; keyboard and screen-reader friendly |
| `RecoveryKeyDialog` | F-028 | F-029, P-005 vault wizard | Shows the recovery key once as selectable text with Copy/Download, forces confirmation (retype last 4 characters), supports rotation |
| `MergeLocalDialog` | F-031 | P-005 (replaces `MergeDialog`), F-033 | "Add what is on this device to your account?" with per-source counts (bookmarks, presets, sessions) and Merge / Use account only / Skip |
| `CountdownRing` | F-028 | F-033 (`TimerRing` is a configuration of it) | Circular countdown from timestamps (not accumulated timers), color change plus text near the end, reduced-motion safe |
| `QrScanner` | F-028 | F-024 (`ScanOverlay` is its overlay layer) | Camera or image QR decode via BarcodeDetector with zxing-wasm fallback; `PermissionPrompt` first |

## Platform components (P-001 to P-005)
| Component | Owner | Purpose |
|---|---|---|
| `TopBar` | P-001 | Ink bar: logo, search field, sign-in or avatar |
| `ToolCard` | P-001 | Grid card (standard and featured variants), one anchor per card, star outside the link |
| `CategoryChips` | P-001 | Toggle-button group for category filter, colored dots |
| `StatPill` | P-001 | "27 run locally" style pill, value from registry |
| `BookmarksStrip` | P-003 | Ink strip of bookmark chips, reorder, overflow menu |
| `RecentsList` | P-003 | Last 10 tools, used by palette and home |
| `StorageProvider` | P-003 | localStorage with in-memory fallback, versioned JSON, `storage`/BroadcastChannel sync |
| `CommandPalette` (`PaletteInput`, `ResultGroup`, `PreviewPane`) and `searchIndex` | P-002 | Global overlay search; `searchProvider` interface for saved items |
| `SignInGate`, `VaultStatus`, `CloudPreview` | P-004 | Guest gate with labelled example preview; Locked/Unlocked pill |
| `SignInButton`, `AvatarMenu`, `VaultSetupWizard`, `AccountSettings` | P-005 | Sign-in entry, signed-in menu, first-use vault setup, account settings |
| `SyncEngine` | P-005 | Non-UI module: local-first queue, backoff, BroadcastChannel leader tab |

## Feature-introduced components (promote when reused)
One line each, grouped by owner feature ID. A component here is owned by that feature until a second feature needs it.

**F-001 DOCX:** `RichTextToolbar` (formatting toolbar), `PagePreview` (paginated live preview), `ExportDialog` (format and options), `FidelityNotice` (layout-may-differ notice), `DraftBanner` (autosaved draft restore/clear).
**F-002 PDF to DOCX:** `FidelityReport` (what converted well and what did not).
**F-005 OCR:** `LanguagePicker` (OCR language selection with data size).
**F-007 Bulk resizer:** `PresetPicker` (grouped size presets), `CropAnchorGrid` (9-point focus), `RenamePatternField` (token input with live example).
**F-008 Image editor:** `ToolPalette` (vertical tool buttons), `LayerPanel` (reorder, visibility, lock, opacity, blend), `HistoryPanel` (undo list), `CurvesEditor` (RGB curve with points), `CropOverlay`, `ProjectFileIO` (save/open project ZIP).
**F-009 Background remover:** `BrushTool` (mask paint with size/hardness/touch), `ModelStatus` (model name, size, license, backend WebGPU/WASM).
**F-010 EXIF:** `MetadataTree` (grouped, searchable, checkboxes, risk flags; built on `TreeView`), `CoordinateDisplay` (decimal/DMS, copy, optional map opt-in), `RiskBanner` (privacy-risk summary).
**F-011 Video:** `TimelineTrimmer` (range handles, playhead, waveform), `EstimateBadge` (size/time estimate with confidence), `CapabilityNotice` (isolation, memory and mobile limits; use `PrivacyNotice` style).
**F-012 Color wheel:** `ColorWheel` (canvas/SVG wheel, keyboard support), `SoftboxStage` (fullscreen light layer), `PresetBar` (save/load presets).
**F-013 Palette:** `PaletteRow` (editable swatch row), `ContrastPanel` (WCAG ratios and pass/fail), `ColorBlindPreview` (simulation side by side).
**F-014 CSS generators:** `GridBuilder`, `FlexBuilder`, `StopBar` (gradient stops), `LayerList` (orderable layers; candidate to merge with F-008 `LayerPanel`), `PreviewStage`.
**F-015 SVG:** `PluginToggleList` (SVGO plugin toggles), `PixelDiffBadge` (visual difference score), `SanitizeReport` (what was removed).
**F-016 Fonts:** `FontPicker`, `FontPreviewCard`, `TypeScaleTable`, `ConsentNotice` (third-party request notice; use `PrivacyNotice` `consent`).
**F-017 Mockups:** `DeviceFramePicker`, `DataFieldPicker`, `DataTablePreview`, `SeedField` (reproducible seed input).
**F-018 JSON:** `TreeView` (promoted above).
**F-019 JWT:** `ClaimsTable` (claims with human-readable times), `TokenStatusChip` (valid/expired/not yet valid), `PrivacyNotice` (promoted above).
**F-020 Regex:** `FlagToggleGroup`, `MatchHighlighter` (match and group decorations in text), `RegexExplainer` (token tree), `CheatsheetPanel` (searchable, click-to-insert), `SavedList` (local saved patterns).
**F-021 Hash:** `HashResultRow` (algorithm, value, copy, compare state), `SecurityNote` (use `PrivacyNotice` `caution`).
**F-022 Cron:** `TimezoneSelect` (use `ZonePicker`), `CronBuilder` (per-field editors), `RunList` (next runs with timezone).
**F-023 SQL/cURL:** `HeaderTable` (sortable, per-row copy and redact marker), `RedactToggle` (secret masking; reusable by request tools).
**F-024 QR:** `QrPreview` (preview with print-size ruler), `ContrastBadge` (ratio + pass/fail; share logic with F-013 `ContrastPanel`), `ScanOverlay` (camera boxes), `ScanResultList`, `LinkSafetyCard` (host and risk flags; also wanted by F-032 `LinkWarning`).
**F-025 Units:** `SmartSearchBar` (combobox with parse chips and suggestions, e.g. "5 km in miles"), `UnitTable`, `WorldClockList`, `MeetingPlannerGrid`.
**F-026 Password:** `StrengthMeter` (promoted above), `PasswordDisplay` (monospace, per-character class coloring), `SiteRulesForm`.
**F-027 Word counter:** `StatTile` (label, value, tooltip with definition; candidate for any stats grid, e.g. F-006), `GoalBar`, `KeywordTable` (sortable, n-gram switch), `LimitPresetList` (platform character limits).
**F-028 TOTP:** `TotpCard`, `CountdownRing`, `QrScanner`, `RecoveryKeyDialog` (promoted above), `ClockDriftBanner`, `ImportPreviewList`.
**F-029 Notes:** `NoteList`, `MarkdownPreview` (sanitized), `SecretBlock` (masked secret with reveal/copy), `TagInput`, `VersionHistoryPanel`, `PassphraseChangeDialog`.
**F-030 Snippets:** `SnippetList`, `VariableFillForm` (fill `{{variables}}`), `CollectionTree`, `SecretWarningBar` (local secret detection), `ImportMapper`.
**F-031 Saved library:** `LibraryGrid`, `PaletteCard`, `GradientCard`, `PresetCard` (softbox thumbnail), `SaveToLibraryDialog`, `MergeLocalDialog` (promoted above).
**F-032 Clipboard drop:** `DropItemCard`, `DeviceList`, `PairingQr`, `LiveConnectionBadge`, `LinkWarning` (use `LinkSafetyCard`), `SendComposer`.
**F-033 Pomodoro:** `TimerRing` (use `CountdownRing`), `SessionLog`, `HabitRow`, `StreakBadge`, `HeatCalendar`, `AccessibleChart` (chart with data-table toggle; reusable by any chart), `ActiveTimerBanner`.

F-003, F-004 and F-006 introduce no new components.

## Layout primitives
`Stack`, `Cluster`, `Grid` (auto-fill cards), `Sheet` (mobile bottom sheet), `Drawer`, `Modal`. All use spacing and color tokens from the approved design (Ink + Electric Blue, light/dark).

## Design tokens (from the approved home page)
Ink `#0b0f19`, accent electric blue `#2446f0` (dark mode `#8fa6ff`), highlight `--hl` `#8fa6ff` (used on ink surfaces), category colors: documents blue, media magenta `#d6246e`, design violet `#7440e8`, developer green `#0a8a66`, everyday amber `#c26200`, cloud teal `#0e7490`. Headings Space Grotesk, body Inter. 1.5px borders, 12 to 14px radius. Final token file is defined when coding starts.
