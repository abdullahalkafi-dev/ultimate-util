---
id: F-018
slug: json-yaml-xml
title: JSON / YAML / XML Formatter & Diff Checker
category: developer
tier: client
priority: P0
status: planned
depends_on: []
---

# JSON / YAML / XML Formatter & Diff Checker

## 1. Summary
Paste or open JSON, YAML or XML, then validate, beautify, minify, sort keys, convert between the three formats, browse a tree, or compare two documents side by side. Errors show the exact line and column with a plain hint. Everything runs in the browser, so API responses and config files stay private.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Backend dev | API returns a minified 2 MB JSON blob | Beautified, searchable tree, copy of a single JSON path |
| DevOps | Two Kubernetes YAML files differ after a deploy | Semantic diff that ignores key order and indentation |
| Integrator | Partner sends XML, the app wants JSON | Converted JSON with a note on how attributes were mapped |
| Support engineer | Customer config "does not load" | Error at line 14, column 3: "trailing comma, not allowed in strict JSON", with a one-click fix |
| Data dev (non-obvious) | JSON has IDs like 9007199254740993 | Big numbers shown and kept exactly, with a warning that JS `JSON.parse` would round them |

## 3. User flow
1. Empty state: `EmptyState` with a `CodeEditor`, a `DropZone` ("Drop .json, .yaml, .yml, .xml") and **Try an example**. Format is auto-detected; a `SegmentedControl` (JSON / YAML / XML) lets the user override.
2. User pastes or types. Validation runs live (debounced about 150 ms). Status line: "Valid JSON, 1,240 lines, 38 KB" or an error chip.
3. Mode `Tabs`: **Format** (beautify, minify, sort keys, indent 2/4/tab), **Tree** (collapsible, search, copy path/value), **Convert** (to JSON/YAML/XML), **Diff** (two panes).
4. Working state: files over about 5 MB parse in a Worker with `ProgressBar` and Cancel; editor stays usable.
5. Done state: output in `CodeOutput` with `CopyButton` and `DownloadButton` (`<name>-formatted.json`). Errors appear in `ErrorBanner` and as gutter markers; clicking jumps to the position.
6. Diff mode: two `CodeEditor`s inside `SplitPane`, a toggle **Semantic / Text**, then `DiffView` with next/previous change buttons.

```
[ JSON | YAML | XML ]  Format | Tree | Convert | Diff   Indent [2 v]  [Sort keys] [JSON5]
+------------------------+   +---------------------------+
| Input (CodeEditor)     |   | Output / Tree / Diff      |
+------------------------+   +---------------------------+
 Valid JSON · 38 KB · Local, not uploaded
```

## 4. Inputs and outputs
- **Inputs:** pasted text, `.json .jsonc .json5 .yaml .yml .xml .txt`. Soft warning 5 MB (switches to Worker + virtual rendering), warning at 50 MB, hard stop around 200 MB (verify memory in spike).
- **Outputs:** formatted/minified text, converted text, diff report (unified text, copyable), JSON path of a selected node. Filenames `<original>-formatted.<ext>`, `<original>-converted.<ext>`.
- Options: indent (2, 4, tab), sort keys (recursive, A to Z), strictness (JSON / JSONC / JSON5), YAML version (1.2 default, 1.1 compat), XML attribute prefix.

## 5. Components and tech
- **UI:** `ToolShell`, `CodeEditor`, `CodeOutput`, `SplitPane`, `DiffView`, `Tabs`, `SegmentedControl`, `SettingsPanel`, `DropZone`, `ProgressBar`, `ErrorBanner`, `CopyButton`, `DownloadButton`, `EmptyState`, `HelpPopover`. New: `TreeView` (virtualized, collapsible, path copy).
- **Libraries:** native `JSON.parse` for strict JSON; custom tokenizer or `json-bigint` style handling for big numbers and duplicate-key detection (verify); `json5` for JSON5/JSONC (MIT, verify); `yaml` (ISC) for YAML 1.1/1.2, anchors, multi-doc; `fast-xml-parser` (MIT) for XML, with `XMLValidator`; `jsdiff` (BSD) and CodeMirror merge (MIT) for diff. Verify sizes before shipping.
- **Where it runs:** main thread under the soft limit; Web Worker above it. Worker is terminated on Cancel.

