/** Pure layout analysis: PDF text runs in, document blocks out. No pdf.js or DOM here so it can be tested. */

export interface TextRun {
  str: string;
  /** Left edge and baseline (PDF user space, origin bottom-left). */
  x: number;
  y: number;
  width: number;
  /** Font height. */
  size: number;
}

export interface PageInput {
  width: number;
  height: number;
  runs: TextRun[];
}

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; text: string }
  | { type: 'table'; rows: string[][] };

export interface PageResult {
  blocks: Block[];
  chars: number;
  scanned: boolean;
  /** Multi-column flow or reconstructed tables: reading order may differ from the original. */
  lowConfidence: boolean;
  columns: number;
  tables: number;
}

interface Segment {
  str: string;
  x: number;
  width: number;
  size: number;
}

interface Line {
  y: number;
  size: number;
  segments: Segment[];
}

const SCANNED_MIN_CHARS = 8;
const BULLET = /^([•◦▪■●○‣∙·\-–—*])\s+/;
const NUMBERED = /^(\d{1,3}|[a-zA-Z]|[ivxIVX]{1,4})[.)]\s+/;

export function buildLines(runs: TextRun[]): Line[] {
  const items = runs.filter((r) => r.str.trim().length > 0).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const r of items) {
    const line = lines.find((l) => Math.abs(l.y - r.y) <= Math.max(1.5, Math.min(l.size, r.size) * 0.35));
    const seg = { str: r.str, x: r.x, width: r.width, size: r.size };
    if (line) {
      line.segments.push(seg);
      line.size = Math.max(line.size, r.size);
    } else {
      lines.push({ y: r.y, size: r.size, segments: [seg] });
    }
  }
  for (const l of lines) l.segments.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => b.y - a.y);
}

/** Merges runs on a line into cells; gaps wider than a column gap start a new cell. */
export function lineCells(line: Line): { text: string; x: number; end: number }[] {
  const cells: { text: string; x: number; end: number }[] = [];
  for (const s of line.segments) {
    const last = cells[cells.length - 1];
    const gap = last ? s.x - last.end : 0;
    if (last && gap <= line.size * 2.2) {
      const needsSpace = gap > line.size * 0.15 && !/\s$/.test(last.text) && !/^\s/.test(s.str);
      last.text += (needsSpace ? ' ' : '') + s.str;
      last.end = Math.max(last.end, s.x + s.width);
    } else {
      cells.push({ text: s.str, x: s.x, end: s.x + s.width });
    }
  }
  return cells.map((c) => ({ ...c, text: c.text.replace(/\s+/g, ' ').trim() }));
}

const lineText = (line: Line) => lineCells(line).map((c) => c.text).join(' ');

/** Looks for an empty vertical gutter that splits the page into two text columns. */
export function findGutter(page: PageInput): number | null {
  const segs = page.runs.filter((r) => r.str.trim().length > 1);
  if (segs.length < 12) return null;
  for (let step = 0.3; step <= 0.7; step += 0.01) {
    const g = page.width * step;
    if (segs.some((s) => s.x < g - 1 && s.x + s.width > g + 1)) continue;
    const left = segs.filter((s) => s.x + s.width <= g + 1).length;
    const right = segs.filter((s) => s.x >= g - 1).length;
    if (left >= segs.length * 0.25 && right >= segs.length * 0.25 && left + right === segs.length) return g;
  }
  return null;
}

function medianSize(lines: Line[]): number {
  const sizes = lines.flatMap((l) => l.segments.map((s) => s.size)).sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)] ?? 12;
}

function detectTables(lines: Line[]): { start: number; end: number; rows: string[][] }[] {
  const found: { start: number; end: number; rows: string[][] }[] = [];
  let i = 0;
  while (i < lines.length) {
    const first = lines[i];
    const cells = first ? lineCells(first) : [];
    if (!first || cells.length < 2) {
      i++;
      continue;
    }
    const tol = first.size * 1.5;
    let j = i + 1;
    const rows = [cells.map((c) => c.text)];
    while (j < lines.length) {
      const l = lines[j];
      const c = l ? lineCells(l) : [];
      const aligned = c.length === cells.length && c.every((cell, k) => Math.abs(cell.x - (cells[k]?.x ?? 0)) <= tol || (k > 0 && Math.abs(cell.x - (cells[k]?.x ?? 0)) <= tol * 3));
      const prev = lines[j - 1];
      if (!l || !prev || !aligned || prev.y - l.y > first.size * 3.5) break;
      rows.push(c.map((x) => x.text));
      j++;
    }
    if (rows.length >= 2) {
      found.push({ start: i, end: j, rows });
      i = j;
    } else i++;
  }
  return found;
}

