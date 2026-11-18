---
id: P-001
slug: home-page
title: Home Page (card grid + filters)
category: platform
tier: platform
priority: P0
status: designed
depends_on: [P-002, P-003, P-004, P-005, _shared/conventions.md]
---

# Home Page (card grid + filters)

## 1. Summary
The front door of Ultimate Util: an ink top bar with search and sign-in, a bookmarks strip, a short intro with live counts, category filter chips and a grid of tool cards. It is generated entirely from the tool registry, so a new tool appears with no edit to this screen. Visual source of truth: `design/home-a.html` (layout A, "Ink + Electric Blue", approved 2026-11-19).

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| First-time visitor from search | Wants "compress PDF" | Types in the big search, card filters live, one click opens the tool |
| Returning user | Uses the same 4 tools daily | Bookmarks strip shows them as one-click chips, no scrolling |
| Privacy-conscious user | Wants proof files stay local | Sees "Local" badge on cards and the "run locally" stat before opening anything |
| Keyboard user | Never touches the mouse | `Ctrl K` or `/` opens the command palette (P-002), Tab reaches the filter field and every card, Enter opens |
| Owner (non-obvious) | Ships a half-built tool | Sets a registry flag; card shows "Coming soon" or is hidden, no code change on home |

## 3. User flow
1. **First paint:** the grid renders synchronously from the registry (no fetch, no spinner), so there is no layout shift. Skeletons are used only for user-specific parts (avatar, bookmarks from account) and never change the grid height.
2. **Top bar (ink):** logo (blue tile + "Ultimate Util") left; search field (white, 44 px high, max 600 px, hint `Ctrl K` / `⌘ K`) centered-left; **Sign in with Google** button right (P-005). Signed in: avatar menu replaces it.
3. **Bookmarks strip (ink):** label "Bookmarks" with star, horizontal chips (colored dot + name + ×), note "Saved in this browser" for guests (P-003).
4. **Intro:** H1 "Every tool you need. None of your files uploaded." plus one-line sub copy; stat pills on the right: `[N] run locally`, `[M] sync with Google`.
5. **Category chips:** "All tools" + one chip per category, each with its category-colored dot. One active at a time (`aria-pressed`). Selecting filters the grid in place and updates the URL hash.
6. **Grid:** cards `repeat(auto-fill, minmax(222px,1fr))`, gap 14 px. Each card: solid category-colored icon tile, star, name, 2-line description, category label, Local / Local, optional sync / Synced badge (P-004). The featured tool (highest `featuredRank`) is a double-width accent-filled card (see 6).
7. **Empty search:** dashed box "No tool matches "xyz". Try a shorter word like "pdf" or "color"." plus a "Clear search" button and the 3 nearest suggestions.
8. **Open a tool:** click or Enter on a card goes to `/tools/<slug>`; the tool code loads lazily there.

```
[▦ Ultimate Util]  [🔍 Search 33 tools          Ctrl K]            [ Sign in with Google ]
★ BOOKMARKS  (● DOCX ×) (● Color ×) (● JSON ×)           Saved in this browser
Every tool you need.                         (27 run locally) (6 sync with Google)
None of your files uploaded.
(All tools) (● Documents) (● Image & media) (● Design) (● Developer) ...
[#### DOCX Viewer & Editor — featured, 2 cols ####] [card] [card]
[card] [card] [card] [card] ...
```

## 4. Inputs and outputs
- **Inputs:** typed search text, category chip, star clicks, card activation, URL hash `#cat=developer&q=json`.
- **Outputs:** navigation to `/tools/<slug>`; filtered grid; bookmark changes written via P-003. No files, no downloads.
- The home search field is an **in-page grid filter** (as in the approved mockup): typing filters the cards, it never opens an overlay. It uses the same search index and ranking as the palette (P-002). The `Ctrl K` hint inside it advertises the palette, which opens on `Ctrl K` / `⌘ K` and `/` on every page including home. On non-home pages the top-bar search button opens the palette.

## 5. Components and tech
- **Existing:** `AuthBadge`, `BookmarkStar`, `ShortcutHint`, `Grid`, `Toast`, `EmptyState`, `Tooltip`, `Sheet`.
- **New (catalogued in `_shared/components.md`):** `ToolCard` (standard + featured variant), `CategoryChips`, `StatPill`, `TopBar`, `BookmarksStrip` (owned by P-003).
- **Tech:** static or SSR-rendered HTML from the registry (framework choice open). Fonts: Space Grotesk (headings), Inter (body), self-hosted preferred over the Google Fonts link used in the mockup (verify: privacy and CSP; see 8). Icons: inline SVG sprite, one symbol per registry `icon`.
- **Runs:** main thread only. Home loads no tool code.

