# F-029 — Secure Notes & Scratchpad

Status: shipped (E2EE cloud-synced scratchpad, Markdown notes, `||secret||` redaction, snapshots, and 30-day trash).

## Implementation notes
- Encrypts note titles, Markdown bodies, tags, pinned flags, and up to `MAX_VERSIONS = 10` snapshots locally using the user's vault key (`encryptJson` / `decryptJson`).
- Enforces `NOTE_MAX_BYTES = 50,000` (payload budget `52,000` bytes fitting API limits), masks `||secret||` inline spans before Markdown rendering (`prepareMarkdown`) and search indexing (`stripSecrets`), supports split-long-note helper (`splitForLimit`), vault passphrase rewrapping (`rewrapWithPassphrase`), auto-lock minutes, tab-blur hiding, and encrypted ZIP export.

## Known limitations
- Requires an authenticated session and unlocked vault to sync with backend API (`QUOTA = 500` items).
- Binary file attachments are not stored inside notes; text/Markdown only within the 50 KB per-note budget.
