/** Pure matching engine. Runs inside a Worker in the app, and directly in unit tests. */

export interface MatchGroup {
  /** Index in the pattern (1-based) */
  n: number;
  name?: string;
  value: string | undefined;
  /** [start, end] in UTF-16 code units; only with the d flag. */
  range?: [number, number];
}

export interface MatchInfo {
  n: number;
  /** UTF-16 code unit offsets, as JavaScript reports them. */
  index: number;
  end: number;
  /** Position counted in Unicode code points. */
  charIndex: number;
  value: string;
  groups: MatchGroup[];
}

export interface RunRequest {
  pattern: string;
  flags: string;
  text: string;
  replacement?: string;
  /** How many matches to keep for display. */
  maxMatches?: number;
}

export interface RunResult {
  ok: boolean;
  error?: { message: string; position?: number };
  matches: MatchInfo[];
  /** Total number of matches found (stops counting at COUNT_LIMIT). */
  total: number;
  countCapped: boolean;
  truncated: boolean;
  groupCount: number;
  groupNames: string[];
  replaced?: string;
  replaceIssues: string[];
  ms: number;
}

export const MAX_MATCHES = 10_000;
export const COUNT_LIMIT = 1_000_000;

const FLAG_ORDER = 'dgimsuvy';

export function normalizeFlags(flags: string): string {
  return [...new Set(flags)].filter((f) => FLAG_ORDER.includes(f)).sort((a, b) => FLAG_ORDER.indexOf(a) - FLAG_ORDER.indexOf(b)).join('');
}

/** Finds where a syntax problem is, since the engine message only has text. */
export function locateError(pattern: string, message: string): number | undefined {
  if (/unterminated group|unmatched '\('/i.test(message)) {
    const stack: number[] = [];
    let inClass = false;
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i];
      if (c === '\\') i++;
      else if (inClass) inClass = c !== ']';
      else if (c === '[') inClass = true;
      else if (c === '(') stack.push(i);
      else if (c === ')') stack.pop();
    }
    return stack.length ? stack[stack.length - 1] : undefined;
  }
  if (/unmatched '\)'|unmatched \)/i.test(message)) {
    let depth = 0;
    let inClass = false;
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i];
      if (c === '\\') i++;
      else if (inClass) inClass = c !== ']';
      else if (c === '[') inClass = true;
      else if (c === '(') depth++;
      else if (c === ')' && --depth < 0) return i;
    }
  }
  if (/unterminated character class/i.test(message)) {
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === '\\') i++;
      else if (pattern[i] === '[') return i;
    }
  }
  if (/nothing to repeat/i.test(message)) {
    const m = /(^|[(|])[*+?]/.exec(pattern);
    if (m) return m.index + m[1]!.length;
  }
  if (/\\ at end of pattern/i.test(message)) return pattern.length - 1;
  return undefined;
}

export function friendlyError(pattern: string, err: unknown): { message: string; position?: number } {
  const raw = err instanceof Error ? err.message : String(err);
  const tail = raw.replace(/^Invalid regular expression:\s*/, '').replace(/^\/[\s\S]*\/[a-z]*:\s*/, '');
  const msg = tail.charAt(0).toUpperCase() + tail.slice(1);
  const position = locateError(pattern, tail);
  return { message: position !== undefined ? `${msg} at position ${position}` : msg, position };
}

export function supportsFlag(flag: string): boolean {
  try {
    new RegExp('', flag);
    return true;
  } catch {
    return false;
  }
}

/** Capture groups in the order they open: their name, or null when unnamed. */
export function groupOrder(pattern: string): (string | null)[] {
  const order: (string | null)[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') i++;
    else if (inClass) inClass = c !== ']';
    else if (c === '[') inClass = true;
    else if (c === '(') {
      if (pattern[i + 1] !== '?') order.push(null);
      else {
        const named = /^\(\?<([A-Za-z_$][\w$]*)>/.exec(pattern.slice(i));
        if (named) order.push(named[1]!);
      }
    }
  }
  return order;
}

export function countGroups(pattern: string, flags: string): { count: number; names: string[]; order: (string | null)[] } {
  const probe = new RegExp(`${pattern}|`, flags.replace(/[gy]/g, ''));
  const m = probe.exec('');
  const order = groupOrder(pattern);
  return { count: (m?.length ?? 1) - 1, names: [...new Set(order.filter((x): x is string => x !== null))], order };
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

export function codePointLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (isHighSurrogate(s.charCodeAt(i)) && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
    }
    n++;
  }
  return n;
}

