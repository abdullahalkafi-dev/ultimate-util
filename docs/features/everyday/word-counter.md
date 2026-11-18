---
id: F-027
slug: word-counter
title: Word, Character & Reading Time Counter
category: everyday
tier: client
priority: P0
status: planned
depends_on: []
---

# Word, Character & Reading Time Counter

## 1. Summary
Paste or type text and see live counts of words, characters, sentences, paragraphs and lines, plus reading and speaking time, keyword density, readability, and platform limits. Counting is Unicode-correct across scripts. Text is never uploaded or saved unless the user turns on a local draft.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Student | Essay must be 1,500 words, no more than 1,650 | Live count with a target bar and over/under indicator |
| Social media manager | Post for X (280), SMS, and a meta description | Presets with remaining characters and SMS segment count |
| SEO writer | Checks keyword use in a draft | Frequency and density of words and 2-3 word phrases, stopwords hidden |
| Speaker | Needs a 5-minute talk | Speaking time at chosen WPM, word target for the time |
| Bengali or Arabic writer (non-obvious) | Counts words in unspaced or non-Latin scripts | Correct counts and graphemes, not Latin-only guesses |

## 3. User flow
1. Empty state: large text area with placeholder, "Paste text", **Open file**, **Try an example**; all counters show 0.
2. Type or paste: stats bar updates live. Large text (over 100k chars) shows a small "Counting..." indicator and updates after a pause.
3. Stats panel (right on desktop, below on mobile): primary counts; time estimates; limits presets; keywords; readability. Sections are collapsible via `Tabs` or accordion.
4. Select part of the text: panel shows "Selection: 120 words, 640 chars" next to the totals.
5. Optional: set a goal (min/max words or characters); progress bar fills and turns warning at over limit (icon + text).
6. Done state: Copy stats as text/CSV; **Clear** (with `ConfirmDialog` when text exceeds a few lines); optional "Remember my draft on this device" toggle (off by default).

## 4. Inputs and outputs
- **Inputs:** typed or pasted text (soft limit 1,000,000 chars; hard limit about 5,000,000); `.txt` and `.md` files (soft 20 MB); `.docx` text extraction through the F-001 parser (future); settings: WPM (reading default 238, speaking 130, verify sources), language, stopword list, goal.
- **Outputs:** copyable summary (words, characters, etc.), keyword table CSV, copy/paste cleaned text options (trim, collapse spaces). No file output besides CSV/TXT download via `DownloadButton`.

## 5. Components and tech
- **UI (shared):** `ToolShell`, `DropZone`, `SplitPane`, `Tabs`, `SettingsPanel`, `Slider`/`NumberField`, `SegmentedControl`, `CopyButton`, `DownloadButton`, `ConfirmDialog`, `Toast`, `ErrorBanner`, `EmptyState`, `HelpPopover`, `ProgressBar`.
- **New:** `StatTile` (label, value, tooltip with definition), `GoalBar`, `KeywordTable` (sortable, n-gram switch), `LimitPresetList`.
- **Tech:** `Intl.Segmenter` (word, sentence, grapheme granularity) with native feature detection; fallback regex segmenter for older browsers with a notice (CJK/Thai counts become approximate). Readability formulas implemented locally (Flesch Reading Ease, Flesch-Kincaid grade, Gunning Fog, SMOG, Coleman-Liau, ARI; English syllable heuristic). Stopword lists bundled for major languages (verify sources/licences; e.g. ISO stopwords sets).
- **Where it runs:** small text on main thread; above about 100k chars, segmentation in a Web Worker with chunking and cancel-on-new-input.

