# Feature specifications

_Created: 2026-11-19. Updated: 2026-11-19 (audited). One file per feature. These are the source of truth for what to build._

Every tool and platform feature has its own spec file written from the same template ([_TEMPLATE.md](_TEMPLATE.md)). Shared building blocks live in [_shared/](_shared/) so feature files stay short and consistent. The decisions the owner must make before coding are collected in [_shared/open-questions.md](_shared/open-questions.md).

The set is **33 tools (27 Local + 6 Synced) and 5 platform features**. Counts shown on the site are always derived from the tool registry, never typed by hand.

## How to read a feature file
Summary, use cases, step-by-step user flow, inputs and outputs, components and tech, behavior rules, edge cases, limits/privacy, accessibility/mobile, data (cloud only), acceptance criteria, future ideas/open questions. The front matter (id, slug, title, category, tier, priority, status, depends_on) must match this index exactly.

## Badge semantics (P-004)
Every card, bookmark chip, palette result and tool header shows one badge, derived from the registry and nothing else:
| Badge | Registry | Meaning |
|---|---|---|
| **Local** (lock) | `tier: client` | Runs 100% in the browser. No file or typed content is sent anywhere. Verified by a CI network audit. |
| **Local, optional sync** (lock + small cloud) | `tier: client`, `sync: 'optional'` | Works fully as a guest; when signed in it can also save presets or palettes to the account (F-012, F-013 via F-031). |
| **Synced** (cloud) | `tier: cloud` | Saves to the user's Google account after sign-in. Class A tools encrypt on the device first. |
| **Platform** (no badge) | `tier: platform` (P-001 to P-005) | Site-wide features, not tools: they have no registry entry, no card and no badge. The `platform` tier exists only in spec front matter. |

