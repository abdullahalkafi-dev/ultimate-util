/** Pure logic for Secure Notes. No React, no network. */

export const NOTE_MAX_BYTES = 50_000;
export const NOTE_WARN_BYTES = 45_000;
/** The API rejects ciphertext above about 70 KB of base64 (roughly 52 KB of JSON). History is trimmed to fit. */
export const PAYLOAD_BUDGET_BYTES = 52_000;
export const MAX_VERSIONS = 10;
export const VERSION_INTERVAL_MS = 5 * 60 * 1000;
export const TRASH_DAYS = 30;

export interface NoteVersion {
  title: string;
  body: string;
  savedAt: number;
}

/** Everything in here lives inside the encrypted payload. */
export interface NotePayload {
  v: 1;
  title: string;
  body: string;
  tags: string[];
  isScratchpad: boolean;
  pinned: boolean;
  trashedAt: number | null;
  versions: NoteVersion[];
}

export const emptyNote = (over: Partial<NotePayload> = {}): NotePayload => ({
  v: 1, title: '', body: '', tags: [], isScratchpad: false, pinned: false, trashedAt: null, versions: [], ...over,
});

const enc = new TextEncoder();
export const byteLength = (s: string): number => enc.encode(s).length;

export function normalizeTags(raw: string): string[] {
  return Array.from(new Set(raw.split(/[,\n]/).map((t) => t.trim().toLowerCase().normalize('NFC')).filter(Boolean))).slice(0, 20);
}

/** Drops the oldest versions until the serialized payload fits the budget. */
export function fitVersions(note: NotePayload, budget = PAYLOAD_BUDGET_BYTES): NotePayload {
  let versions = note.versions.slice(-MAX_VERSIONS);
  const size = (v: NoteVersion[]) => byteLength(JSON.stringify({ ...note, versions: v }));
  while (versions.length > 0 && size(versions) > budget) versions = versions.slice(1);
  return { ...note, versions };
}

/** Adds a snapshot of the previous content at most once per 5 minutes, and only when something changed. */
export function withSnapshot(prev: NotePayload | null, next: NotePayload, now: number, force = false): NotePayload {
  if (!prev) return fitVersions(next);
  const changed = prev.body !== next.body || prev.title !== next.title;
  const last = prev.versions[prev.versions.length - 1];
  const due = force || !last || now - last.savedAt >= VERSION_INTERVAL_MS;
  if (!changed || !due || (prev.body === '' && prev.title === '')) return fitVersions({ ...next, versions: prev.versions });
  return fitVersions({ ...next, versions: [...prev.versions, { title: prev.title, body: prev.body, savedAt: now }] });
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Removes ||secret|| content so it never shows up in search snippets. */
export const stripSecrets = (body: string) => body.replace(/\|\|[^\n]*?\|\|/g, '||••••||');

export function searchNotes<T extends { title: string; body: string; tags: string[] }>(notes: T[], query: string): T[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return notes;
  return notes.filter((n) => {
    // Secret contents are searchable only by their surroundings, not by the masked text itself.
    const hay = fold(`${n.title}\n${stripSecrets(n.body)}\n${n.tags.join(' ')}`);
    return terms.every((t) => hay.includes(t));
  });
}

export function snippetAround(body: string, query: string, radius = 40): string {
  const clean = stripSecrets(body).replace(/\s+/g, ' ');
  const term = fold(query).split(/\s+/)[0];
  if (!term) return clean.slice(0, radius * 2);
  const i = fold(clean).indexOf(term);
  if (i < 0) return clean.slice(0, radius * 2);
  return (i > radius ? '...' : '') + clean.slice(Math.max(0, i - radius), i + radius);
}

export interface PreparedMarkdown { md: string; secrets: string[] }
const TOKEN = (i: number) => `UUSECRETTOKEN${i}X`;

/** Replaces ||secret|| with tokens so the secret text never enters the markdown pipeline. */
export function prepareMarkdown(body: string): PreparedMarkdown {
  const secrets: string[] = [];
  const md = body.replace(/\|\|([^\n]+?)\|\|/g, (_m, inner: string) => {
    secrets.push(inner);
    return TOKEN(secrets.length - 1);
  });
  return { md, secrets };
}
export const secretTokenPattern = /UUSECRETTOKEN(\d+)X/g;

const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:sk|pk|ghp|gho|ghs|xox[bp])[-_][A-Za-z0-9_-]{20,}/,
  /\b[A-Za-z0-9+/_-]{40,}={0,2}(?=\s|$)/,
];
export const looksLikeSecret = (text: string): boolean => SECRET_PATTERNS.some((r) => r.test(text));

/** Splits at the last line break before the byte limit so nothing is lost. */
export function splitForLimit(body: string, limit = NOTE_MAX_BYTES): [string, string] {
  if (byteLength(body) <= limit) return [body, ''];
  let lo = 0;
  let hi = body.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (byteLength(body.slice(0, mid)) <= limit) lo = mid; else hi = mid - 1;
  }
  const nl = body.lastIndexOf('\n', lo);
  const cut = nl > lo * 0.5 ? nl + 1 : lo;
  return [body.slice(0, cut), body.slice(cut)];
}

export const isTrashExpired = (trashedAt: number, now: number) => now - trashedAt > TRASH_DAYS * 86_400_000;

export function fileNameFor(title: string, fallback = 'note'): string {
  const base = title.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, '-').slice(0, 60);
  return `${base || fallback}.md`;
}
