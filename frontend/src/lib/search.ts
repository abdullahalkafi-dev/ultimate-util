import type { ToolMeta } from '@/registry/types';

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/** Letters of the query appear in order inside the text (e.g. "jwt" in "JSON Web Token"). */
function isSubsequence(query: string, text: string): boolean {
  let i = 0;
  for (const ch of text) {
    if (ch === query[i]) i++;
    if (i === query.length) return true;
  }
  return query.length === 0;
}

export function scoreTool(tool: ToolMeta, rawQuery: string): number {
  const query = norm(rawQuery).trim();
  if (!query) return 0;
  const name = norm(tool.name);
  const words = name.split(/[^a-z0-9]+/).filter(Boolean);
  const keywords = tool.keywords.map(norm);
  const description = norm(tool.description);

  let best = 0;
  for (const token of query.split(/\s+/)) {
    let score = 0;
    if (name === token) score = 100;
    else if (name.startsWith(token)) score = 90;
    else if (words.some((w) => w.startsWith(token))) score = 80;
    else if (keywords.some((k) => k === token)) score = 75;
    else if (keywords.some((k) => k.startsWith(token))) score = 65;
    else if (name.includes(token)) score = 55;
    else if (keywords.some((k) => k.includes(token))) score = 45;
    else if (description.includes(token)) score = 30;
    else if (token.length >= 3 && isSubsequence(token, name)) score = 15;
    if (score === 0) return 0; // every word of the query must match something
    best += score;
  }
  return best;
}

/** Ranks tools for a query. Empty query returns an empty list; callers decide what to show then. */
export function searchTools(tools: ToolMeta[], query: string, limit = 50): ToolMeta[] {
  return tools
    .map((tool) => ({ tool, score: scoreTool(tool, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
    .slice(0, limit)
    .map((r) => r.tool);
}
