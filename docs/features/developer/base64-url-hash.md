---
id: F-021
slug: base64-url-hash
title: Base64, URL & Hash Generator
category: developer
tier: client
priority: P0
status: planned
depends_on: []
---

# Base64, URL & Hash Generator

## 1. Summary
Encode and decode Base64, Base64URL and URL (percent) text; hash text or files with MD5, SHA-1, SHA-2; compute HMACs; and create or verify bcrypt hashes. All work is local, with correct UTF-8 handling and streaming for big files.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Developer | Debug a `Basic` auth header or data URI | Decodes Base64 to text, or encodes a file into a ready `data:` URI |
| Release engineer | Publishes a 3 GB installer with a checksum | SHA-256 of the file with progress, compared against the published value |
| API integrator | Webhook signature mismatch | HMAC-SHA256 of payload with a secret, in hex and Base64 |
| Web dev | Query string breaks on `&` and `+` | Right encoding (component vs full URL vs form) with explanations |
| Backend dev (non-obvious) | Chooses bcrypt cost for a new login system | Times cost 10 to 14 on this device and verifies an existing `$2b$` hash |

## 3. User flow
1. Empty state: `Tabs` for **Base64**, **URL**, **Hash**, **HMAC**, **Bcrypt**; each shows an input area, `DropZone` where files make sense, and **Try an example**.
2. Base64 tab: `SegmentedControl` Encode / Decode, variant (Standard / URL-safe), options (padding on/off, line wrap none/64/76, output as text / data URI). Output updates live for text.
3. URL tab: mode (Component / Full URL / Form `application/x-www-form-urlencoded`), Encode / Decode. A parsed-URL breakdown shows scheme, host, path, query pairs when valid.
4. Hash tab: text or file; checkboxes for MD5, SHA-1, SHA-256, SHA-384, SHA-512; output hex (lower/upper) or Base64. Files show `ProgressBar` with Cancel. **Compare** field: paste an expected hash, shows Match or No match.
5. HMAC tab: message, secret (`PasswordPrompt`-style show/hide), algorithm, output format.
6. Bcrypt tab: **Hash** (password, cost 4 to 15 with `Slider`, shows estimated time) and **Verify** (password + hash). Runs in a Worker with progress and Cancel.
7. Done state: `CopyButton` per result, `DownloadButton` for decoded files (`name-decoded.bin`) or a `.sha256` checksum file, **Clear** button.

## 4. Inputs and outputs
- **Inputs:** text (UTF-8), any file (soft warning 50 MB for Base64/data URI, no fixed limit for hashing since it streams; verify browser limits), secrets, bcrypt password and hash.
- **Outputs:** Base64/Base64URL text, decoded text or file, data URI, percent-encoded or decoded text, hex/Base64 digests, HMAC, bcrypt string (`$2b$12$...`), Match/No match verdicts, checksum file `<file>.sha256` in `<hash>  <filename>` format.

## 5. Components and tech
- **UI:** `ToolShell`, `Tabs`, `SegmentedControl`, `CodeEditor` (plain), `CodeOutput`, `DropZone`, `FileList`, `ProgressBar`, `CopyButton`, `DownloadButton`, `SettingsPanel`, `Slider`/`NumberField`, `PasswordPrompt`, `ErrorBanner`, `Toast`, `HelpPopover`, `LibraryLoader`. New: `HashResultRow` (algorithm, value, copy, compare state), `SecurityNote` (inline caution block).
- **APIs/libraries:** `TextEncoder`/`TextDecoder`, `btoa`/`atob` only on byte strings, `FileReader`/`Blob.stream()`; `crypto.subtle.digest` for SHA-1/256/384/512; `crypto.subtle` HMAC; `spark-md5` (MIT, supports incremental) for MD5; `bcryptjs` (MIT, verify bundle size). Streaming SHA over huge files: SubtleCrypto cannot hash incrementally, so a streaming implementation such as `hash-wasm` (MIT, in research-notes for KDF; verify support for SHA-2 streaming) or `@noble/hashes` (MIT, verify) is needed for large files.
- **Where it runs:** text ops on main thread; file hashing and bcrypt in Workers.

