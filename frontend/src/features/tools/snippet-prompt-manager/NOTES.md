# F-030 — Snippet & Prompt Manager

Status: shipped (authenticated cloud snippet/prompt CRUD, fuzzy search, `{{var}}` fill modal, secret detection, and import/export).

## Implementation notes
- Syncs up to `QUOTA = 1000` code snippets and AI prompts via `resources.api`, with local language auto-detection/syntax highlighting (`highlight.ts`), duplicate detection (`findDuplicate`), typo-tolerant search (`editDistance`), and 30-day `.trash/` folder cleanup.
- Parses `{{name}}`, `{{name|default}}`, `{{name:a,b,c}}`, and escaped `\{{...}}` variables for a fill-and-copy modal, and warns before saving detected API keys/tokens (`detectSecret`).

## Known limitations
- Requires a signed-in account and running backend API (`QUOTA = 1000`, `MAX_BODY_BYTES = 100,000`).
- Prompts/snippets are stored as structured server resources (not client-encrypted like F-028/F-029) per specification.
