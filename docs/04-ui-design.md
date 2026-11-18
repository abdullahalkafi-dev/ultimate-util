# UI design

_Updated: 2026-11-19_

## Direction
Clean, light, minimal. Card grid home. Bookmarks bar on top, stored in localStorage (guests), synced to DB after Google login.

## Home page variants (mockup, pending user choice)
- **A, Classic:** top bar with search + bookmarks strip, category chips, uniform card grid.
- **B, Sidebar:** left category sidebar, bookmarks strip, larger cards with short descriptions.
- **C, Editorial:** big centered search hero, bookmarks row, grouped sections by category with compact cards.

## Shared elements
Command palette hint (Ctrl+K), cloud badge on OAuth tools, "runs locally" privacy note, bookmark star on each card.

## Chosen variant
**A (top bar + grid)**, chosen 2026-11-19.

## Revision 2 (2026-11-19): more contrast
User feedback: first palette looked normal and boring; wanted more contrast.
- File: `design/home-a.html` (variant A only).
- Ink (near-black) header and bookmarks strip, white search field.
- Solid saturated icon tiles, one color per category (docs blue, media magenta, design violet, developer green, everyday amber, cloud teal).
- Heavier headings (Space Grotesk), 1.5px borders, bold hover state.
- Featured accent-filled card for the DOCX tool.
- Stat pills: 27 local, 6 synced.
- 3 palette options to pick from: Ink + Electric Blue, Ink + Lime, Ink + Orange. Dark mode supported.
- **Palette chosen:** Ink + Electric Blue (2026-11-19). Design is approved; `design/home-a.html` is the visual source of truth.

## Revision 3 (2026-11-19): spec-driven additions
- The approved mockup (`design/home-a.html`) is unchanged and remains the visual source of truth.
- Specs add one badge not in the mockup: **Local, optional sync** for client tools that can save presets/palettes to the account (F-012, F-013). It is an extension of the approved badge set (P-004) and needs a small design pass when coding starts.
- Stat pills ("27 run locally", "6 sync with Google") and the featured card are derived from the tool registry, not hardcoded (P-001).
- The mockup's Google Fonts link is a prototype shortcut; production self-hosts fonts (open question).
