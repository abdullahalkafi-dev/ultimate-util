---
id: P-005
slug: google-auth-and-sync
title: Google Login, Guest Merge & Sync
category: platform
tier: platform
priority: P0
status: planned
depends_on: [P-001, P-003, P-004, _shared/conventions.md, _shared/cloud-conventions.md, _shared/research-notes.md]
---

# Google Login, Guest Merge & Sync

## 1. Summary
Optional sign-in with Google (identity only) that unlocks the cloud tools, syncs bookmarks, recents and settings across devices, and merges what a guest already did on this device. Includes the avatar menu, account export and deletion, vault setup trigger for Class A tools, and the sync engine rules. The backend provider is an open decision (see 6).

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Guest who liked the site | Signs in after bookmarking 6 tools | Dialog shows what will be merged; bookmarks follow them to their phone |
| New cloud-tool user | Opens 2FA Authenticator | Sign-in, then vault setup (passphrase + recovery key) only now |
| Multi-device user | Laptop and phone | Same bookmarks, palettes and presets; offline changes sync later |
| Shared-computer user (non-obvious) | Library PC | Signs in with "Sign out clears local cache" so nothing stays |
| Privacy-focused user | Wants out | "Export my data" then "Delete account", confirmed by email, purged within 30 days |

## 3. User flow
1. **Guest state:** top bar shows **Sign in with Google**. All Local tools work with no prompts.
2. **Start:** click Sign in (or the gate in a Synced tool, P-004). A pre-dialog (first time only) states: "We only ask Google for your name, email and photo. No Drive, Gmail or contacts." with links to Privacy Policy and Terms and a **Continue with Google** button.
3. **Google consent** opens by full-page redirect (default) and returns to the same page. The return target is a same-origin path chosen from an allowlist pattern (`/` or `/tools/<slug>`), carried server-side or inside a signed, single-use `state`; arbitrary URLs are rejected (no open redirect) and no user data is in it. Cancel/deny returns with a message (see 7). The pre-dialog (step 2) has an unchecked box **"This is a shared or public computer"**: when ticked, the session cookie is a browser-session cookie (no refresh persistence, about 12 h absolute), and sign-out defaults to **Clear** (P-003).
4. **First login, merge dialog** (`MergeLocalDialog`, only if the device has local data): "Add what is on this device to your account?" lists counts per source: "5 bookmarks, 10 recents, theme" plus any local items of tools with `guestAccess: 'local'` or `sync: 'optional'` ("3 saved palettes, 2 softbox presets, 12 focus sessions"). Buttons: **Merge (recommended)**, **Use account only** (if the account has data), **Skip**. Result toast "Synced. 3 bookmarks added from this device." Preferences merge by P-003; tool items merge by each tool's own rules (F-031, F-033).
5. **Signed-in state:** avatar button replaces Sign in; menu: name + email, **Sync status**, **Settings**, **Sign out**, **Sign out everywhere**, **Export my data**, **Delete account**, links to Privacy and Terms.
6. **Vault setup (Class A only):** the first time the user opens F-028/F-029 (not at login), a wizard (`VaultSetupWizard`): choose passphrase (`StrengthMeter`, minimum enforced), generate recovery key (`RecoveryKeyDialog`: shown once, tick "I saved it", retype its last 4 characters), confirm. Plain warning: "If you lose both, your data cannot be recovered."
7. **Sign out:** asks "Clear data on this device?" (P-003: applies to bookmarks, recents and usage). Cloud-tool caches (IndexedDB items, queue, keys) are always wiped after a warning about unsynced items. **Sign out everywhere** revokes all sessions and shows a confirmation.
8. **Delete account:** type-to-confirm, then email link; after confirming, access ends immediately and data is purged within 30 days; email confirms purge date.

