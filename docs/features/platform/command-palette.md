---
id: P-002
slug: command-palette
title: Global Command Palette (Cmd/Ctrl + K)
category: platform
tier: platform
priority: P0
status: planned
depends_on: [P-001, P-003, P-004, P-005, _shared/conventions.md]
---

# Global Command Palette (Cmd/Ctrl + K)

## 1. Summary
A keyboard-first overlay, available on every page, that finds tools, categories, bookmarks, recents, saved items (cloud, when allowed) and actions, and runs the chosen result. It turns a 40+ tool site into "press Ctrl K, type 3 letters, Enter".

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Power user inside a tool | Wants to switch from JSON to Regex | `Ctrl K`, "reg", Enter, without going home |
| Signed-in developer | Needs a saved snippet | Types the snippet title and opens it in the Snippet Manager (F-030) |
| Anyone | Wants dark mode now | Types "theme", Enter; no hunting for a menu |
| Mobile user | No keyboard shortcuts | Taps the search button in the top bar, gets a full-screen sheet |
| Privacy-minded user (non-obvious) | Has secure notes and 2FA codes | By default they never appear in results. If the user opts in, titles only, while the vault is unlocked, matched on device only |

## 3. User flow
1. **Open:** `Ctrl K` (Windows/Linux) or `⌘ K` (Mac) anywhere; `/` when focus is not in a text field; on tool pages click the search button in the top bar; on mobile tap the search icon. On the home page the top-bar field is an in-page grid filter (P-001) and does not open the overlay; `Ctrl K`, `⌘ K` and `/` still open it there, and the hint in the field advertises `Ctrl K`.
2. **Empty query:** shows "Recent" (last 5 tools, P-003), "Bookmarks", then "Actions". Footer shows key hints.
3. **Typing:** results update on every keystroke (no debounce below 3000 items). Groups: Tools, Categories, Saved items, Actions. The first result is pre-selected.
4. **Navigate:** Up/Down (also `Ctrl N` / `Ctrl P`) move; Home/End jump; Enter runs; `Tab` toggles a preview pane (tool description, category, Local/Synced badge, shortcuts); `Ctrl Enter` / `⌘ Enter` opens in a new tab; `Esc` clears the query first, then closes.
5. **Run:** tools navigate to `/tools/<slug>`; actions run in place (theme, sign in, go home); saved items open their tool with the item selected (deep link by ID, never by content).
6. **Close:** overlay closes, focus returns to the element that opened it.
7. **No results:** "No results for "xyz"" with suggestions: "Browse all tools" and "Clear". When signed out and the query might be a saved item, a hint line: "Sign in to search your saved items."

```
+-----------------------------------------------+
| 🔍 reg                                  Esc    |
|-----------------------------------------------|
| TOOLS                                          |
|  ▸ Regex Tester        Developer   [Local]  ↵  |
|    Cron Parser         Developer   [Local]     |
| ACTIONS                                        |
|    Toggle theme                                |
|-----------------------------------------------|
| ↑↓ move   ↵ open   Tab preview   Ctrl ↵ new tab |
+-----------------------------------------------+
```

## 4. Inputs and outputs
- **Inputs:** keystrokes, pointer, touch. Query max 200 characters (extra ignored).
- **Outputs:** navigation or an action. Nothing copied or downloaded. The query is never logged or sent anywhere.

## 5. Components and tech
- **Existing:** `Modal`, `Sheet` (mobile), `ShortcutHint`, `AuthBadge`, `EmptyState`.
- **New (catalogued in `_shared/components.md`):** `CommandPalette` (with `PaletteInput`, `ResultGroup`, `PreviewPane`) and a `searchIndex` module.
- **Search:** Fuse.js (Apache-2.0, about 6 KB gzip, verify) or MiniSearch (MIT, about 7 KB, verify). Pick by spike: 100 tools plus 2,000 saved items, p95 under 16 ms per keystroke. MiniSearch has prefix and per-field boosts built in; Fuse is simpler for typo tolerance.
- **Runs:** main thread; index build over saved items may run in a worker if over 8 ms.
- **Sources:** registry (name, keywords, description, category), P-003 bookmarks and recents, actions list, saved items provider API (each cloud tool registers a `searchProvider`).

