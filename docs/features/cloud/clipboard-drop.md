---
id: F-032
slug: clipboard-drop
title: Clipboard History & Cross-Device Drop
category: cloud
tier: cloud
priority: P2
status: planned
depends_on: [_shared/cloud-conventions, _shared/components, P-005]
---

# Clipboard History & Cross-Device Drop

## 1. Summary
A personal inbox for moving text, links and small files between your own devices (phone to PC and back), with a short history. It is not a background clipboard sync: browsers cannot read the clipboard in the background, so every item is added on purpose (paste box, Send button, drag and drop, share target on installed mobile PWA later).

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Student | Link on phone needed on a lab PC | Sends the link, opens the tool on the PC, clicks it |
| Developer | Moves a 3 MB log or screenshot to a laptop | Drops the file, downloads on the other device |
| Traveller | Sends a booking code to a hotel PC | Opens tool through QR pairing, copies the text, deletes it |
| Privacy-minded user | Sending an API token | Marks the drop "End-to-end encrypted"; only unlocked devices read it |
| Anyone | Re-uses something sent yesterday | History with pinned items |

## 3. User flow
1. Guest: sign-in gate with a short explanation and a diagram of "device A sends, device B receives". No guest drops.
2. First sign-in: this device gets a name ("Pixel 8", editable). Empty state: **Paste or type**, **Add file**, **Show pairing QR**, plus honest note "Copy something, then press Send. We cannot watch your clipboard."
3. **Send:** text box (also receives paste), file picker/drag-drop (`DropZone`), **Send** button; option **Encrypt end-to-end** toggle. Optional **Paste from clipboard** button uses the Clipboard API after a click.
4. **Receive:** other signed-in devices with the tool open get the item in real time; a badge counts new items. Item card: preview, source device, time, **Copy**, **Open/Download**, **Pin**, **Delete**.
5. **QR pairing:** a signed-in device shows a QR containing a short-lived link to the tool (no credentials); the other device opens it and still signs in with Google. It is a convenience, not a login bypass. The token grants no access; it only opens the tool, is single-use and expires in 5 minutes.
6. Done: item copied; "Delete everywhere" removes it from all devices and the server.

```
This device: "Work laptop"   [Devices 3] [Pair device QR]
[ Type or paste here ........................ ] [Add file] [Encrypt E2E] [Send]
Pinned   | Today
 Link  github.com/...     Pixel 8   2 min   [Copy][Pin][Delete]
 File  log.txt 3.1 MB     Pixel 8   1 h     [Download]  expires in 6d
 Synced · 12/100 items · 38 MB / 100 MB
```

## 4. Inputs and outputs
- **Inputs:** text up to 50 KB per item, links, files up to 10 MB each (100 MB total). Allowed file types: images, PDF, text, ZIP, office docs; executables (.exe, .msi, .apk, .bat, .scr, .js) are blocked (verify list).
- **Outputs:** copied text, downloaded file (original name, sanitized), image preview, export of history as JSON (text items) or ZIP (with files).

## 5. Components and tech
- **Reused:** `ToolShell`, `AuthBadge`, `SyncStatus`, `UsageMeter`, `UnlockGate` (E2E items), `PasswordPrompt`, `DropZone`, `FileList`, `ProgressBar`, `CopyButton`, `DownloadButton`, `PermissionPrompt`, `ConfirmDialog`, `Toast`, `ErrorBanner`, `EmptyState`, `Tabs`.
- **New:** `DropItemCard`, `DeviceList`, `PairingQr`, `LiveConnectionBadge`, `LinkWarning`, `SendComposer`.
- **Transport (provider-neutral):** realtime via WebSocket or SSE or provider push; fallback polling every 15 s (30 s when tab hidden). Use whichever the backend provides (open decision). **QR render:** `qrcode` library (MIT, verify).
- **E2E option:** AES-256-GCM with the vault data key (same vault as F-028/F-029), a fresh random 96-bit IV per item, one WebCrypto call per item (10 MB is small enough; no chunking, so no IV or ordering pitfalls), run in a worker. If no vault exists yet, the toggle starts vault setup. The file name and body are inside the ciphertext.
- **Mobile later:** Web Share Target (installed PWA, Android Chrome; limited on iOS, verify).

