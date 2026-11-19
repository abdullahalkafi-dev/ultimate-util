# F-020 — Regex Tester

Status: shipped (sandboxed worker matching, capture groups, replacement preview, explainer, and shareable hash).

## Implementation notes
- Executes matches inside a timeout-guarded Web Worker (`useRegexRunner` + `match.worker.ts`, user-configurable 0.5–10s timeout) with cancellation and browser-flag feature checks (`v`, `d`).
- Highlights matches inside a window (`HIGHLIGHT_WINDOW = 100,000` chars), inspects capture groups, previews substitutions, generates a plain-English token explanation (`explain.ts`), surfaces ReDoS/style hints (`hints.ts`), and exports JS literal/constructor snippets.
- Shareable URL hash encodes only `pattern` and `flags` (`buildShareHash`), never sensitive test input text.

## Known limitations
- Uses the browser's JavaScript `RegExp` engine (ECMAScript flavor) rather than PCRE/Python-only lookbehind/possessive extensions outside JS support.
- Very large subjects cap match rendering (`MAX_MATCHES`) and highlight slicing (`HIGHLIGHT_WINDOW`) to keep DOM rendering responsive.
