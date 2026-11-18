---
id: F-031
slug: saved-palettes-presets
title: Saved Color Palettes & Softbox Presets
category: cloud
tier: cloud
priority: P1
status: planned
depends_on: [F-012, F-013, _shared/cloud-conventions, _shared/components, P-005]
---

# Saved Color Palettes & Softbox Presets

## 1. Summary
A personal library of brand palettes, gradients and favorite fullscreen softbox lighting presets that follows you across devices. Tools F-012 and F-013 save into it and load from it. Guests can save locally and are invited to sign in to sync.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Designer | Keeps palettes for 12 clients | Named palettes with roles, export to CSS or Tailwind |
| Developer | Needs brand colors in a new project | One-click load into F-013 or copy as CSS variables |
| Streamer or video caller | Likes a warm, bright key-light screen | Saved softbox preset (color, temperature, brightness, shape) opened full screen on any device |
| Photographer | Uses a phone as a light on location | Presets synced to the phone with thumbnails |
| Guest | Tries the tool, saves two palettes | Local save works; sign-in prompt merges them into the account |

## 3. User flow
1. Open the library (also reachable from F-012/F-013 toolbars via **Save** and **Library**). Tabs: Palettes, Gradients, Softbox presets.
2. Guest state: items are saved locally on this device (registry `guestAccess: local`; the badge stays Synced, with a note "Saved on this device. Sign in to sync."). A quiet banner "Sign in to sync across devices". No blocking gate (a documented exception to the default sign-in gate).
3. Empty state: `EmptyState` with **Create palette**, **Import (JSON or image)**, and a link to F-013.
4. Save from a tool: dialog with name, tags, collection, and (for palettes) role labels; Save.
5. Library view: grid of cards with thumbnails (strip of swatches, gradient preview, softbox render), search, tag filter, collection chips, drag or keyboard reorder, rename inline.
6. **Load:** card menu **Open in Color Wheel / Palette Generator / Softbox**; the target tool opens with the item applied (via a library id in the URL; no data in the URL).
7. **Export:** per item or per collection: CSS variables, Tailwind config, JSON, SCSS; copy or download.
8. First sign-in with local items: `ConfirmDialog` "Merge 7 local items into your account?" then result toast.

## 4. Inputs and outputs
- **Inputs:** items from F-012/F-013; JSON import (own schema, also simple arrays of HEX); image (PNG/JPG/WebP up to 10 MB) from which up to 8 dominant colors are extracted, previewed before saving (verify extraction quality).
- **Outputs:** CSS (`--brand-primary: #2446f0;`), Tailwind (`theme.extend.colors`), JSON, SCSS, PNG thumbnail of a palette. ASE and GPL are future.

## 5. Components and tech
- **Reused:** `ToolShell`, `AuthBadge`, `SyncStatus`, `UsageMeter`, `ColorSwatch`/`ColorField`, `CopyButton`, `DownloadButton`, `DropZone`, `Tabs`, `SegmentedControl`, `ConfirmDialog`, `Toast`, `EmptyState`, `ErrorBanner`.
- **New:** `LibraryGrid`, `PaletteCard`, `GradientCard`, `PresetCard` (renders a softbox thumbnail), `SaveToLibraryDialog`, `MergeLocalDialog`.
- **Libraries:** `culori` (MIT, verify) for OKLCH conversion; color extraction by quantization in a worker (own median-cut or `colorthief`, verify license); canvas for thumbnails.
- **Runs:** extraction and thumbnails in a worker.