## 6. Behavior rules
- **Index:** tools, categories and actions are built from the registry at load (synchronously, under 5 ms for 100 tools). Saved items are indexed lazily on first palette open after sign-in and kept in memory only; never written to localStorage.
- **Saved-item sources and privacy:**
  - Class B (snippets F-030, library items F-031): indexed only when signed in (or, for `guestAccess: 'local'` tools, from the local cache). Titles and tags only, **no body text and no body prefix** (snippet bodies may contain secrets, see F-030).
  - Class A (notes F-029, TOTP F-028, E2E clipboard items F-032): **not indexed by default.** Each tool has an opt-in setting "Show in command palette". When enabled, titles only (notes: title; TOTP: issuer name, never the account name; never secrets, note bodies or codes) are indexed locally in memory while the vault is unlocked, and are dropped within 1 s on lock, sign-out and tab close. They are never written to localStorage or IndexedDB, never sent anywhere, and TOTP codes are never shown in the palette. A `searchProvider` for a `vault: true` tool must return nothing while locked.
  - Guests: no account items exist; local-only items of `guestAccess: 'local'` tools follow the Class B rule.
- **Ranking score** = text match (exact > prefix > word-prefix > fuzzy) + boosts: exact-prefix on name (strong), keyword hit (medium), recency (last 10 opens, decays), frequency (log of open count over the last 30 days, stored locally as a count map keyed by registry tool `id`, capped at 200 entries, about 8 KB). Ties: bookmarked first, then registry order. Actions rank below tools unless the query matches an action name exactly or starts with `>`.
- **Prefixes:** `>` actions only, `#` categories, `@` saved items only. Optional, shown in the footer hint.
- **Shortcut handling:** `Ctrl/⌘ K` calls `preventDefault` only if the palette will actually open. If focus is inside a `CodeEditor`, `contenteditable` or a field that declares `data-uu-capture-k` (editors that use Ctrl K themselves, e.g. link insertion in the DOCX editor F-001), the palette does not open on Ctrl K; the editor wins and the palette stays reachable via the top-bar button. `/` never opens inside inputs, textareas, selects or contenteditable. Shortcuts are disabled while another modal is open.
- **Browsers:** Firefox/Chrome use `Ctrl K` / `Ctrl E` for search bar or address bar. Calling `preventDefault` on keydown works on page content in all supported browsers; if a browser or extension still steals it, the visible button and `/` are the fallback.
- **IME:** while `isComposing` or `keyCode 229`, Enter and arrows do not run or move; results update on `compositionend` and during composition using the in-progress text. Works with CJK, Bengali, Arabic, Hindi input.
- **Normalization:** query and index are Unicode NFKC-normalized, case-folded, diacritics folded (so "resume" finds "résumé"); non-Latin tokens segmented with `Intl.Segmenter`.
- **Focus:** focus trap inside; background gets `inert`; scroll locked; focus restored on close.
- **Max results:** 8 per group, 30 total, "Show more" with `Tab`-reachable link on the group header.
- **Frequency data** is local-only, resets with "Clear data on this device" (P-003), and syncs only as part of Class C preferences if the user is signed in (counts only, no queries).

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Empty query, no recents | Show Bookmarks (or default suggestions: top 5 featured tools) and Actions |
| Query only whitespace | Treated as empty |
| Query of 200+ chars | Truncated silently; no error |
| Typo ("jsno") | Fuzzy match still surfaces JSON tool, ranked below exact matches |
| Query matches tool and saved item with same name | Tool first, saved item under "Saved items" with its source tool named |
| Signed in but vault locked | Class A items absent; if the user opted in, one row "Unlock vault to search notes" opens `UnlockGate` (otherwise no row at all) |
| Session expires while palette open | Saved items group disappears; row "Sign in again to search saved items" |
| Saved items provider is slow or offline | Tools appear immediately; saved group shows "Loading..." then "Unavailable offline"; never blocks tools |
| Tool flagged `soon` or `hidden` | Not indexed |
| Tool renamed or removed in registry | Index rebuilt per deploy; stale recents ignored (P-003) |
| Ctrl K pressed in a code editor | Editor gets the key; palette does not open (see 6) |
| Palette already open, Ctrl K again | Selects the query text (does not stack a second palette) |
| Held-down arrow key | Smooth, no skipped items; wraps at ends |
| Screen reader user types fast | `aria-activedescendant` updates; count announced debounced 300 ms |
| Window resized with palette open | Switches between centered dialog and full-screen sheet without losing query |
| Pointer hover vs keyboard selection conflict | Hover only changes selection on real mouse movement, not on scroll |
| Very long names | Truncated with ellipsis; full name in the preview and `title` |
| Browser back while open | Closes the palette (pushState entry not required; `popstate` closes) |
| `/` typed on the Bookmarks add dialog or any text field | Types the character; no palette |
| Text selected on page then Ctrl K | Opens with the selection prefilled only if under 40 chars and inside a non-sensitive tool (verify; default off) |