function joinWrapped(prev: string, next: string): string {
  if (/[a-z]-$/.test(prev) && /^[a-z]/.test(next)) return prev.slice(0, -1) + next;
  return `${prev} ${next}`;
}

function linesToBlocks(lines: Line[], body: number, detect: boolean): { blocks: Block[]; tables: number } {
  const blocks: Block[] = [];
  const tables = detect ? detectTables(lines) : [];
  const inTable = new Map(tables.map((t) => [t.start, t]));
  let paraOpen = false;
  let prev: Line | null = null;
  const maxEnd = Math.max(0, ...lines.flatMap((l) => l.segments.map((s) => s.x + s.width)));
  for (let i = 0; i < lines.length; i++) {
    const t = inTable.get(i);
    if (t) {
      blocks.push({ type: 'table', rows: t.rows });
      i = t.end - 1;
      paraOpen = false;
      prev = null;
      continue;
    }
    const line = lines[i];
    if (!line) continue;
    const text = lineText(line);
    if (!text) continue;
    const ratio = line.size / body;
    if (detect && ratio >= 1.2 && text.length <= 140) {
      blocks.push({ type: 'heading', level: ratio >= 1.8 ? 1 : ratio >= 1.4 ? 2 : 3, text });
      paraOpen = false;
      prev = line;
      continue;
    }
    const bullet = detect ? BULLET.exec(text) : null;
    const numbered = detect && !bullet ? NUMBERED.exec(text) : null;
    if (bullet || numbered) {
      blocks.push({ type: 'list', ordered: !!numbered, text: text.slice((bullet ?? numbered)![0].length) });
      paraOpen = false;
      prev = line;
      continue;
    }
    const last = blocks[blocks.length - 1];
    const gap = prev ? prev.y - line.y : 0;
    const prevEnd = prev ? Math.max(...prev.segments.map((s) => s.x + s.width)) : 0;
    const shortPrev = prev ? prevEnd < maxEnd * 0.75 && /[.!?:]["')\]]?$/.test(lineText(prev)) : false;
    const continues = paraOpen && last?.type === 'paragraph' && prev !== null && gap < line.size * 1.7 && !shortPrev;
    if (continues && last?.type === 'paragraph') last.text = joinWrapped(last.text, text);
    else blocks.push({ type: 'paragraph', text });
    paraOpen = true;
    prev = line;
  }
  return { blocks, tables: tables.length };
}

export interface AnalyzeOptions {
  detectStructure: boolean;
  /** Median font size across the whole document (headings are judged against it). */
  bodySize?: number;
}

export function analyzePage(page: PageInput, options: AnalyzeOptions): PageResult {
  const chars = page.runs.reduce((n, r) => n + r.str.replace(/\s/g, '').length, 0);
  if (chars < SCANNED_MIN_CHARS) return { blocks: [], chars, scanned: true, lowConfidence: false, columns: 0, tables: 0 };
  const gutter = findGutter(page);
  const groups = gutter === null ? [page.runs] : [page.runs.filter((r) => r.x < gutter), page.runs.filter((r) => r.x >= gutter)];
  const blocks: Block[] = [];
  let tables = 0;
  for (const g of groups) {
    const lines = buildLines(g);
    const body = options.bodySize ?? medianSize(lines);
    const res = linesToBlocks(lines, body, options.detectStructure);
    blocks.push(...res.blocks);
    tables += res.tables;
  }
  return { blocks, chars, scanned: false, lowConfidence: gutter !== null || tables > 0, columns: groups.length, tables };
}

/** Body text size across all pages, so a page of only headings is not mistaken for body. */
export function documentBodySize(pages: PageInput[]): number {
  const sizes: number[] = [];
  for (const p of pages) for (const r of p.runs) for (let i = 0; i < Math.min(r.str.trim().length, 40); i += 10) sizes.push(Math.round(r.size * 2) / 2);
  sizes.sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)] ?? 12;
}
