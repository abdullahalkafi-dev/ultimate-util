---
id: P-003
slug: bookmarks-favorites-recents
title: Bookmarks Bar, Favorites & Recent History
category: platform
tier: platform
priority: P0
status: planned
depends_on: [P-001, P-002, P-005, _shared/conventions.md, _shared/cloud-conventions.md]
---

# Bookmarks Bar, Favorites & Recent History

## 1. Summary
Star any tool to pin it in the ink bookmarks strip under the top bar; the last 10 opened tools are remembered as "Recents". Works for guests in localStorage, and merges into the Google account at login so it follows the user across devices. Data class C (preferences, see cloud-conventions.md).

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Daily user | Uses DOCX, Color, JSON, QR every day | Four chips, one click each, on every page |
| Guest on a library PC | No account | Bookmarks persist in that browser, nothing sent anywhere |
| Phone + laptop user | Signs in on both | Same bookmarks and order on both devices |
| Careful user (non-obvious) | Shared computer | On sign-out is asked "Clear data on this device?" so the next person does not see their tools |
| Returning user | Forgot the tool name | "Recent" list in the palette and home shows the last 10 |

## 3. User flow
1. **Star:** the star on a card (home) or in the `ToolShell` header toggles a bookmark. `aria-pressed` flips; `Toast` "Added to bookmarks" (Undo).
2. **Strip:** chips appear in the strip in order added; each is `[dot icon] Name [x]`. Click opens the tool; `x` removes with a `Toast` "Removed X. Undo" for 6 s.
3. **Empty state:** strip shows "Star a tool and it appears here for one-click access." and, for guests, the note "Saved in this browser".
4. **Reorder:** drag a chip, or focus a chip, press `Space` to grab it, move with Left/Right arrows, `Space` to drop, `Esc` to cancel (also a "Move left/Move right" item in its menu; Enter opens the tool). `Alt+Left/Right` is deliberately not used because browsers use it for Back/Forward. Order is saved immediately.
5. **Overflow:** chips scroll horizontally (scrollbar hidden, edge fade). When the strip cannot show all, a trailing "+N more" button opens a menu listing the hidden ones; selecting scrolls to or opens it.
6. **Recents:** opening a tool page records it (once per visit, de-duplicated, newest first, max 10). Shown in the palette empty state (P-002) and a "Recently used" row on home when there are more than 30 tools (P-001).
7. **Sign in:** merge runs once per device and account (P-005, section 6 here). A toast says "Bookmarks synced. 3 added from this device."
8. **Sign out:** dialog "Sign out. Clear bookmarks and recents from this device?" Options: **Keep on this device** (default on a private device), **Clear** (recommended on shared computers). Choice remembered in `uu-signout-pref`. This choice covers Class C preferences only: cloud-tool caches (Class A/B, IndexedDB) are always wiped on sign-out (cloud-conventions.md). Signing in with "This is a shared or public computer" ticked (P-005) preselects **Clear**.

## 4. Inputs and outputs
- **Inputs:** star/unstar, drag/keyboard reorder, remove, import file `.json` (max 100 KB).
- **Outputs:** ordered list of tool IDs; Export button in the strip menu downloads `ultimate-util-bookmarks.json`. Export JSON shape matches the storage schema below plus `exportedAt`.
- Import: validates schema and version, drops unknown IDs, shows a summary "Imported 5, skipped 2 unknown", merge or replace choice.

## 5. Components and tech
- **Existing:** `BookmarkStar`, `Toast`, `ConfirmDialog`, `Sheet`, `SyncStatus` (only for signed-in), `Tooltip`.
- **New (catalogued in `_shared/components.md`):** `BookmarksStrip`, `RecentsList`, `StorageProvider` (localStorage with in-memory fallback, `storage`/BroadcastChannel sync).
- **Tech:** plain `localStorage` + `BroadcastChannel`; drag via pointer events (no heavy DnD library; verify touch behavior). Runs on the main thread, under 5 KB gzip logic.