## 6. Behavior rules
- Text is always encoded as UTF-8 before Base64 or hashing; the UI says so. Decoding Base64 to text uses UTF-8 with fatal errors off and shows a "Not valid UTF-8, showing as bytes" mode with hex view and a **Download as file** button.
- Never call `btoa` on a JS string directly (fails on non-Latin1); always go through bytes.
- Decoder accepts whitespace/newlines inside Base64, both alphabets, with or without padding. It reports the alphabet detected and the real error position for invalid characters. Missing padding is auto-fixed and noted.
- Base64URL output uses `-` `_` and omits padding by default (toggle).
- URL tab: **Component** = `encodeURIComponent` (encodes `& = ? / # +` etc.), **Full URL** = `encodeURI` (keeps `: / ? # & =`), **Form** = spaces as `+`. Decode in Form mode turns `+` into space; in Component mode `+` stays `+`. A help table shows the difference with an example. Malformed sequences (`%E0%A4%A`) produce the exact position and a "decode leniently" option.
- Double-encoding hint when the input already contains `%25` patterns.
- Hash of text: choice of line endings is never changed; a note flags that CRLF vs LF produce different hashes. Empty string is hashed normally (known value shown in tests).
- MD5 and SHA-1 show a `SecurityNote`: "Not safe for passwords or signatures. Fine for checksums of non-hostile data. For passwords use bcrypt or Argon2id."
- `crypto.subtle.digest` has no incremental API and needs the whole input in memory, and it has no MD5. Text and files up to 100 MB (tunable) may use it for SHA-1/2; larger files use the streaming library for every selected algorithm. File hashing computes all selected algorithms in one pass over the file chunks (e.g. 4 MB), updating progress; memory stays flat regardless of file size.
- Compare: strips spaces and colons, lowercases, auto-detects hex vs Base64, uses constant-time comparison; shows Match / No match, and which algorithm matched if the pasted length fits several.
- HMAC: secret as UTF-8 text, hex or Base64 (toggle). Empty secret allowed with a notice; WebCrypto `importKey` rejects zero-length HMAC keys in some browsers (verify), so the empty-key case uses the fallback library. Secret is held in memory only.
- Password and secret fields use `autocomplete="off"` (or `new-password`), `spellcheck=false`, so browsers do not offer to save them.
- Form mode follows `URLSearchParams` rules (space becomes `+`; `~ ! ' ( )` are percent-encoded), which differ slightly from `encodeURIComponent` (verify against the library used).
- Bcrypt: cost 4 to 15 (default 12), estimated time shown from a small calibration; costs 14+ warn about duration. Input longer than 72 **bytes** is flagged: bcrypt ignores bytes beyond 72, and the UI shows the byte count (emoji and non-ASCII use multiple bytes). Output prefix `$2b$` (`bcryptjs` default, verify); verification accepts `$2a$`, `$2b$`, `$2y$`. Bcrypt hashes use a fresh random salt each time, so two results for the same password differ; the help text says so.
- Passwords, secrets and input text are not persisted; only tab, output format and cost preference are saved.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Empty input | Encode/hash of empty string is valid and shown; decode shows empty output, no error |
| Non-ASCII/emoji/Bengali/Arabic text | UTF-8 encoded; round trip verified; RTL output uses `dir="auto"` |
| Decode input with invalid characters | Error names the character and position; offers "Strip invalid characters" |
| Standard vs URL-safe Base64 mixed | Auto-detected; message says which alphabet was found |
| Missing or excess padding | Fixed and noted; excess padding flagged |
| Decoded bytes not valid UTF-8 (image, zip) | Hex/bytes view; guess type by magic bytes; Download as file; image preview optional |
| Huge file to Base64 (over 50 MB) | Warn (output 33% larger, memory heavy); chunked encode; refuse above about 500 MB (verify) |
| File over 4 GB to hash | Streams; progress; Cancel stops reads; no memory growth |
| Data URI with `data:image/png;base64,` prefix pasted into decoder | Prefix parsed, MIME shown, payload decoded |
| Line-wrapped Base64 (MIME 76 cols) | Accepted on decode; encode option for 64 or 76 with CRLF/LF choice |
| URL: space as `%20` vs `+` | Mode explained; Form mode only for query/body |
| URL: encoding an already full URL with Component mode | Hint "Use Full URL mode to keep `https://` readable" |
| URL: lone surrogate (`\ud800`) | `encodeURIComponent` throws; show "Invalid Unicode (lone surrogate)" |
| Unicode normalization (é as 1 vs 2 code points) | Different hashes; option "Normalize to NFC before hashing" off by default with a hint |
| Hash compare with uppercase/spaces/colons | Normalized before compare |
| Bcrypt password over 72 bytes | Warning with byte count; truncation behavior stated; no silent change |
| Bcrypt invalid hash string | "Not a bcrypt hash (expected $2a$/$2b$/$2y$, cost, 53-char salt+hash)" |
| Bcrypt cost 15 on a phone | Estimated time shown first; Worker progress; Cancel terminates |
| `crypto.subtle` unavailable (HTTP, old browser) | SHA features via fallback library or disabled with message; MD5 and Base64 still work |
| Cancel during file hash | Worker terminated; partial results discarded; status "Cancelled" |
| Binary secret with null bytes in HMAC | Use hex/Base64 secret mode; text mode warns if null bytes pasted |
| Empty HMAC secret | Computed via fallback library with a notice (see rules) |
| Percent-encoded text that is not valid UTF-8 (`%E9` from Latin-1) | `decodeURIComponent` throws; show position, offer "Decode as Latin-1 / Windows-1252" |
| Bcrypt password containing a null byte | Rejected with a message (bcrypt implementations disagree on NUL handling) |
| Input on a phone with a very large file (over 1 GB) | Hashing still streams; warn about battery and keeping the tab in the foreground, since background tabs are throttled |

