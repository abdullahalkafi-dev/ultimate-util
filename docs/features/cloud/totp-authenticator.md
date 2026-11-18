---
id: F-028
slug: totp-authenticator
title: 2FA Authenticator (TOTP Manager)
category: cloud
tier: cloud
priority: P1
status: planned
depends_on: [_shared/cloud-conventions, _shared/components, P-005]
---

# 2FA Authenticator (TOTP Manager)

## 1. Summary
Store two-factor secrets encrypted on the device (class A) and show rotating one-time codes on any signed-in device. Codes are computed locally with the Web Crypto API; the server only ever holds ciphertext. Honest trade-off: syncing 2FA secrets across devices is convenient but weaker than a single offline device (see section 8).

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Phone owner | Lost phone, needs codes on a laptop | Signs in, unlocks vault, codes appear on the laptop |
| Developer | 20 accounts across GitHub, AWS, registrars | Folders, search, issuer icons, one-tap copy |
| Switcher | Moving from Google Authenticator | Imports the export QR (otpauth-migration) in one scan |
| Careful user | Wants an offline backup | Exports an encrypted backup file and stores it elsewhere |
| Shared-screen user | Working in a call or café | "Hide codes" toggle; codes show only on tap |

## 3. User flow
1. Guest: sign-in gate (preview with fake sample codes, "Your secrets are encrypted on your device; we cannot read them"). Button **Sign in with Google**.
2. First sign-in: **Create vault passphrase** (`PasswordPrompt` with strength meter, minimum enforced), then **recovery key** screen (shown once, must tick "I saved it" and re-type the last 4 characters).
3. Empty state: `EmptyState` with **Scan QR**, **Upload QR image**, **Enter key manually**, **Paste otpauth:// link**, **Import backup**.
4. Add flow: pick method, see a parsed preview (issuer, account, algorithm, digits, period), edit name/folder, **Save**. Test code appears immediately.
5. Working state: list of cards. Each card: icon, issuer, account, code in groups ("123 456"), countdown ring, tap to copy. Next code shown dimmed in the last 5 seconds.
6. Search box, folder chips, drag or keyboard reorder, edit and delete in a card menu.
7. Lock: after 5 min idle (configurable) or **Lock now**, the list is replaced by `UnlockGate`. Done state for export: file downloads, toast with filename.

```
[Search]  [All|Work|Personal]  [+ Add] [Hide codes] [Lock]
 GitHub  alice@x.com        482 913   (ring 17s)  [copy]
 AWS     root               071 556   (ring  4s)
 Local-first · Synced 2 min ago · 12/200 entries
```

## 4. Inputs and outputs
- **Inputs:** camera QR; QR image (PNG/JPG/WebP, 10 MB); base32 secret typed or pasted; `otpauth://totp|hotp/...`; `otpauth-migration://offline?data=...` (may contain several accounts); encrypted backup file.
- **Outputs:** 6 or 8 digit codes; encrypted backup `ultimate-util-2fa-YYYY-MM-DD.uubackup` (JSON envelope, key derived from a backup passphrase chosen at export; the vault passphrase is suggested); optional plaintext otpauth list export after re-entering passphrase (strong warning).

## 5. Components and tech
- **Reused:** `ToolShell`, `AuthBadge`, `UnlockGate`, `PasswordPrompt`, `SyncStatus`, `UsageMeter`, `PermissionPrompt`, `DropZone`, `CopyButton`, `ConfirmDialog`, `Toast`, `ErrorBanner`, `EmptyState`, `HelpPopover`, `DownloadButton`, `LibraryLoader`.
- **New:** `TotpCard`, `CountdownRing`, `QrScanner`, `RecoveryKeyDialog`, `ClockDriftBanner`, `ImportPreviewList`.
- **Crypto:** HMAC via Web Crypto (SHA-1/256/512), RFC 6238/4226. Vault per cloud-conventions (Argon2id or PBKDF2 600k+, AES-256-GCM, data key wrapped).
- **QR decode:** `BarcodeDetector` where available, else `jsQR` (Apache-2.0, verify) or `zxing-wasm` (verify). Migration payload: protobuf decoded with a small hand-written decoder (verify field layout).
- **Runs:** main thread for ticking; QR decoding in a worker.

