import { Document, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, StandardFonts, TextRenderingMode, rgb } from 'pdf-lib';
import { joinParagraphLines, type WordBox } from './preprocess';

export interface SearchablePage {
  width: number;
  height: number;
  imageBytes: Uint8Array;
  words: WordBox[];
}

export function buildOcrText(pages: { text: string }[], joinParagraphs: boolean): string {
  const raw = pages.map((p) => p.text.trim()).filter(Boolean).join('\n\n');
  return joinParagraphs ? joinParagraphLines(raw) : raw;
}

export function buildOcrJson(pages: { pageNumber: number; confidence: number; text: string; words: WordBox[] }[]): string {
  return JSON.stringify(pages, null, 2);
}

export async function buildOcrDocx(text: string): Promise<Blob> {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => new Paragraph({ children: [new TextRun(p.replace(/\n/g, ' '))] }));

  const doc = new Document({
    sections: [
      {
        children: paragraphs.length ? paragraphs : [new Paragraph('')],
      },
    ],
  });
  return Packer.toBlob(doc);
}

/**
 * Builds a searchable PDF with each page image and an invisible selectable text layer
 * aligned to Tesseract word bounding boxes.
 */
export async function buildSearchablePdf(pages: SearchablePage[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const p of pages) {
    const page = doc.addPage([p.width, p.height]);
    if (p.imageBytes.length > 8) {
      const img = await doc.embedPng(p.imageBytes);
      page.drawImage(img, { x: 0, y: 0, width: p.width, height: p.height });
    }
    for (const w of p.words) {
      // Standard PDF Helvetica only supports WinAnsi characters; skip non-Latin glyphs safely.
      const printable = w.text.replace(/[^\x20-\x7e\xa0-\xff]/g, ' ').trim();
      if (!printable) continue;
      const boxH = Math.max(4, w.y1 - w.y0);
      const size = Math.max(4, Math.min(72, boxH * 0.85));
      const pdfY = Math.max(0, p.height - w.y1 + boxH * 0.15);
      page.drawText(printable, {
        x: Math.max(0, w.x0),
        y: pdfY,
        size,
        font,
        color: rgb(0, 0, 0),
        opacity: 0,
      });
    }
  }
  void TextRenderingMode;
  return doc.save();
}