## 8. Limits, performance, privacy
- Targets: SHA-256 of a 1 GB file in under about 20 s on a mid-range laptop (verify, depends on library); UI stays responsive.
- Network: none with user content. Libraries (MD5, bcrypt, streaming hash) lazy-load, sizes shown via `LibraryLoader`.
- Stored locally: preferences only. No passwords, secrets, files or digests persisted. Shared links never contain input.

## 9. Accessibility and mobile
- Tabs use roving tabindex; each result row is labeled ("SHA-256: ..."); Match/No match uses icon + text and `aria-live`. Progress announced at 10% steps.
- Mobile: tabs scroll horizontally; file picker replaces drag and drop; long digests wrap with a copy button; bcrypt warns about battery/time at high cost.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] `héllo 😀` encodes to Base64 and decodes back identically; `btoa` errors never surface.
- [ ] Known vectors pass: SHA-256("abc"), MD5(""), HMAC-SHA256 test vector (RFC 4231), bcrypt `$2b$` verify.
- [ ] A 2 GB file hashes with at most 300 MB of added memory (DevTools measurement), no main-thread task over 100 ms, and Cancel stops reads within 1 s.
- [ ] Hashing the empty string gives the known values: MD5 `d41d8cd98f00b204e9800998ecf8427e`, SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- [ ] HMAC with an empty secret returns the correct value (RFC 2104 behavior) instead of throwing.
- [ ] Component, Full URL and Form modes produce different, documented output for `a b&c=d+e`.
- [ ] Decoding Base64URL without padding works.
- [ ] A 73-byte bcrypt input shows the 72-byte warning.
- [ ] MD5 and SHA-1 results show the security note.
- [ ] Hash compare accepts pasted hashes with spaces/uppercase/colons.
- [ ] Password, secret and input fields are never written to localStorage, sessionStorage, IndexedDB or the URL (checked by a storage snapshot test).
- [ ] No network request contains input, files or secrets.

## 12. Future ideas and open questions
- SHA-3, BLAKE3, CRC32, Argon2id/scrypt hashing (see KDF in research notes), file hash manifest for folders, Base32/Base58/hex converters, HTML entity and JWT-aware Base64 links to F-019.
- Open: which streaming hash library for SHA-2 (verify size/license)? Include Base64 file decode of over 500 MB?
