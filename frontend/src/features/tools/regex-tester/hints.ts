export interface Hint {
  id: string;
  level: 'warn' | 'info';
  text: string;
}

const ASTRAL = /[\ud800-\udbff][\udc00-\udfff]/;

/** Static, heuristic checks. No hint does not prove a pattern is safe. */
export function patternHints(pattern: string, flags: string, text = ''): Hint[] {
  const hints: Hint[] = [];
  if (!pattern) return hints;
  const unicode = /[uv]/.test(flags);

  if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*]|\((?:[^()\\]|\\.)*[+*]\)\{\d+,\}/.test(pattern)) {
    hints.push({ id: 'nested', level: 'warn', text: 'Nested quantifiers such as (a+)+ can cause catastrophic backtracking (ReDoS). Make the inner part unambiguous, for example a+ instead of (a+)+.' });
  }
  if (/\(([^()|\\]+)\|\1\)[+*]/.test(pattern) || /\((\w)\|\1\)[*+]/.test(pattern)) {
    hints.push({ id: 'overlap', level: 'warn', text: 'Alternatives that match the same text inside a repeated group, like (a|a)*, can backtrack exponentially.' });
  }
  if (/\.\*[^|)]*\.\*/.test(pattern)) {
    hints.push({ id: 'dotstar', level: 'warn', text: 'Several ".*" in a row can be slow on long lines. Prefer a specific character class such as [^,]*.' });
  }
  if (/^\(\?[imsx-]+\)/.test(pattern) || /\(\?[imsx]+[:)]/.test(pattern)) {
    hints.push({ id: 'inline', level: 'info', text: 'Inline flags like (?i) are not supported in JavaScript. Use the flag toggles instead (for example i for case-insensitive).' });
  }
  if (/\\[AZz]/.test(pattern)) hints.push({ id: 'az', level: 'info', text: '\\A, \\Z and \\z do not exist in JavaScript. Use ^ and $ (they match the whole text unless the m flag is on).' });
  if (/\(\?>/.test(pattern)) hints.push({ id: 'atomic', level: 'info', text: 'Atomic groups (?>...) are not supported in JavaScript. A lookahead with a backreference can emulate them.' });
  if (/(?:[*+?]|\})\+/.test(pattern.replace(/\\./g, ''))) hints.push({ id: 'possessive', level: 'info', text: 'Possessive quantifiers like a++ are not supported in JavaScript.' });
  if (/\(\?P[<=>]/.test(pattern)) hints.push({ id: 'pyname', level: 'info', text: 'Python-style named groups (?P<name>...) must be written (?<name>...) in JavaScript.' });
  if (/[‘’“”]/.test(pattern)) hints.push({ id: 'curly', level: 'warn', text: 'The pattern contains curly quotes, probably pasted from a document. They match only those exact characters.' });
  if (!unicode && /\\[pP]\{/.test(pattern)) hints.push({ id: 'prop', level: 'warn', text: 'Unicode property escapes like \\p{L} need the u (or v) flag; without it they match the literal text "p{L}".' });
  if (!unicode && ASTRAL.test(text)) hints.push({ id: 'astral', level: 'info', text: 'The text contains emoji or other characters outside the basic plane. Without the u flag, "." matches only half of them. Enable u.' });
  if (flags.includes('y') && flags.includes('g')) hints.push({ id: 'sticky', level: 'info', text: 'With y and g, matches must follow each other with no gap, starting at the beginning of the text.' });
  return hints;
}
