# Cloud tool conventions (Google login)

_Created: 2026-11-19._ Applies to F-028 to F-033 and P-005. The database/backend provider is **not chosen yet**; this file is provider-neutral.

## Who sees what
- Guests: all client tools work. Cloud tools with registry `guestAccess: 'gate'` (default) show a sign-in gate with a clear explanation, plus a labelled "Example" preview (P-004). Cloud tools with `guestAccess: 'local'` (F-031, F-033) work locally for guests, store nothing on a server, and invite sign-in; features that need an account are gated inline. Class A tools are always gated: there is no guest storage for secrets.
- Signed in (Google OAuth): cloud tools unlock. Session shown in the header with avatar menu (Sign out, Export my data, Delete account).

## Data classes
| Class | Examples | Storage |
|---|---|---|
| **A: Zero-knowledge (encrypted on device)** | TOTP secrets, secure notes, scratchpad | Only ciphertext reaches the server. Server cannot read it, even for support. |
| **B: Private, server-readable** | Snippets, prompts, saved palettes, pomodoro logs, clipboard items | Stored normally, access limited to the owner by row-level rules. May be encrypted at rest by the provider. |
| **C: Preferences** | Bookmarks, recents, theme | Small JSON per user; local-first, synced after login. |

Tools declare their class in their spec. Class A tools must never log plaintext, including in error reports.

## Encryption design (Class A)
- A **vault passphrase** separate from Google login. Google proves *who you are*; the passphrase protects *what you stored*. Without this, anyone with Google account access could read the secrets.
- Key derivation on device: Argon2id (WASM) preferred, PBKDF2-SHA256 with at least 600,000 iterations as fallback (verify current guidance when building).
- Encryption: AES-256-GCM via Web Crypto, unique random 96-bit IV per record, versioned ciphertext envelope `{v, kdf, salt, iv, ct}`.
- A random **data key** encrypts records; the passphrase-derived key wraps the data key. Changing the passphrase re-wraps only the data key.
- **Recovery:** generate a recovery key (shown once; random 128-bit value shown as grouped Base32 text, not a word list) that can also unwrap the data key. The user must tick "I saved it" and retype its last 4 characters (`RecoveryKeyDialog`, used by P-005, F-028, F-029). The key can be rotated; the old one is then invalid. If passphrase and recovery key are both lost, data is unrecoverable. The UI says this plainly at setup.
- Auto-lock after inactivity (default 5 minutes, configurable) and on tab close. Keys held in memory only.
- Brute-force: server-side rate limiting on fetching ciphertext does not stop offline guessing, so enforce a minimum passphrase strength at setup.

## Sync rules
- **Local-first:** reads come from a local cache (IndexedDB); writes apply locally, then queue to the server.
- Each record: `id (UUID)`, `ownerId`, `updatedAt`, `deviceId`, `version`, `deleted` (tombstone), plus class-specific fields.
- Conflict: last-write-wins by `updatedAt` per record; if two devices edited the same record within a short window, keep both (duplicate with "conflict copy" label) for notes and snippets so no text is lost. TOTP entries: never overwrite a secret silently.
- Offline: queue persists across reloads; `SyncStatus` shows pending count; retry with backoff.
- Multi-tab: use `BroadcastChannel` so tabs agree and do not double-submit.
- Deletes are soft for 30 days (trash), then purged. "Delete account" purges everything within 30 days and confirms by email.

## Quotas and abuse limits (defaults, adjustable)
Per user: 1,000 snippets, 500 notes (50 KB each), 200 TOTP entries, 100 saved library items, 100 clipboard items (files up to 10 MB each, total 100 MB, auto-delete after 7 days unless pinned), pomodoro history unlimited (small). API rate limits per user and per IP. Show `UsageMeter` when above 80%.