## How to add a new feature (5 steps)
1. Copy [_TEMPLATE.md](_TEMPLATE.md) into the right category folder, name it `<slug>.md`, fill the front matter and all 12 sections. Pick components from [_shared/components.md](_shared/components.md) before inventing new ones; list anything new in section 5 with a one-line purpose.
2. Add one row to the index below (next free ID: `F-034` for tools, `P-006` for platform) with the **exact** front-matter title.
3. For a tool (not a platform feature), add one **registry entry** (`id`, `slug`, `name`, `category`, `tier`, `icon`, `keywords`, `description`, `status`, plus optional `isNew`, `featuredRank`, `sync`, `guestAccess`, `vault`, `optInNetwork`; field rules in [_shared/conventions.md](_shared/conventions.md#tool-registry)). Home grid, stat pills, command palette, badges, bookmarks, sitemap and the network audit pick it up with no other edit. Use `status: 'soon'` while it is not ready.
4. Add the new components to the "Feature-introduced components" list in `_shared/components.md`, and any owner decisions from section 12 to `_shared/open-questions.md`.
5. Add a dated line to `docs/03-changelog.md` and, if it changes scope, update `docs/01-feature-spec.md` and `docs/02-decisions.md`.

The registry drives the home grid, command palette, category filters and badges, so a new tool never needs changes to those screens. See [_shared/conventions.md](_shared/conventions.md#tool-registry).

## Status values
Spec status (front matter `status`): `planned` (spec written) · `designed` (UI approved) · `building` · `shipped`. This is not the registry `status` (`live` / `soon` / `hidden`, which controls visibility on the site). Priority: P0 launch core, P1 soon after, P2 later. Tier: `client` (Local), `cloud` (Synced), `platform` (site-wide).

## Index

### Documents
| ID | Feature | Tier | Priority | Status | File |
|---|---|---|---|---|---|
| F-001 | DOCX Viewer & Editor | client | P0 | planned | [documents/docx-editor.md](documents/docx-editor.md) |
| F-002 | PDF ⇄ DOCX Converter | client | P1 | planned | [documents/pdf-docx-converter.md](documents/pdf-docx-converter.md) |
| F-003 | PDF Merge, Split & Reorder | client | P0 | planned | [documents/pdf-merge-split-reorder.md](documents/pdf-merge-split-reorder.md) |
| F-004 | PDF Compress & Protect | client | P1 | planned | [documents/pdf-compress-protect.md](documents/pdf-compress-protect.md) |
| F-005 | OCR (Image/PDF to Text) | client | P1 | planned | [documents/ocr.md](documents/ocr.md) |

### Image & media
| ID | Feature | Tier | Priority | Status | File |
|---|---|---|---|---|---|
| F-006 | Image Compressor | client | P0 | planned | [media/image-compressor.md](media/image-compressor.md) |
| F-007 | Bulk Image Resizer & Format Converter | client | P0 | planned | [media/bulk-resizer-converter.md](media/bulk-resizer-converter.md) |
| F-008 | Basic & Advanced Image Editor | client | P1 | planned | [media/image-editor.md](media/image-editor.md) |
| F-009 | AI Background Remover | client | P1 | planned | [media/background-remover.md](media/background-remover.md) |
| F-010 | EXIF Metadata Viewer & Stripper | client | P0 | planned | [media/exif-tool.md](media/exif-tool.md) |
| F-011 | Video/Audio Trimmer & GIF Maker | client | P2 | planned | [media/video-gif-maker.md](media/video-gif-maker.md) |

### Design
| ID | Feature | Tier | Priority | Status | File |
|---|---|---|---|---|---|
| F-012 | Color Wheel & Fullscreen Softbox Light | client + optional sync | P0 | planned | [design/color-wheel-softbox.md](design/color-wheel-softbox.md) |
| F-013 | Palette Generator & Contrast Checker | client + optional sync | P0 | planned | [design/palette-contrast.md](design/palette-contrast.md) |
| F-014 | CSS / Tailwind Visual Generators | client | P1 | planned | [design/css-tailwind-generators.md](design/css-tailwind-generators.md) |
| F-015 | SVG Optimizer & JSX Converter | client | P1 | planned | [design/svg-optimizer-jsx.md](design/svg-optimizer-jsx.md) |
| F-016 | Font Pairer & Type Scale Calculator | client | P2 | planned | [design/font-pairer-type-scale.md](design/font-pairer-type-scale.md) |
| F-017 | Placeholder & Mockup Generator | client | P2 | planned | [design/placeholder-mockup-generator.md](design/placeholder-mockup-generator.md) |

### Developer
| ID | Feature | Tier | Priority | Status | File |
|---|---|---|---|---|---|
| F-018 | JSON / YAML / XML Formatter & Diff Checker | client | P0 | planned | [developer/json-yaml-xml.md](developer/json-yaml-xml.md) |
| F-019 | JWT Decoder & Debugger | client | P0 | planned | [developer/jwt-decoder.md](developer/jwt-decoder.md) |
| F-020 | Regex Tester & Cheatsheet | client | P0 | planned | [developer/regex-tester.md](developer/regex-tester.md) |
| F-021 | Base64, URL & Hash Generator | client | P0 | planned | [developer/base64-url-hash.md](developer/base64-url-hash.md) |
| F-022 | Cron Expression Parser & Generator | client | P1 | planned | [developer/cron-parser.md](developer/cron-parser.md) |
| F-023 | SQL Formatter & API Webhook/cURL Inspector | client | P1 | planned | [developer/sql-curl-tools.md](developer/sql-curl-tools.md) |

### Everyday
| ID | Feature | Tier | Priority | Status | File |
|---|---|---|---|---|---|
| F-024 | QR Code & Barcode Generator/Scanner | client | P0 | planned | [everyday/qr-barcode.md](everyday/qr-barcode.md) |
| F-025 | Unit & Timezone Converter | client | P1 | planned | [everyday/unit-timezone-converter.md](everyday/unit-timezone-converter.md) |
| F-026 | Strong Password & Passphrase Generator | client | P0 | planned | [everyday/password-generator.md](everyday/password-generator.md) |
| F-027 | Word, Character & Reading Time Counter | client | P0 | planned | [everyday/word-counter.md](everyday/word-counter.md) |

### Cloud-synced (Google login)
| ID | Feature | Tier | Priority | Status | File |
|---|---|---|---|---|---|
| F-028 | 2FA Authenticator (TOTP Manager) | cloud | P1 | planned | [cloud/totp-authenticator.md](cloud/totp-authenticator.md) |
| F-029 | Encrypted Scratchpad & Secure Notes | cloud | P1 | planned | [cloud/secure-notes.md](cloud/secure-notes.md) |
| F-030 | Snippet & Prompt Manager | cloud | P1 | planned | [cloud/snippet-prompt-manager.md](cloud/snippet-prompt-manager.md) |
| F-031 | Saved Color Palettes & Softbox Presets | cloud | P1 | planned | [cloud/saved-palettes-presets.md](cloud/saved-palettes-presets.md) |
| F-032 | Clipboard History & Cross-Device Drop | cloud | P2 | planned | [cloud/clipboard-drop.md](cloud/clipboard-drop.md) |
| F-033 | Habit & Focus Pomodoro Tracker | cloud | P2 | planned | [cloud/pomodoro-habit-tracker.md](cloud/pomodoro-habit-tracker.md) |

### Platform
| ID | Feature | Tier | Priority | Status | File |
|---|---|---|---|---|---|
| P-001 | Home Page (card grid + filters) | platform | P0 | designed | [platform/home-page.md](platform/home-page.md) |
| P-002 | Global Command Palette (Cmd/Ctrl + K) | platform | P0 | planned | [platform/command-palette.md](platform/command-palette.md) |
| P-003 | Bookmarks Bar, Favorites & Recent History | platform | P0 | planned | [platform/bookmarks-favorites-recents.md](platform/bookmarks-favorites-recents.md) |
| P-004 | Clear Auth Badging (Local vs Synced) | platform | P0 | designed | [platform/auth-badging.md](platform/auth-badging.md) |
| P-005 | Google Login, Guest Merge & Sync | platform | P0 | planned | [platform/google-auth-and-sync.md](platform/google-auth-and-sync.md) |

### Shared docs
- [_shared/conventions.md](_shared/conventions.md): rules every tool follows (states, files, workers, privacy, accessibility, tool registry)
- [_shared/components.md](_shared/components.md): the reusable UI component catalog, including feature-introduced components
- [_shared/cloud-conventions.md](_shared/cloud-conventions.md): auth, encryption, sync, quotas and per-tool overrides for cloud tools
- [_shared/research-notes.md](_shared/research-notes.md): library findings, risks and things to verify before building
- [_shared/open-questions.md](_shared/open-questions.md): owner decisions needed before coding

Removed by user decision (2026-11-19): URL shortener, uptime/SSL monitor, currency rates.