## 6. Behavior rules
- Codes are computed on device only; secrets are never sent to the server in plaintext and never logged, including error reports.
- Algorithms SHA1/SHA256/SHA512; digits 6/8; period 15 to 120 s with presets 15/30/60 (default SHA1/6/30). Dynamic truncation per RFC 4226; HMAC key is the decoded secret bytes. Counter = floor(serverAdjustedNow / period).
- Countdown uses `Date.now()` timestamps recomputed each frame, not accumulated timers, so background throttling cannot desync it; values are also recomputed on `visibilitychange`. Ring turns amber at 5 s.
- **Command palette (P-002):** no entry, issuer or account name is ever passed to the palette indexer. The palette may only offer a static "Open 2FA Authenticator" action.
- HOTP (optional): shows a "Generate next" button; the counter increments only on tap and syncs as part of the encrypted record. Never auto-increments.
- Manual secret: strip spaces and hyphens, uppercase, pad to a multiple of 8 with `=`, reject characters outside A-Z2-7 with a pointer to the bad character. RFC 4226 requires at least 128 bits and recommends 160, but many services issue 80-bit (16-character) secrets, so shorter secrets warn and are still allowed. Lowercase and missing padding in URIs are accepted.
- `otpauth://` URI: type (`totp`/`hotp`), label `Issuer:account`, params `secret` (required), `issuer` (wins over the label prefix), `algorithm`, `digits`, `period`, `counter` (HOTP, required). Defaults when absent: SHA1, 6, 30. Non-standard types (Steam Guard) are rejected with a message.
- **Google Authenticator migration:** `otpauth-migration://offline?data=<URL-encoded base64 protobuf>`. The payload lists accounts with raw secret bytes (not base32, so re-encode), name, issuer, algorithm, digits and type as enums, and may be split over several QR codes (batch index and size); the importer asks for the remaining codes. Verify field numbers and enum values against a real export before building.
- Clipboard: copy with user gesture; auto-clear after 30 s only if the clipboard still holds our code (clearing needs `readText` permission; otherwise best effort, verify) and tell the user.
- **Clock drift:** on load and every 10 min, compare device time to the `Date` header of a lightweight request to our own server. If drift exceeds 5 s, show `ClockDriftBanner` ("Your device clock is off by 47 s; codes may be rejected") and offer "Use server-adjusted time" (a local offset applied to codes). Only the header is read; no user data is sent.
- Duplicate detection: same issuer, account and secret hash blocks the add; same issuer and account with a different secret asks "Replace or keep both".
- Hide-codes toggle masks codes with dots until tapped (revealed 10 s). Hiding is also automatic when the tab loses visibility.
- Auto-lock: 5 min idle default, on tab close; keys in memory only.
- Deleting an entry asks for confirmation and states that the service must be re-enrolled if no other copy exists.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Lost vault passphrase, recovery key available | Unlock with recovery key, then force setting a new passphrase (re-wrap data key) |
| Lost passphrase and recovery key | Data is unrecoverable. Offer only "Reset vault" (deletes all ciphertext after typed confirmation) |
| Device clock wrong by minutes | `ClockDriftBanner`; server-adjusted option; codes use offset if enabled |
| Offline | Codes keep working from the local encrypted cache after unlock; adds and edits queue; `SyncStatus` shows pending |
| Same entry edited on two devices | Never overwrite a secret silently: show conflict dialog with both versions (secret masked, fingerprint shown) |
| Session or token expiry while unlocked | Codes keep displaying; sync pauses with "Sign in again to sync"; no data loss |
| Sign out | Local ciphertext cache, keys and the offline queue are wiped after warning about unsynced items |
| Multi-tab | `BroadcastChannel`: lock in one tab locks all; one tab leader performs sync |
| Camera denied, absent, or page not on HTTPS | `PermissionPrompt` recovery help; fall back to image upload and manual entry |
| QR image over 10 MB or not a QR | Rejected with a message before decoding |
| Passphrase guessing on the unlock screen | Client-side delay after 5 failures only slows the UI; real protection is KDF cost plus the enforced minimum strength (offline guessing is not prevented) |
| QR with several accounts (migration) | `ImportPreviewList` with checkboxes, duplicates flagged, partial import allowed |
| Malformed or truncated URI, wrong base32 | Field-level error, nothing saved |
| Unusual parameters (period 45, digits 7, unknown algorithm) | Reject digits outside 6/8 and unknown algorithms with a clear message; period 15 to 120 accepted |
| Quota exceeded (200 entries) | `UsageMeter` at 80%; at 200 adding is blocked with "Delete or export entries" |
| Unicode or emoji issuer and account names | Stored as UTF-8, NFC-normalized, sorted with `Intl.Collator`; RTL names rendered with `dir="auto"` |
| Huge import (1,000-entry backup) | Imports only up to the quota, reports how many were skipped |
| Corrupt or wrong-passphrase backup | AES-GCM auth failure shown as "Wrong passphrase or damaged file"; nothing imported |
| Account deleted | Server ciphertext purged within 30 days; local data wiped on next load |

