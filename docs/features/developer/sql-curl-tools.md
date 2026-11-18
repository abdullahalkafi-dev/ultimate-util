---
id: F-023
slug: sql-curl-tools
title: SQL Formatter & API Webhook/cURL Inspector
category: developer
tier: client
priority: P1
status: planned
depends_on: [F-018]
---

# SQL Formatter & API Webhook/cURL Inspector

## 1. Summary
Two developer tools on one page. **SQL:** beautify or minify queries with dialect-aware formatting. **cURL/HTTP:** paste a cURL command or raw HTTP request, see it as a clean header table, and get ready-to-use code (fetch, axios, Python requests, Node). It parses text only. It never sends a request.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Analyst | Gets a 200-line one-line query from an ORM log | Indented, upper-case keywords, comments kept |
| Frontend dev | Copies "Copy as cURL" from browser DevTools | `fetch` or axios snippet with headers and body |
| Support engineer | Customer pastes a failing webhook request | Header table, parsed JSON body, secrets redacted for the ticket |
| Backend dev | Windows `cmd` cURL with `^` line breaks | Correct parse, snippet for Python `requests` |
| DBA (non-obvious) | Needs a compact query for a config file | Minified SQL with comments stripped on request, strings untouched |

## 3. User flow
1. Empty state: `Tabs` **SQL** and **cURL / HTTP**, each with an input `CodeEditor` and **Try an example**. The cURL tab shows the notice "This tool only reads the text. It does not send requests."
2. **SQL:** pick dialect (Standard SQL, PostgreSQL, MySQL, MariaDB, SQLite, SQL Server (T-SQL), Oracle PL/SQL, BigQuery, Snowflake, Redshift, Spark, others per library, verify). Options: keyword case (upper/lower/preserve), indent (2/4/tab), max line width, comma position, `IN` list wrapping. Actions: **Format**, **Minify**. Live output in `SplitPane`.
3. **cURL/HTTP:** paste input. Auto-detects cURL (`curl ...`) vs raw HTTP (`POST /path HTTP/1.1` plus headers). Output `Tabs`: **Summary** (method, URL, query params, auth type), **Headers** (table), **Body** (pretty-printed if JSON, form fields if urlencoded/multipart), **Code** (language `SegmentedControl`: fetch, axios, Python requests, Node `https`).
4. **Redact secrets** toggle: masks Authorization, Cookie, Set-Cookie, `X-API-Key`-like headers, `-u user:pass`, tokens in query strings and common body fields. Applies to every view and copy.
5. Done state: `CopyButton` and `DownloadButton` (`query-formatted.sql`, `request.js`). **Clear** wipes input.

```
[ SQL | cURL / HTTP ]
cURL input ........................   Summary | Headers | Body | Code (fetch v)
curl -X POST 'https://api...' -H ..   [x] Redact secrets      [Copy] [Download]
Not sent. This tool never makes the request.
```