## 6. Behavior rules
- Format detection: first non-space char `{`/`[` suggests JSON, `<` suggests XML, otherwise YAML. User override always wins.
- Numbers are parsed as text tokens first. Integers beyond 2^53 or decimals with more precision than a double are kept as written (BigInt for integers); output never rounds them silently. A badge "Large numbers preserved" explains.
- Duplicate keys: reported as a warning with both line numbers ("last one wins" in JS, but the tool keeps both in text output unless the user chooses Remove duplicates).
- Strict JSON by default. Comments or trailing commas give an error plus an offer "Parse as JSONC/JSON5"; output of a JSON5 parse is strict JSON unless "Keep JSON5" is on.
- Sort keys sorts objects only, never array order. Sorting is by Unicode code point, stated in the tooltip, implemented with an explicit comparator (the default JS `.sort()` compares UTF-16 code units, which orders emoji keys differently).
- Key order is never changed unless Sort keys is on. The parser keeps ordered entries instead of plain JS objects, because `JSON.parse` moves integer-like keys (`"10"`, `"2"`) to the front in ascending order. A `__proto__` key is kept as an ordinary key.
- Convert rules: JSON to YAML is lossless for data (strings that a YAML 1.1 parser would read as booleans or numbers, such as `"no"`, `"on"`, `"0123"`, are quoted on output). YAML to JSON fails with a clear message for non-JSON features (anchors are expanded, tags dropped with notice, multi-doc becomes an array). XML to JSON uses `@attr` for attributes and `#text` for mixed text; JSON to XML needs a single root (wrapper `<root>` offered). Each lossy step shows a **Conversion notes** list.
- YAML 1.1 vs 1.2: default 1.2 core schema (`no`, `yes`, `on` stay strings). In 1.1 mode they become booleans; a warning lists any such scalars found ("`country: no` becomes false in YAML 1.1 parsers"). Unquoted `0123` and `1e3`, dates and `~` get the same type-hint warnings.
- XML: namespaces and prefixes preserved; CDATA preserved on beautify; attribute order kept as written unless "Sort attributes" is on. DOCTYPE with external entities is **never resolved** (no file or network access); internal entity expansion is capped to prevent billion-laughs. Check the chosen parser version's entity handling (`fast-xml-parser` has had entity-expansion advisories; verify) and keep the cap in our own layer.
- Semantic diff: parses both sides, compares structure; object key order ignored, array order respected (option "Ignore array order"), numbers compared by text value. Text diff compares lines. Differences are labeled added / removed / changed with a JSON path.
- Leading BOM is stripped on input and noted; output has no BOM (option to add). Encoding assumed UTF-8; invalid bytes in a file trigger "File is not valid UTF-8" with a try-UTF-16/Latin-1 retry.
- Input text is never stored. Only settings are saved.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Empty input | Neutral status "Nothing to format", no error |
| 50 MB JSON | Warn first; parse in Worker; tree virtualized; output shown in chunks; Cancel works |
| Single huge line (minified) | Beautify streams output; editor uses line virtualization, no freeze |
| Trailing comma, single quotes, unquoted keys | Strict error at exact line:col with hint; "Fix and parse as JSON5" button |
| Comments in JSON | Error in strict mode; accepted in JSONC mode and stripped on minify |
| Duplicate keys | Warning with both lines; diff flags them |
| Integer-like keys (`{"b":1,"10":2,"2":3}`) | Output keeps input order; JS-object reordering is not applied |
| Key `__proto__` or `constructor` | Treated as plain data; no prototype pollution in the tree, diff or convert code |
| Pasted text is not JSON/YAML/XML (HTML page, log line) | Detected as YAML scalar; message "This is plain text, not a structured document" instead of a misleading YAML result |
| Number 12345678901234567890 or 1.10 | Preserved exactly; warning that JavaScript clients may round |
| `NaN`, `Infinity`, `undefined` | Invalid in JSON; error explains; JSON5 accepts NaN/Infinity |
| YAML tabs for indentation | Error "tabs are not allowed for indentation" at position |
| YAML anchors/merge keys (`<<`) | Resolved in JSON output; preserved when YAML to YAML; notes list them |
| YAML multi-document (`---`) | Documents listed in a selector; JSON output is an array |
| YAML `no`, `off`, `0o14`, `2024-01-02` | Type warnings per version setting (see rules) |
| XML with DOCTYPE and external entity (XXE) | Entity not fetched; notice "External entities are blocked"; document still parsed |
| XML entity expansion bomb | Expansion limit hit; clear error, no hang |
| XML mixed content, comments, processing instructions | Preserved in XML output; in JSON a note says order may be lost |
| XML to JSON single child vs repeated | Option "Always use arrays" to avoid shape changes |
| BOM or UTF-16 file | BOM stripped; UTF-16 detected and decoded; message shown |
| RTL / emoji / CJK / combining text in strings | Preserved byte-exact; escaping option `\uXXXX` for non-ASCII; surrogate pairs kept intact |
| Lone surrogate `\ud800` | Accepted by JSON grammar, flagged as invalid Unicode |
| Deeply nested (10,000 levels) | Stack-safe parser; depth limit with clear message |
| Diff on two huge files | Semantic diff in Worker with progress; text diff falls back to chunked mode |
| Cancel during parse | Worker terminated; input untouched; status "Cancelled" |
| Worker or JS blocked | Falls back to main thread under 5 MB; otherwise message |