## 4. Inputs and outputs
- **Inputs:** Google ID token via OAuth/OIDC (`openid email profile` only); passphrase (vault); delete-confirmation text.
- **Outputs:** session; user record `{id, email, name, avatarUrl}`; synced documents; **Export** = one `.zip` with `account.json`, `preferences.json`, cloud-tool JSON, and Class A as ciphertext plus `README.txt` (or decrypted client-side after unlock, user choice).

## 5. Components and tech
- **Existing:** `SyncStatus`, `UnlockGate`, `PasswordPrompt`, `ConfirmDialog`, `Modal`, `ErrorBanner`, `Toast`, `UsageMeter`, `AuthBadge`.
- **New (catalogued in `_shared/components.md`):** `SignInButton`, `AvatarMenu`, `VaultSetupWizard`, `AccountSettings`, `SyncEngine` (non-UI module). The merge dialog is the shared `MergeLocalDialog` (owned by F-031); the wizard reuses `StrengthMeter` and `RecoveryKeyDialog`.
- **Auth flow:** OAuth 2.0 authorization code with **PKCE** (S256, single-use verifier and `state`), full-page redirect (default); the code exchange happens on our backend/edge, never in page JavaScript. A popup or One Tap is optional and not planned: `COOP: same-origin` (needed by multi-thread ffmpeg.wasm on the video route, see research-notes) severs `window.opener`, which breaks popup messaging. Therefore isolation headers apply only to the video route, the login callback is a redirect on a route without isolation, and the Sign in button on the video route navigates away and returns afterward. Under `COEP: require-corp` the Google avatar image can fail to load, so that route shows initials or an avatar proxied through our origin. Verify in the spike.
- **Backend options (open decision, listed neutrally):**
  | Option | Notes |
  |---|---|
  | Supabase | Postgres with row-level security, built-in Google auth, realtime; managed or self-host; regions available (verify EU) |
  | Firebase (Auth + Firestore) | Mature Google auth, offline SDK, realtime; NoSQL, security rules; Google-hosted lock-in |
  | Custom (own API + Postgres + auth lib) | Full control, any region; most work and security burden |
  Criteria: row-level/owner-only access rules, realtime or cheap polling, cost at 10k and 100k users, EU/other region availability and data residency, export/lock-in, ability to do "delete within 30 days" and backups-aware purge, rate-limit support, quality of Google OIDC and refresh handling.
- **Tokens (verify):** session in a `__Host-` prefixed `HttpOnly; Secure; SameSite=Lax; Path=/` cookie issued by our own backend/edge (not readable by JS; Lax still sends it on the top-level redirect back from Google), short-lived access (about 15 min) plus rotating refresh; no tokens in localStorage. Because JS cannot see an HttpOnly cookie, a separate non-sensitive flag cookie `uu-has-session=1` (no token, `Secure; SameSite=Lax`) tells the page whether to render the avatar skeleton without a request. If the provider forces client tokens, keep them in memory and refresh via cookie. CSRF: SameSite cookie plus a per-session CSRF token header on state-changing requests, and `Origin` checks.
- **Runs:** auth in main thread; `SyncEngine` and crypto (Argon2id) in a Web Worker.

