/** Page-range syntax: `1-3, 5, 8-`, `last`, `-4`. Pure and DOM-free so it can be unit tested. */

export interface RangeIssue {
  /** Character offsets into the original input, end exclusive. */
  start: number;
  end: number;
  message: string;
}

export interface RangeGroup {
  /** 1-based inclusive page numbers after clamping. */
  from: number;
  to: number;
  token: string;
}

export interface ParsedRanges {
  groups: RangeGroup[];
  /** Pages in the order typed; duplicates are kept (extract may repeat pages). */
  pages: number[];
  errors: RangeIssue[];
  warnings: string[];
}

const ENDPOINT = /^(\d+|last)$/i;

function endpoint(text: string, total: number): number | null {
  if (/^last$/i.test(text)) return total;
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : null;
}

export function parseRanges(input: string, total: number): ParsedRanges {
  const result: ParsedRanges = { groups: [], pages: [], errors: [], warnings: [] };
  const clampNotes = new Set<string>();
  let offset = 0;
  for (const raw of input.split(',')) {
    const leading = raw.length - raw.trimStart().length;
    const token = raw.trim();
    const start = offset + leading;
    const end = start + token.length;
    offset += raw.length + 1;
    if (!token) continue;
    const fail = (message: string) => result.errors.push({ start, end, message });

    const parts = token.split('-').map((p) => p.trim());
    let from: number | null;
    let to: number | null;
    if (parts.length === 1) {
      if (!ENDPOINT.test(token)) {
        fail(`"${token}" is not a page number`);
        continue;
      }
      from = to = endpoint(token, total);
    } else if (parts.length === 2) {
      const [a = '', b = ''] = parts;
      if ((a && !ENDPOINT.test(a)) || (b && !ENDPOINT.test(b))) {
        fail(`"${token}" is not a valid range`);
        continue;
      }
      if (!a && !b) {
        fail('A range needs at least one page number');
        continue;
      }
      from = a ? endpoint(a, total) : 1;
      to = b ? endpoint(b, total) : total;
    } else {
      fail(`"${token}" has too many dashes`);
      continue;
    }
    if (from === null || to === null) {
      fail(`"${token}" is too large`);
      continue;
    }
    if (from < 1 || to < 1) {
      fail('Pages start at 1');
      continue;
    }
    if (from > to) {
      fail(`"${token}" ends before it starts`);
      continue;
    }
    if (from > total) {
      fail(`Document has ${total} page${total === 1 ? '' : 's'}`);
      continue;
    }
    if (to > total) {
      clampNotes.add(`Document has ${total} page${total === 1 ? '' : 's'}; "${token}" was clamped to ${from}-${total}.`);
      to = total;
    }
    result.groups.push({ from, to, token });
    for (let p = from; p <= to; p++) result.pages.push(p);
  }
  result.warnings.push(...clampNotes);
  if (new Set(result.pages).size !== result.pages.length) result.warnings.push('Some pages appear more than once and will be duplicated.');
  return result;
}

/** Consecutive chunks of n pages: [[1..n],[n+1..2n],...]. */
export function planEveryN(total: number, n: number): RangeGroup[] {
  const size = Math.max(1, Math.floor(n));
  const out: RangeGroup[] = [];
  for (let from = 1; from <= total; from += size) {
    const to = Math.min(total, from + size - 1);
    out.push({ from, to, token: `${from}-${to}` });
  }
  return out;
}

/**
 * Greedy split so each part stays under maxBytes by the given per-page estimates.
 * A single page larger than the limit still gets its own part.
 */
export function planBySize(pageBytes: number[], maxBytes: number): RangeGroup[] {
  const out: RangeGroup[] = [];
  let from = 1;
  let sum = 0;
  pageBytes.forEach((bytes, i) => {
    const page = i + 1;
    if (page > from && sum + bytes > maxBytes) {
      out.push({ from, to: page - 1, token: `${from}-${page - 1}` });
      from = page;
      sum = 0;
    }
    sum += bytes;
  });
  if (pageBytes.length) out.push({ from, to: pageBytes.length, token: `${from}-${pageBytes.length}` });
  return out;
}

/** Splits at the given 1-based start pages (e.g. top-level bookmarks). Page 1 is always a start. */
export function planAtStarts(total: number, starts: number[]): RangeGroup[] {
  const sorted = [...new Set([1, ...starts.filter((s) => s >= 1 && s <= total)])].sort((a, b) => a - b);
  return sorted.map((from, i) => {
    const to = (sorted[i + 1] ?? total + 1) - 1;
    return { from, to, token: `${from}-${to}` };
  });
}
