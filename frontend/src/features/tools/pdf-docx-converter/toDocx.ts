import { AlignmentType, Document, HeadingLevel, LevelFormat, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { findUnsupportedScripts } from '../_shared-docs/scripts';
import type { Block, PageResult } from './layout';

export interface FidelityReport {
  pagesConverted: number;
  pagesTotal: number;
  headings: number;
  lists: number;
  tables: number;
  paragraphs: number;
  scannedPages: number[];
  lowConfidencePages: number[];
  scripts: string[];
  notes: string[];
}

const HEADING = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 } as const;

export function buildReport(pages: { pageNumber: number; result: PageResult }[], pagesTotal: number): FidelityReport {
  const counts = { headings: 0, lists: 0, tables: 0, paragraphs: 0 };
  const texts: string[] = [];
  for (const { result } of pages) {
    for (const b of result.blocks) {
      if (b.type === 'heading') counts.headings++;
      else if (b.type === 'list') counts.lists++;
      else if (b.type === 'table') counts.tables++;
      else counts.paragraphs++;
      texts.push(b.type === 'table' ? b.rows.flat().join(' ') : b.text);
    }
  }
  const scripts = findUnsupportedScripts(texts.join(' '));
  const notes = ['Images, vector graphics and form fields are not carried over; fillable fields are not converted.', 'Digital signatures are not carried over.', 'Fonts are replaced by the default Word font; original font names are not kept.'];
  if (scripts.length) notes.push(`${scripts.join(', ')} text was detected. Text order is preserved, but check shaping and fonts in Word.`);
  return {
    pagesConverted: pages.filter((p) => !p.result.scanned).length,
    pagesTotal,
    ...counts,
    scannedPages: pages.filter((p) => p.result.scanned).map((p) => p.pageNumber),
    lowConfidencePages: pages.filter((p) => p.result.lowConfidence).map((p) => p.pageNumber),
    scripts,
    notes,
  };
}

function tableBlock(rows: string[][]): Table {
  const width = Math.max(...rows.map((r) => r.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((r) => new TableRow({ children: Array.from({ length: width }, (_, i) => new TableCell({ children: [new Paragraph({ children: [new TextRun(r[i] ?? '')] })] })) })),
  });
}

function toChildren(blocks: Block[], listRefs: { bullet: string; ordered: () => string }, pageBreak: boolean): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  let orderedRef: string | null = null;
  let first = true;
  for (const b of blocks) {
    const breakBefore = pageBreak && first;
    first = false;
    if (b.type !== 'list') orderedRef = null;
    if (b.type === 'heading') out.push(new Paragraph({ heading: HEADING[b.level], pageBreakBefore: breakBefore, children: [new TextRun(b.text)] }));
    else if (b.type === 'table') {
      if (breakBefore) out.push(new Paragraph({ pageBreakBefore: true, children: [] }));
      out.push(tableBlock(b.rows), new Paragraph({}));
    } else if (b.type === 'list') {
      if (b.ordered && !orderedRef) orderedRef = listRefs.ordered();
      out.push(new Paragraph({ pageBreakBefore: breakBefore, numbering: { reference: b.ordered ? (orderedRef as string) : listRefs.bullet, level: 0 }, children: [new TextRun(b.text)] }));
    } else out.push(new Paragraph({ pageBreakBefore: breakBefore, alignment: AlignmentType.LEFT, spacing: { after: 120 }, children: [new TextRun(b.text)] }));
  }
  return out;
}

/** Page breaks keep the page structure of the original; content never spans an empty page. */
export function buildDocxDocument(pages: { result: PageResult }[]): Document {
  let n = 0;
  const orderedRefs: string[] = [];
  const refs = {
    bullet: 'bullets',
    ordered: () => {
      const r = `ordered-${n++}`;
      orderedRefs.push(r);
      return r;
    },
  };
  const children: (Paragraph | Table)[] = [];
  let started = false;
  for (const { result } of pages) {
    if (!result.blocks.length) continue;
    children.push(...toChildren(result.blocks, refs, started));
    started = true;
  }
  const levels = (fmt: (typeof LevelFormat)[keyof typeof LevelFormat], text: string) => [{ level: 0, format: fmt, text, alignment: AlignmentType.LEFT }];
  return new Document({
    numbering: {
      config: [{ reference: 'bullets', levels: levels(LevelFormat.BULLET, '•') }, ...orderedRefs.map((reference) => ({ reference, levels: levels(LevelFormat.DECIMAL, '%1.') }))],
    },
    sections: [{ children: children.length ? children : [new Paragraph({})] }],
  });
}

export async function buildDocxBlob(pages: { result: PageResult }[]): Promise<Blob> {
  return Packer.toBlob(buildDocxDocument(pages));
}

export async function buildDocxBytes(pages: { result: PageResult }[]): Promise<Uint8Array> {
  return new Uint8Array(await Packer.toBuffer(buildDocxDocument(pages)));
}