## 6. Behavior rules
- **Storage keys (versioned JSON):**
  - `uu-bookmarks`: `{"v":1,"items":["F-001","F-012"],"updatedAt":"2026-11-19T10:00:00Z"}`. Items are registry `id`s (not slugs), order = array order.
  - `uu-recents`: `{"v":1,"items":[{"id":"F-020","at":1763546400000}]}` newest first, max 10. Tool IDs and timestamps only, never file names, content, or query text.
  - `uu-sync-meta`: `{"v":1,"lastMergedAccount":"<hash>","deviceId":"<uuid>"}`.
  The mockup's bare array of short ids (`["docx","color"]`) is mockup-only; if a bare array is ever found it is migrated to v1 and unknown ids are dropped.
- **Migration:** on read, a `v` lower than current runs migration functions in order; unknown higher `v` is left untouched and the app uses in-memory defaults (never overwrite data from a newer version).
- **Limits:** max 24 bookmarks (a 25th shows "Bookmark limit reached (24). Remove one first."), 10 recents, one entry per tool ID. Verify 24 is right after design review.
- **Registry reconciliation:** on load, ids that do not exist in the registry at all (removed tools) are pruned silently from the in-memory view and dropped on the next save. A renamed `slug` or `name` keeps its `id`, so bookmarks survive renames. Tools flagged `soon` or `hidden` stay stored but are not shown and are not counted against the 24 limit while hidden (they return if the flag changes).
- **Defaults:** a brand-new browser gets DOCX, Color Wheel, JSON, QR (approved mockup). User deletes are respected; defaults are never re-added (`uu-bookmarks` exists = initialized).
- **Multi-tab:** changes broadcast on `BroadcastChannel('uu-prefs')`; fallback for browsers without it is the `storage` event, which fires only in the *other* tabs, never in the tab that wrote. Last write wins by `updatedAt`; a tab applies the incoming list without re-triggering a write. Recents merge by id/newest `at`.
- **Merge on login (P-005):** `bookmarks = account.items ++ [local.items not in account]` (account order first, then new local ones, preserving local order), capped at 24 (extras dropped with notice listing them). `recents` = union by id, keep newest `at`, sort desc, cut to 10. If both sides changed since last merge and an item was removed on one side, removal wins only when the removal timestamp is newer than the other's add (per-item tombstones kept 30 days in the account record). After merge the result is written to both stores.
- **Sync after login:** local-first; every change writes localStorage then queues an upsert of the whole small JSON (debounced 2 s). Offline: the queue persists in localStorage (`uu-sync-queue`) and retries with backoff; `SyncStatus` shows "Offline, will sync". Server rejects a write if `updatedAt` is older than stored; client then re-merges.
- **Sign-out:** per the dialog. **Clear** deletes `uu-bookmarks`, `uu-recents`, `uu-usage`, `uu-sync-meta`, `uu-sync-queue` and `uu-guest-snapshot` (the next person sees the first-visit defaults). **Keep** resets the local copy to the guest snapshot saved at sign-in (`uu-guest-snapshot`) so the signed-out browser shows only what the guest had, not the account's data; the account's bookmarks stay on the server and return at the next sign-in. If no snapshot exists (the user was always signed in on this device), Keep falls back to the last synced list. A device the user marked as shared never keeps the account's data.
- **Privacy:** recents are tool IDs only. A "Clear recents" button is in the strip menu and in settings. If `localStorage` throws on write (private window, blocked, quota), recents and bookmarks live in memory for the session and the "won't be saved" note is shown. (`navigator.storage.persisted()` is not used for this: it is false in most normal sessions too.)

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| localStorage blocked/full (private window, quota) | In-memory store; strip shows note "Bookmarks won't be saved in this window"; works for the session; no crash on `setItem` throw |
| Corrupt JSON in storage | Back up raw string to `uu-bookmarks-corrupt`, reset to defaults, no error toast spam (one info toast) |
| Newer schema version from a future deploy | Read-only treat as defaults, do not write |
| Same tool starred twice quickly | Idempotent; one entry |
| Starring from two tabs at once | Both survive: merge by union, order by `updatedAt` |
| Tool removed from registry | Pruned silently on next load; no error |
| Tool renamed | ID same, chip shows new name automatically |
| Tool `soon` / `hidden` bookmarked earlier | Hidden from the strip, kept in storage, returns if the flag changes; pruned only if the id is gone from the registry |
| 25th bookmark | Blocked with message (see 6) |
| Strip wider than screen | Horizontal scroll + "+N more" menu; keyboard Tab reaches the menu |
| Remove then Undo after navigation | Undo available only while the toast is visible; after that, re-star |
| Drag on touch | Long-press (300 ms) starts drag; otherwise scroll; keyboard alternative always exists |
| Login on a second device with different local bookmarks | Union merge, no loss; notice shows counts |
| Account has 24 and device adds 3 new | Cap hit; 3 extras listed in the merge toast with "Review" link; none lost silently (kept in `overflow` in the account for 30 days) |
| Offline sign-in change queued, then sign out | Ask to flush; if offline, warn that queued changes will be lost on Clear |
| Clock skew between devices | `updatedAt` from server is authoritative after sync; client uses it for comparison (verify) |
| Import with unknown tool IDs | Skipped and counted, no failure |
| User signs in with a different Google account than before on this device | Do not merge old account's cache; ask "Keep this device's bookmarks or use this account's?" (P-005) |
| Page opened via a shared link `/tools/x` | Records recent normally; the star state reflects stored bookmarks |

