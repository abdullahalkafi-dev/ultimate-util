---
id: F-020
slug: regex-tester
title: Regex Tester & Cheatsheet
category: developer
tier: client
priority: P0
status: planned
depends_on: []
---

# Regex Tester & Cheatsheet

## 1. Summary
Write a regular expression, test it live against sample text, see highlighted matches and capture groups, preview replacements, and get a plain-English explanation of each token. A cheatsheet inserts syntax with one click. It uses the browser's own JavaScript regex engine, protected by a Worker so a bad pattern cannot freeze the page.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Developer | Extract IDs from log lines | Live highlights and a table of named groups |
| Beginner | Copied `^(?=.*\d)(?=.*[A-Z]).{8,}$` from a forum | Token-by-token explanation in plain words |
| Data analyst | Clean a text column with find/replace | Replace preview using `$1`, `$<name>` before applying elsewhere |
| QA | Page hangs on a form pattern | Timeout warning and a "risky pattern" hint about nested quantifiers |
| Team lead (non-obvious) | Wants to share a pattern in chat | Link with pattern and flags only; test text is never included |

## 3. User flow
1. Empty state: pattern field with `/ /` delimiters, flag toggles, a test text area, **Try an example** (e.g. date matcher), and the Cheatsheet closed.
2. User types a pattern. Matching runs live (debounce about 150 ms) in a Worker. Matches are highlighted in the test text; a counter shows "5 matches in 3 ms".
3. Right-hand `Tabs`: **Matches** (list with index, position, value), **Groups** (capture and named groups per match), **Replace** (replacement field + live output), **Explain** (token breakdown tree).
4. **Cheatsheet** `Drawer`: grouped (characters, anchors, groups, quantifiers, lookaround, flags, Unicode properties). Clicking an entry inserts it at the caret in the pattern field.
5. Working state: if matching exceeds 1 s, show "Still running... Cancel". On timeout (default 2 s, adjustable) the Worker is terminated and an `ErrorBanner` explains likely causes.
6. Done state: **Copy as** menu (JS literal, `new RegExp` string with escaped backslashes), **Share link** (pattern + flags), **Save example** (stored locally with a name).

```
/ pattern ........................ / [g][i][m][s][u][v][y][d]   Share  Save
+-------------------------------+  | Matches | Groups | Replace | Explain |
| Test text (highlighted)       |  |                                      |
+-------------------------------+  +--------------------------------------+
 Cheatsheet [open]            JavaScript (ECMAScript) engine · Local
```

## 4. Inputs and outputs
- **Inputs:** pattern (text), flags `g i m s u v y d`, test text (up to 1 MB soft limit), replacement string, optional test file (`.txt`, `.log`, `.csv`).
- **Outputs:** highlighted matches, match and group tables (copy as JSON/CSV), replaced text (copy/download), regex literal snippets, share URL such as `#p=...&f=gi`.

## 5. Components and tech
- **UI:** `ToolShell`, `CodeEditor` (pattern, test text with decorations), `SegmentedControl`, `SettingsPanel`, `Tabs`, `Drawer`, `CopyButton`, `DownloadButton`, `ErrorBanner`, `ProgressBar` (indeterminate with Cancel), `Toast`, `HelpPopover`, `EmptyState`, `Tooltip`. New: `FlagToggleGroup`, `MatchHighlighter`, `RegexExplainer` (token tree), `CheatsheetPanel` (searchable, click-to-insert), `SavedList`.
- **Engine:** native `RegExp` inside a dedicated Web Worker. Explainer: own small parser over the pattern, or a library such as `regexp-tree` (MIT, verify) or `regjsparser` (verify). `v` flag support must be feature-detected.
- **Where it runs:** matching and replacing in a Worker (killable); UI and explainer on main thread.

