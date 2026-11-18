---
id: F-026
slug: password-generator
title: Strong Password & Passphrase Generator
category: everyday
tier: client
priority: P0
status: planned
depends_on: []
---

# Strong Password & Passphrase Generator

## 1. Summary
Generate random passwords, Diceware-style passphrases, and PINs using the browser's cryptographic random source, with an honest entropy figure. Also checks the strength of a password the user types. Nothing is stored or sent.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Everyday user | Signing up for a new account | A 20-character random password, one click to copy |
| User of a picky site | Site demands 1 symbol, max 16 chars, no `&` | Generator meeting the exact rules |
| Person typing a master password | Needs something memorable but strong | 6-word passphrase with computed entropy |
| IT admin | Needs 20 temporary passwords for new staff | Bulk list, copy or download as text |
| Phone owner (non-obvious) | Needs a PIN for a SIM or device | Random PIN that avoids trivial patterns when asked |

## 3. User flow
1. Empty state: a password is generated immediately on load (safe, local), shown large with a strength meter, **Copy** and **Regenerate**. `Tabs`: Password | Passphrase | PIN | Check mine.
2. Password tab controls: length slider (8 to 128, default 20), toggles for lowercase, uppercase, digits, symbols, "Avoid look-alikes (O/0, l/1/I)", custom exclude list, "Must include at least one of each selected class".
3. Passphrase tab: word count (3 to 12, default 6), separator, capitalize, add number, wordlist choice.
4. Any change regenerates. Result shows entropy in bits and an honest label.
5. **Bulk:** choose count (1 to 100), generate list, Copy all / Download .txt.
6. **Check mine:** `PasswordPrompt`-style input with show/hide; zxcvbn-ts estimate, crack-time ranges, warnings and tips.
7. Done state: after Copy, Toast "Copied. Paste it into your password manager, then clear your clipboard" with a "Clear clipboard now" button and a 60 s reminder.

## 4. Inputs and outputs
- **Inputs:** length 8 to 128 on the slider (4 to 7 only by typing in the number field, with a warning); class toggles; excluded characters; per-site rules (min counts per class, max length, forbidden characters, allowed symbol set); passphrase options; user-typed password for checking (never leaves the page).
- **Outputs:** text in a monospace field (digits and symbols color-coded, with letter-O vs zero distinguished), entropy bits, optional bulk `.txt`. Filename `passwords.txt` (with a warning that files are unencrypted).

## 5. Components and tech
- **UI (shared):** `ToolShell`, `Tabs`, `Slider`/`NumberField`, `SettingsPanel`, `SegmentedControl`, `CopyButton`, `PasswordPrompt`, `DownloadButton`, `Toast`, `ConfirmDialog`, `ErrorBanner`, `HelpPopover`, `Tooltip`, `LibraryLoader`.
- **New:** `StrengthMeter` (bits and label, with text, not color-only), `PasswordDisplay` (monospace, per-character class coloring), `SiteRulesForm`.
- **Libraries:** `crypto.getRandomValues` (native); `zxcvbn-ts` (MIT, core plus language packs, verify size, lazy-loaded only for "Check mine"); EFF large wordlist (7,776 words, 12.92 bits per word) licensed CC BY 3.0 US, verify wording and show attribution in the footer/help; bundled locally, not fetched.
- **Where it runs:** main thread; checking with zxcvbn-ts in a worker for long inputs.

