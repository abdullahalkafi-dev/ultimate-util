/** Ordered document model. Keeps key order, number text and duplicate keys (all lost by JSON.parse). */
export type JNode =
  | { t: 'obj'; entries: [string, JNode][] }
  | { t: 'arr'; items: JNode[] }
  | { t: 'str'; v: string }
  | { t: 'num'; raw: string }
  | { t: 'bool'; v: boolean }
  | { t: 'null' };

export type Format = 'json' | 'yaml' | 'xml';

export interface ParseIssue {
  message: string;
  hint?: string;
  line: number;
  col: number;
  offset: number;
}

export interface ParseOptions {
  /** Accept comments, trailing commas, single quotes and unquoted keys (JSON5 / JSONC style). */
  lenient?: boolean;
  yamlVersion?: '1.1' | '1.2';
}

export interface ParseResult {
  ok: boolean;
  node?: JNode;
  error?: ParseIssue;
  warnings: string[];
}

export function lineCol(text: string, offset: number): { line: number; col: number } {
  let line = 1;
  let last = -1;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      last = i;
    }
  }
  return { line, col: end - last };
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** True when the number text cannot round-trip through a JS double. */
export function isUnsafeNumber(raw: string): boolean {
  if (/^-?\d+$/.test(raw)) {
    const n = BigInt(raw);
    return n > MAX_SAFE || n < -MAX_SAFE;
  }
  const digits = raw.replace(/[eE].*$/, '').replace(/^[+-]/, '').replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
  return digits.length > 15;
}

export function countUnsafeNumbers(node: JNode): number {
  if (node.t === 'num') return isUnsafeNumber(node.raw) ? 1 : 0;
  if (node.t === 'arr') return node.items.reduce((n, c) => n + countUnsafeNumbers(c), 0);
  if (node.t === 'obj') return node.entries.reduce((n, [, c]) => n + countUnsafeNumbers(c), 0);
  return 0;
}

export function sortKeys(node: JNode): JNode {
  if (node.t === 'arr') return { t: 'arr', items: node.items.map(sortKeys) };
  if (node.t !== 'obj') return node;
  const entries = [...node.entries]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]): [string, JNode] => [k, sortKeys(v)]);
  return { t: 'obj', entries };
}

/** Plain JS view. Objects become Maps so key order survives; big integers become BigInt. */
export function nodeToJs(node: JNode): unknown {
  switch (node.t) {
    case 'null': return null;
    case 'bool':
    case 'str': return node.v;
    case 'num':
      if (/^-?\d+$/.test(node.raw) && isUnsafeNumber(node.raw)) return BigInt(node.raw);
      return Number(node.raw);
    case 'arr': return node.items.map(nodeToJs);
    case 'obj': return new Map(node.entries.map(([k, v]) => [k, nodeToJs(v)]));
  }
}

/** Convert values from the YAML and XML parsers into the model. */
export function jsToNode(value: unknown): JNode {
  if (value === null || value === undefined) return { t: 'null' };
  if (typeof value === 'string') return { t: 'str', v: value };
  if (typeof value === 'boolean') return { t: 'bool', v: value };
  if (typeof value === 'bigint') return { t: 'num', raw: value.toString() };
  if (typeof value === 'number') return Number.isFinite(value) ? { t: 'num', raw: String(value) } : { t: 'str', v: String(value) };
  if (value instanceof Date) return { t: 'str', v: value.toISOString() };
  if (Array.isArray(value)) return { t: 'arr', items: value.map(jsToNode) };
  if (value instanceof Map) return { t: 'obj', entries: [...value.entries()].map(([k, v]): [string, JNode] => [String(k), jsToNode(v)]) };
  if (typeof value === 'object') return { t: 'obj', entries: Object.entries(value as object).map(([k, v]): [string, JNode] => [k, jsToNode(v)]) };
  return { t: 'str', v: String(value) };
}