## 6. Behavior rules
- **Words:** `Intl.Segmenter` with `isWordLike`; punctuation-only and emoji-only segments are not words. Hyphenated "well-known" counts as one word; contractions count as one. Numbers count as words. URLs and emails count as one word each. `Intl.Segmenter` alone splits hyphenated words and URLs into pieces (UAX #29), so a small pre-pass merges them (verify per engine).
- **Characters:** two counts, "with spaces" and "without spaces" (whitespace = Unicode White_Space). Counted in **grapheme clusters** (family emoji = 1, "e" + combining accent = 1). Also show UTF-16 length and UTF-8 bytes in the detail view for developers.
- **CJK/Thai/Khmer/Lao without spaces:** words come from the segmenter dictionary; display note "Word count for this script is an estimate". Optional "Count CJK characters as words" toggle (common for Chinese and Japanese limits).
- **Sentences:** `Intl.Segmenter` sentence granularity; abbreviations ("Dr.", "e.g.") handled by the engine, not guaranteed; Bengali danda "।" and Arabic "؟" should be recognized (verify in each engine; add tests).
- **Paragraphs:** blocks separated by one or more blank lines; **lines:** `\n`, `\r\n`, `\r` normalized. Empty paragraphs are not counted.
- **Reading time** = words / WPM, rounded up to the nearest 10 seconds under 1 minute, otherwise minutes + seconds. Speaking time same with speaking WPM. Images/code not considered. For CJK, use characters per minute (default about 500, verify).
- **Keyword density** = occurrences / total words. Stopwords hidden by default per detected or selected language; n-gram selector 1, 2, 3 words; minimum count 2; case-insensitive using locale-aware lowercasing (Turkish dotless i uses the selected language).
- **Longest words** list top 10 (grapheme length). **Readability** only for English: other detected languages show "Readability scores are English-only" instead of numbers.
- **Presets:** X/Twitter 280 (weighted counting: URLs count as 23, CJK count as 2, verify current rules), SMS: GSM-7 160/153 per segment vs UCS-2 70/67; shows encoding and segment count, flags the characters forcing UCS-2 and extension characters (`^{}\[]~|` and euro count as 2 in GSM-7). Meta title about 60 characters (about 580 px, verify), meta description about 155 to 160 characters; Instagram caption 2,200; others configurable (verify limits at build time).
- **Selection-only count** uses the same engine on the selected range.
- Live update debounced 150 ms; under 20k chars updates on every input event.
- Text is processed in memory. Never sent, never in the URL. Draft saving (IndexedDB only; localStorage's roughly 5 MB quota is too small for the 5 MB cap) only if the toggle is on, with visible "Saved on this device" and a **Clear draft** button.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Empty or whitespace-only text | All zero; no division by zero in density/readability; "Add text" hint |
| 1,000,000-character paste | UI stays responsive (input never blocks); worker counts in chunks; stats update within 2 s; progress shown |
| 5,000,000+ characters | Warning and truncation choice: count first N chars or cancel; never freeze the tab |
| Emoji with ZWJ, flags, skin tones | 1 grapheme each; byte and UTF-16 lengths shown in details |
| Combining marks, Devanagari/Bengali conjuncts | Grapheme cluster counts match user-perceived characters |
| Chinese/Japanese/Thai without spaces | Segmenter-based words with "estimate" note; CJK-character toggle |
| Arabic/Hebrew RTL, mixed with English and numbers | Counting is order-independent; text area `dir="auto"`; display of numbers stays LTR |
| Arabic tatweel, zero-width joiners/non-joiners, soft hyphen | Not counted as characters in the "visible" count; counted in raw length (documented) |
| Hyphens, apostrophes, slashes ("and/or", "don't") | Rules as above; documented in help |
| Browser without `Intl.Segmenter` (older Firefox/Safari) | Regex fallback with visible notice; counts for spaced languages still fine |
| Tabs, non-breaking spaces, mixed line endings | Treated as whitespace/line breaks; normalized |
| Text with HTML or Markdown syntax | Counted as typed by default; toggle "Ignore Markdown/HTML tags" strips syntax before counting |
| Pasted rich text (from Word/web) | Pasted as plain text; formatting dropped, with note |
| Open file not text (binary, PDF) | Magic-byte check; error suggesting the right tool; `.docx` v1 rejects with "coming later" |
| File with wrong encoding (UTF-16, Latin-1) | BOM detect, UTF-8/UTF-16 supported, else show decode warning and offer encoding select |
| Language wrongly detected for stopwords/readability | Manual language selector overrides |
| User changes WPM to 0 or negative | Field validation; clamp to 50 to 1,000 |
| Close tab with text and draft off | No prompt; text lost by design; help text says so. With draft on, restored next visit |
| localStorage/IndexedDB blocked | Toggle disabled with message; counter works |
| Offline | Fully works; segmenter, stopwords and readability code are bundled |
| Paste button denied or unsupported | `clipboard.readText` needs a user gesture and may prompt (Firefox/Safari show a paste prompt; verify); on failure the user pastes with Ctrl/Cmd+V |
| Text selected across paragraphs | Selection stats computed on the exact range |
| SMS with emoji | Switches to UCS-2; shows segment math and which characters caused it |

## 8. Limits, performance, privacy
- Typing latency unaffected up to 100k chars; 1M chars analyzed in under 2 s on a mid-range laptop (worker, chunked). Keyword n-gram analysis capped to the top 1,000 terms to bound memory.
- Network: none for text. Stopword lists and fallback code are bundled.
- Stored locally: settings; optional draft (off by default, cap 5 MB, Clear button).

## 9. Accessibility and mobile
- Text area labeled; stats in a region with `aria-live="polite"` throttled to about every 2 s and on pause, so screen readers are not flooded. Goal status uses icon + text. Keyboard path from text area to stats and presets; `?` opens help.
- Mobile: text area on top with a sticky compact stats bar (words, characters, reading time); full stats in a `Sheet`. Paste button for clipboard permission-friendly pasting.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] "Hello, world!" gives 2 words, 13 characters, 12 without spaces, 1 sentence, 1 paragraph, 1 line.
- [ ] A family emoji counts as 1 character; "e" + U+0301 counts as 1 character.
- [ ] A Thai or Chinese sentence without spaces returns a plausible word count and shows the estimate note.
- [ ] Pasting 1,000,000 characters never freezes input (no frame over 100 ms while typing after paste) and finishes counting in under 2 s.
- [ ] Reading time at 238 WPM for 2,380 words is 10 minutes; changing WPM updates it instantly.
- [ ] SMS preset reports GSM-7 160/153 and UCS-2 70/67 correctly and lists the characters forcing UCS-2.
- [ ] Readability panel shows scores for English and a clear English-only message for other languages.
- [ ] No network request includes text; draft storage is off by default and removable.

## 12. Future ideas and open questions
- `.docx` and `.pdf` text open (via F-001 parser and F-003), compare two drafts (diff counts), per-paragraph stats, writing-goal streaks, find-and-replace/case converter (belongs to a separate text-utils tool), more languages for readability.
- Open: default reading WPM (238 vs 200)? Show X weighted counting or plain characters by default? Which stopword list sources to adopt (licence check)?
