---
id: F-030
slug: snippet-prompt-manager
title: Snippet & Prompt Manager
category: cloud
tier: cloud
priority: P1
status: planned
depends_on: [_shared/cloud-conventions, _shared/components, P-002, P-005]
---

# Snippet & Prompt Manager

## 1. Summary
A personal library for code snippets, terminal commands and AI prompts, synced across devices. Prompts can have `{{variables}}` that you fill in through a small form before copying. Stored private (class B); a warning appears if a snippet looks like it contains a secret.

## 2. Use cases
| Who | Situation | What they get |
|---|---|---|
| Developer | Retypes the same `docker`/`git` commands | One-click copy, searchable by fuzzy match |
| AI power user | Has 30 prompt templates | Variables form (`{{tone}}`, `{{text}}`), copy the finished prompt |
| Student | Collects code examples by topic | Collections, tags, syntax highlighting |
| Team lead | Moves a prompt library between laptop and work PC | Export JSON, import on the other machine |
| Anyone | Just copied something useful | Quick-add from clipboard in two clicks |

## 3. User flow
1. Guest: sign-in gate with a preview list of sample snippets and the explanation that snippets are saved to the account (not end-to-end encrypted; use F-029 for secrets).
2. Empty state: `EmptyState` with **New snippet**, **Add from clipboard**, **Import JSON/Markdown**, and three starter examples.
3. Main layout: sidebar (All, Favorites, Collections, Tags, Trash), list with fuzzy search, detail pane with highlighted code. Command palette (P-002) offers "Snippets: Search" and "Snippets: New from clipboard".
4. **Add:** title, type (code / command / prompt), language (auto-detected, editable), description, tags, collection, body. Save.
5. **Use:** open item, **Copy**. For a prompt with `{{variables}}` a form appears (one field per variable, remembered last values optional), live preview, **Copy result**.
6. Done: toast "Copied"; usage count and last-used time update locally.

```
[Search...]  [+ New] [Paste] [Import]        Local-first · Synced
Collections | git: undo last commit      [fav] [Copy] [Edit]
 All 214    | ```bash git reset --soft HEAD~1```
 Prompts 31 | tags: git  lang: bash   v3
```

## 4. Inputs and outputs
- **Inputs:** typed or pasted text up to 100 KB per snippet (soft warning at 50 KB); JSON import (own format), Markdown import (fenced code blocks, headings become titles; verify mapping rules), plain text from clipboard.
- **Outputs:** copied text (raw or variable-filled); export JSON (full, with versions optional), export Markdown (one file or ZIP per collection), single snippet download with proper extension.

## 5. Components and tech
- **Reused:** `ToolShell`, `AuthBadge`, `SyncStatus`, `UsageMeter`, `CodeEditor`, `CodeOutput`, `CopyButton`, `DropZone`, `DownloadButton`, `DiffView`, `Tabs`, `ConfirmDialog`, `Toast`, `ErrorBanner`, `EmptyState`, `ShortcutHint`, `PermissionPrompt` (clipboard read).
- **New:** `SnippetList`, `VariableFillForm`, `TagInput`, `CollectionTree`, `SecretWarningBar`, `ImportMapper`.
- **Libraries:** CodeMirror 6 languages or `highlight.js` (BSD-3, verify size, load per language), `Fuse.js` or `MiniSearch` (verify), `fflate`. Language guess: `highlight.js` auto-detect, low confidence labelled "guessed".
- **Runs:** index building in a worker; UI on main thread.

## 6. Behavior rules
- **Command palette (P-002):** class B, so titles and tags may be indexed, from the local cache only (no server call per keystroke). Bodies are not passed to the palette. Opening or copying happens inside this tool.
- Fuzzy search runs on a client-side index built from the local cache (title, tags, description, body first 2 KB, language); typo tolerant; updates as you type (150 ms debounce); ranks title above body; favorites and recent used boost.
- Variables syntax `{{name}}`, optional default `{{name|default}}`, optional choices `{{tone:formal,casual}}` (verify syntax with owner). Variable names are `[A-Za-z_][A-Za-z0-9_ ]*`. A literal `{{` is escaped as `\{{`. Same name used twice is filled once.
- Copy output is exactly the stored text with substitution; no trailing newline added; terminal commands copy as a single line unless multi-line.
- Secret detection (local only): patterns for AWS keys, private key blocks, `sk-`/`ghp_` style tokens, long high-entropy strings, `password=`. Shows `SecretWarningBar` ("This looks like a secret. Snippets are not end-to-end encrypted. Save in Secure Notes instead?") with **Move to Secure Notes**, **Save anyway**. Never blocks, never sent anywhere. A future per-item encryption toggle is planned (class A) and is not in v1. **Move to Secure Notes** needs the F-029 vault to be set up and unlocked (otherwise it starts setup), creates the note first, then deletes the snippet and offers "Delete permanently now", because a trashed snippet stays server-readable for 30 days and so do its versions.
- Duplicate detection: identical body hash (normalized whitespace) shows "Similar snippet exists: open it / save anyway".
- Versions: keep last 10 versions per snippet, snapshot on save when the body changed; restore through `DiffView`.
- Quick-add from clipboard requires a click (Clipboard API user gesture) and a focused page; `readText` may prompt (Firefox and Safari show a paste prompt; verify). If denied, a paste box is offered.
- The 100 KB per-snippet limit is a spec-level value; cloud-conventions sets no snippet size (owner to confirm).
- Favorites pin to the top; collections are one level deep (folders) and an item belongs to at most one collection but many tags.
- Import: preview with counts, duplicates skipped by default, never overwrites existing items without choice.
- Trash 30 days; permanent delete needs confirmation.