## 6. Behavior rules
- **Palette:** name, ordered colors (2 to 20). Each color stores canonical `hex` (sRGB, 6 or 8 digit), `oklch` (derived, stored for display), optional `role` (primary, secondary, accent, background, surface, text, success, warning, danger, custom label) and optional name.
- **Gradient:** type (linear/radial/conic), angle or position, stops (2 to 12) with color and position; CSS string generated, not stored as source of truth.
- **Softbox preset:** `color` (hex), `temperatureK` (1,000 to 10,000), `brightness` (5 to 100), `shape` (flat, vignette, ring, panel), `size`, `edgeSoftness`, optional `notes`. Ranges and shapes must mirror the F-012 controls exactly (if F-012 changes, update here); unknown fields from newer versions are preserved.
- Loading never silently overwrites the current tool state: if the tool has unsaved changes, ask first.
- Duplicate detection: identical ordered colors prompt "Already saved as X". Names need not be unique; duplicates get " (2)".
- Rename, reorder (manual order stored), collections one level; tags free text.
- Local-first: guests store in IndexedDB under a local namespace. On first login, merge: union by id; items with identical content are deduped; newest `updatedAt` wins on id collision.
- No versioning; conflict resolution is last-write-wins per item.
- Thumbnails are generated locally and stored small (under 20 KB; PNG or SVG data). They are always shown through `<img>` (never inlined), so a tampered SVG cannot run script.
- **Deliberate deviation from cloud-conventions:** the conventions say guests hold no class B data and cloud tools show a sign-in gate. This tool has no gate: F-012 and F-013 already let guests keep presets locally, so guests may keep up to 100 items in IndexedDB and merge them on first sign-in. P-005 must cover this merge. Guest data is local only and is lost if site data is cleared (the banner says so).
- No palette, color or preset name is passed to the command palette indexer (P-002) by this tool; the palette only offers "Open Library".
- Contrast hints from F-013 are not stored; they are recomputed on load.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Guest with local items logs in | `MergeLocalDialog`; dedupe; failures keep local copy and show retry |
| Two accounts on one browser | Local guest items merge only into the account that confirms; after sign-out the account cache is wiped; the guest namespace keeps only items the user declined to merge |
| Passphrase lost | Not applicable: class B has no vault |
| Huge item | Names capped at 60 code points, 20 colors, 12 gradient stops, thumbnail 20 KB; larger JSON imports are rejected per item with a reason |
| Same item edited on two devices | Last write wins per item by `updatedAt`; loser kept as "Name (other device)" only if both edited within 60 s |
| 100 palettes reached | Save blocked with options to delete or export; `UsageMeter` at 80 |
| Offline | Library readable and editable; saves queue; `SyncStatus` pending |
| Token expiry | Local edits continue; "Sign in again to sync" banner |
| Multi-tab | `BroadcastChannel` updates lists; no duplicate saves |
| Invalid HEX in import (`#12`, `red`) | Named CSS colors are converted; invalid values listed and skipped; rest imports |
| Out-of-gamut OKLCH value | Stored as authored; display clamps to sRGB with a gamut badge |
| Image with transparency or single color | Extraction ignores transparent pixels; may return fewer than requested colors |
| Huge image (50 MP) | Downscaled before analysis; over 10 MB rejected |
| Unicode or emoji names, RTL names | Stored UTF-8, 60-char limit by code points, `dir="auto"` |
| Softbox preset on a device that cannot reach the brightness | Loads values and shows a note that device brightness is controlled by the OS |
| Schema from newer app version | Unknown fields kept, item flagged "newer format" and loadable if core fields exist |
| Account deleted | Server data purged within 30 days; local cache cleared |

## 8. Limits, performance, privacy
- 100 items in total (cloud-conventions says "100 saved palettes"; here gradients and presets count in the same 100, a stricter reading to be confirmed by the owner); 20 colors per palette; names 60 chars; tags 10 per item.
- Library renders under 200 ms for 100 items. Network: auth and sync only; images for extraction are processed locally and never uploaded.
- Class B: server-readable by design; no sensitive data expected.

## 9. Accessibility and mobile
- Cards are buttons with names and color values in text (`#2446f0 primary`), never color alone; swatch strips have a table-style details view. Keyboard reorder with Alt+Arrow and a "Move" menu.
- Mobile: two-column grid, bottom sheet menus, full-screen softbox opens in one tap; respects `prefers-reduced-motion`.

## 10. Data

_Registry flags: `guestAccess: local` (guests keep a local library, merged on sign-in via `MergeLocalDialog`), `vault: false`. Data class B._
- **Class B**; no E2E encryption.
- **Entities:** `Palette` (`id`, `ownerId`, `name`, `colors[{hex, oklch, role, name}]`, `tags[]`, `collectionId`, `sortIndex`, `thumbnail`, `updatedAt`, `deviceId`, `version`, `deleted`), `Gradient` (same plus `type`, `angle`, `stops[]`), `SoftboxPreset` (`color`, `temperatureK`, `brightness`, `shape`, `size`, `edgeSoftness`, `notes`), `Collection` (`id`, `name`, `sortIndex`).
- **Sync:** local-first; last-write-wins per item; tombstones 30 days with restore from Trash.
- **Quotas:** 100 items; thumbnail under 20 KB.
- **Offline:** full. **Export:** JSON (all), CSS/Tailwind per selection; included in "Export my data". **Delete:** per item (Trash 30 days); account deletion purges within 30 days.
- **Signed-out gate:** none; guests use the library locally and see a sync invitation. **Sign-out:** account cache wiped; guest-local namespace remains empty. **Session expiry:** local use continues, sync pauses. **Account deletion:** local account cache cleared.

## 11. Acceptance criteria
- [ ] A palette saved from F-013 on a laptop appears on a phone within 30 s of being online.
- [ ] Guest saves persist across reloads and merge without duplicates after login.
- [ ] Export CSS produces valid variables that paste into a stylesheet unchanged.
- [ ] Image import of a 4000x3000 photo returns 5 colors in under 2 s.
- [ ] A softbox preset loads with identical color, temperature, brightness and shape.
- [ ] The 101st item is refused with a clear message.
- [ ] Concurrent edit on two devices resolves by last write per item with no data corruption.
- [ ] Invalid colors in an import are reported by line, valid ones import.
- [ ] Library navigable and reorderable by keyboard only.

## 12. Future ideas and open questions
- ASE/GPL/Figma tokens export, public share links, palette versions, auto-collections by image, team libraries, color-blind simulation preview.
- Open: do gradients and presets share the 100 limit? Allow OKLCH-only storage?
