/** Small tokenizer that turns a JavaScript regex into plain-English lines. No dependency, no execution. */

export interface ExplainItem {
  token: string;
  text: string;
  depth: number;
  kind: 'literal' | 'class' | 'anchor' | 'group' | 'group-end' | 'quantifier' | 'alternation' | 'backref' | 'any';
}

const CLASS_ESCAPES: Record<string, string> = {
  d: 'a digit (0-9)',
  D: 'anything except a digit',
  w: 'a word character (letter, digit or underscore)',
  W: 'anything except a word character',
  s: 'whitespace (space, tab, line break)',
  S: 'anything except whitespace',
};

const CHAR_ESCAPES: Record<string, string> = {
  n: 'a line feed (newline)',
  r: 'a carriage return',
  t: 'a tab',
  f: 'a form feed',
  v: 'a vertical tab',
  '0': 'the NUL character',
};

function describeEscape(src: string, flags: string): { text: string; kind: ExplainItem['kind'] } {
  const c = src[1] ?? '';
  if (CLASS_ESCAPES[c]) return { text: `Matches ${CLASS_ESCAPES[c]}`, kind: 'class' };
  if (c === 'b') return { text: 'Word boundary: the edge between a word character and a non-word character', kind: 'anchor' };
  if (c === 'B') return { text: 'Not a word boundary', kind: 'anchor' };
  if (CHAR_ESCAPES[c]) return { text: `Matches ${CHAR_ESCAPES[c]}`, kind: 'literal' };
  if (c === 'p' || c === 'P') {
    const body = /\{([^}]*)\}/.exec(src)?.[1] ?? '';
    const base = `Matches a character ${c === 'P' ? 'without' : 'with'} the Unicode property "${body}"`;
    return { text: /[uv]/.test(flags) ? base : `${base}. Without the u or v flag this is literal text, so enable u`, kind: 'class' };
  }
  if (c === 'x') return { text: `Matches the character with hex code ${src.slice(2)}`, kind: 'literal' };
  if (c === 'u') return { text: `Matches the Unicode character U+${src.replace(/[\\u{}]/g, '').toUpperCase()}`, kind: 'literal' };
  if (c === 'c') return { text: `Matches the control character Ctrl+${src[2] ?? ''}`, kind: 'literal' };
  if (c === 'k') return { text: `Repeats the text matched by the named group ${src.slice(2)}`, kind: 'backref' };
  if (/[1-9]/.test(c)) return { text: `Repeats the text matched by group ${src.slice(1)}`, kind: 'backref' };
  if (c === 'A' || c === 'Z' || c === 'z') return { text: `${src} is not supported in JavaScript. Use ^ or $ (with the m flag for line starts and ends)`, kind: 'anchor' };
  if (c === 'X') return { text: '\\X (grapheme cluster) is not supported in JavaScript', kind: 'class' };
  return { text: `Matches the literal character "${c}"`, kind: 'literal' };
}

function describeClass(src: string, flags: string): string {
  const negated = src[1] === '^';
  const inner = src.slice(negated ? 2 : 1, -1);
  const parts: string[] = [];
  for (let i = 0; i < inner.length; i++) {
    let a = inner[i]!;
    if (a === '\\') {
      const m = /^\\(?:p\{[^}]*\}|P\{[^}]*\}|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|c[A-Za-z]|.)/.exec(inner.slice(i));
      const esc = m?.[0] ?? '\\';
      i += esc.length - 1;
      if (inner[i + 1] === '-' && i + 2 < inner.length && inner[i + 2] !== '\\') {
        parts.push(`${esc} to ${inner[i + 2]}`);
        i += 2;
        continue;
      }
      a = esc;
      parts.push(CLASS_ESCAPES[esc[1]!] ?? describeEscape(esc, flags).text.replace(/^Matches /, ''));
      continue;
    }
    if (inner[i + 1] === '-' && i + 2 < inner.length) {
      parts.push(`"${a}" to "${inner[i + 2]}"`);
      i += 2;
    } else parts.push(`"${a}"`);
  }
  return `Matches ${negated ? 'any single character except' : 'any one of'}: ${parts.join(', ') || 'nothing'}`;
}

function describeQuantifier(q: string): string {
  const lazy = q.endsWith('?') && q.length > 1;
  const base = lazy ? q.slice(0, -1) : q;
  let what: string;
  if (base === '*') what = 'zero or more times';
  else if (base === '+') what = 'one or more times';
  else if (base === '?') return 'Makes the previous item optional (zero or one time)';
  else {
    const m = /^\{(\d+)(?:(,)(\d*))?\}$/.exec(base);
    if (!m) what = q;
    else if (!m[2]) what = `exactly ${m[1]} times`;
    else if (m[3] === '') what = `${m[1]} or more times`;
    else what = `between ${m[1]} and ${m[3]} times`;
  }
  return `Repeats the previous item ${what} (${lazy ? 'lazy: as few as possible' : 'greedy: as many as possible'})`;
}

