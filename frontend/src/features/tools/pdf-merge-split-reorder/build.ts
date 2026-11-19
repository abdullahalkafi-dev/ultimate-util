import { PDFDocument, degrees } from 'pdf-lib';

/** One output page: a page of a source PDF, or a blank page. */
export interface PlannedPage {
  sourceId: string | null;
  index: number;
  rotation: number;
  width: number;
  height: number;
}

export interface OutputJob {
  name: string;
  pages: PlannedPage[];
}

export interface BuildOptions {
  title: string;
  stripMetadata: boolean;
}

export interface BuiltFile {
  name: string;
  bytes: Uint8Array;
}

/**
 * Copies pages from the source PDFs into new documents. Runs in a worker in the app, but only
 * uses pdf-lib so it is also testable in node. `shouldStop` is checked between pages.
 */
export async function buildOutputs(
  sources: ReadonlyMap<string, Uint8Array>,
  jobs: OutputJob[],
  options: BuildOptions,
  onProgress?: (done: number, total: number) => void,
  shouldStop?: () => boolean,
): Promise<BuiltFile[]> {
  const loaded = new Map<string, PDFDocument>();
  const total = jobs.reduce((n, j) => n + j.pages.length, 0);
  let done = 0;
  const out: BuiltFile[] = [];

  for (const job of jobs) {
    const doc = await PDFDocument.create({ updateMetadata: false });
    for (const page of job.pages) {
      if (shouldStop?.()) throw new DOMException('Cancelled', 'AbortError');
      if (page.sourceId === null) {
        const blank = doc.addPage([page.width, page.height]);
        if (page.rotation) blank.setRotation(degrees(page.rotation));
      } else {
        let src = loaded.get(page.sourceId);
        if (!src) {
          const bytes = sources.get(page.sourceId);
          if (!bytes) throw new Error('A source file is missing.');
          src = await PDFDocument.load(bytes, { updateMetadata: false });
          loaded.set(page.sourceId, src);
        }
        const [copied] = await doc.copyPages(src, [page.index]);
        if (!copied) throw new Error(`Page ${page.index + 1} could not be copied.`);
        if (page.rotation) copied.setRotation(degrees((copied.getRotation().angle + page.rotation) % 360));
        doc.addPage(copied);
      }
      onProgress?.(++done, total);
      // Let the worker receive a cancel message during long loops.
      if (done % 20 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if (options.stripMetadata) {
      doc.setTitle('');
      doc.setAuthor('');
      doc.setSubject('');
      doc.setKeywords([]);
      doc.setCreator('');
      doc.setProducer('');
    } else {
      if (options.title) doc.setTitle(options.title, { showInWindowTitleBar: true });
      doc.setProducer('Ultimate Util');
      doc.setCreator('Ultimate Util');
    }
    out.push({ name: job.name, bytes: await doc.save() });
  }
  return out;
}

/** Cheap check for digital signatures: signed PDFs carry a /ByteRange entry. */
export function looksSigned(bytes: Uint8Array): boolean {
  const needle = [0x2f, 0x42, 0x79, 0x74, 0x65, 0x52, 0x61, 0x6e, 0x67, 0x65]; // /ByteRange
  const end = bytes.length - needle.length;
  for (let i = 0; i <= end; i++) {
    if (bytes[i] !== 0x2f) continue;
    let k = 1;
    while (k < needle.length && bytes[i + k] === needle[k]) k++;
    if (k === needle.length) return true;
  }
  return false;
}