function replacementIssues(replacement: string, count: number, names: string[]): string[] {
  const issues: string[] = [];
  for (const m of replacement.matchAll(/\$(\d{1,2})|\$<([^>]*)>/g)) {
    if (m[1] !== undefined) {
      const num = Number(m[1]);
      if (num === 0 || num > count) {
        // "$12" with fewer than 12 groups reads as "$1" then "2" in JS, so only flag when even $1 is missing.
        const first = Number(m[1][0]);
        if (!(m[1].length === 2 && first >= 1 && first <= count)) issues.push(`${m[0]} refers to a group that does not exist; it is kept as literal text.`);
      }
    } else if (names.length === 0) {
      issues.push(`${m[0]} is literal text because the pattern has no named groups.`);
    } else if (!names.includes(m[2]!)) {
      issues.push(`${m[0]} names a group that does not exist; it is replaced with nothing.`);
    }
  }
  return issues;
}

export function runMatch(req: RunRequest): RunResult {
  const started = Date.now();
  const flags = normalizeFlags(req.flags);
  const empty: RunResult = { ok: true, matches: [], total: 0, countCapped: false, truncated: false, groupCount: 0, groupNames: [], replaceIssues: [], ms: 0 };
  if (req.pattern === '') return empty;

  let re: RegExp;
  let groupInfo: { count: number; names: string[]; order: (string | null)[] };
  try {
    re = new RegExp(req.pattern, flags);
    groupInfo = countGroups(req.pattern, flags);
  } catch (err) {
    return { ...empty, ok: false, error: friendlyError(req.pattern, err) };
  }

  const { text } = req;
  const max = req.maxMatches ?? MAX_MATCHES;
  const global = flags.includes('g');
  const unicode = flags.includes('u') || flags.includes('v');
  const matches: MatchInfo[] = [];
  let total = 0;
  let countCapped = false;
  // Code point counting is incremental because matches arrive in order.
  let cpCursor = 0;
  let cpCount = 0;

  re.lastIndex = 0;
  for (;;) {
    const m = re.exec(text);
    if (!m) break;
    total++;
    if (matches.length < max) {
      cpCount += codePointLength(text.slice(cpCursor, m.index));
      cpCursor = m.index;
      const groups: MatchGroup[] = [];
      for (let i = 1; i < m.length; i++) {
        const range = m.indices?.[i];
        groups.push({ n: i, name: groupInfo.order[i - 1] ?? undefined, value: m[i], range: range ? [range[0], range[1]] : undefined });
      }
      matches.push({ n: total, index: m.index, end: m.index + m[0].length, charIndex: cpCount, value: m[0], groups });
    }
    if (total >= COUNT_LIMIT) {
      countCapped = true;
      break;
    }
    if (!global) break;
    if (m[0] === '') {
      // Advance past an empty match, by a whole code point in unicode mode, so the loop always ends.
      const at = re.lastIndex;
      const step = unicode && at < text.length && isHighSurrogate(text.charCodeAt(at)) ? 2 : 1;
      re.lastIndex = at + step;
      if (re.lastIndex > text.length) break;
    }
  }

  let replaced: string | undefined;
  let issues: string[] = [];
  if (req.replacement !== undefined) {
    issues = replacementIssues(req.replacement, groupInfo.count, groupInfo.names);
    replaced = text.replace(new RegExp(req.pattern, flags), req.replacement);
  }

  return {
    ok: true,
    matches,
    total,
    countCapped,
    truncated: total > matches.length,
    groupCount: groupInfo.count,
    groupNames: groupInfo.names,
    replaced,
    replaceIssues: issues,
    ms: Date.now() - started,
  };
}