## 8. Limits, performance, privacy
- Targets: 1 MB formats in under 300 ms; 20 MB in under 5 s with UI responsive.
- Network: none with user content. Libraries lazy-load (YAML, XML, diff) on first use of that format.
- Stored locally: settings only (indent, mode, strictness). Input is not persisted; shared links carry settings only.

## 9. Accessibility and mobile
- Tree is an ARIA `tree` with arrow-key navigation, expand/collapse, `Enter` to copy path. Errors use `role="alert"` and are linked to the editor position. Diff changes announced as "Change 3 of 12".
- Mobile: input and output become tabs; diff stacks vertically; tree rows 44 px; options in a `Sheet`.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] Invalid JSON reports the correct line and column and a plain-language hint.
- [ ] 9007199254740993 round-trips unchanged through format, minify and sort.
- [ ] Sort keys never reorders arrays; output is stable across runs.
- [ ] YAML `no` is a string in 1.2 mode and boolean in 1.1 mode, with a warning.
- [ ] XML with an external entity makes zero network or file requests.
- [ ] Semantic diff reports no changes for two JSON files that differ only in key order and whitespace.
- [ ] A 20 MB JSON file can be beautified in under 5 s with no main-thread task over 100 ms, and Cancel stops it within 1 s.
- [ ] `{"b":1,"10":2,"2":3}` formats with keys in the order b, 10, 2.
- [ ] Sort keys on `{"😀":1,"￿":2}` orders by code point (`￿` before `😀`).
- [ ] Every conversion that loses information shows a Conversion notes entry.
- [ ] No network request contains input text.

## 12. Future ideas and open questions
- JSON Schema validation, JSONPath/jq-style query box, TOML and CSV conversion, generate TypeScript types, JSON to CSV, YAML comment preservation (needs round-trip parser).
- Open: keep both duplicate keys in output or drop them by default? Keep BOM-less output only?