## 4. Inputs and outputs
- **Inputs:** SQL text or `.sql` file (soft 5 MB); cURL command (multi-line, with `\`, `^` or backtick continuations), raw HTTP/1.x request text, or a header block only.
- **Outputs:** formatted/minified SQL; parsed request model; code snippets; header table (copy as JSON, as `Key: value` lines); redacted versions of all.

## 5. Components and tech
- **UI:** `ToolShell`, `Tabs`, `CodeEditor`, `CodeOutput`, `SplitPane`, `SegmentedControl`, `SettingsPanel`, `CopyButton`, `DownloadButton`, `DropZone`, `ErrorBanner`, `Toast`, `HelpPopover`, `EmptyState`. New: `HeaderTable` (sortable, per-row copy and redact marker), `RedactToggle` (shared with future request tools), `PrivacyNotice`.
- **Libraries:** `sql-formatter` (MIT, per research notes; verify dialect list and version). cURL tokenizer/parser: own shell-style tokenizer (verify existing parsers such as `curlconverter`, MIT, for coverage and size before writing a new one). Body pretty-print reuses the JSON logic of F-018.
- **Where it runs:** main thread for typical inputs; Worker for SQL over about 1 MB.

## 6. Behavior rules
- **SQL formatting never changes meaning:** string literals, quoted identifiers, numbers and comments are preserved byte-for-byte. Only whitespace and (optionally) keyword case change. This is tested by comparing the token stream of input and output ignoring whitespace and keyword case; a mismatch shows "Formatting changed the query, showing original". Comments (`--`, `/* */`, and MySQL `#`) are kept in place. Dialect-specific tokens (`::` in PostgreSQL, `[bracketed]` identifiers in T-SQL, backticks in MySQL/BigQuery, `$$` dollar quotes) are handled by dialect selection; wrong dialect gives a hint when parsing fails.
- Multiple statements are separated by `;` and formatted separately with blank lines between them.
- Long `IN (...)` lists: option "Wrap after N items" (default 10 per line) so lists of thousands of IDs stay readable.
- Minify: a `--` or `#` comment runs to the end of the line, so joining lines would comment out the rest of the query. When comments are kept, line comments are rewritten as `/* ... */` (or a newline is kept after them if the dialect has no block comments). Minify collapses whitespace and removes comments only if "Strip comments" is on (default on for minify; MySQL `/*! ... */` conditional comments and optimizer hints `/*+ ... */` are kept). Never alters whitespace inside strings.
- Format is idempotent: formatting formatted output gives the same text.
- Formatting errors do not block output: unrecognized syntax is passed through unchanged and flagged "Formatted with warnings".
- **cURL parsing:** handles `-X/--request`, `-H/--header`, `-d/--data`, `--data-raw`, `--data-binary`, `--data-urlencode`, `-F/--form` (multipart, `@file` references are shown as file placeholders and never read), `--json` (curl 7.82+: sets `Content-Type` and `Accept` to JSON), `-u/--user` (becomes Basic Authorization header, decoded for display), `--compressed` (adds `Accept-Encoding` note), `-G/--get` (moves data to query string), `-k/--insecure` (flagged), `-L`, `-A`, `-e`, `-b/--cookie`, `--url`. Unknown flags are listed under "Ignored options". Implicit method rules: `-d`/`-F` mean POST unless `-G`; `-I` means HEAD. `-d` without an explicit header adds `Content-Type: application/x-www-form-urlencoded`; `-F` adds `multipart/form-data` with a generated boundary. `-d @file` strips CR/LF from the file while `--data-binary @file` does not (noted when shown). `--data-raw` treats `@` literally.
- Quoting styles: POSIX single quotes, double quotes with escapes, `$'...'` ANSI-C quoting, Windows cmd (`^` continuation, `^"` escaping, `\"` inside double quotes), and PowerShell backtick continuation. A "Detected shell" label appears; the user can override.
- Raw HTTP: request line, headers, blank line, body; `Host` header + path builds the URL (scheme guessed `https`, editable). Chunked bodies are shown as received, not decoded.
- Content-type aware body view: JSON pretty-print, form fields table, multipart parts list, binary placeholder with size.
- Snippets keep headers and body exactly; JSON bodies in fetch/axios use object literals only when conversion is lossless, otherwise a raw string. For browser `fetch`/axios snippets, forbidden header names (`Host`, `Content-Length`, `Accept-Encoding`, `Cookie`, `Origin`, `Referer`, `User-Agent` in most browsers; verify list) are omitted with a comment; Node and Python snippets keep them.
- **Redaction** replaces values with `[REDACTED]`, keeps header names, and states what was masked ("3 values redacted"). It covers `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`, `X-API-Key`/`X-Auth-Token`-style headers, `-u user:pass`, `--oauth2-bearer`, URL userinfo (`https://user:pass@host`), query parameters named like `token`, `key`, `secret`, `signature`, `access_token`, and body fields named `password`, `secret`, `token` (JSON and form). The toggle is **on by default** (safe default; owner may change, see open questions), applies to every view, copy and download, and its state is remembered as a setting. A banner appears when secrets are detected in the input and the toggle is off.
- **Never executes requests.** No `fetch`, XHR, beacon, image ping or link prefetch to any URL from the input. URLs are shown as text and not auto-linked.
- Input text is not persisted. Only settings (dialect, options, language) are saved.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Empty input | Empty state with example; no error |
| Huge SQL (5 MB+) / 100k-item IN list | Worker with progress and Cancel; warn above soft limit |
| Invalid or dialect-mismatched SQL | Output with warning, error position if known, dialect hint |
| SQL with unterminated string or comment | Reported at position; remaining text unformatted |
| Procedural blocks (`BEGIN...END`, `DELIMITER`, `$$`) | Best effort; flagged as limited support (verify per dialect) |
| Unicode/RTL identifiers and strings, emoji | Preserved exactly; width calculations use code points |
| `--` inside a string or `#` in PostgreSQL | Not treated as comments; dialect-aware |
| cURL with `\` and `^` line continuations (Windows) | Joined correctly; `^"` unescaped |
| Single quotes containing apostrophes `'it'\''s'` | Parsed as one value |
| `-d` repeated multiple times | Joined with `&` as cURL does; shown with a note |
| `-d @file`, `-F file=@photo.jpg`, `--data-binary @-` | Shown as placeholders with a note; files are never read or uploaded |
| `-u user:pass` or `Authorization: Basic ...` | Decoded for display; redacted when toggle is on |
| `--compressed`, `-k`, `-L` | Reflected in a notes list; `-k` produces a security warning |
| Variable expansion (`$TOKEN`, `%TOKEN%`) | Left literal; marked as "environment variable" in the table |
| Multiple URLs or `--next` | First request parsed; message lists the others; option to pick |
| Missing URL or method without URL | Error "No URL found"; shows what was parsed |
| Raw HTTP with CRLF vs LF, missing blank line, folded headers | Normalized; warning for obsolete folding |
| Duplicate headers (`Set-Cookie`, `Accept`) | All shown; snippet uses arrays/multiple entries where supported |
| Binary body or very large base64 body | Truncated preview with size; snippet keeps placeholder |
| Cookies with secrets, JWTs in headers | Redacted; a JWT is recognized and offers "Copy token to paste into F-019" (the link to F-019 never carries the token, since tokens must not go into URLs) |
| Unterminated quote in cURL, or a non-cURL command (PowerShell `Invoke-WebRequest`, `wget`, HTTPie) | Error with position, or "Not a cURL command"; nothing is guessed |
| HTTP/2 pseudo-headers pasted from DevTools (`:method`, `:path`, `:authority`) | Mapped to method, path and Host, then dropped from the header table |
| `-d @file` content cannot be read (files are never read) | Placeholder `<contents of file>`; note about CR/LF stripping (see rules) |
| SQL minify with `--` comments kept | Converted to block comments so the query stays valid (see rules) |
| Unsupported browser features | None needed beyond standard JS; fallback copy via text selection |
| Cancel on SQL formatting | Worker terminated; input kept |

## 8. Limits, performance, privacy
- SQL: under 200 ms for 100 KB; Worker above 1 MB. cURL: instant.
- Network: none. The tool does not contact hosts in pasted commands. CSP forbids third-party connections from this page.
- Pasted requests often contain secrets: input is held in memory only, never in URL, history, localStorage or analytics. Redaction is a convenience, and the UI says "Check the output before sharing".

## 9. Accessibility and mobile
- Tabs and language selector are keyboard operable; header table has proper `th` scope and sortable controls with `aria-sort`. Redaction count announced via `aria-live="polite"`. Redacted values are text, not only color.
- Mobile: tabs stack, header table becomes cards, code snippets scroll horizontally with wrap toggle, options in a `Sheet`.

## 10. Data
N/A, client-only.

## 11. Acceptance criteria
- [ ] Formatting twice yields identical output; strings and comments are unchanged.
- [ ] Dialect switch to T-SQL formats `[brackets]` and `TOP`; PostgreSQL formats `::` casts.
- [ ] A DevTools "Copy as cURL (cmd)" command with `^` continuations parses to the correct method, URL, headers and body.
- [ ] `-u`, `-F`, `-G`, `--data-raw`, `--data-binary`, `--compressed` are each handled with tested fixtures.
- [ ] Redact removes Authorization, Cookie and `-u` secrets from the table, snippets and copied text.
- [ ] Generated fetch and Python snippets run unchanged against a test server in CI.
- [ ] No outbound request is made to any URL found in input (verified in test).
- [ ] 5 MB SQL formats with no main-thread task over 100 ms and Cancel stops it within 1 s.
- [ ] Minified SQL that keeps a `-- comment` still executes equivalently (comment not swallowing following lines).
- [ ] A fixture query's token stream (ignoring whitespace and keyword case) is identical before and after formatting for every supported dialect.
- [ ] Redaction defaults to on, and a fresh session shows redacted output.

## 12. Future ideas and open questions
- More snippet targets (Go, PHP, Java, C#, Rust, HTTPie), OpenAPI/Postman import, webhook signature checker (HMAC, link to F-021), SQL to ORM hints, explain-plan prettifier, SQL linting.
- Open: use `curlconverter` or an in-house parser? Should the code snippet tab offer a "run it yourself" copyable one-liner? Redact default is on in this spec; confirm.
