import { snippetBodySchema, type SnippetBody } from '@uu/shared';

/** Pure logic for the Snippet & Prompt Manager. */

export const MAX_BODY_BYTES = 100_000;
export const WARN_BODY_BYTES = 50_000;
export const QUOTA = 1000;
export const TRASH_PREFIX = '.trash/';
export const TRASH_DAYS = 30;

// ---------- variables ----------
export interface Variable { name: string; default?: string; choices?: string[] }

/** `{{name}}`, `{{name|default}}`, `{{name:a,b,c}}` (choices, optional default after |). `\{{` is a literal. */
const VAR_RE = /(\\)?\{\{\s*([A-Za-z_][A-Za-z0-9_ ]*?)\s*(?::([^}|]*))?(?:\|([^}]*))?\}\}/g;

export function parseVariables(body: string): Variable[] {
  const seen = new Map<string, Variable>();
  for (const m of body.matchAll(VAR_RE)) {
    if (m[1]) continue; // escaped
    const name = m[2]!.trim();
    if (seen.has(name)) continue;
    seen.set(name, {
      name,
      default: m[4] !== undefined ? m[4] : undefined,
      choices: m[3] ? m[3].split(',').map((c) => c.trim()).filter(Boolean) : undefined,
    });
  }
  return [...seen.values()];
}

/** Exact substitution: no trailing newline added; unfilled variables use their default, else stay empty. */
export function fillVariables(body: string, values: Record<string, string>): string {
  return body.replace(VAR_RE, (full, esc: string | undefined, rawName: string, _choices: string | undefined, def: string | undefined) => {
    if (esc) return full.slice(1); // `\{{x}}` becomes literal `{{x}}`
    const name = rawName.trim();
    const v = values[name];
    return v !== undefined && v !== '' ? v : (def ?? '');
  });
}

// ---------- secrets ----------
const SECRET_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'a private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: 'an AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { label: 'an API token (sk-, ghp_, xox...)', re: /\b(?:sk|pk|rk)[-_](?:live|test|proj)?[-_]?[A-Za-z0-9]{20,}|\bgh[pousr]_[A-Za-z0-9]{30,}|\bxox[baprs]-[A-Za-z0-9-]{10,}|\bAIza[0-9A-Za-z_-]{35}/ },
  { label: 'a password assignment', re: /\b(?:password|passwd|pwd|secret|api[_-]?key|token)\s*[=:]\s*['"]?[^\s'"{}$<]{6,}/i },
  { label: 'a long random-looking string', re: /\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[a-z])(?=[A-Za-z0-9+/_-]*[A-Z])[A-Za-z0-9+/_-]{40,}={0,2}(?![A-Za-z0-9])/ },
];

/** Returns what the text looks like, or null. Runs only on the device. */
export function detectSecret(text: string): string | null {
  for (const p of SECRET_PATTERNS) if (p.re.test(text)) return p.label;
  return null;
}

// ---------- duplicates ----------
export const normalizeBody = (b: string) => b.replace(/\s+/g, ' ').trim();
export function findDuplicate<T extends { id: string; body: string }>(items: T[], body: string, excludeId?: string): T | undefined {
  const n = normalizeBody(body);
  if (!n) return undefined;
  return items.find((i) => i.id !== excludeId && normalizeBody(i.body) === n);
}

// ---------- fuzzy search ----------
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Optimal-string-alignment distance (counts a swap of two letters as one edit), capped. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

function tokenScore(token: string, text: string): number {
  if (!text) return 0;
  if (text.includes(token)) return text.startsWith(token) || text.includes(` ${token}`) ? 100 : 80;
  if (token.length < 3) return 0;
  const tol = token.length <= 4 ? 1 : 2;
  let best = 0;
  for (const w of text.split(/[^a-z0-9]+/)) {
    if (!w) continue;
    const dist = editDistance(token, w.slice(0, Math.max(token.length, 1) + 1), tol);
    if (dist <= tol) best = Math.max(best, 60 - dist * 15);
    else if (w.length > token.length) {
      const dp = editDistance(token, w.slice(0, token.length), tol);
      if (dp <= tol) best = Math.max(best, 50 - dp * 15);
    }
  }
  return best;
}