## 6. Behavior rules
- **Scopes:** `openid email profile` only. No Drive/Gmail/contacts. Requesting more needs an owner decision and a new consent screen.
- **Session:** idle sessions last up to 30 days with refresh rotation; absolute max 90 days (verify). Sign-out clears cookie, in-memory keys and (by choice) the local cache. Vault keys are in memory only and auto-lock (default 5 min idle, on tab close).
- **Sync (per cloud-conventions.md):** local-first (IndexedDB cache); writes apply locally then queue; record fields `id, ownerId, updatedAt, deviceId, version, deleted`; last-write-wins per record, conflict copies for notes and snippets, never silently overwrite TOTP; queue persists across reloads; backoff retry; `BroadcastChannel` between tabs so only one tab sends; soft delete 30 days.
- **Class C merge:** exactly the algorithm in P-003 (account order first, then new local, union of recents, cap, tombstones). Merge runs once per (device, account) and is recorded in `uu-sync-meta`. The theme merges by newest `updatedAt`. Per-tool settings stay on the device in v1 (not synced; see open questions).
- **Different account than last time on this device:** never merge the previous account's cache into the new one. Prompt: "This device has data from another account. Keep it as guest data, or clear it?"
- **What is synced:** bookmarks, recents, usage counts and theme (Class C), plus each cloud tool's own data per its spec (including F-031 saved palettes and presets). **Not synced:** any Local tool's files, drafts or per-tool settings.
- **Rate limits (defaults, verify):** 60 sync writes/min and 600/hour per user, 10 sign-in attempts/10 min per IP, 5 exports/day, 3 delete requests/day. Client shows "Too many requests. Try again in N seconds."
- **Security headers:** strict CSP (`default-src 'self'`; `connect-src 'self'` plus the sync API origin on cloud routes only, never on Local tool routes; `img-src 'self' data: blob:` plus the Google avatar host unless avatars are proxied; `frame-ancestors 'none'`; `form-action 'self'`), HSTS, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, no third-party scripts on tool pages. The redirect flow is a top-level navigation, so `accounts.google.com` is not needed in `connect-src` (add it only if One Tap or a popup is ever adopted). Login `redirect_uri` is an exact allowlist; `state` and PKCE verifier are single-use.
- **Consent/legal:** Privacy Policy and Terms must exist before launch; linked in the sign-in dialog, avatar menu and footer. Cookie banner only if non-essential cookies exist (session cookie is essential).
- **Delete:** immediately disables the account and removes it from all devices on next sync; purge within 30 days including soft-deleted rows; backups may retain up to 30 more days (state this in the dialog).

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Popup blocked (if popup mode used) | Fall back to redirect automatically with a short message |
| User cancels/denies consent | Return to the same page, message "Sign-in was cancelled. You can keep using Local tools." No retry loop |
| Google account suspended or no email | "Your Google account could not be verified. Try another account" |
| Account suspended on our side | Signed out with message and contact link; local data untouched |
| Different Google account than before | Prompt per section 6 |
| Offline at sign-in | "Sign-in needs a connection." Guest mode continues |
| Offline after sign-in | Cached session works for reads/writes; queue grows; `SyncStatus` shows pending |
| Google/provider outage | Banner "Sign-in is unavailable right now"; Local tools unaffected; cloud tools use cache read-only if previously loaded |
| Session expires mid-edit | Local edits preserved; "Sign in again" inline; sync resumes after, no data loss |
| Sign in on 2 devices at once, same bookmarks edited | Merge algorithm, no loss, last write wins on order |
| "Sign out everywhere" while another device offline | That device's refresh token fails on reconnect, shows signed-out, keeps queue for 7 days and asks to re-sign-in to upload (verify policy) |
| Shared computer | The browser cannot reliably tell a public computer, so the pre-dialog has an explicit "This is a shared or public computer" box (default unchecked). Ticked: browser-session cookie only, sign-out defaults to Clear, caches wiped at sign-out |
| Lost passphrase and recovery key | Cannot recover; offer "Reset vault" which deletes Class A data after strong confirmation |
| Merge dialog dismissed by Esc | Treated as Skip; local data kept; offered again from Settings > "Merge this device" |
| Storage blocked (private window) | Sign-in works with cookie; local cache in memory; notice that it will not persist |
| Third-party cookies blocked | Not required; first-party session cookie only |
| COOP/COEP page (video tool) | Sign-in button there navigates to a non-isolated route, returns to the tool afterward |
| Email change on Google side | `id` (Google `sub`) is the key, not email |
| User deletes account then signs in again | Treated as new account after purge request; during 30-day window shown "Deletion pending. Cancel deletion?" |
| Export of large account (100 MB clipboard files) | Built as a background job, emailed link valid 24 hours (verify) |
| Bot/credential abuse | Rate limits, Google handles credentials; no passwords stored by us |