## 8. Limits, performance, privacy
- Code render under 50 ms for 200 entries; list is virtualized above 100.
- Network: auth, sync of ciphertext, and the time-header check. No third-party calls; issuer icons are bundled (no remote favicon fetch).
- **Security caveats (shown in help and at setup):** a cloud-synced authenticator means an attacker needs your Google login, a copy of the ciphertext and your passphrase; this is stronger than plain cloud storage, but weaker than an offline hardware key. Do not store the 2FA for your Google account or this site's own login here. Keep each service's recovery codes somewhere else (printed or in a separate password manager).
- Screenshot caution: codes visible on screen can be captured; use Hide codes.
- Stored locally: encrypted cache in IndexedDB; plaintext never persisted.

## 9. Accessibility and mobile
- Each card is a button: "GitHub, alice, code 482 913, expires in 17 seconds. Press to copy". Code changes are not announced every second; an `aria-live=polite` message fires on copy only. Countdown has a text value, not color alone.
- Keyboard: arrows move between cards, Enter copies, Ctrl/Cmd+K focuses search, reorder with Alt+Arrow.
- Mobile: single-column cards, large tap target, bottom-sheet add menu, camera scan full screen, installable PWA.

## 10. Data
- **Class A (zero-knowledge).** Encryption per cloud-conventions: random data key, wrapped by passphrase key and by recovery key; envelope `{v, kdf, salt, iv, ct}`.
- **Entities:**
  - `VaultMeta`: `id`, `ownerId`, `wrappedKeyByPassphrase`, `wrappedKeyByRecovery`, `kdfParams`, `version`, `updatedAt`. Plaintext.
  - `TotpEntry` (all fields inside `ct` except the envelope and sync fields): `id`, `type` (totp/hotp), `issuer`, `account`, `secret`, `algorithm`, `digits`, `period`, `counter`, `folderId`, `sortIndex`, `iconKey`, `notes`. Sync fields in clear: `id`, `ownerId`, `updatedAt`, `deviceId`, `version`, `deleted`.
  - `Folder`: encrypted `name`, `sortIndex`.
- **Not uploaded:** the search index (built in memory after unlock from decrypted entries), issuer names, counts per folder.
- **Sync:** local-first IndexedDB with queue, backoff, `BroadcastChannel`. Conflict: per-record, never silent overwrite of `secret`; user chooses. Deletes soft for 30 days (trash, restorable after unlock).
- **Quotas:** 200 entries, 1 KB per entry (typical), `UsageMeter` at 80%.
- **Offline:** full read and code generation after unlock; writes queued.
- **Export:** encrypted backup (default); decrypted otpauth list after passphrase re-entry. Account-level "Export my data" provides the ciphertext plus instructions.
- **Delete:** entry (trash 30 days), vault reset, account deletion purges all within 30 days (backups may hold ciphertext up to 30 days).
- **Signed-out gate:** guest sees preview only, cannot add secrets (no guest storage for class A). **Sign-out:** wipes cache and keys. **Session expiry:** keeps local unlocked view, pauses sync. **Account deletion:** local cache cleared on next sync check.

## 11. Acceptance criteria
- [ ] Codes match the RFC 6238 Appendix B test vectors for SHA1, SHA256 and SHA512 (8-digit; each hash uses its own seed length: 20, 32, 64 bytes).
- [ ] Code and ring stay within 1 s of real time after a 10-minute background tab.
- [ ] Network inspection shows no request containing a secret or plaintext issuer.
- [ ] Manual entry accepts "jbsw y3dp ehpk 3pxp" and stores a valid padded secret.
- [ ] Google Authenticator migration QR with 3 accounts imports all 3 with correct parameters.
- [ ] A device clock set 60 s off triggers `ClockDriftBanner`.
- [ ] Wrong passphrase never reveals any entry; 5 failures apply an increasing delay.
- [ ] Recovery key unlocks the vault; setup cannot complete without confirming it was saved.
- [ ] Offline after unlock: codes display and a new entry syncs once online.
- [ ] Sign-out leaves no readable or ciphertext data in IndexedDB.
- [ ] Clipboard is cleared 30 s after copy when permitted, and the user is told when it is not.
- [ ] Encrypted backup restores on a fresh account.

## 12. Future ideas and open questions
- Push approval, WebAuthn passkey to unlock instead of passphrase, per-entry lock, brand icon pack, steam-style codes.
- Open: allow a "device-only" mode that never syncs a given entry? Block the owner's Google-account 2FA with a warning? Which QR library after license and size check?
