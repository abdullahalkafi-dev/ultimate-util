import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { safeHref, toDocxBuffer, toMarkdown, toPlainText, readImageInfo, type DocNode } from './exporters';

const t = (text: string, marks?: DocNode['marks']): DocNode => ({ type: 'text', text, marks });
const p = (...c: DocNode[]): DocNode => ({ type: 'paragraph', content: c });

const doc: DocNode = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [t('Title')] },
    p(t('Hello '), t('bold', [{ type: 'bold' }]), t(' and '), t('link', [{ type: 'link', attrs: { href: 'https://example.com' } }])),
    { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('one'))] }, { type: 'listItem', content: [p(t('two'))] }] },
    { type: 'orderedList', content: [{ type: 'listItem', content: [p(t('first'))] }] },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [p(t('A'))] }, { type: 'tableHeader', content: [p(t('B'))] }] }, { type: 'tableRow', content: [{ type: 'tableCell', content: [p(t('1'))] }, { type: 'tableCell', content: [p(t('2|x'))] }] }] },
  ],
};

describe('exporters', () => {
  it('plain text', () => {
    const txt = toPlainText(doc);
    expect(txt).toContain('Title\n\nHello bold and link');
    expect(txt).toContain('- one\n- two');
    expect(txt).toContain('1. first');
    expect(txt).toContain('A\tB');
  });
  it('markdown', () => {
    const md = toMarkdown(doc);
    expect(md).toContain('## Title');
    expect(md).toContain('**bold**');
    expect(md).toContain('[link](https://example.com)');
    expect(md).toContain('| A | B |\n| --- | --- |\n| 1 | 2\\|x |');
  });
  it('drops unsafe link targets', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('file:///etc/passwd')).toBeNull();
    expect(toMarkdown({ type: 'doc', content: [p(t('x', [{ type: 'link', attrs: { href: 'javascript:1' } }]))] })).toBe('x\n');
  });
  it('builds a docx package containing the text', async () => {
    const bytes = await toDocxBuffer(doc, { pageSize: 'A4', marginMm: 20 });
    const files = unzipSync(bytes);
    const xml = strFromU8(files['word/document.xml']!);
    expect(xml).toContain('Title');
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('Heading2');
    expect(files['word/numbering.xml']).toBeDefined();
    expect(xml).toContain('https://example.com'.length ? 'w:hyperlink' : '');
  });
  it('reads PNG dimensions', () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    new DataView(png.buffer).setUint32(16, 40);
    new DataView(png.buffer).setUint32(20, 20);
    expect(readImageInfo(png)).toMatchObject({ type: 'png', width: 40, height: 20 });
  });
});
