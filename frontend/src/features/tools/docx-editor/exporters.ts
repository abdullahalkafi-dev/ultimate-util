import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx';

/** Minimal shape of TipTap's JSON document; avoids depending on the editor in logic code. */
export interface DocNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: DocNode[];
}

const kids = (n: DocNode) => n.content ?? [];

export const EMPTY_DOC: DocNode = { type: 'doc', content: [{ type: 'paragraph' }] };

/** Only http(s), mailto and tel links are kept; file:, javascript: and the rest become plain text. */
export function safeHref(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  return /^(https?:|mailto:|tel:)/i.test(href.trim()) ? href.trim() : null;
}

// ---------- plain text ----------

function inlineText(n: DocNode): string {
  if (n.type === 'text') return n.text ?? '';
  if (n.type === 'hardBreak') return '\n';
  return kids(n).map(inlineText).join('');
}

function blockText(n: DocNode, indent = 0): string[] {
  switch (n.type) {
    case 'bulletList':
    case 'orderedList': {
      const ordered = n.type === 'orderedList';
      return kids(n).flatMap((li, i) => {
        const marker = ordered ? `${i + 1}. ` : '- ';
        const lines = kids(li).flatMap((c) => blockText(c, indent + 1));
        const [first = '', ...rest] = lines.map((l) => l.trimStart());
        return [`${'  '.repeat(indent)}${marker}${first}`, ...rest.map((l) => `${'  '.repeat(indent + 1)}${l}`)];
      });
    }
    case 'table':
      return kids(n).map((row) => kids(row).map((cell) => kids(cell).map(inlineText).join(' ').replace(/\s+/g, ' ').trim()).join('\t'));
    case 'horizontalRule':
    case 'pageBreak':
      return ['', ''];
    case 'image':
      return [typeof n.attrs?.alt === 'string' && n.attrs.alt ? `[image: ${n.attrs.alt}]` : '[image]'];
    case 'blockquote':
      return kids(n).flatMap((c) => blockText(c, indent));
    default:
      return [inlineText(n)];
  }
}

