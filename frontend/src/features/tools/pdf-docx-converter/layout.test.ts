import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { analyzePage, buildLines, lineCells, type PageInput, type TextRun } from './layout';
import { buildDocxBytes, buildReport } from './toDocx';

const run = (str: string, x: number, y: number, size = 12): TextRun => ({ str, x, y, size, width: str.length * size * 0.5 });
const page = (runs: TextRun[]): PageInput => ({ width: 600, height: 800, runs });
const opts = { detectStructure: true };

describe('buildLines', () => {
  it('groups runs on the same baseline and orders top to bottom', () => {
    const lines = buildLines([run('world', 80, 700), run('Hello', 50, 700.5), run('Second', 50, 680)]);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.segments.map((s) => s.str)).toEqual(['Hello', 'world']);
  });
  it('joins adjacent runs with a space only when there is a gap', () => {
    const [line] = buildLines([run('Hel', 50, 700), run('lo', 68, 700), run('there', 90, 700)]);
    expect(lineCells(line!)[0]?.text).toBe('Hello there');
  });
});

describe('analyzePage', () => {
  it('detects a scanned page', () => {
    expect(analyzePage(page([]), opts)).toMatchObject({ scanned: true, blocks: [] });
    expect(analyzePage(page([run('1', 50, 50)]), opts).scanned).toBe(true);
  });

  it('merges wrapped lines into one paragraph and splits on big gaps', () => {
    const r = analyzePage(
      page([run('The quick brown fox jumps over the', 50, 700), run('lazy dog and keeps running far away.', 50, 686), run('A new paragraph begins here today.', 50, 640)]),
      opts,
    );
    expect(r.blocks).toEqual([
      { type: 'paragraph', text: 'The quick brown fox jumps over the lazy dog and keeps running far away.' },
      { type: 'paragraph', text: 'A new paragraph begins here today.' },
    ]);
  });

  it('removes hyphenation at line ends', () => {
    const r = analyzePage(page([run('This is an exam-', 50, 700), run('ple of wrapping text here.', 50, 686)]), opts);
    expect(r.blocks[0]).toMatchObject({ text: 'This is an example of wrapping text here.' });
  });

  it('finds headings by font size and lists by markers', () => {
    const r = analyzePage(
      page([
        run('Annual Report', 50, 750, 24),
        run('Body text paragraph with several words in it.', 50, 700),
        run('• first point', 50, 660),
        run('• second point', 50, 646),
        run('1. step one', 50, 610),
        run('2. step two', 50, 596),
        run('More body text that follows after the lists.', 50, 540),
      ]),
      { detectStructure: true, bodySize: 12 },
    );
    const types = r.blocks.map((b) => b.type);
    expect(types).toEqual(['heading', 'paragraph', 'list', 'list', 'list', 'list', 'paragraph']);
    expect(r.blocks[0]).toMatchObject({ level: 1, text: 'Annual Report' });
    expect(r.blocks[2]).toMatchObject({ ordered: false, text: 'first point' });
    expect(r.blocks[4]).toMatchObject({ ordered: true, text: 'step one' });
  });

  it('reconstructs an aligned table', () => {
    const r = analyzePage(
      page([
        run('Item', 50, 700),
        run('Qty', 300, 700),
        run('Price', 450, 700),
        run('Pen', 50, 684),
        run('2', 300, 684),
        run('1.50', 450, 684),
        run('Book', 50, 668),
        run('1', 300, 668),
        run('9.00', 450, 668),
      ]),
      opts,
    );
    expect(r.blocks).toEqual([{ type: 'table', rows: [['Item', 'Qty', 'Price'], ['Pen', '2', '1.50'], ['Book', '1', '9.00']] }]);
    expect(r.tables).toBe(1);
    expect(r.lowConfidence).toBe(true);
  });

  it('flows two columns left then right', () => {
    const left = Array.from({ length: 6 }, (_, i) => run(`Left column line number ${i}`, 50, 700 - i * 14));
    const right = Array.from({ length: 6 }, (_, i) => run(`Right column line number ${i}`, 330, 700 - i * 14));
    const r = analyzePage(page([...right, ...left]), opts);
    expect(r.columns).toBe(2);
    const text = r.blocks.map((b) => (b.type === 'paragraph' ? b.text : '')).join(' ');
    expect(text.indexOf('Left column line number 5')).toBeLessThan(text.indexOf('Right column line number 0'));
    expect(r.lowConfidence).toBe(true);
  });

  it('keeps plain text only when structure detection is off', () => {
    const r = analyzePage(page([run('Big title here', 50, 750, 24), run('1. not a list item here', 50, 700)]), { detectStructure: false, bodySize: 12 });
    expect(r.blocks.every((b) => b.type === 'paragraph')).toBe(true);
  });
});

describe('docx output and report', () => {
  it('writes a package with headings, list numbering and a table', async () => {
    const result = analyzePage(
      page([run('Title text', 50, 750, 24), run('Body text paragraph with several words in it.', 50, 700), run('1. one thing', 50, 650), run('2. other thing', 50, 636), run('Name', 50, 580), run('Age', 300, 580), run('Ann', 50, 564), run('31', 300, 564)]),
      { detectStructure: true, bodySize: 12 },
    );
    const bytes = await buildDocxBytes([{ result }, { result }]);
    const xml = strFromU8(unzipSync(bytes)['word/document.xml']!);
    expect(xml).toContain('Heading1');
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('w:pageBreakBefore');
    expect(xml).toContain('Body text paragraph');
  });

  it('reports scanned pages, tables and scripts', () => {
    const text = analyzePage(page([run('مرحبا بالعالم اليوم', 50, 700), run('Name', 50, 600), run('Age', 300, 600), run('Ann', 50, 584), run('31', 300, 584)]), opts);
    const scanned = analyzePage(page([]), opts);
    const report = buildReport([{ pageNumber: 1, result: text }, { pageNumber: 2, result: scanned }], 2);
    expect(report.scannedPages).toEqual([2]);
    expect(report.pagesConverted).toBe(1);
    expect(report.tables).toBe(1);
    expect(report.scripts).toEqual(['Arabic']);
    expect(report.lowConfidencePages).toEqual([1]);
  });
});