### Per-tool overrides and details (the cloud specs are the detailed source; this table reconciles them with the defaults above)
| Tool | Differs from or adds to the defaults |
|---|---|
| F-028 TOTP | Class A. 200 entries, about 1 KB each. Entries never silently overwritten on conflict (user chooses). Search index is never uploaded. Codes never appear in the command palette. |
| F-029 Notes | Class A. 500 notes, 50 KB plaintext (UTF-8 bytes) each. Keeps the last 10 versions per note inside the note's encrypted record (so a note can hold about 500 KB of history; whether this counts toward a quota is open). Locks also when the device sleeps. Secret clipboard copies auto-clear after 30 s where permitted. |
| F-030 Snippets | Class B (optional Class A per item is future). 1,000 items but **100 KB** each (soft warning at 50 KB), 10 versions per item, `UsageMeter` warning at 800 items. Local secret detection warns and suggests F-029. |
| F-031 Library | Class B. The **100 limit covers palettes, gradients and softbox presets together** (open question: separate limits). Thumbnails under 20 KB. `guestAccess: 'local'`: guests keep items in IndexedDB and merge them on first sign-in (`MergeLocalDialog`, dedupe by content, newest `updatedAt` wins on id collision). |
| F-032 Clipboard | Class B by default, Class A per item (E2E, `vault: true`). Text up to 50 KB, files 10 MB each, 100 MB and 100 items total, 7-day default expiry (adjustable 1 to 30 days, verify cap), pinned items exempt. Items are append-only (edits limited to pin, rename, delete). Extra rate limits: 30 sends/min, 500/day, 10 uploads/min. Files are malware-scanned only when Class B. |
| F-033 Pomodoro | Class B. History unlimited (about 200 B per session), 100 habits. `guestAccess: 'local'`: the timer works for guests with local history kept up to 90 days; habits and cross-device features need sign-in; local sessions merge by id on first login. |
| P-003 / P-005 preferences | Class C. One small JSON document (about 3 KB): 24 bookmarks, 10 recents, usage counts, theme. Not part of the cloud tool quotas. |

Tool-specific rate limits (above) apply in addition to the global sync limits in P-005 (60 sync writes/min and 600/hour per user, verify).

## Privacy and compliance basics
- Collect only email, name, avatar from Google (scopes: openid, email, profile). No Drive, Gmail or contacts scopes.
- "Export my data" (JSON; Class A exported as ciphertext plus instructions, or decrypted client-side after unlock) and "Delete my account" are mandatory features.
- Privacy policy and terms pages before launch. Cookie banner only if non-essential cookies are used.
- Sessions: short-lived access token plus refresh; sign out everywhere option.
- Backups: provider backups cover ciphertext; mention that deleted data may remain in backups up to 30 days.

## Sign-out and local caches
- Class A and B caches (IndexedDB items, queued writes, keys) are **always wiped** on sign-out after warning about unsynced items. Only Class C preferences (bookmarks, recents, theme) follow the user's "Keep on this device / Clear" choice (P-003, P-005).
- "Sign out everywhere" revokes all sessions; an offline device keeps its queue for up to 7 days (verify) and must re-sign-in to upload.

## Command palette and Class A
Class A titles/issuer names are never indexed by default. A tool may offer an opt-in setting "Show in search"; even then the entries are held only in memory while the vault is unlocked and local, titles only (never secrets, note bodies or codes), and dropped on lock, sign-out and tab close (P-002). Class B items are indexed by title and tags only.

## Guest to account merge
See P-005 and P-003: bookmarks, recents and theme stored locally are merged into the account on first login (union, newest wins on conflict). No class A data exists for guests. Tools with `guestAccess: 'local'` or `sync: 'optional'` (F-031, F-033, F-012/F-013 presets) may hold local Class B-type data for guests; it is listed with counts in the same merge dialog (`MergeLocalDialog`) and merged by each tool's own rules.

## Open decisions (owner)
Backend provider (e.g. Supabase, Firebase, own server), hosting region, whether to offer email-only sign-in later, whether any cloud tool gets a free-tier limit.
