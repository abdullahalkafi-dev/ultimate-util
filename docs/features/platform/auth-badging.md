---
id: P-004
slug: auth-badging
title: Clear Auth Badging (Local vs Synced)
category: platform
tier: platform
priority: P0
status: designed
depends_on: [P-001, P-002, P-005, _shared/conventions.md, _shared/cloud-conventions.md]
---

# Clear Auth Badging (Local vs Synced)

## 1. Summary
A consistent two-state label on every tool: **Local** (lock icon: runs in your browser, nothing saved to an account) and **Synced** (cloud icon: saves to your Google account). It tells users before they click whether sign-in is needed and where their data goes. The badge is derived from the registry `tier` field and backed by a CI test that proves Local means local.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Visitor | Scanning the grid for something that won't upload a file | Sees "Local" with a lock on most cards (27 of 33 at launch, derived from the registry) |
| Guest | Taps "2FA Authenticator" | Page with a preview and a clear "Sign in with Google to use this" gate, not a dead end |
| Signed-in user | Uses Secure Notes | Header shows "Synced" plus `SyncStatus` (Synced / Syncing / Offline) and Locked/Unlocked vault state |
| Softbox user (non-obvious) | Wants saved presets but not an account | Tool badged "Local, optional sync"; works fully as guest, presets sync only when signed in |
| Security reviewer | Verifies the "Local" claim | CI test output shows zero outbound user-content requests per Local tool |

## 3. User flow
1. **Grid/palette/bookmarks:** each item shows its badge (text + icon). Hover or focus shows a tooltip; touch shows the text label permanently.
2. **Guest opens a Synced tool:** the tool page loads (static, indexable) with `ToolShell`. If the registry says `guestAccess: 'gate'` (default for `tier: cloud`; always for Class A tools), the workspace is replaced by the gate: a **preview** (screenshot/demo state with fake data, clearly labelled "Example"), a bullet list of what sync gives, and **Sign in with Google** (P-005). No client work is lost because none exists. If `guestAccess: 'local'` (F-031, F-033), the tool works locally for the guest with a quiet banner "Sign in to sync across devices", and only account-only features (e.g. F-033 habits) show an inline gate. The badge stays **Synced** in both cases: it describes where the tool saves data when it is used fully, derived from `tier` only.
3. **After sign-in:** gate disappears, tool opens. For Class A tools, `UnlockGate` / vault setup appears next (P-005).
4. **Signed-in user inside a cloud tool:** header shows `Synced` badge + `SyncStatus` pill; Class A tools add a vault pill "Unlocked" (open lock, with Lock now button) or "Locked" (closed lock, with Unlock button).
5. **Local tool as signed-in user:** badge stays "Local". It never changes to Synced because the user is signed in.
6. **Mixed tool (e.g. F-012 Softbox + F-031 presets):** badge "Local, optional sync". Guest sees a "Sync presets" link; signed-in sees the presets save to the account, with a "Saved to your account" line next to the save control.

```
Card:   [■ icon]                  ☆        Tool header: DOCX Viewer & Editor  [🔒 Local] ☆ ?
        Name / description                              Notes  [☁ Synced] [● Synced 2m ago] [🔓 Unlocked]
        Category          [🔒 Local]
```

## 4. Inputs and outputs
- **Inputs:** registry `tier` (`client` | `cloud`), optional `sync: 'optional'`, `guestAccess`, `vault`; auth state; sync state; vault state.
- **Outputs:** rendered badge (text, icon, `aria-label`, tooltip). Nothing stored. Mapping from registry:
  | Registry | Badge text | Icon | Style |
  |---|---|---|---|
  | `tier: client` | Local | lock | outlined, muted text |
  | `tier: client`, `sync: optional` | Local, optional sync | lock + small cloud | outlined |
  | `tier: cloud` | Synced | cloud | filled ink (white on ink; as in mockup) |

## 5. Components and tech
- **Existing:** `AuthBadge`, `Tooltip`, `SyncStatus`, `UnlockGate`, `EmptyState`, `Sheet`.
- **New (catalogued in `_shared/components.md`):** `SignInGate` (preview + explanation + button), `VaultStatus` (Locked/Unlocked pill), `CloudPreview` (labelled fake-data screenshot).
- **Tech:** pure rendering from the registry; no library. A Playwright (or similar, verify) network-audit test in CI, see 6. Runs on the main thread.