## 6. Behavior rules
- **Capture is manual only.** No background reading (browsers allow `readText` only on a focused page after a user gesture, and may prompt). The UI states this. Clipboard reads happen only on a click (`PermissionPrompt` explains first, with a paste-box fallback).
- **Command palette (P-002):** clipboard items are never indexed or passed to the palette. Palette offers only "Open Clipboard Drop".
- **Auto-lock:** E2E items follow the vault auto-lock (5 min idle by default); locked devices show "Locked" cards, class B items stay visible.
- Class B default: item stored readable by the server (needed for preview and abuse scanning). Class A option: content and file name encrypted, only type and size remain visible; no preview on server, no scanning; recipients need the vault unlocked.
- **Auto-expiry:** default 7 days from send (cloud-conventions); an optional setting of 1 to 30 days is an extension for the owner to confirm; pinned items are exempt from expiry but still count toward the 100 items and 100 MB. Files are deleted from storage at expiry; a tombstone remains 30 days for sync.
- **Links:** shown as text with a domain badge. The server never fetches user links for unfurling by default; no title or image preview unless the user enables "Fetch link previews from this device" (client fetches may fail due to CORS; verify) . Links get `rel="noopener noreferrer"`, open only on click, and show `LinkWarning` for punycode/lookalike domains, URL shorteners, and any link on the platform's blocklist (verify provider such as Google Safe Browsing, privacy trade-off to decide).
- **Files:** size and type checked on the client and the server, magic-byte validated, never executed or auto-opened. Class B files are scanned for malware by the provider or a service (open decision); class A files cannot be scanned and show "Not scanned" on the recipient.
- Rate limits: 30 sends per minute and 500 per day per user; 10 uploads per minute; per-IP limits too.
- Offline queue: items sent offline are stored locally with "Queued" and delivered in order on reconnect; files over the remaining quota fail with a clear message.
- Devices: each browser registers `deviceId` and a name; list shows last seen and **Remove** (revokes that device's session and wipes its local cache on next contact).
- Sign-out wipes the local cache of items and files from this browser.
- Delete everywhere is immediate for the server and best effort for offline devices (they remove it on next sync).

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| File over 10 MB | Blocked before upload with size shown and tips (compress with F-006 or F-004) |
| Text over 50 KB | Offered as a `.txt` file instead (counts as a file against the 10 MB and 100 MB limits) |
| Lost vault passphrase (class B items) | Not applicable to class B items; only E2E items are affected |
| Total quota (100 MB or 100 items) exceeded | Send blocked; `UsageMeter`; "Delete old items" shortcut; pinned items listed first |
| Offline send | Queued locally; sent in order when back online; user can cancel queued items |
| Realtime connection dropped | `LiveConnectionBadge` "Reconnecting", polling fallback; no duplicates (item ids deduplicated) |
| Token expired | Reads from cache continue; sends queue; banner "Sign in again" |
| Same text sent twice | Allowed; consecutive identical text within 10 s from the same device is collapsed |
| Lost passphrase and E2E items | Those items cannot be read; user can delete them; not recoverable |
| E2E item received on a locked device | Card shows "Locked: unlock to view"; `UnlockGate` |
| Multi-tab on same device | One tab holds the realtime connection (leader) and broadcasts via `BroadcastChannel`; no double notifications |
| Clipboard permission denied | Paste box used; instructions to re-enable in browser settings |
| Malware or phishing link | `LinkWarning` with "Open anyway" requiring a second click; blocked links never open directly |
| Executable or double-extension file (`invoice.pdf.exe`) | Rejected with reason |
| Image with GPS EXIF | Option "Remove location data before sending" (default on), using the F-010 stripping logic on the device |
| Unicode, emoji, RTL text; very long single line | Stored UTF-8, size counted in bytes, rendered with `dir="auto"`, wrapped, truncated in list with "Show more" |
| Abuse report or file flagged | Item removed, user notified; repeated abuse can suspend the feature |
| Device removed while offline | Next online contact signs it out and wipes its cache |
| Account deleted | All items and files purged within 30 days; devices cleared |
| iOS Safari limits | No share target; Clipboard API stricter; manual paste works |

## 8. Limits, performance, privacy
- 100 items, 10 MB per file, 100 MB total, 7-day default expiry; text up to 50 KB.
- Delivery target: under 3 s with realtime, under 30 s with polling.
- Network: auth, item sync, file upload/download (signed URLs). No third-party calls by default; optional blocklist lookup and client-side link preview are opt-in and disclosed.
- Privacy: class B items are readable by the service under access rules; for sensitive content use the E2E toggle or F-029. Local cache of items cleared on sign-out; downloaded files remain on the device.

## 9. Accessibility and mobile
- New items announced politely ("New item from Pixel 8: link"). Keyboard: Ctrl/Cmd+Enter sends, Enter on a card copies, Delete removes (confirm). Icons have text labels.
- Mobile first: large Send button, paste button, file picker with camera/photos, QR scanned by the system camera app.

## 10. Data

_Registry flags: `guestAccess: gate`, `vault: true` only for items sent with the end-to-end option (class A), `vault: false` otherwise (class B)._
- **Class B default; class A per item.** Cross-device delivery needs the server to hold items temporarily.
- **Entities:** `DropItem` (`id`, `ownerId`, `kind` text/link/file, `body` (B) or `ciphertext` (A), `fileName`, `mime`, `sizeBytes`, `storageKey`, `encrypted` bool, `pinned`, `sourceDeviceId`, `createdAt`, `expiresAt`, `deleted`, `updatedAt`, `version`), `Device` (`id`, `ownerId`, `name`, `platform`, `lastSeenAt`, `revoked`), `PairingToken` (short-lived, single-use, 5 min).
- **Sync/conflict:** items are append-only; edits are limited to pin, rename and delete; last-write-wins on those fields.
- **Quotas:** 100 items, 10 MB per file, 100 MB total, 7-day expiry unless pinned; `UsageMeter` at 80%.
- **Offline:** local cache readable; sends queue.
- **Export:** JSON/ZIP of history; includes E2E items decrypted after unlock.
- **Delete:** per item "delete everywhere"; auto-expiry purges; account deletion purges within 30 days.
- **Signed-out gate:** explanation only. **Sign-out:** local cache and queued items wiped after warning. **Session expiry:** read-only cache, sends queue. **Account deletion:** remote devices clear on next contact.

## 11. Acceptance criteria
- [ ] A text sent from device A appears on device B within 3 s with realtime and within 30 s with polling.
- [ ] No code path reads the clipboard without a user click.
- [ ] A 10.1 MB file is rejected and a 9.9 MB file uploads with progress and cancel.
- [ ] Items expire after the chosen time; pinned items stay.
- [ ] E2E items show no content or file name in server storage.
- [ ] The server makes no outbound request to a user-sent link by default.
- [ ] Offline sends deliver in order after reconnect without duplicates.
- [ ] "Delete everywhere" removes the item on all online devices within 5 s.
- [ ] Sign-out leaves no items or files in local storage.
- [ ] Rate limit returns a readable message with retry time.

## 12. Future ideas and open questions
- Web Share Target and Android share sheet, desktop notifications, auto clean rules, text snippets promote to F-030, shared drop with another person (out of scope).
- Open: provider for realtime and storage; virus-scan service; use of a link blocklist (privacy); max expiry; should E2E be the default for files?
