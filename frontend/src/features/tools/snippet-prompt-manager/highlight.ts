/** Syntax highlighting with highlight.js core; each language is a separate lazy chunk loaded on demand. */
type Loader = () => Promise<{ default: unknown }>;

const LANGS: Record<string, Loader> = {
  bash: () => import('highlight.js/lib/languages/bash'),
  shell: () => import('highlight.js/lib/languages/shell'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  python: () => import('highlight.js/lib/languages/python'),
  json: () => import('highlight.js/lib/languages/json'),
  sql: () => import('highlight.js/lib/languages/sql'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  xml: () => import('highlight.js/lib/languages/xml'),
  css: () => import('highlight.js/lib/languages/css'),
  go: () => import('highlight.js/lib/languages/go'),
  rust: () => import('highlight.js/lib/languages/rust'),
  java: () => import('highlight.js/lib/languages/java'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  dockerfile: () => import('highlight.js/lib/languages/dockerfile'),
};
export const LANGUAGE_OPTIONS = ['text', ...Object.keys(LANGS)];

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const MAX_HIGHLIGHT = 60_000; // larger text is shown plain to stay responsive

let corePromise: Promise<typeof import('highlight.js/lib/core').default> | null = null;
const registered = new Set<string>();

async function core() {
  corePromise ??= import('highlight.js/lib/core').then((m) => m.default);
  return corePromise;
}

/** Returns escaped HTML (hljs output is escaped). Unknown languages and huge bodies fall back to plain text. */
export async function highlight(code: string, language: string): Promise<string> {
  const load = LANGS[language];
  if (!load || code.length > MAX_HIGHLIGHT) return escapeHtml(code);
  try {
    const hljs = await core();
    if (!registered.has(language)) {
      hljs.registerLanguage(language, (await load()).default as Parameters<typeof hljs.registerLanguage>[1]);
      registered.add(language);
    }
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

/** Cheap guess for the language of pasted text. Returned as a guess; the user can override. */
export function guessLanguage(text: string): string {
  const t = text.trim();
  if (!t) return 'text';
  if (/^[{[][\s\S]*[}\]]$/.test(t) && /"\s*:/.test(t)) return 'json';
  if (/^#!.*\b(ba)?sh\b/.test(t) || /^(\$ )?(git|docker|npm|pnpm|kubectl|curl|ssh|sudo|apt|brew)\b/.test(t)) return 'bash';
  if (/^\s*(def |import |from \w+ import |class \w+:)/m.test(t)) return 'python';
  if (/\b(select|insert into|update|delete from|create table)\b[\s\S]*\b(from|into|set|values|table)\b/i.test(t)) return 'sql';
  if (/\b(const|let|function|=>|console\.log)\b/.test(t)) return /:\s*(string|number|boolean)\b|interface \w+/.test(t) ? 'typescript' : 'javascript';
  if (/^\s*package main|func \w+\(/m.test(t)) return 'go';
  if (/\bfn \w+\(|let mut /.test(t)) return 'rust';
  if (/^<\w+[\s>]/.test(t)) return 'xml';
  if (/^[\w-]+\s*:\s*\S+/m.test(t) && !t.includes('{')) return 'yaml';
  if (/[.#]?[\w-]+\s*\{[^}]*:\s*[^}]*\}/.test(t)) return 'css';
  return 'text';
}