export function toPlainText(doc: DocNode): string {
  const blocks = kids(doc).map((b) => blockText(b).join('\n'));
  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ---------- markdown ----------

function mdEscape(s: string): string {
  return s.replace(/([\\`*_{}[\]<>#|])/g, '\\$1');
}

function mdInline(n: DocNode): string {
  if (n.type === 'hardBreak') return '  \n';
  if (n.type === 'image') return `![${mdEscape(String(n.attrs?.alt ?? ''))}](${String(n.attrs?.src ?? '')})`;
  if (n.type !== 'text') return kids(n).map(mdInline).join('');
  const raw = n.text ?? '';
  const marks = new Set((n.marks ?? []).map((m) => m.type));
  if (marks.has('code')) return '`' + raw.replace(/`/g, '\\`') + '`';
  let out = mdEscape(raw);
  const lead = /^\s*/.exec(out)?.[0] ?? '';
  const trail = /\s*$/.exec(out)?.[0] ?? '';
  let core = out.trim();
  if (core) {
    if (marks.has('bold')) core = `**${core}**`;
    if (marks.has('italic')) core = `*${core}*`;
    if (marks.has('strike')) core = `~~${core}~~`;
    if (marks.has('underline')) core = `<u>${core}</u>`;
    const link = (n.marks ?? []).find((m) => m.type === 'link');
    const href = safeHref(link?.attrs?.href);
    if (href) core = `[${core}](${href})`;
  }
  out = lead + core + trail;
  return out;
}

function mdBlock(n: DocNode, indent = ''): string[] {
  switch (n.type) {
    case 'heading':
      return [`${'#'.repeat(Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1))))} ${kids(n).map(mdInline).join('')}`];
    case 'bulletList':
    case 'orderedList':
      return kids(n).flatMap((li, i) => {
        const marker = n.type === 'orderedList' ? `${i + 1}. ` : '- ';
        const lines = kids(li).flatMap((c) => mdBlock(c, indent + '  '));
        const [first = '', ...rest] = lines;
        return [`${indent}${marker}${first.trimStart()}`, ...rest];
      });
    case 'blockquote':
      return kids(n).flatMap((c) => mdBlock(c)).map((l) => `> ${l}`);
    case 'codeBlock':
      return ['```', ...kids(n).map((c) => c.text ?? '').join('').split('\n'), '```'];
    case 'horizontalRule':
    case 'pageBreak':
      return ['---'];
    case 'image':
      return [mdInline(n)];
    case 'table': {
      const rows = kids(n).map((row) => kids(row).map((cell) => kids(cell).map(mdInline).join(' ').replace(/\s+/g, ' ').trim()));
      if (!rows.length) return [];
      const width = Math.max(...rows.map((r) => r.length));
      const pad = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
      const [head = [], ...body] = rows;
      return [pad(head), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...body.map(pad)];
    }
    default:
      return [kids(n).map(mdInline).join('')];
  }
}

export function toMarkdown(doc: DocNode): string {
  const parts = kids(doc).map((b) => mdBlock(b).join('\n'));
  return parts.filter((p, i) => p !== '' || parts[i - 1] !== '').join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ---------- images ----------

export interface ImageInfo {
  type: 'png' | 'jpg' | 'gif';
  width: number;
  height: number;
  data: Uint8Array;
}

export function parseDataUri(src: string): { mime: string; data: Uint8Array } | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src);
  if (!m) return null;
  const [, mime = '', b64, body = ''] = m;
  try {
    if (b64) {
      const bin = atob(body);
      return { mime, data: Uint8Array.from(bin, (c) => c.charCodeAt(0)) };
    }
    return { mime, data: new TextEncoder().encode(decodeURIComponent(body)) };
  } catch {
    return null;
  }
}

/** Reads the pixel size from PNG/JPEG/GIF headers. Other formats return null. */
export function readImageInfo(data: Uint8Array): ImageInfo | null {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length > 24 && v.getUint32(0) === 0x89504e47) return { type: 'png', width: v.getUint32(16), height: v.getUint32(20), data };
  if (data.length > 10 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return { type: 'gif', width: v.getUint16(6, true), height: v.getUint16(8, true), data };
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) return null;
      const marker = data[i + 1] ?? 0;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: 'jpg', height: v.getUint16(i + 5), width: v.getUint16(i + 7), data };
      }
      i += 2 + v.getUint16(i + 2);
    }
  }
  return null;
}

// ---------- docx ----------

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const MAX_IMAGE_PX = 600;

export interface DocxExportOptions {
  pageSize: 'A4' | 'LETTER';
  marginMm: number;
  pageNumbers?: boolean;
}

interface Ctx {
  numbering: { reference: string; levels: { level: number; format: (typeof LevelFormat)[keyof typeof LevelFormat]; text: string; alignment: (typeof AlignmentType)[keyof typeof AlignmentType] }[] }[];
  counter: number;
}

function runs(n: DocNode): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const c of kids(n)) {
    if (c.type === 'hardBreak') {
      out.push(new TextRun({ break: 1 }));
    } else if (c.type === 'image') {
      out.push(...imageRuns(c));
    } else if (c.type === 'text') {
      const marks = new Map((c.marks ?? []).map((m) => [m.type, m.attrs]));
      const run = new TextRun({
        text: c.text ?? '',
        bold: marks.has('bold') || undefined,
        italics: marks.has('italic') || undefined,
        underline: marks.has('underline') ? {} : undefined,
        strike: marks.has('strike') || undefined,
        font: marks.has('code') ? 'Courier New' : undefined,
      });
      const href = marks.has('link') ? safeHref(marks.get('link')?.href) : null;
      out.push(href ? new ExternalHyperlink({ link: href, children: [run] }) : run);
    }
  }
  return out;
}

function imageRuns(n: DocNode): ParagraphChild[] {
  const parsed = typeof n.attrs?.src === 'string' ? parseDataUri(n.attrs.src) : null;
  const info = parsed ? readImageInfo(parsed.data) : null;
  if (!info || !info.width || !info.height) return [new TextRun({ text: '[image not embedded]', italics: true })];
  const scale = Math.min(1, MAX_IMAGE_PX / info.width);
  return [new ImageRun({ type: info.type, data: info.data, transformation: { width: Math.round(info.width * scale), height: Math.round(info.height * scale) } })];
}