## 8. Limits, performance, privacy
- Storage under 3 KB total. Read once at load, written debounced 300 ms. Rendering the strip must not shift layout (reserved 56 px height).
- Network: none for guests. Signed in: one small JSON PUT per change (debounced) to the account; no tool content.
- Never stored: file names, file contents, search queries, referrers.

## 9. Accessibility and mobile
- Strip is a `nav` with a list; each chip is a link plus a remove button with `aria-label="Remove DOCX Viewer from bookmarks"`. Star buttons use `aria-pressed` and label "Bookmark X".
- Reorder: grab with `Space`, arrows, drop with `Space`, and a "Move left/right" menu; announced "DOCX moved to position 2 of 5" via `aria-live`. Undo toast is focusable and has a keyboard shortcut (`Ctrl Z` when focus is in the strip).
- Mobile: chips 34 px tall with 44 px effective hit area; strip swipes horizontally; "Saved in this browser" note hidden; "+N more" opens a bottom `Sheet`. No hover-only controls (remove `x` always visible).

## 10. Data
- **localStorage:** `uu-bookmarks`, `uu-recents`, `uu-sync-meta`, `uu-sync-queue`, `uu-guest-snapshot`, `uu-signout-pref`, `uu-usage` (P-002).
- **Account (class C, one JSON doc per user):** `{v, bookmarks:{items, tombstones}, recents, usage, theme, updatedAt, deviceId}`, about 3 KB, owner-only row rules, last-write-wins at document level with the merge above. Quota: 24 bookmarks, 10 recents, 1 doc per user. Included in "Export my data" and removed on account deletion (P-005).

## 11. Acceptance criteria
- [ ] Starring a tool adds a chip instantly and survives reload (guest).
- [ ] Removing a chip shows Undo; Undo restores the same position.
- [ ] Drag and keyboard reorder both persist and announce the new position.
- [ ] More than fits: strip scrolls and "+N more" lists the rest.
- [ ] Opening 12 distinct tools leaves exactly 10 recents, newest first, de-duplicated.
- [ ] No storage key ever contains a file name, file content or search text.
- [ ] With localStorage disabled the page works and shows the "won't be saved" note.
- [ ] Two tabs stay in sync within 1 second without double writes.
- [ ] Removing a tool from the registry drops its bookmark with no error.
- [ ] Login merge produces account order then new local items, tested with 5 fixtures (empty/empty, local-only, account-only, overlap, over cap).
- [ ] Sign-out "Clear" leaves none of the listed keys; "Keep" shows guest data only.
- [ ] Export then Import into a clean browser reproduces the list.

## 12. Future ideas and open questions
- Ideas: bookmark folders, shared bookmark sets by link, pinned per-tool presets, Recents with "resume draft" (only if the tool exposes it explicitly).
- Open: max 24 bookmarks OK? Default sign-out choice (Keep vs Clear) on first sign-out? Should the 4 default bookmarks exist at all? Show recents in the strip or only palette/home?