## 6. Behavior rules
- Default flags: `g` on. Flags `u` and `v` are mutually exclusive; selecting one disables the other with a tooltip. `v` is disabled with a note where unsupported (feature-detect via `new RegExp('', 'v')`).
- Engine label always visible: "JavaScript (ECMAScript)". Notes panel lists known differences from PCRE, Python, .NET, Java (named group syntax `(?P<n>)`, possessive quantifiers, atomic groups, `\A`/`\Z`, inline flags such as `(?i)`, recursion, `\X`) so users do not assume portability. It also notes the reverse: JavaScript allows variable-width lookbehind, which PCRE and Python reject, so a pattern that works here may fail elsewhere. Newer JS features (flag modifiers `(?i:...)`, duplicate named groups in different alternatives) are feature-detected and marked "verify support" in the notes. A flavor selector is future work.
- Each run happens on a fresh Worker call with a cancel token. Stale results from an earlier keystroke are discarded. The worker is recreated after any timeout.
- Match loop for `g`: guards zero-length matches by advancing `lastIndex` (by code point when `u`/`v` is set) so no infinite loop. Safety cap: 10,000 highlighted matches, with a "showing first 10,000" notice.
- Highlights alternate two colors plus an underline so adjacent matches are distinguishable without relying on color alone; numbered badges are available.
- Index units are UTF-16 code units (JavaScript). The Matches table shows both code-unit index and "character" position (counting code points) with a tooltip.
- `d` flag adds start/end index per group in the Groups tab.
- Replace preview follows JS rules: `$1`, `$<name>`, `$&`, `` $` ``, `$'`, `$$`. Invalid references are flagged and shown literally.
- Risk hints (static, before running): nested quantifiers like `(a+)+`, overlapping alternations `(a|a)*`, `.*.*`. Hint text explains catastrophic backtracking (ReDoS) and suggests a fix; it does not block running. The check is a heuristic: no hint does not prove a pattern is safe, and the UI says so. The timeout only protects this page; it is not a safety proof for production.
- Flag support: `d` (match indices) needs Chrome 90, Firefox 88, Safari 15; `v` (unicodeSets) needs Chrome 112, Firefox 116, Safari 17 (verify). Both are feature-detected with `new RegExp('', flag)`; unsupported flags are disabled with a note.
- Lookbehind `(?<=...)` and `(?<!...)`: supported in current Chrome, Edge, Firefox and Safari 16.4+ (verify). If construction throws, show "Your browser does not support lookbehind" with the browser version hint.
- Share link carries `p` (pattern) and `f` (flags) only, in the URL hash (never sent to a server). Test text and replacement are never put in a URL (platform rule: no content in URLs; test data often holds logs or personal data). Saved examples live in localStorage, with Delete and Export JSON, and the test text is saved only if the user ticks "Save test text too".

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Empty pattern | No matching; hint "Type a pattern". An empty pattern is not reported as matching everywhere |
| Empty test text | Zero matches, group table empty, no error |
| Invalid pattern (`(`, `[a-`, `\k<x>` undefined) | Browser error message translated: "Unterminated group at position 1" with caret marker |
| Catastrophic backtracking `(a+)+$` on `aaaa...b` | Worker killed at timeout; banner explains; risk hint was shown beforehand |
| Zero-length matches (`^`, `\b`, `a*`) | Shown as thin markers; loop advances, no hang; table says "(empty)" |
| Emoji and surrogate pairs without `u` | `.` matches half a pair; hint "Enable the u flag" when astral characters are detected |
| Unicode properties `\p{L}` without `u`/`v` | Treated as literal `p{L}`; hint to enable `u` |
| Case-insensitive with Turkish/German `ß`, `İ` | Follows JS rules; note in help; no locale-specific folding |
| RTL and mixed-direction test text | Highlight rendering uses `dir="auto"`; indices remain logical order |
| Combining characters / grapheme clusters | Matches may split clusters; explain that `\X` is unsupported in JS |
| Multiline text with CRLF | `$` and `^` behave per `m` flag; `\r` visible with "Show whitespace" toggle |
| Very large test text (over 1 MB) | Warning; run in Worker with progress; highlight only visible window |
| Over 10,000 matches | Cap with notice; counts continue to total (up to 1,000,000 then "1M+") |
| Sticky `y` with `g` | Matches only consecutive from lastIndex; explainer notes behavior |
| Named groups with duplicate names | Error from engine surfaced; note that duplicates in alternation depend on browser (verify) |
| Replacement refers to missing group | Flagged inline; output shows literal text as JS does |
| Worker blocked or unsupported | Fallback to main thread with prominent "no timeout protection" warning and a smaller input cap |
| Lookbehind on old Safari | Clear unsupported message; cheatsheet marks the entry with "not in Safari before 16.4" |
| PCRE-only syntax pasted (`(?i)`, `\A`, `(?>...)`, possessive `a++`) | Detected and explained as unsupported in JS, with the JS equivalent |
| Cancel clicked | Worker terminated; previous highlights cleared; status "Cancelled" |
| Share link opened with bad/long params | Parsed defensively; invalid flags dropped with notice; pattern over 2,000 chars rejected |
| Flag `d` or `v` on an older browser | Toggle disabled with the minimum browser version; link flags that are unsupported are dropped with a notice |
| Test text pasted from logs with personal data | Stays in memory; not in URL, not saved unless "Save test text too" is ticked; footer says "Local, not uploaded" |
| Mobile keyboard autocorrect/smart quotes in the pattern field | Field sets `autocapitalize=off`, `autocorrect=off`, `spellcheck=false`; curly quotes pasted are flagged |