## 6. Behavior rules
- **Registry-driven:** cards, chips, stats and search index all derive from the registry. Counts follow the derived-value rules in `_shared/conventions.md#tool-registry`: `run locally` = `live` tools with `tier: client` (including `sync: 'optional'`); `sync with Google` = `live` tools with `tier: cloud`; `soon` and `hidden` tools are never counted. Never hardcoded (the mockup shows 27 and 6 for the current 33 tools). Placeholder text "Search N tools" uses the `live` count.
- **Category colors** come from tokens in `_shared/components.md` (documents blue, media magenta, design violet, developer green, everyday amber, cloud teal). Chip order = fixed category order. Empty categories (all tools hidden) are not shown.
- **Featured card:** the `live` tool with the highest registry `featuredRank` (ties: registry order); zero or one tool, never more. `isNew` only controls the pill ("New" if set, else "Featured"). Shown only on "All tools" or its own category, with no search text. Accent fill (`#2446f0`, dark mode `#8fa6ff`), pill, "Open tool" arrow. At launch F-001 has the highest `featuredRank`, as in the mockup. Below 640 px it is a normal single-column card. If nothing is featured, no wide card.
- **Filter + search combine** (AND). Search matches name, description, keywords, category name (same fuzzy rules as P-002). Typing is debounced 100 ms; the grid never re-mounts, it toggles hidden.
- **URL state:** category and query live in the hash (`#cat=`, `#q=`), updated with `replaceState` for typing and `pushState` for chip changes so Back works. Unknown `cat` falls back to All. No user data in the URL.
- **Order within grid:** registry order (curated by category, then name). With a filter of All and 40+ tools, see "Scaling".
- **Scaling to 100+ tools:** "All tools" with more than 60 visible tools switches to grouped sections (one heading per category, collapsed to the first 12 cards with a "Show N more" button); a filtered category shows all its cards. No pagination, no infinite scroll (keeps Ctrl F and keyboard Tab simple). A "Recently used" row (from P-003, max 6) sits above the grid for returning users when there are more than 30 tools. Grid uses CSS `content-visibility: auto` on sections to keep paint cheap.
- **Feature flags:** registry `status` (semantics in `_shared/conventions.md#tool-registry`): `live` (shown), `soon` (card dimmed, "Coming soon" tag, not clickable, star disabled, excluded from stat counts, palette and sitemap), `hidden` (not rendered, route returns 404). Flags are build-time constants, not per-user.
- **Dark mode:** follows `prefers-color-scheme`; a manual theme toggle (in avatar/menu and the palette) writes `data-theme` to localStorage. Ink bar becomes `#131927` in dark.
- **First-visit hint:** a single dismissible line under the search ("Tip: press / or Ctrl K to jump to any tool") shown once, flag `uu-onboard` in localStorage. The default bookmarks for a new browser are F-001 DOCX, F-012 Color Wheel, F-018 JSON, F-024 QR (as in the mockup; stored by registry `id`, see P-003); the user can remove them (verify with owner, see 12).
- **Analytics:** none by default. If added: anonymous page-view and tool-open counts only, no search text, no file names, no IDs tied to accounts, honors Do Not Track, no cookies.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Search with no match | Empty state (step 7); chips unchanged; announce "No tools match" via `aria-live` |
| Search text plus a category with zero matches but other categories match | Message "No match in Developer. 3 matches in other categories." with a "Search all" link |
| Registry has 0 tools in a category | Chip hidden |
| Registry has 1 tool | Grid shows it, featured card suppressed |
| Very long tool name / description | Name wraps up to 2 lines; description clamps at 2 lines (3 on featured); full text in tool page |
| Hash has bad value (`#cat=<script>`) | Ignored, treated as All; values are matched against known IDs only, never injected as HTML |
| JS disabled or fails | Server-rendered grid still lists links to every tool page; search and filter need JS; a `<noscript>` note says so |
| localStorage blocked | Page works; bookmarks in memory with notice (P-003); theme follows system |
| Signed-in user while account bookmarks load | Local bookmarks render first; strip updates in place, no jump (reserved height 56 px) |
| Cloud tool clicked by a guest | Opens the tool page with preview and sign-in gate (P-004), not a blocked click on home |
| Tool flagged `soon` | Dimmed card, `aria-disabled`, tooltip "Coming soon", star disabled |
| Viewport 320 px | One-column cards; sign-in button collapses to icon; stat pills wrap |
| Very wide screen (2560 px) | Content max width 1240 px, centered |
| Browser zoom 200% / large text | No clipped text; cards grow in height |
| RTL or non-Latin tool names | Cards use `dir="auto"`; layout mirrors in RTL locales |
| Hover-only effects on touch | Lift/border on `:hover` only under `(hover:hover)`; nothing essential depends on hover |
| Reduced motion | No card lift, no transitions |

