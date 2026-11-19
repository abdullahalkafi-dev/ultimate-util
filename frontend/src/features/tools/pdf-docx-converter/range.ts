/** Parses "1-3, 5, 9-" into sorted unique 1-based page numbers. Returns null text errors as `error`. */
export function parsePageRange(input: string, total: number): { pages: number[]; error?: string } {
  const text = input.trim();
  if (!text) return { pages: Array.from({ length: total }, (_, i) => i + 1) };
  const set = new Set<number>();
  for (const part of text.split(',')) {
    const m = /^\s*(\d*)\s*(-)?\s*(\d*)\s*$/.exec(part);
    if (!m || (!m[1] && !m[3])) return { pages: [], error: `"${part.trim()}" is not a valid page or range.` };
    const from = m[2] ? Number(m[1] || 1) : Number(m[1]);
    const to = m[2] ? Number(m[3] || total) : from;
    if (from < 1 || to < from || from > total) return { pages: [], error: `"${part.trim()}" is outside 1-${total}.` };
    for (let p = from; p <= Math.min(to, total); p++) set.add(p);
  }
  return { pages: [...set].sort((a, b) => a - b) };
}
