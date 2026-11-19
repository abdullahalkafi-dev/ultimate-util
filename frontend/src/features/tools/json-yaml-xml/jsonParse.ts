import { lineCol, type JNode, type ParseIssue, type ParseResult } from './model';

class JsonError extends Error {
  constructor(message: string, public offset: number, public hint?: string) {
    super(message);
  }
}

const MAX_DEPTH = 512;
const STRICT_NUM = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const LENIENT_NUM = /[+-]?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y;
const IDENT = /[A-Za-z_$][\w$]*/y;

/**
 * Tolerant JSON parser that keeps number text, key order and duplicate keys.
 * Strict mode follows RFC 8259; lenient mode adds JSON5/JSONC conveniences.
 */
export function parseJson(text: string, lenient = false): ParseResult {
  const warnings: string[] = [];
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const fail = (message: string, at = i, hint?: string): never => {
    throw new JsonError(message, at, hint);
  };

  function skip(): void {
    for (;;) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++;
      else if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
        if (!lenient) fail('Comments are not allowed in strict JSON', i, 'Turn on "Allow comments and trailing commas" to accept JSONC / JSON5.');
        if (text[i + 1] === '/') {
          while (i < text.length && text[i] !== '\n') i++;
        } else {
          const end = text.indexOf('*/', i + 2);
          if (end < 0) fail('Unterminated comment', i);
          i = end + 2;
        }
      } else return;
    }
  }

  function str(quote: string): string {
    const start = i;
    i++;
    let out = '';
    for (;;) {
      if (i >= text.length) fail('Unterminated string', start, 'A string is missing its closing quote.');
      const c = text[i]!;
      if (c === quote) {
        i++;
        return out;
      }
      if (c === '\\') {
        const e = text[i + 1];
        i += 2;
        if (e === 'n') out += '\n';
        else if (e === 't') out += '\t';
        else if (e === 'r') out += '\r';
        else if (e === 'b') out += '\b';
        else if (e === 'f') out += '\f';
        else if (e === '/' || e === '\\' || e === '"') out += e;
        else if (e === 'u') {
          const hex = text.slice(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Invalid \\u escape', i - 2, 'Use four hex digits, like \\u00e9.');
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else if (e === "'" && lenient) out += "'";
        else fail(`Invalid escape \\${e ?? ''}`, i - 2);
      } else if (c === '\n' || c === '\r' || (c < ' ' && !lenient)) {
        fail('Unescaped control character in string', i, c === '\n' ? 'Strings cannot span lines. Use \\n for a line break.' : undefined);
      } else {
        out += c;
        i++;
      }
    }
  }

  function value(depth: number): JNode {
    if (depth > MAX_DEPTH) fail('Nesting is too deep', i);
    skip();
    const c = text[i];
    if (c === undefined) return fail('Unexpected end of input', i, 'The document ends early. Check for a missing closing bracket or brace.');
    if (c === '{') return object(depth);
    if (c === '[') return array(depth);
    if (c === '"' || (c === "'" && lenient)) return { t: 'str', v: str(c) };
    if (c === "'") fail('Single quotes are not valid in JSON', i, 'Use double quotes for strings.');
    if (text.startsWith('true', i)) {
      i += 4;
      return { t: 'bool', v: true };
    }
    if (text.startsWith('false', i)) {
      i += 5;
      return { t: 'bool', v: false };
    }
    if (text.startsWith('null', i)) {
      i += 4;
      return { t: 'null' };
    }
    const re = lenient ? LENIENT_NUM : STRICT_NUM;
    re.lastIndex = i;
    const m = re.exec(text);
    if (m) {
      i += m[0].length;
      return { t: 'num', raw: m[0] };
    }
    if (text.startsWith('NaN', i) || text.startsWith('Infinity', i) || text.startsWith('undefined', i)) {
      fail('NaN, Infinity and undefined are not valid in JSON', i, 'Use null or a string instead.');
    }
    return fail(`Unexpected character "${c}"`, i, /[a-zA-Z]/.test(c) ? 'Strings and keys need double quotes.' : undefined);
  }

  function key(): string {
    const c = text[i];
    if (c === '"' || (c === "'" && lenient)) return str(c);
    if (lenient) {
      IDENT.lastIndex = i;
      const r = IDENT.exec(text);
      if (r) {
        i += r[0].length;
        return r[0];
      }
    }
    return fail('Expected a property name in double quotes', i, c === "'" ? 'Use double quotes for keys.' : 'Keys must be quoted strings.');
  }

  function object(depth: number): JNode {
    const open = i;
    i++;
    const entries: [string, JNode][] = [];
    const seen = new Set<string>();
    for (;;) {
      skip();
      if (text[i] === '}') {
        if (entries.length > 0 && !lenient) fail('Trailing comma is not allowed in strict JSON', i - 1, 'Remove the comma before the closing brace.');
        i++;
        return { t: 'obj', entries };
      }
      if (i >= text.length) fail('Unclosed object', open, 'This "{" is never closed.');
      const keyAt = i;
      const k = key();
      if (seen.has(k)) {
        const p = lineCol(text, keyAt);
        warnings.push(`Duplicate key "${k}" at line ${p.line}, column ${p.col}. Parsers usually keep only the last value.`);
      }
      seen.add(k);
      skip();
      if (text[i] !== ':') fail('Expected ":" after the property name', i, 'Each key needs a colon followed by a value.');
      i++;
      entries.push([k, value(depth + 1)]);
      skip();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === '}') {
        i++;
        return { t: 'obj', entries };
      }
      if (i >= text.length) fail('Unclosed object', open, 'This "{" is never closed.');
      fail('Expected "," or "}"', i, 'A comma may be missing between properties.');
    }
  }

  function array(depth: number): JNode {
    const open = i;
    i++;
    const items: JNode[] = [];
    for (;;) {
      skip();
      if (text[i] === ']') {
        if (items.length > 0 && !lenient) fail('Trailing comma is not allowed in strict JSON', i - 1, 'Remove the comma before the closing bracket.');
        i++;
        return { t: 'arr', items };
      }
      if (i >= text.length) fail('Unclosed array', open, 'This "[" is never closed.');
      items.push(value(depth + 1));
      skip();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === ']') {
        i++;
        return { t: 'arr', items };
      }
      if (i >= text.length) fail('Unclosed array', open, 'This "[" is never closed.');
      fail('Expected "," or "]"', i, 'A comma may be missing between items.');
    }
  }

  try {
    const node = value(0);
    skip();
    if (i < text.length) fail('Unexpected content after the JSON value', i, 'Only one top-level value is allowed. For several records use a JSON array.');
    return { ok: true, node, warnings };
  } catch (e) {
    if (e instanceof JsonError) {
      const { line, col } = lineCol(text, e.offset);
      const error: ParseIssue = { message: e.message, hint: e.hint, line, col, offset: e.offset };
      return { ok: false, error, warnings };
    }
    throw e;
  }
}