## 8. Limits, performance, privacy
- **Budget:** home HTML + critical CSS under 30 KB gzip; home JS under 60 KB gzip (grid hydrate, search, bookmarks); LCP under 2 s on mid-range phone over 4G; CLS 0; INP under 200 ms. Tool code, Fuse/MiniSearch if over budget, and all WASM load only on tool open or first palette open.
- **SEO:** each tool has its own indexable page `/tools/<slug>` with unique title, meta description and structured data (`SoftwareApplication`, free, browser-based). Home lists all tools as real `<a href>` links (card is an anchor, not a JS click handler). Category filter hashes are not indexed; optional static `/category/<id>` pages (verify). `sitemap.xml` is generated from the registry.
- **Network on home:** HTML, CSS, JS, fonts (self-hosted; the mockup links Google Fonts, verify against the "no third-party" CSP rule in conventions). No request contains user data.
- **Stored locally:** `uu-bookmarks`, `uu-recents` (P-003), `uu-theme`, `uu-onboard`. Nothing else.

## 9. Accessibility and mobile
- Landmarks: `header`, `nav` (bookmarks, chips), `main`, `footer`. One H1. Skip link "Skip to tools".
- Chips are a toggle-button group (`aria-pressed`); the grid is a list of links. Card = one `<a>` with the star as a separate button outside the link's text flow (avoids nested interactive elements; the mockup's `article` + `tabindex` is replaced). Tab order: search, sign-in, bookmarks, chips, cards. Enter on a card opens it (it is a link, so Space scrolls the page). Focus ring 3 px: `--hl` (`#8fa6ff`) on ink surfaces and in dark mode, accent `#2446f0` on light surfaces (`#8fa6ff` on white is under the 3:1 non-text contrast minimum).
- Result count announced politely after filtering ("12 tools shown"). Badge conveys text + icon, not color alone.
- Mobile (under 640 px): cards minmax 160 px, gap 10 px, `Ctrl K` hint and "Sign in" label hidden (icon button, 44 px), search keeps full width, bookmarks strip scrolls horizontally, safe-area insets respected (as in mockup).

## 10. Data
- **localStorage (all users):** `uu-bookmarks`, `uu-recents`, `uu-theme`, `uu-onboard` (schemas in P-003).
- **Account (signed in):** bookmarks, recents, theme as Class C preferences via P-005. Home itself owns no data and has no server calls except the preference sync.

## 11. Acceptance criteria
- [ ] Adding one registry entry makes a card, a chip count, a stat increment, a palette result and a sitemap URL appear with no other edit.
- [ ] Stat pills equal the registry counts (test with 2 fixture registries).
- [ ] First paint shows the full grid with zero layout shift (CLS 0 in Lighthouse).
- [ ] Home JS under 60 KB gzip; no tool library appears in the home network panel.
- [ ] `#cat=developer` loads filtered; Back returns to the previous filter; invalid values fall back to All.
- [ ] Empty search shows the empty state and announces it to screen readers.
- [ ] Tab reaches every card and star in order; Enter opens; focus is always visible.
- [ ] `soon` tools are dimmed, unclickable, and excluded from counts and search.
- [ ] Works with JS disabled as a list of crawlable links.
- [ ] Light, dark and 320 px layouts pass axe with no serious issues.
- [ ] No analytics request includes search text or tool file names.

## 12. Future ideas and open questions
- Ideas: "Recently used" and "Most used" rows, drag to reorder cards for signed-in users, per-category landing pages, list view toggle, localized UI.
- Open: keep the 4 default bookmarks for new visitors or start empty? Featured tool selection: manual flag or newest? Self-host fonts or accept Google Fonts? Grouped sections threshold (60) correct? Static category pages for SEO worth it?
