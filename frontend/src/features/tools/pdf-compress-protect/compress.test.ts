import { deflateSync, crc32 } from 'node:zlib';
import type { PDFNumber} from 'pdf-lib';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { recompressImages, stripMetadata, type Reencoder } from './compress';
import { PRESETS, TARGET_LADDER, bestForTarget, maxSideFor, pickSmaller, targetSize } from './plan';

/** A header-valid JPEG (SOF0 with the given size) padded so it counts as a big image. */
function fakeJpeg(width: number, height: number, padding = 8000): Uint8Array {
  const sof = [0xff, 0xc0, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const com = [0xff, 0xfe, (padding + 2) >> 8, (padding + 2) & 255, ...new Array(padding).fill(0x41)];
  return new Uint8Array([0xff, 0xd8, ...com, ...sof, 0xff, 0xd9]);
}

function png(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const body = new Uint8Array([...Buffer.from(type), ...data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    Buffer.from(body).copy(out, 4);
    out.writeUInt32BE(crc32(body) >>> 0, 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7) & 255;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]));
}

const settings = PRESETS.balanced;

function codec(overrides: Partial<Reencoder> = {}): Reencoder {
  return {
    fromJpeg: vi.fn(async (_b, w, h) => ({ bytes: new Uint8Array(500), width: Math.round(w / 2), height: Math.round(h / 2) })),
    fromRaw: vi.fn(async (_p, w, h) => ({ bytes: new Uint8Array(300), width: w, height: h })),
    ...overrides,
  };
}

async function docWithJpeg() {
  const doc = await PDFDocument.create();
  const img = await doc.embedJpg(fakeJpeg(40, 30));
  doc.addPage([200, 200]).drawImage(img, { x: 0, y: 0, width: 100, height: 75 });
  return PDFDocument.load(await doc.save());
}

describe('recompressImages', () => {
  it('replaces a big JPEG with the re-encoded data and updates its dictionary', async () => {
    const doc = await docWithJpeg();
    const c = codec();
    const report = await recompressImages(doc, settings, c);
    expect(report.found).toBe(1);
    expect(report.recompressed).toBe(1);
    expect(report.bytesAfter).toBeLessThan(report.bytesBefore);
    const stream = [...doc.context.enumerateIndirectObjects()].map(([, o]) => o).find((o): o is PDFRawStream => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));
    expect((stream?.dict.get(PDFName.of('Width')) as PDFNumber).asNumber()).toBe(20);
    expect(stream?.getContents().length).toBe(500);
    expect(stream?.dict.get(PDFName.of('ColorSpace'))).toBe(PDFName.of('DeviceRGB'));
  });

  it('keeps the original when the new data is not clearly smaller', async () => {
    const doc = await docWithJpeg();
    const c = codec({ fromJpeg: async (b, w, h) => ({ bytes: new Uint8Array(b.length), width: w, height: h }) });
    const report = await recompressImages(doc, settings, c);
    expect(report.recompressed).toBe(0);
    expect(report.skipped['already small']).toBe(1);
  });

  it('handles Flate RGB images (PNG-style predictor data)', async () => {
    const doc = await PDFDocument.create();
    const img = await doc.embedPng(png(64, 64));
    doc.addPage([100, 100]).drawImage(img, { x: 0, y: 0, width: 50, height: 50 });
    const loaded = await PDFDocument.load(await doc.save());
    const c = codec();
    const report = await recompressImages(loaded, settings, c);
    expect(c.fromRaw).toHaveBeenCalledTimes(1);
    expect(vi.mocked(c.fromRaw).mock.calls[0]![0].length).toBe(64 * 64 * 3);
    expect(report.recompressed + (report.skipped['already small'] ?? 0)).toBe(1);
  });

  it('survives a decoder failure and reports it', async () => {
    const doc = await docWithJpeg();
    const report = await recompressImages(doc, settings, codec({ fromJpeg: async () => { throw new Error('bad'); } }));
    expect(report.skipped['could not be decoded']).toBe(1);
  });

  it('stops when cancelled', async () => {
    const doc = await docWithJpeg();
    await expect(recompressImages(doc, settings, codec(), () => true)).rejects.toThrow('Cancelled');
  });

  it('strips metadata', async () => {
    const doc = await PDFDocument.create();
    doc.setTitle('Secret');
    doc.setAuthor('Me');
    stripMetadata(doc);
    const back = await PDFDocument.load(await doc.save(), { updateMetadata: false });
    expect(back.getTitle() ?? '').toBe('');
    expect(back.getAuthor() ?? '').toBe('');
  });
});

describe('plan', () => {
  it('never upscales and keeps aspect ratio', () => {
    expect(targetSize(500, 400, 150).scaled).toBe(false);
    const t = targetSize(4000, 2000, 150);
    expect(t.width).toBe(maxSideFor(150));
    expect(t.height).toBe(Math.round(maxSideFor(150) / 2));
  });

  it('pickSmaller returns the original unless the candidate is smaller', () => {
    const a = new Uint8Array(10);
    expect(pickSmaller(a, new Uint8Array(10)).original).toBe(true);
    expect(pickSmaller(a, new Uint8Array(11)).original).toBe(true);
    expect(pickSmaller(a, null).original).toBe(true);
    expect(pickSmaller(a, new Uint8Array(9)).original).toBe(false);
  });

  it('target mode takes the first fit, or reports the floor', () => {
    const results = TARGET_LADDER.map((settings, i) => ({ settings, size: 1000 - i * 100 }));
    expect(bestForTarget(results, 750)).toMatchObject({ reached: true, size: 700 });
    expect(bestForTarget(results, 10)).toMatchObject({ reached: false, size: 400 });
  });
});
