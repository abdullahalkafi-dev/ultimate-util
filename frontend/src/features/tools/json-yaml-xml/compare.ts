import { diffLines } from 'diff';
import type { JNode } from './model';

export interface LinePart {
  kind: 'same' | 'add' | 'del';
  text: string;
  count: number;
}

/** Line based text diff. */
export function textDiff(a: string, b: string): LinePart[] {
  return diffLines(a, b).map((p) => ({ kind: p.added ? 'add' : p.removed ? 'del' : 'same', text: p.value, count: p.count ?? 0 }));
}

export interface SemanticChange {
  path: string;
  kind: 'added' | 'removed' | 'changed' | 'type';
  before?: string;
  after?: string;
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

export function childPath(parent: string, key: string | number): string {
  if (typeof key === 'number') return `${parent}[${key}]`;
  return IDENT.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

function show(n: JNode): string {
  if (n.t === 'str') return JSON.stringify(n.v);
  if (n.t === 'num') return n.raw;
  if (n.t === 'bool') return String(n.v);
  if (n.t === 'null') return 'null';
  const text = n.t === 'arr' ? `[${n.items.length} items]` : `{${n.entries.length} keys}`;
  return text;
}

function sameNumber(a: string, b: string): boolean {
  if (a === b) return true;
  if (/^-?\d+$/.test(a) && /^-?\d+$/.test(b)) return BigInt(a) === BigInt(b);
  return Number(a) === Number(b) && !Number.isNaN(Number(a));
}

/** Structure-aware comparison: object key order is ignored, arrays compare by index. */
export function semanticDiff(a: JNode, b: JNode, limit = 5000): SemanticChange[] {
  const out: SemanticChange[] = [];
  const walk = (x: JNode, y: JNode, path: string): void => {
    if (out.length >= limit) return;
    if (x.t !== y.t) {
      out.push({ path, kind: 'type', before: show(x), after: show(y) });
      return;
    }
    if (x.t === 'obj' && y.t === 'obj') {
      const yMap = new Map(y.entries);
      const xKeys = new Set(x.entries.map(([k]) => k));
      for (const [k, xv] of x.entries) {
        const yv = yMap.get(k);
        if (yv === undefined) out.push({ path: childPath(path, k), kind: 'removed', before: show(xv) });
        else walk(xv, yv, childPath(path, k));
      }
      for (const [k, yv] of y.entries) if (!xKeys.has(k)) out.push({ path: childPath(path, k), kind: 'added', after: show(yv) });
      return;
    }
    if (x.t === 'arr' && y.t === 'arr') {
      const n = Math.max(x.items.length, y.items.length);
      for (let i = 0; i < n; i++) {
        const xi = x.items[i];
        const yi = y.items[i];
        if (xi && yi) walk(xi, yi, childPath(path, i));
        else if (xi) out.push({ path: childPath(path, i), kind: 'removed', before: show(xi) });
        else if (yi) out.push({ path: childPath(path, i), kind: 'added', after: show(yi) });
      }
      return;
    }
    if (x.t === 'num' && y.t === 'num') {
      if (!sameNumber(x.raw, y.raw)) out.push({ path, kind: 'changed', before: x.raw, after: y.raw });
      return;
    }
    if ((x.t === 'str' || x.t === 'bool') && (y.t === 'str' || y.t === 'bool') && x.v !== y.v) {
      out.push({ path, kind: 'changed', before: show(x), after: show(y) });
    }
  };
  walk(a, b, '$');
  return out;
}
