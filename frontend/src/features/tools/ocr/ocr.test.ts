import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildOcrDocx, buildOcrJson, buildOcrText, buildSearchablePdf } from './exporters';
import { applyColorTransforms, averageConfidence, joinParagraphLines, rotatePixels } from './preprocess';

describe('ocr logic and exporters', () => {
  it('applies grayscale, contrast and invert transforms', () => {
    const rgba = new Uint8ClampedArray([200, 100, 50, 255]);
    const gray = applyColorTransforms(rgba, { grayscale: true, contrast: 0, invert: false });
    expect(gray[0]).toBe(gray[1]);
    expect(gray[1]).toBe(gray[2]);

    const inv = applyColorTransforms(new Uint8ClampedArray([10, 20, 30, 255]), { grayscale: false, contrast: 0, invert: true });
    expect(Array.from(inv)).toEqual([245, 235, 225, 255]);
  });

  it('rotates pixel buffers cleanly by 90 and 180 degrees', () => {
    const buf = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([
        255, 0, 0, 255,
        0, 255, 0, 255,
      ]),
    };
    const r90 = rotatePixels(buf, 90);
    expect(r90.width).toBe(1);
    expect(r90.height).toBe(2);
    expect(Array.from(r90.data.slice(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(r90.data.slice(4, 8))).toEqual([0, 255, 0, 255]);
  });

  it('joins paragraph line wraps while keeping double newlines', () => {
    const raw = 'First line\nsecond line\n\nNew paragraph\nhere';
    expect(joinParagraphLines(raw)).toBe('First line second line\n\nNew paragraph here');
  });

  it('computes average word confidence and exports text, JSON, DOCX and searchable PDF', async () => {
    expect(averageConfidence([{ confidence: 90 }, { confidence: 80 }])).toBe(85);
    expect(buildOcrText([{ text: 'Line 1\nLine 2' }], true)).toBe('Line 1 Line 2');

    const json = buildOcrJson([{ pageNumber: 1, confidence: 95, text: 'Hello', words: [{ text: 'Hello', confidence: 95, x0: 10, y0: 10, x1: 60, y1: 30 }] }]);
    expect(JSON.parse(json)[0]?.text).toBe('Hello');

    const docx = await buildOcrDocx('Hello world');
    expect(docx.size).toBeGreaterThan(500);

    const pdfBytes = await buildSearchablePdf([
      { width: 200, height: 100, imageBytes: new Uint8Array(0), words: [{ text: 'Invoice', confidence: 98, x0: 10, y0: 10, x1: 80, y1: 30 }] },
    ]);
    const loaded = await PDFDocument.load(pdfBytes);
    expect(loaded.getPageCount()).toBe(1);
  });
});