## 7. Edge cases
| Case | Expected behavior |
|---|---|
| Empty body or title | Title defaults to first line (60 chars); empty body blocked with message |
| 1,000 item cap reached | Add blocked; `UsageMeter` warning at 800; offer export and trash purge |
| Snippet over 100 KB | Rejected with suggestion to split or use a file; no truncation |
| Prompt with 40 variables | Form scrolls; Tab order follows first appearance; "Fill from last time" button |
| Variable name collides with text such as `{{ }}` in code (Go templates, Handlebars) | Per-item toggle "Treat braces as literal"; detection warns when code language is template-based |
| Same snippet edited on two devices | Conflict copy labelled with device and time; both preserved |
| Offline | Full read, edit, copy; queued sync; `SyncStatus` shows pending |
| Token expiry or sign-out | Edits stay queued; sign-out warns about unsynced items then wipes the local cache |
| Multi-tab | `BroadcastChannel` refreshes lists; open editor in second tab shows "Changed elsewhere" with reload or keep mine |
| Unicode, emoji, RTL prompts (Arabic, Bengali) | Stored UTF-8; highlighting falls back to plain; search normalizes diacritics; RTL text `dir="auto"` |
| Tabs vs spaces, CRLF | Preserved exactly; copy keeps original line endings; display normalizes |
| Import malformed JSON or unknown version | Error with line hint; partial import offered only for valid items |
| Clipboard permission denied | Use manual paste box |
| Language auto-detect wrong | User override stored; badge "guessed" removed once set |
| Secret saved anyway | Item gets a small warning icon; included in exports by default, with a notice that the file is plain text and holds a flagged secret |
| Passphrase lost | Not applicable: class B has no vault passphrase. Only Moved-to-Secure-Notes items depend on the F-029 vault |
| Session expiry while editing | Edits stay in the local queue; "Sign in again to sync"; nothing lost |
| Account deleted | Server data purged within 30 days; local cache cleared |

## 8. Limits, performance, privacy
- 1,000 items, 100 KB each; search results under 50 ms for 1,000 items; list virtualized.
- Network: auth and sync only. No content sent to third parties; no AI calls in v1.
- Privacy: class B means the service operator could technically read items, protected by row-level access rules and provider at-rest encryption. This is stated on the gate and in settings.
- Stored locally: cache in IndexedDB, plaintext (device is trusted; cleared on sign-out).

## 9. Accessibility and mobile
- Keyboard: `/` focuses search, arrows move in the list, Enter opens, Ctrl/Cmd+Enter copies, `N` new. Highlighted code has text-equivalent contrast of at least 4.5:1 in both themes.
- Variable form fields have labels derived from variable names; copy result announced via `aria-live`.
- Mobile: list then detail screens, bottom-sheet actions, sticky Copy button, paste-first quick add.

## 10. Data
- **Class B** (server-readable, owner-only access). Optional per-item encryption (class A) is a future toggle.
- **Entities:**
  - `Snippet`: `id`, `ownerId`, `title`, `kind` (code/command/prompt), `language`, `body`, `description`, `tags[]`, `collectionId`, `favorite`, `variablesMeta`, `bodyHash`, `useCount`, `lastUsedAt`, `createdAt`, `updatedAt`, `deviceId`, `version`, `deleted`.
  - `SnippetVersion`: `snippetId`, `body`, `title`, `savedAt` (max 10).
  - `Collection`: `id`, `name`, `sortIndex`, `updatedAt`.
- **Sync:** local-first; last-write-wins per item; edits within the sync window on two devices yield a conflict copy. `useCount` and `lastUsedAt` merge by max.
- **Quotas:** 1,000 snippets, 100 KB each, 10 versions; `UsageMeter` at 80%.
- **Offline:** complete. **Export:** JSON and Markdown at any time; "Export my data" includes them. **Delete:** Trash 30 days; account deletion purges within 30 days.
- **Signed-out gate:** guests see the preview only, nothing is saved. **Sign-out:** local cache wiped. **Session expiry:** local use continues, sync paused. **Account deletion:** local cache cleared at next check.

## 11. Acceptance criteria
- [ ] A prompt with `{{topic}}` and `{{tone}}` shows a two-field form and copies the substituted text exactly.
- [ ] Fuzzy search finds "dokcer" when the title is "docker run" within 50 ms on 1,000 items.
- [ ] Pasting an AWS access key shows `SecretWarningBar` without any network request.
- [ ] Export then import on a clean account reproduces all items, tags and collections.
- [ ] Editing one snippet on two offline devices keeps both versions after sync.
- [ ] The 1,001st snippet is refused with a clear message.
- [ ] Duplicate body triggers the duplicate notice.
- [ ] Command palette (P-002) can open a snippet and copy it.
- [ ] Syntax highlighting loads only the language needed.
- [ ] After sign-out the local cache is empty.

## 12. Future ideas and open questions
- Per-item encryption, share links, team libraries, VS Code or browser extension, AI-assisted tagging, variable types (date, dropdown), snippet-to-gist export. Sharing is out of scope for v1.
- Open: final variable syntax (defaults and choices) and whether choices belong in v1. Include secrets in default exports? Higher item cap for heavy users?