## 8. Limits, performance, privacy
- Sign-in round trip under 5 s typical; auth bundle under 20 KB gzip, loaded on first click of Sign in (not on home load; only a tiny "session present" cookie check at load, no request).
- Network: Google (accounts.google.com) only after the user clicks Sign in; our sync API with session cookie. Guests: none.
- Stored: `__Host-` session cookie, `uu-has-session` flag cookie, `uu-sync-meta`, IndexedDB cache for cloud tools (always wiped on sign-out; preferences per the Keep/Clear choice). We hold email, name, avatar URL; nothing else from Google.
- Quotas and `UsageMeter` per cloud-conventions.md (warn at 80%).

## 9. Accessibility and mobile
- Avatar menu follows the menu-button pattern (arrow keys, Esc, focus return); avatar has `alt` text with name. All dialogs trap focus and have labelled titles; errors use `role="alert"`; merge counts are plain text, not only icons.
- Vault wizard is keyboard complete; recovery key is selectable text with Copy and Download buttons, and not only an image or QR.
- Mobile: redirect flow (no popups); avatar menu opens as a bottom `Sheet`; sign-in button collapses to a 44 px icon; Google's own page handles its UI. In-app browsers (Instagram, etc.) that Google blocks: detect and show "Open in your browser to sign in" (verify user agents).

## 10. Data
- **Account:** `users {id(sub), email, name, avatarUrl, createdAt, deletedAt?}`, `devices {id, userId, lastSeen}`, `preferences` (class C doc, see P-003), plus per-tool tables from cloud specs. Class A stored as ciphertext envelopes only.
- **Local:** session cookie (HttpOnly), `uu-sync-meta`, IndexedDB sync cache/queue, localStorage preference keys (P-003).
- **Rules:** owner-only access (row-level rules), soft delete 30 days then purge, per-user quotas, audit log of sign-ins and deletions kept 90 days without content (verify).

## 11. Acceptance criteria
- [ ] Only `openid email profile` are requested (checked in the consent screen and code).
- [ ] Guest with 5 bookmarks signs in: merge dialog lists counts, result has account order then local extras, nothing lost.
- [ ] Redirect login works on desktop Chrome/Edge/Firefox/Safari and iOS Safari; the callback route is not cross-origin isolated.
- [ ] Denying consent, closing the tab and a blocked popup each return a clear message and a working guest session.
- [ ] Session token is not readable from JavaScript (`document.cookie` shows no auth token).
- [ ] State-changing calls without a valid CSRF token are rejected.
- [ ] Sign out wipes all cloud-tool IndexedDB caches and keys always; with "Clear" it also removes all `uu-*` preference keys; with "Keep" only the guest snapshot remains.
- [ ] The post-login return target is validated: a `state` pointing to an external URL is rejected and lands on `/`.
- [ ] On the video route (COOP/COEP) Sign in navigates to a non-isolated route and returns; no avatar request fails (initials or proxied avatar shown).
- [ ] "Sign out everywhere" invalidates a second device's session within one refresh interval.
- [ ] Export contains all of a test user's records; Class A is ciphertext only unless unlocked.
- [ ] Delete account sends an email, disables access on confirm, and the purge job removes all rows within 30 days.
- [ ] Vault setup appears only when a Class A tool is first opened, not at login.
- [ ] Offline edits made while signed in sync after reconnect without duplicates.
- [ ] Privacy and Terms links are present in the sign-in dialog, menu and footer.

## 12. Future ideas and open questions
- Ideas: email magic-link sign-in, passkeys, other providers (GitHub, Apple), team sharing, session/device list in settings, one-tap sign-in.
- Open: backend provider (Supabase, Firebase, custom) and hosting region; popup vs redirect final choice after the COOP spike (default: redirect only); sync per-tool settings or keep them per device; cookie vs memory token model; free-tier limits for cloud tools; whether sign-out defaults to Keep or Clear; exact session lifetimes.