## 8. Limits, performance, privacy
- Typical pattern on 10 KB text updates in under 50 ms. Default timeout 2 s (range 0.5 to 10 s). Test text soft limit 1 MB, hard 10 MB.
- Network: none with user content. Cheatsheet is bundled.
- Stored locally: flags/timeout preference, saved examples (pattern, flags, optional text the user chooses to save). Test text is not persisted unless saved explicitly.

## 9. Accessibility and mobile
- Pattern field, flags (toggle buttons with `aria-pressed`) and tabs are keyboard reachable. Matches announced via `aria-live="polite"` ("5 matches"). Highlights have a text list alternative (Matches tab).
- Cheatsheet entries are buttons; insertion announced. Shortcuts: `Ctrl/Cmd+Enter` run, `Ctrl/Cmd+/` toggle cheatsheet.
- Mobile: test text and results become tabs; cheatsheet in a bottom `Sheet`; large flag buttons (44 px); symbol row above the keyboard (`\ ( ) [ ] { } ^ $ . * + ? |`).

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] Typing a valid pattern highlights matches within 200 ms for a 10 KB text.
- [ ] `(a+)+$` against 40 `a`s plus `b` does not freeze the page; the timeout message appears and Cancel works.
- [ ] `a*` on `baaac` terminates and lists empty matches correctly.
- [ ] With `u`, `😀` matches `.` as one match; without `u`, a hint appears.
- [ ] Named groups show in the Groups table; `$<name>` works in Replace preview.
- [ ] Explain tab describes every token in `^(?<y>\d{4})-(?<m>\d{2})$`.
- [ ] Share link restores pattern and flags and never contains test text or replacement text.
- [ ] Highlighting a 1 MB test text keeps main-thread tasks under 100 ms (only the visible window is decorated).
- [ ] Unsupported `v` flag or lookbehind produces a clear message, not a crash.
- [ ] No network request contains pattern or text.

## 12. Future ideas and open questions
- Flavor selector (PCRE2, Python `re`, .NET, Java, Go RE2) via WASM engines; RE2-style linear-time engine option; generate regex from examples; unit-test list of should-match/should-not-match strings; export to code in other languages.
- Open: ship a bundled explainer parser or a library?