## 6. Behavior rules
- **Source of truth:** the registry `tier`. No component hardcodes badge state. Changing `tier` changes every surface.
- **Exact wording** (English; strings centralized for i18n):
  - Badge: "Local" / "Synced" / "Local, optional sync".
  - Tooltips: Local: "Runs 100% in your browser. Your files and text are not uploaded." Synced: "Saves to your Google account. Needs sign-in." Optional: "Works fully without an account. Sign in to also sync your saved presets."
  - Vault: "Locked. Unlock to view." / "Unlocked. Locks after 5 min idle."
  - Gate heading: "Sign in to use [Tool]". Body: "[Tool] saves your data to your Google account so it is on every device." Class A tools (`vault: true`) add: "Your data is encrypted on your device. We cannot read it."
- **Not color alone:** every badge has text and an icon; filled vs outlined style is an extra cue only. Meets 4.5:1 contrast in both themes (verify with real tokens).
- **Accuracy rule (hard):** a tool badged Local (`tier: client`, including `sync: 'optional'` when the user is signed out or not saving) MUST make zero network requests that contain user content (files, typed text, derived data such as coordinates, file names, IDs). Enforced in two layers: (1) a CI test: for each `tier: client` registry entry, run its e2e happy path with request interception; fail if any request goes to a non-allowlisted URL or has a body/query beyond the allowlist; (2) a runtime backstop: Local tool routes are served with a CSP `connect-src 'self'` (plus only the origins in the registry's `optInNetwork` for that tool), and the sync API lives on a different origin that Local routes do not allow. Mixed tools allow the sync API origin only while signed in and saving.
- **Allowed exceptions (allowlist, per tool, reviewed in PR):** (a) same-origin static assets (JS chunks, WASM, fonts, model files) fetched by GET with no user data in URL or headers, including first-time downloads of models or libraries from our own origin (e.g. ffmpeg core, ONNX model, tesseract language data), cached for offline use afterward; (b) service worker updates; (c) the anonymous analytics ping if enabled (page/tool ID only, no content); (d) a **user-confirmed opt-in feature** declared in the registry as `optInNetwork` (currently F-010 "Show on map" and F-016 "Use Google Fonts CDN in exported snippet", both pending owner decisions): it runs only after a confirmation dialog that says what is sent, the e2e test asserts that nothing is sent before the confirmation, and the tool's privacy footer states it. Anything else needs an owner decision and a visible note in the tool's privacy line.
- **Cloud tools** may call only the sync API with an authenticated session; a cloud tool must never be marked Local to look friendlier.
- **Mixed tools:** the Local part must still pass the test with the guest/no-sync path; the sync path is tested separately and its requests are listed in that tool's spec section 8.
- **Sync state mapping (`SyncStatus`):** Synced, Syncing (N pending), Offline (queued, N pending), Conflict (needs review), Error (retry). Shown only on `tier: cloud` and mixed tools when signed in.
- **Guest never sees sync states** and never sees "Synced" status wording on Local tools.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Guest opens a cloud tool via a direct link | Gate page with preview; after sign-in returns to the same URL (validated same-origin path, no data in URL; see P-005) |
| Guest opens a `guestAccess: 'local'` tool (F-031, F-033) | Tool works locally with a sync invitation banner; no blocking gate; badge stays Synced |
| Local tool with `optInNetwork` (F-010 map, F-016 CDN) | Badge stays Local; confirmation dialog states what is sent; before confirmation the network audit sees zero extra requests |
| Guest opens a cloud tool offline | Gate shows "Sign-in needs a connection." Preview still renders (static) |
| Signed-in user offline in a cloud tool | Badge stays Synced; `SyncStatus` = "Offline, 3 changes will sync"; reads from local cache |
| Session expires mid-use | Status "Signed out. Sign in again to keep syncing"; unsent changes kept in the local queue; editing continues locally; re-auth in place without losing the page |
| Account suspended/deleted | Status "Account unavailable"; local cache read-only; link to contact (P-005) |
| Vault locked and user clicks a Class A item | `UnlockGate`; no plaintext rendered, including in the palette (P-002) |
| Vault auto-locks while viewing | Content blurred/cleared, pill turns Locked, focus moved to Unlock button |
| Tool changes tier after release (client to cloud) | Existing local data is not uploaded automatically; one-time prompt explains and asks |
| Mixed tool, guest saves a preset | Stored locally (guests keep presets in localStorage/IndexedDB; F-012 and F-013 are `sync: optional`); "Sync presets" prompt appears once per session, not repeatedly |
| Tooltip cannot be seen (touch, screen reader) | Same info in the visible gate text and in `aria-label`; tooltip is never the only place |
| Badge text too long in narrow card | "Local, optional sync" collapses to "Local+" with full text in `aria-label` below 200 px card width (verify) |
| Localization (long German/RTL) | Badge grows or wraps to 2 lines; icon stays on the leading edge; layout mirrors in RTL |
| Registry entry missing `tier` | Build fails (schema validation); never default to Local |
| Local tool silently adds a request in a PR | CI fails with the URL and tool ID |
| Third-party dependency phones home | Caught by the same test; replace or vendor the dependency |
| Extension/adblock blocks sync API | `SyncStatus` Error with plain cause and Retry |

## 8. Limits, performance, privacy
- Badge render adds no requests; sync state is read from the local sync engine, not polled by the badge. Update latency under 500 ms after state changes.
- CI audit adds under 2 minutes per full run (parallel per tool); run on every PR touching `tools/` or dependencies, plus nightly.
- The audit logs only URLs and methods, never payloads, in CI artifacts.

## 9. Accessibility and mobile
- Each badge is text, not an image: `<span>` with visible text and `aria-hidden` icon; tooltip via `aria-describedby`, shown on hover and focus, dismissible with `Esc`. Cards read as "DOCX Viewer and Editor, Documents, Local".
- Vault and sync pills are `role="status"` with polite announcements on change ("Vault locked").
- Mobile: no hover, so the full text label is always visible; tap on the badge opens a small `Sheet` with the tooltip text and a link to the privacy page. Touch targets 44 px when interactive.

## 10. Data
- **No data stored** by this feature. Reads registry, auth and sync state. Dismissal of the "Sync presets" prompt: `uu-prompt-presets-dismissed` in localStorage (session or 30 days, verify).

## 11. Acceptance criteria
- [ ] The same badge (text, icon, tooltip) appears on cards, bookmarks chips (icon + text on hover/focus, text in menu), palette results, preview pane and tool header, all from one component.
- [ ] Changing a tool's `tier` in the registry updates every surface and the stat pills.
- [ ] A guest opening any Synced tool sees preview + sign-in button and an "Example" label, never an error page.
- [ ] A signed-in user sees SyncStatus on cloud tools and none on Local tools.
- [ ] Class A tools show Locked/Unlocked and no plaintext while locked.
- [ ] The CI network audit fails when a test Local tool sends a POST with content and passes with an allowlisted same-origin model download; an `optInNetwork` request is rejected before the confirmation step and allowed after it.
- [ ] Local tool routes return a CSP with `connect-src 'self'` (no sync API origin); a Local tool that tries `fetch` to another origin is blocked in a browser test.
- [ ] Badge info is available without hover (touch and screen reader checked).
- [ ] A mixed tool shows "Local, optional sync" and works fully as a guest.
- [ ] Session expiry mid-use keeps local edits and shows the re-sign-in message.

## 12. Future ideas and open questions
- Ideas: "Verified Local" link to a page listing each tool's allowed requests; browser-side "offline mode" demo; per-tool "what we store" popover.
- Open: the "Local, optional sync" badge (lock + small cloud) is an extension of the approved mockup, which shows only Local and Synced; the owner should confirm it. Exact label for mixed tools ("Local, optional sync" vs "Local + sync")? Should Local tools on a signed-in session show a subtle "Not saved to your account" line? Do we publish the CI audit results publicly?