## 6. Behavior rules
- **Randomness:** only `crypto.getRandomValues`. Never `Math.random`; lint rule bans it in this tool. Index selection uses **rejection sampling** (discard values above the largest multiple of N below 2^32) to avoid modulo bias. Shuffles use Fisher-Yates with the same unbiased sampler. `getRandomValues` accepts at most 65,536 bytes per call, so bulk generation requests randomness in chunks. It works in insecure contexts too (only `crypto.subtle` needs HTTPS).
- **Required classes:** pick one random char from each required class first, fill the rest from the full pool, then shuffle. Document that this slightly lowers entropy; the displayed figure uses the number of valid outputs under the constraints (estimated, verify method), never inflated.
- **Entropy:** random password = length x log2(pool size); passphrase = words x log2(list size) plus separator/number extras only if randomly chosen. Labels: under 40 weak, 40 to 59 fair, 60 to 79 strong, 80 and above very strong. Shown as "x bits, computed from how it was generated".
- Generated passwords are **not** run through zxcvbn (it would misjudge random strings); typed passwords are.
- Ambiguous characters excluded set: `O 0 o l 1 I |` (editable). Symbol set default: `!@#$%^&*()-_=+[]{};:,.?` (editable); per-site rule can restrict it.
- Max length and required classes conflict (e.g. 3 required classes, length 2): show an inline error, do not silently relax.
- PIN mode: digits only, length 4 to 12; option "avoid obvious" rejects repeats (1111), sequences (1234, 4321), and short repeating pairs; entropy shown after the filter.
- Copy: Clipboard API (`writeText`, needs a user gesture). Default is a reminder Toast after 60 s; timers in background tabs are throttled, so the reminder also shows when the tab regains focus. Optional auto-clear: `readText` needs a permission prompt and a focused page (Firefox and Safari show a paste prompt instead; verify), so clear only if the clipboard still equals the copied value and otherwise just remind.
- Never stored: no localStorage, IndexedDB, cookies, URL hash, or analytics for generated values. Settings (length, toggles) may persist; the typed "Check mine" text never does. **No history by default**; an optional in-memory "Recent" list clears on tab close and has a Clear button.
- If `crypto.getRandomValues` is missing: refuse to generate, show "This browser cannot generate secure randomness" with update advice. Never fall back to `Math.random`. SSR/prerender: generation runs only after hydration in the browser.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| All character classes off | Inline error "Select at least one type"; regenerate disabled |
| Length shorter than required classes | Error naming the conflict |
| Length 1 to 7 | Warn "Too short to be safe" and show low bits; allow for legacy sites |
| Length 128 | Works; display wraps; copy gets the full value |
| Exclude list removes every char of a class | Class marked unavailable with a message |
| Site forbids certain symbols / max length 12 | Per-site rules applied; entropy updates, with a warning if below 60 bits |
| Site requires starting with a letter | Rule option "First char is a letter" |
| Crypto API unavailable (very old browser) | Refuse and explain; no weak fallback |
| Offline | Fully works; wordlist and zxcvbn-ts are bundled (zxcvbn-ts cached after first "Check mine" use) |
| Several tabs open | Each tab generates independently; nothing shared or stored |
| Bulk 100 x 128 chars | Generated in under 100 ms; listed in a scroll area |
| Clipboard blocked or unavailable | `CopyButton` fallback to select text; message to copy manually |
| Passphrase with Unicode separator or emoji | Allowed; entropy counts only random choices; warn some sites reject it |
| Wordlist capitalization + number | Entropy adds log2(number range) only if the number is random; shown |
| User types password in "Check mine" | Local only; Clear on tab leave; never in URL; paste allowed |
| Empty check field | Neutral prompt, no score |
| Extremely long typed password (10k chars) | Truncate analysis at 100 chars with a note; zxcvbn-ts in worker |
| Typed password is in common-password data | Warning "Very common password"; offers to generate instead |
| Screen shared / shoulder surfing | Option "Hide generated password" (dots, reveal on press) |
| RTL page language | Generated value forced `dir="ltr"` |
| Autofill/extension modifies fields | Fields set `autocomplete="off"`; value not a form field submitted anywhere |

## 8. Limits, performance, privacy
- Single generation under 5 ms; bulk 100 under 100 ms. Wordlist bundle about 60 KB (verify). zxcvbn-ts and language packs about 1 MB or more (verify), lazy.
- Network: none. Wordlist and dictionaries are bundled.
- Stored locally: UI settings only. No generated or typed password is ever stored or transmitted.
- Help text links to password manager advice (use a manager, unique password per site, turn on 2FA/passkeys); links are plain, outbound only on user click.

## 9. Accessibility and mobile
- Output field is read-only, focusable, labeled; `aria-live="polite"` announces "Password generated, 20 characters, 130 bits" without reading the password aloud by default (option "Read it out" for screen reader users). Strength shown as text plus icon.
- Keyboard: R to regenerate, C to copy (shown with `ShortcutHint`; single-key shortcuts only when no text field is focused and can be turned off, per WCAG 2.1.4). Mobile: big Copy button, sliders with number fields, 44 px targets, settings in a `Sheet`.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] Source search shows no use of `Math.random` in this tool; a test stubs `crypto.getRandomValues` and verifies the generator uses it.
- [ ] Chi-square test over 1,000,000 draws on a pool of size 94 shows no modulo bias beyond statistical tolerance.
- [ ] Per-site rules (min counts, max length, excluded chars) are always satisfied in 10,000 generated samples.
- [ ] Entropy figure equals length x log2(pool) for unconstrained mode.
- [ ] No generated or typed password appears in storage, URL, or network traffic.
- [ ] Without `crypto.getRandomValues` the tool shows an error and produces nothing.
- [ ] Passphrase mode shows EFF wordlist attribution; copy reminder appears after copy.
- [ ] Fully usable by keyboard and screen reader.

## 12. Future ideas and open questions
- Pronounceable passwords, username generator, TOTP seed helper (see F-028), HIBP-style breach check (needs k-anonymity network call; not planned, would break "no network").
- Open: confirm EFF wordlist licence/attribution wording; include non-English wordlists (verify sources and licences)? Should clipboard auto-clear be attempted or only reminded?