const GROUP_PREFIXES: [string, string][] = [
  ['(?<=', 'Positive lookbehind: only if the text before is'],
  ['(?<!', 'Negative lookbehind: only if the text before is not'],
  ['(?=', 'Positive lookahead: only if what follows is'],
  ['(?!', 'Negative lookahead: only if what follows is not'],
  ['(?:', 'Non-capturing group'],
];

export function explain(pattern: string, flags = ''): ExplainItem[] {
  const out: ExplainItem[] = [];
  let depth = 0;
  let groupNo = 0;
  let i = 0;
  const push = (token: string, text: string, kind: ExplainItem['kind'], d = depth) => out.push({ token, text, depth: d, kind });

  while (i < pattern.length) {
    const c = pattern[i]!;
    if (c === '\\') {
      const m = /^\\(?:p\{[^}]*\}|P\{[^}]*\}|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|c[A-Za-z]|k<[^>]*>|\d+|[\s\S])/.exec(pattern.slice(i));
      const tok = m?.[0] ?? '\\';
      const d = describeEscape(tok, flags);
      push(tok, d.text, d.kind);
      i += tok.length;
    } else if (c === '[') {
      let j = i + 1;
      if (pattern[j] === '^') j++;
      if (pattern[j] === ']') j++;
      while (j < pattern.length && pattern[j] !== ']') j += pattern[j] === '\\' ? 2 : 1;
      const tok = pattern.slice(i, j + 1);
      push(tok, tok.endsWith(']') ? describeClass(tok, flags) : 'Unfinished character class (missing "]")', 'class');
      i = j + 1;
    } else if (c === '(') {
      const prefix = GROUP_PREFIXES.find(([p]) => pattern.startsWith(p, i));
      const named = /^\(\?<([A-Za-z_$][\w$]*)>/.exec(pattern.slice(i));
      if (prefix) {
        push(prefix[0], prefix[1], 'group');
        i += prefix[0].length;
      } else if (named) {
        groupNo++;
        push(named[0], `Start of capture group ${groupNo} named "${named[1]}"`, 'group');
        i += named[0].length;
      } else if (pattern.startsWith('(?', i)) {
        const bad = /^\(\?[^)]{0,4}/.exec(pattern.slice(i))![0];
        push(bad, `${bad} is not valid JavaScript group syntax (inline flags, atomic groups and recursion are not supported)`, 'group');
        i += bad.length;
      } else {
        groupNo++;
        push('(', `Start of capture group ${groupNo}`, 'group');
        i++;
      }
      depth++;
    } else if (c === ')') {
      depth = Math.max(0, depth - 1);
      push(')', 'End of group', 'group-end');
      i++;
    } else if (c === '|') {
      push('|', 'Or: match what is on the left or what is on the right', 'alternation', Math.max(0, depth - 0));
      i++;
    } else if (c === '^') {
      push('^', /m/.test(flags) ? 'Start of a line' : 'Start of the text', 'anchor');
      i++;
    } else if (c === '$') {
      push('$', /m/.test(flags) ? 'End of a line' : 'End of the text', 'anchor');
      i++;
    } else if (c === '.') {
      push('.', /s/.test(flags) ? 'Any character, including line breaks' : 'Any character except a line break', 'any');
      i++;
    } else if (c === '*' || c === '+' || c === '?') {
      const tok = pattern[i + 1] === '?' ? c + '?' : c;
      push(tok, describeQuantifier(tok), 'quantifier');
      i += tok.length;
    } else if (c === '{') {
      const m = /^\{\d+(?:,\d*)?\}\??/.exec(pattern.slice(i));
      if (m) {
        push(m[0], describeQuantifier(m[0]), 'quantifier');
        i += m[0].length;
      } else {
        push('{', 'Matches the literal character "{"', 'literal');
        i++;
      }
    } else {
      // Gather a run of plain characters into one line.
      let j = i;
      while (j < pattern.length && !'\\[()|^$.*+?{'.includes(pattern[j]!)) j++;
      // A quantifier applies to the last character only, so leave it for the next token.
      if (j < pattern.length && '*+?{'.includes(pattern[j]!) && j - i > 1) j--;
      const tok = pattern.slice(i, j);
      push(tok, `Matches the text "${tok}"${/i/.test(flags) ? ' (ignoring case)' : ''}`, 'literal');
      i = j;
    }
  }
  return out;
}
