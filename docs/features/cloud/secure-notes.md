---
id: F-029
slug: secure-notes
title: Encrypted Scratchpad & Secure Notes
category: cloud
tier: cloud
priority: P1
status: planned
depends_on: [_shared/cloud-conventions, _shared/components, P-005]
---

# Encrypted Scratchpad & Secure Notes

## 1. Summary
A markdown notepad whose content is encrypted on the device (class A) before it syncs. A quick scratchpad for temporary text and titled notes for API keys, recovery codes and private snippets of life. The server stores only ciphertext.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Developer | Needs to move an API key from laptop to phone | Pastes in scratchpad, opens on phone after unlock |
| Anyone | Saves bank backup codes | Titled note with masked secret blocks |
| Freelancer | Keeps client logins and notes | Tagged, searchable notes that still stay private |
| Traveller | Passport numbers and booking codes | Works offline after the first unlock |
| Person on a shared PC | Quick private jotting | Auto-lock and "lock now"; nothing readable stays behind |

## 3. User flow
1. Guest: gate page with a preview and the sentence "We cannot read your notes". **Sign in with Google**.
2. First time: vault passphrase setup, then recovery key (shown once, confirmation required).
3. Empty state: `EmptyState` with **New note** and the Scratchpad tab (a single always-open note).
4. Layout: note list (search, tags, Trash) on the left, editor on the right (`SplitPane`: edit and preview; mobile uses tabs).
5. Editing: markdown with toolbar. Wrap text in `||secret||` or choose **Mask selection** to create a secret block shown as dots; click or press Enter to reveal for 15 s, then it hides again.
6. Save is automatic (debounced 1 s) to the local encrypted cache, then synced. `SyncStatus` shows state.
7. Done states: copy secret, export markdown, or move to Trash (Undo toast). Lock returns to `UnlockGate`.

```
[Scratchpad] [Notes]  [Search decrypted notes...]  [Lock]
| Notes list / tags |  Title            tags: api, work |
| ...               |  # Markdown ...   | Preview       |
 Local-first · Synced · 42/500 notes
```

## 4. Inputs and outputs
- **Inputs:** typed or pasted markdown (CommonMark plus tables, task lists), title, tags. Max 50 KB per note (UTF-8 bytes of plaintext). Attachments are out of scope in v1.
- **Outputs:** `.md` per note (decrypted client-side), ZIP of all notes, encrypted backup JSON (ciphertext). Copy of note text or one secret block.

## 5. Components and tech
- **Reused:** `ToolShell`, `AuthBadge`, `UnlockGate`, `PasswordPrompt`, `SyncStatus`, `UsageMeter`, `CodeEditor`, `SplitPane`, `Tabs`, `CopyButton`, `DownloadButton`, `ConfirmDialog`, `DiffView` (versions), `Toast`, `ErrorBanner`, `EmptyState`.
- **New:** `NoteList`, `MarkdownPreview` (sanitized), `SecretBlock`, `TagInput`, `VersionHistoryPanel`, `RecoveryKeyDialog`, `PassphraseChangeDialog`.
- **Libraries:** CodeMirror 6 (MIT), `markdown-it` or `marked` plus DOMPurify (verify), `fflate` for ZIP, Web Crypto, Argon2id WASM (verify package). Search: `MiniSearch` or `FlexSearch` (verify), in memory only.
- **Runs:** crypto and indexing in a worker; editing on the main thread.