## 8. Limits, performance, privacy
- Open in under 50 ms (component is part of the home bundle, under 10 KB gzip excluding the search lib); keystroke to render under 16 ms for 100 tools + 2,000 saved items; index memory under 2 MB.
- No network request on open or on typing. Saved-item index is fetched through the cloud tool's own sync cache (IndexedDB), not a new endpoint.
- Query text is never stored, logged, or put in analytics. Frequency map stores tool IDs only.

## 9. Accessibility and mobile
- ARIA 1.2 combobox: input `role="combobox"`, `aria-expanded`, `aria-controls` the listbox, `aria-activedescendant` the active option; results `role="listbox"` with `role="group"` and labelled headings; options `role="option"`, `aria-selected`. Dialog `aria-modal`, labelled "Command palette".
- Live region announces "12 results" and "No results". Key hints are in text, not only icons. Contrast AA; badges show text + icon.
- Reduced motion: no slide/scale animation. High contrast: selection uses outline, not color only.
- Mobile: trigger is a 44 px button in the top bar (`Ctrl K` hint hidden); opens a full-screen sheet with the input pinned at top, results above the on-screen keyboard (use `visualViewport`), close button top right, swipe down closes. Preview pane and `Ctrl Enter` are hidden.

## 10. Data
- **localStorage:** `uu-usage` (tool ID to open count + last opened, capped at 200 entries, versioned like P-003). Nothing else.
- **Account:** usage counts may sync as Class C. Saved-item search data stays in each tool's own store (see their specs); the palette holds a transient in-memory index only.

## 11. Acceptance criteria
- [ ] `Ctrl K` / `⌘ K` / `/` open the palette on home, tool pages and settings; `/` does nothing inside text fields.
- [ ] Typing "jwt", "regex" or a typo like "jsno" returns the right tool first.
- [ ] Empty query lists recents then bookmarks then actions.
- [ ] Arrow keys, Enter, Tab preview, Ctrl Enter (new tab) and Esc behave as in 3; focus returns to the opener.
- [ ] A new registry tool is searchable with no palette code change.
- [ ] With default settings, no Class A title (note, TOTP issuer) is findable even when the vault is unlocked; with the opt-in on and the vault unlocked, titles only are findable; after lock they disappear within 1 s.
- [ ] No palette index data (any class) exists in localStorage, sessionStorage or IndexedDB (inspected after a session).
- [ ] Signed-out users never see a saved-items group, only the sign-in hint.
- [ ] Ctrl K inside the DOCX editor link field does not open the palette.
- [ ] IME composition (Japanese, Bengali) never triggers a run on Enter that confirms composition.
- [ ] NVDA and VoiceOver announce group names, selected option and result count.
- [ ] No network request fires while the palette is used (guest or after cache is warm).
- [ ] Mobile full-screen sheet keeps the input visible with the keyboard open.

## 12. Future ideas and open questions
- Ideas: inline calculator/unit conversion, "recent files" (names only, opt-in, off by default for privacy), user-defined shortcuts, per-tool commands ("Export PDF" in DOCX), `g` then letter navigation chords.
- Open: Fuse.js or MiniSearch (spike). Search saved-item bodies or titles only? Should the palette pre-fill selected text (default off)? Offer the opt-in for Class A titles at all, or never (strictest option)? Recommended default: opt-in available, off by default.
