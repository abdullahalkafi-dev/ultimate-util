---
id: F-004
slug: pdf-compress-protect
title: PDF Compress & Protect
category: documents
tier: client
priority: P1
status: planned
depends_on: [F-003]
---

# PDF Compress & Protect

## 1. Summary
Shrink PDF size for email limits and portals, and add, change or remove password protection (AES) locally.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Applicant | Portal limits upload to 2 MB | Compressed file under the target size |
| Freelancer | Sends invoice with client data | Password-protected PDF |
| Office | Received protected PDF, knows the password, needs an unlocked copy | Unlocked PDF |
| Anyone | PDF contains hidden metadata | Metadata stripped |

## 3. User flow
1. `DropZone` accepts PDFs. Tabs: **Compress** | **Protect** | **Unlock**.
2. **Compress:** preset chooser (Light, Balanced, Strong) plus **Target size** field ("Under 2 MB"). Live estimate after analysis. Options: downscale images to N dpi, JPEG quality, remove metadata/thumbnails, flatten annotations.
3. Click **Compress**. `ProgressBar`; `ResultCard` shows before/after size and % saved, page thumbnails, a zoomed side-by-side check (`BeforeAfter`).
4. **Protect:** enter password twice (`PasswordPrompt`), choose permissions (print, copy, edit), encryption AES-256. Output downloads.
5. **Unlock:** enter the current password; produces unprotected copy.

## 4. Inputs and outputs
- **Inputs:** PDF up to 200 MB soft; password strings (UTF-8). Several PDFs may be dropped (up to 50): they run one at a time through the chosen tab with the same settings; a failure never blocks the rest; multiple outputs download as ZIP.
- **Outputs:** `<name>-compressed.pdf`, `<name>-protected.pdf`, `<name>-unlocked.pdf`. Never replaces original.

## 5. Components and tech
- **UI:** `ToolShell`, `Tabs`, `DropZone`, `SettingsPanel`, `Slider`, `NumberField`, `PasswordPrompt`, `ProgressBar`, `ResultCard`, `BeforeAfter`, `DownloadButton`, `ErrorBanner`.
- **Compress:** pdf.js (render/inspect) + pdf-lib; re-encode embedded images (canvas/jSquash), drop unused objects, subset fonts if possible, strip metadata. qpdf-wasm can also do lossless structural savings (object streams, dedupe; verify). Stronger option: Ghostscript or MuPDF WASM. **Both are AGPL**, which is a problem for a closed-source product: do not ship either unless the owner picks AGPL compliance or buys a commercial license (open decision, section 12).
- **Encrypt/decrypt:** qpdf-wasm (about 2 MB, Apache-2.0 per research notes; verify the WASM package license). Treat pdf-lib as unable to encrypt: sources disagree, so it is not used for this until verified. Worker execution.

## 6. Behavior rules
- Compression never makes the file larger: if result >= original, return the original with a message "Already well optimized."
- Target size mode iterates quality/dpi downward until the target is met or a minimum quality floor is hit; if the floor is reached, tell the user the smallest achievable size.
- Text and vector content stay as is; only raster images are downsampled.
- Protect: user password vs owner password both settable; warn the password cannot be recovered. Permission flags (print, copy, edit) are advisory: some readers ignore them, so the UI says "restrictions are not strong security; the open password is".
- Passwords never leave the page, are not logged or persisted, and references are dropped after use (JavaScript cannot guarantee wiping strings from memory; do not claim it).
- Unlock requires the correct password; the tool does **not** crack or bypass passwords.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Scanned PDF (all images) | Biggest savings; show warning that very strong settings blur text; offer 150/200 dpi |
| Already-optimized PDF | Return original, say so |
| PDF/A or signed PDF | Warn that compression/encryption invalidates signatures or PDF/A compliance |
| Forgot password on Unlock | Clear message: cannot be recovered |
| Weak password (e.g. 1234) | Strength meter + warning, allow anyway |
| Non-ASCII password | Supported; note that some old readers may fail |
| Fonts embedded and large | Subsetting attempted; else notice |
| JBIG2/JPX images | Re-encode only if supported, otherwise leave and report |
| Encrypted-with-owner-password only | Unlock works without password; show restrictions removed notice |
| Target size impossible | Show best result and the floor |
| Huge file out of memory | Fail gracefully with suggestion to split first (F-003) |
| Cancel | Worker terminated; no download |
| Empty/0-byte, corrupt or renamed non-PDF | Magic-byte check; clear error naming the detected type; in a batch that file fails alone |
| Encrypted input on Compress or Protect tab | Ask for the password first (`PasswordPrompt`); output of Compress keeps protection only if the user re-applies it in Protect |
| Unsupported browser (no Worker/WASM) | Clear message; tool disabled |
| Non-Latin file or document metadata (title/author in CJK, Arabic, Bengali) | Preserved as UTF-8 unless "remove metadata" is on |
| Phone / low memory | Limit to one file at a time and ~50 MB on mobile (verify); suggest splitting with F-003 first |

## 8. Limits, performance, privacy
Target (validate in spike): 20 MB scanned PDF compressed in under 20 seconds on a mid-range laptop. Module sizes: qpdf-wasm about 2 MB; Ghostscript/MuPDF, if ever shipped, is larger and lazy-loaded with its size shown first. No network request carries file content or passwords; nothing is persisted except settings.

## 9. Accessibility and mobile
Password fields have show/hide with labels; strength meter has text, not only color. Mobile: sheet for options.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] A 10 MB scanned PDF shrinks by at least 40% on Balanced (target to validate) and body text stays legible at 100% zoom.
- [ ] Output is never larger than input.
- [ ] Protected file asks for the password in Adobe Reader, Chrome and macOS Preview and opens only with it; AES-256 confirmed with an independent tool (qpdf --show-encryption).
- [ ] Cancel stops work within 2 seconds with no download.
- [ ] Unlock with a wrong password fails clearly and allows retry.
- [ ] Signature/PDF-A warnings appear when relevant.

## 12. Future ideas and open questions
Redaction, watermark, remove metadata only, batch folder compress.
Open: Ghostscript/MuPDF license path (AGPL compliance, commercial license, or skip and accept weaker compression)? Does the unlock tab belong in v1 given the misuse risk (it requires the correct password, so it only removes a password the user already has)?