## 6. Behavior rules
- Everything (title, body, tags, version diffs) is inside the ciphertext. The server sees only ids, sizes, timestamps, version counters.
- **Search runs on the decrypted local index only.** The index is built in memory after unlock, is never persisted in plaintext and never uploaded. Locking destroys it.
- Preview is sanitized; remote images and scripts are not loaded (images show as links), so opening a note never triggers a network request.
- Secret blocks are masked in the UI, in search snippets and in the printed view; they are not special cryptographically (the whole note is encrypted).
- **Version history:** last 10 versions per note, snapshot at most once per 5 minutes of edits; restore creates a new version. Each version is its own encrypted record (`NoteVersion`) with a fresh IV; the 50 KB limit applies per version, so a note can hold up to about 500 KB of history (verify storage cost). Versions are not counted in the 500-note quota and are deleted with the note.
- **Command palette (P-002):** note titles, tags and bodies are never passed to the palette indexer, locked or unlocked. The palette offers only a static "Open Secure Notes" action. Search stays inside this tool.
- The Scratchpad is one special note and counts as 1 of the 500.
- **Conflict copies:** if two devices edit the same note within the sync window, keep both; the older becomes "Title (conflict copy, device name, time)". No auto merge.
- Paste warnings: pasting text matching known secret patterns (private key header, 40+ char tokens) shows a one-line info bar suggesting a secret block; never blocks.
- Auto-lock 5 min idle (configurable), on tab close, and on return from sleep (detected as a clock jump longer than the idle limit; browsers expose no sleep event). Clipboard copies of secrets auto-clear after 30 s where permitted.
- Passphrase change re-wraps the data key only; notes are not re-encrypted. Recovery key can be rotated (old one invalidated).
- Trash: soft delete for 30 days, restore from Trash, then purged; "Empty trash" needs confirmation.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Lost passphrase, recovery key available | Unlock via recovery key, force new passphrase |
| Lost both | Unrecoverable; only "Reset vault" (typed confirmation, deletes all ciphertext) |
| Note exceeds 50 KB | Counter turns red at 45 KB; save blocked above 50 KB with a "Split into two notes" action; nothing is truncated |
| Huge paste (5 MB) | Rejected before it enters the editor, with size message; editor stays responsive |
| Offline | Full read and edit after unlock; queue shown in `SyncStatus`; sync on reconnect |
| Edit on two devices | Conflict copy created and a `Conflict` badge; user can diff and delete one |
| Token expiry | Editing continues locally; banner "Sign in again to sync"; no data loss |
| Multi-tab | `BroadcastChannel`: lock syncs across tabs; editing a note open in another tab shows "Open in another tab" and makes this tab read-only |
| Quota exceeded (500 notes) | Block new note, `UsageMeter` at 80%, offer export and trash purge |
| Unicode, emoji, RTL, combining marks | Stored UTF-8 (byte size counted, not characters); search uses `Intl` normalization and diacritic folding; `dir="auto"` per paragraph |
| Markdown injection (`<script>`, `javascript:` links) | Sanitized in preview; links open with `rel="noopener noreferrer"` after a confirm for external domains |
| Passphrase brute force | Minimum strength enforced at setup; the unlock delay is cosmetic (offline guessing cannot be rate-limited) |
| Corrupt record (bad GCM tag) | That note is shown as "Cannot decrypt" with Export raw and Delete; others unaffected |
| Sign-out | Wipes cache, index and keys; warns about unsynced edits first |
| Session expiry while unlocked | Stay unlocked locally; sync paused |
| Account deleted elsewhere | Next sync clears local data and shows an explanation |
| Browser storage cleared | Data restored from server after sign-in and unlock; unsynced edits lost, as the sync status warned |

## 8. Limits, performance, privacy
- 500 notes, 50 KB each; open note under 100 ms; index build for 500 notes under 1 s after unlock.
- Network: auth, ciphertext sync only. No analytics on note content; error reports strip all note data.
- Stored locally: encrypted records in IndexedDB; plaintext only in memory. Screen content is exposed to screenshots; an optional "Blur when tab not focused" setting is available.
- Honest limit: if the device is compromised while unlocked (malware, extensions) content can be read.

## 9. Accessibility and mobile
- Editor and list fully keyboard operable (Ctrl/Cmd+N new, Ctrl/Cmd+F search, Ctrl/Cmd+L lock). Secret blocks are buttons with `aria-label="Secret, hidden. Press Enter to reveal"`.
- Preview has headings navigable; `aria-live` announces "Saved" and "Locked".
- Mobile: list and editor are separate screens; large toolbar; autosave on app background; PWA install.

## 10. Data
- **Class A.** Same vault as F-028 (one vault per user, shared data key). Envelope `{v, kdf, salt, iv, ct}` per record; unique IV per save.
- **Entities:**
  - `Note` (ciphertext holds `title`, `body`, `tags[]`, `isScratchpad`, `pinned`; clear fields `id`, `ownerId`, `updatedAt`, `deviceId`, `version`, `deleted`, `deletedAt`, `sizeBytes`).
  - `NoteVersion` (encrypted `body`, `title`, `savedAt`; parent `noteId`).
  - `VaultMeta` as in F-028.
- **Sync:** local-first, per-record last-write-wins plus conflict copies; tombstones 30 days.
- **Quotas:** 500 notes, 50 KB per note; versions 10 per note; `UsageMeter` at 80% of count.
- **Offline:** full; queue persisted.
- **Export:** decrypted `.md` or ZIP after unlock; encrypted JSON through "Export my data".
- **Delete:** per note to Trash then purge; account deletion purges within 30 days.
- **Signed-out gate:** guest sees preview, cannot save notes. **Sign-out:** wipe local cache. **Session expiry:** local use continues, sync paused. **Account deletion:** local cache cleared at next check.

## 11. Acceptance criteria
- [ ] Network capture shows only ciphertext, ids and sizes for note saves.
- [ ] Search finds a word in a note body while unlocked and nothing is searchable while locked.
- [ ] A 51 KB note cannot be saved and no text is lost.
- [ ] Editing the same note offline on two devices yields a conflict copy with both texts intact.
- [ ] Changing the passphrase does not re-upload all notes and old passphrase stops working.
- [ ] Recovery key unlocks the vault; setup cannot finish without confirming it.
- [ ] Secret blocks stay masked in preview, search results and print.
- [ ] Deleted note reappears via Trash within 30 days and disappears after purge.
- [ ] After sign-out, IndexedDB holds no notes or index.
- [ ] Exported `.md` equals the editor text byte for byte (UTF-8).

## 12. Future ideas and open questions
- Attachments (encrypted files), shared notes with a link key, per-note passphrase, templates for recovery codes, note links.
- Open: should version history count toward a per-user storage quota? Is a 10-version cap enough? Which search library after bundle-size check?