function newList(ctx: Ctx, ordered: boolean): string {
  const reference = `list-${ctx.counter++}`;
  ctx.numbering.push({
    reference,
    levels: Array.from({ length: 6 }, (_, level) => ({
      level,
      format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
      text: ordered ? `%${level + 1}.` : '•',
      alignment: AlignmentType.LEFT,
    })),
  });
  return reference;
}

function docxBlocks(n: DocNode, ctx: Ctx, level = 0): (Paragraph | Table)[] {
  const align = typeof n.attrs?.textAlign === 'string' ? ALIGN[n.attrs.textAlign] : undefined;
  switch (n.type) {
    case 'heading': {
      const lv = Math.min(6, Math.max(1, Number(n.attrs?.level ?? 1)));
      return [new Paragraph({ heading: HEADINGS[lv - 1], alignment: align, children: runs(n) })];
    }
    case 'bulletList':
    case 'orderedList': {
      const ref = newList(ctx, n.type === 'orderedList');
      return kids(n).flatMap((li) => kids(li).flatMap((c) => (c.type === 'bulletList' || c.type === 'orderedList' ? docxBlocks(c, ctx, level + 1) : [new Paragraph({ numbering: { reference: ref, level: Math.min(level, 5) }, alignment: ALIGN[String(c.attrs?.textAlign)] ?? undefined, children: runs(c) })])));
    }
    case 'blockquote':
      return kids(n).flatMap((c) => docxBlocks(c, ctx, level)).map((p) => p);
    case 'codeBlock':
      return (kids(n).map((c) => c.text ?? '').join('') || '').split('\n').map((line) => new Paragraph({ children: [new TextRun({ text: line, font: 'Courier New' })] }));
    case 'horizontalRule':
      return [new Paragraph({ border: { bottom: { style: 'single', size: 6, color: '999999', space: 1 } }, children: [] })];
    case 'pageBreak':
      return [new Paragraph({ children: [new PageBreak()] })];
    case 'image':
      return [new Paragraph({ children: imageRuns(n) })];
    case 'table': {
      const rows = kids(n).map(
        (row) =>
          new TableRow({
            children: kids(row).map(
              (cell) =>
                new TableCell({
                  columnSpan: Number(cell.attrs?.colspan ?? 1) || 1,
                  rowSpan: Number(cell.attrs?.rowspan ?? 1) || 1,
                  children: (() => {
                    const b = kids(cell).flatMap((c) => docxBlocks(c, ctx)).filter((x): x is Paragraph => x instanceof Paragraph);
                    return b.length ? b : [new Paragraph({})];
                  })(),
                }),
            ),
          }),
      );
      return rows.length ? [new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })] : [];
    }
    default:
      return [new Paragraph({ alignment: align, children: runs(n) })];
  }
}

export function buildDocx(doc: DocNode, options: DocxExportOptions): Document {
  const ctx: Ctx = { numbering: [], counter: 0 };
  const children = kids(doc).flatMap((b) => docxBlocks(b, ctx));
  const twip = Math.round((options.marginMm / 25.4) * 1440);
  const size = options.pageSize === 'A4' ? { width: 11906, height: 16838 } : { width: 12240, height: 15840 };
  return new Document({
    numbering: { config: ctx.numbering },
    sections: [{ properties: { page: { size, margin: { top: twip, bottom: twip, left: twip, right: twip } } }, children: children.length ? children : [new Paragraph({})] }],
  });
}

export function toDocxBlob(doc: DocNode, options: DocxExportOptions): Promise<Blob> {
  return Packer.toBlob(buildDocx(doc, options));
}

export function toDocxBuffer(doc: DocNode, options: DocxExportOptions): Promise<Uint8Array> {
  return Packer.toBuffer(buildDocx(doc, options)).then((b) => new Uint8Array(b));
}
