import type { PDFDict, PDFDocument, PDFRef} from 'pdf-lib';
import { PDFArray, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream, type PDFObject } from 'pdf-lib';
import type { CompressSettings } from './plan';

export interface Reencoded {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** Image codec used by the pass. The browser implementation uses canvas; tests inject a fake. */
export interface Reencoder {
  fromJpeg(bytes: Uint8Array, width: number, height: number, settings: CompressSettings): Promise<Reencoded | null>;
  /** `pixels` is tightly packed 8-bit samples with 1 (gray) or 3 (RGB) components. */
  fromRaw(pixels: Uint8Array, width: number, height: number, components: 1 | 3, settings: CompressSettings): Promise<Reencoded | null>;
}

export interface ImageReport {
  found: number;
  recompressed: number;
  /** Reasons why images were left as they are, with counts. */
  skipped: Record<string, number>;
  bytesBefore: number;
  bytesAfter: number;
}

const N = PDFName.of;

function filterNames(dict: PDFDict, context: PDFDocument['context']): string[] {
  const f = context.lookup(dict.get(N('Filter')));
  if (f instanceof PDFName) return [f.asString().slice(1)];
  if (f instanceof PDFArray) return f.asArray().map((x) => (context.lookup(x) instanceof PDFName ? (context.lookup(x) as PDFName).asString().slice(1) : '?'));
  return [];
}

const num = (doc: PDFDocument, v: PDFObject | undefined) => {
  const r = v ? doc.context.lookup(v) : undefined;
  return r instanceof PDFNumber ? r.asNumber() : undefined;
};

/** Number of colour components for the simple colour spaces this pass can handle, else null. */
function components(doc: PDFDocument, dict: PDFDict): 1 | 3 | null {
  const cs = doc.context.lookup(dict.get(N('ColorSpace')));
  if (cs instanceof PDFName) {
    const name = cs.asString();
    if (name === '/DeviceRGB') return 3;
    if (name === '/DeviceGray') return 1;
    return null;
  }
  if (cs instanceof PDFArray && cs.size() >= 2) {
    const kind = doc.context.lookup(cs.get(0));
    if (kind instanceof PDFName && kind.asString() === '/ICCBased') {
      const icc = doc.context.lookup(cs.get(1));
      const n = icc && 'dict' in icc ? num(doc, (icc as PDFRawStream).dict.get(N('N'))) : undefined;
      return n === 3 ? 3 : n === 1 ? 1 : null;
    }
    if (kind instanceof PDFName && (kind.asString() === '/CalRGB' || kind.asString() === '/CalGray')) return kind.asString() === '/CalRGB' ? 3 : 1;
  }
  return null;
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

/**
 * Re-encodes embedded raster images in place. Text and vector content are never touched.
 * Only replaces an image when the new data is clearly smaller.
 */
export async function recompressImages(
  doc: PDFDocument,
  settings: CompressSettings,
  codec: Reencoder,
  shouldStop?: () => boolean,
  onProgress?: (done: number, total: number) => void,
): Promise<ImageReport> {
  const report: ImageReport = { found: 0, recompressed: 0, skipped: {}, bytesBefore: 0, bytesAfter: 0 };
  const images: [PDFRef, PDFRawStream][] = [];
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.get(N('Subtype')) === N('Image')) images.push([ref, obj]);
  }
  report.found = images.length;

  let done = 0;
  for (const [ref, stream] of images) {
    if (shouldStop?.()) throw new DOMException('Cancelled', 'AbortError');
    onProgress?.(done++, images.length);
    const dict = stream.dict;
    const original = stream.getContents();
    report.bytesBefore += original.length;
    report.bytesAfter += original.length;

    const width = num(doc, dict.get(N('Width')));
    const height = num(doc, dict.get(N('Height')));
    if (!width || !height) {
      bump(report.skipped, 'unknown size');
      continue;
    }
    if (doc.context.lookup(dict.get(N('ImageMask'))) === doc.context.obj(true) || dict.has(N('Mask'))) {
      bump(report.skipped, 'mask images');
      continue;
    }
    const filters = filterNames(dict, doc.context);
    let result: Reencoded | null = null;
    try {
      if (filters.length === 1 && filters[0] === 'DCTDecode') {
        result = await codec.fromJpeg(original, width, height, settings);
      } else if (filters.length === 1 && (filters[0] === 'FlateDecode' || filters[0] === 'Fl')) {
        const comps = components(doc, dict);
        const bpc = num(doc, dict.get(N('BitsPerComponent')));
        if (!comps || bpc !== 8) {
          bump(report.skipped, 'unsupported colour format');
          continue;
        }
        const pixels = decodePDFRawStream(stream).decode();
        if (pixels.length < width * height * comps) {
          bump(report.skipped, 'unreadable data');
          continue;
        }
        result = await codec.fromRaw(pixels.subarray(0, width * height * comps), width, height, comps, settings);
      } else {
        bump(report.skipped, filters.length ? `${filters.join('+')} images` : 'uncompressed images');
        continue;
      }
    } catch {
      bump(report.skipped, 'could not be decoded');
      continue;
    }
    if (!result || result.bytes.length >= original.length * 0.95) {
      bump(report.skipped, 'already small');
      continue;
    }

    const next = dict.clone(doc.context);
    for (const key of ['Filter', 'DecodeParms', 'Decode', 'Length', 'Intent']) next.delete(N(key));
    next.set(N('Width'), PDFNumber.of(result.width));
    next.set(N('Height'), PDFNumber.of(result.height));
    next.set(N('ColorSpace'), N('DeviceRGB'));
    next.set(N('BitsPerComponent'), PDFNumber.of(8));
    next.set(N('Filter'), N('DCTDecode'));
    doc.context.assign(ref, PDFRawStream.of(next, result.bytes));
    report.recompressed++;
    report.bytesAfter += result.bytes.length - original.length;
    await new Promise((r) => setTimeout(r, 0));
  }
  onProgress?.(images.length, images.length);
  return report;
}

/** Removes document info and the XMP metadata stream. */
export function stripMetadata(doc: PDFDocument) {
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setCreator('');
  doc.setProducer('');
  doc.catalog.delete(N('Metadata'));
}
