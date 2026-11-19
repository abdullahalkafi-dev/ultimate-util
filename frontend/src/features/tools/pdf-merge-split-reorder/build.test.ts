import { PDFDocument, PDFName, PDFString, StandardFonts, degrees } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildOutputs, looksSigned, type PlannedPage } from './build';

async function fixture(label: string, pages: number, size: [number, number] = [300, 400]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) doc.addPage(size).drawText(`${label}${i}`, { x: 20, y: 20, font });
  return new Uint8Array(await doc.save());
}

const page = (sourceId: string | null, index: number, rotation = 0): PlannedPage => ({ sourceId, index, rotation, width: 300, height: 400 });
const opts = { title: 'Merged', stripMetadata: false };

describe('buildOutputs', () => {
  it('merges in the requested order across files, with rotation and a blank', async () => {
    const sources = new Map([['a', await fixture('A', 3)], ['b', await fixture('B', 2, [500, 300])]]);
    const [out] = await buildOutputs(sources, [{ name: 'm.pdf', pages: [page('b', 1), page('a', 0, 90), page(null, 0), page('a', 0)] }], opts);
    const doc = await PDFDocument.load(out!.bytes);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getPage(0).getSize().width).toBe(500);
    expect(doc.getPage(1).getRotation().angle).toBe(90);
    expect(doc.getPage(2).getSize()).toEqual({ width: 300, height: 400 });
    expect(doc.getTitle()).toBe('Merged');
  });

  it('adds rotation on top of the source rotation', async () => {
    const src = await PDFDocument.load(await fixture('A', 1));
    src.getPage(0).setRotation(degrees(90));
    const sources = new Map([['a', new Uint8Array(await src.save())]]);
    const [out] = await buildOutputs(sources, [{ name: 'r.pdf', pages: [page('a', 0, 270)] }], opts);
    expect((await PDFDocument.load(out!.bytes)).getPage(0).getRotation().angle).toBe(0);
  });

  it('produces several outputs for a split and reports progress', async () => {
    const sources = new Map([['a', await fixture('A', 5)]]);
    const seen: number[] = [];
    const outs = await buildOutputs(
      sources,
      [
        { name: 'p1.pdf', pages: [page('a', 0), page('a', 1)] },
        { name: 'p2.pdf', pages: [page('a', 2), page('a', 3), page('a', 4)] },
      ],
      opts,
      (d) => seen.push(d),
    );
    expect(outs.map((o) => o.name)).toEqual(['p1.pdf', 'p2.pdf']);
    expect((await PDFDocument.load(outs[1]!.bytes)).getPageCount()).toBe(3);
    expect(seen.at(-1)).toBe(5);
  });

  it('strips metadata when asked', async () => {
    const sources = new Map([['a', await fixture('A', 1)]]);
    const [out] = await buildOutputs(sources, [{ name: 'x.pdf', pages: [page('a', 0)] }], { title: 'T', stripMetadata: true });
    const doc = await PDFDocument.load(out!.bytes, { updateMetadata: false });
    expect(doc.getTitle() ?? '').toBe('');
    expect(doc.getProducer() ?? '').toBe('');
  });

  it('stops when cancelled', async () => {
    const sources = new Map([['a', await fixture('A', 3)]]);
    await expect(buildOutputs(sources, [{ name: 'x.pdf', pages: [page('a', 0)] }], opts, undefined, () => true)).rejects.toThrow('Cancelled');
  });

  it('keeps the page font resources so text stays selectable', async () => {
    const sources = new Map([['a', await fixture('Hello', 1)]]);
    const [out] = await buildOutputs(sources, [{ name: 'x.pdf', pages: [page('a', 0)] }], opts);
    const doc = await PDFDocument.load(out!.bytes);
    const resources = doc.getPage(0).node.Resources();
    expect(resources?.has(PDFName.of('Font'))).toBe(true);
  });
});

describe('links', () => {
  it('keeps a web link annotation on a copied page', async () => {
    const doc = await PDFDocument.create();
    const p = doc.addPage([300, 400]);
    const link = doc.context.register(
      doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [10, 10, 100, 30], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.com/') } }),
    );
    p.node.set(PDFName.of('Annots'), doc.context.obj([link]));
    const sources = new Map([['a', new Uint8Array(await doc.save())]]);
    const [out] = await buildOutputs(sources, [{ name: 'x.pdf', pages: [page('a', 0)] }], opts);
    const copied = (await PDFDocument.load(out!.bytes)).getPage(0).node.Annots();
    expect(copied?.size()).toBe(1);
  });
});

describe('looksSigned', () => {
  it('detects /ByteRange', () => {
    expect(looksSigned(new TextEncoder().encode('%PDF-1.7 /Type /Sig /ByteRange [0 10 20 30]'))).toBe(true);
    expect(looksSigned(new TextEncoder().encode('%PDF-1.7 plain'))).toBe(false);
  });
});