export interface Searchable { title: string; tags: string[]; description: string; body: string; language: string; isFavorite: boolean }

/** Ranks title above tags above description above body (first 2 KB). Every query token must match somewhere. */
export function fuzzySearch<T extends Searchable>(items: T[], query: string): T[] {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return items;
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const f = { t: fold(item.title), g: fold(item.tags.join(' ') + ' ' + item.language), d: fold(item.description), b: fold(item.body.slice(0, 2048)) };
    let total = 0;
    let ok = true;
    for (const tok of tokens) {
      const s = Math.max(tokenScore(tok, f.t) * 3, tokenScore(tok, f.g) * 2, tokenScore(tok, f.d), tokenScore(tok, f.b));
      if (s === 0) { ok = false; break; }
      total += s;
    }
    if (ok) scored.push({ item, score: total + (item.isFavorite ? 15 : 0) });
  }
  return scored.sort((a, b) => b.score - a.score).map((x) => x.item);
}

// ---------- trash (client-side marker, see NOTES.md) ----------
export const isTrashed = (folder: string) => folder.startsWith(TRASH_PREFIX);
export const trashFolder = (folder: string) => TRASH_PREFIX + folder;
export const untrashFolder = (folder: string) => (isTrashed(folder) ? folder.slice(TRASH_PREFIX.length) : folder);
export const isTrashExpired = (updatedAt: string, now: number) => now - new Date(updatedAt).getTime() > TRASH_DAYS * 86_400_000;

// ---------- title helpers ----------
export function titleFromBody(body: string): string {
  const line = body.split('\n').find((l) => l.trim()) ?? '';
  return line.trim().slice(0, 60) || 'Untitled';
}

export function guessKind(text: string): SnippetBody['kind'] {
  if (parseVariables(text).length > 0) return 'prompt';
  const t = text.trim();
  if (!t.includes('\n') && /^(\$ )?(git|docker|npm|pnpm|yarn|kubectl|curl|ssh|cd|ls|sudo|pip|python|node|cargo|go|brew|apt)\b/.test(t)) return 'command';
  if (/\b(you are|act as|write a|summarize|explain|translate)\b/i.test(t) && !/[{};]/.test(t)) return 'prompt';
  return 'code';
}

// ---------- import / export ----------
export interface ExportFile { app: 'ultimate-util-snippets'; v: 1; exportedAt: string; items: SnippetBody[] }

export function buildExport(items: SnippetBody[], now = new Date()): string {
  const file: ExportFile = { app: 'ultimate-util-snippets', v: 1, exportedAt: now.toISOString(), items };
  return JSON.stringify(file, null, 2);
}

export interface ImportResult { valid: SnippetBody[]; invalid: number }

export function parseImport(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    const m = /position (\d+)/.exec((e as Error).message);
    throw new Error(`That file is not valid JSON${m ? ` (near character ${m[1]})` : ''}.`);
  }
  const obj = raw as Partial<ExportFile> | null;
  if (!obj || obj.app !== 'ultimate-util-snippets' || !Array.isArray(obj.items)) throw new Error('This is not a snippet export from this tool.');
  if (obj.v !== 1) throw new Error(`Unknown export version ${String(obj.v)}.`);
  const valid: SnippetBody[] = [];
  let invalid = 0;
  for (const it of obj.items) {
    const r = snippetBodySchema.safeParse(it);
    if (r.success && new TextEncoder().encode(r.data.body).length <= MAX_BODY_BYTES) valid.push(r.data); else invalid++;
  }
  return { valid, invalid };
}

export const bodyBytes = (b: string) => new TextEncoder().encode(b).length;

export const EXTENSIONS: Record<string, string> = {
  bash: 'sh', shell: 'sh', javascript: 'js', typescript: 'ts', python: 'py', json: 'json', sql: 'sql', yaml: 'yml', xml: 'html',
  css: 'css', go: 'go', rust: 'rs', java: 'java', markdown: 'md', dockerfile: 'Dockerfile', text: 'txt', plaintext: 'txt',
};
