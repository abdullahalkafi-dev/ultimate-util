import { zipSync } from 'fflate';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export type SniffedType =
  | 'pdf' | 'png' | 'jpeg' | 'gif' | 'webp' | 'avif' | 'heic' | 'bmp' | 'zip' | 'docx' | 'svg' | 'mp4' | 'webm' | 'ole' | 'unknown';

const ascii = (b: Uint8Array, start: number, end: number) => String.fromCharCode(...b.slice(start, end));

/** Detects a file type from its first bytes. Extensions are never trusted on their own. */
export function sniffType(bytes: Uint8Array): SniffedType {
  if (bytes.length < 4) return 'unknown';
  if (ascii(bytes, 0, 5) === '%PDF-') return 'pdf';
  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG') return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (ascii(bytes, 0, 3) === 'GIF') return 'gif';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp';
  if (ascii(bytes, 0, 2) === 'BM') return 'bmp';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return 'zip';
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'ole';
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm';
  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (['heic', 'heix', 'mif1', 'msf1', 'hevc'].includes(brand)) return 'heic';
    return 'mp4';
  }
  const head = new TextDecoder().decode(bytes.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
  return 'unknown';
}

export async function readFirstBytes(file: Blob, count = 512): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, count).arrayBuffer());
}

/** Starts a browser download for a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(text: string, filename: string, mime = 'text/plain'): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

/** Zips several files; duplicate names get a numeric suffix. */
export async function zipFiles(files: { name: string; data: Uint8Array | Blob }[]): Promise<Blob> {
  const seen = new Map<string, number>();
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    const count = seen.get(f.name) ?? 0;
    seen.set(f.name, count + 1);
    const dot = f.name.lastIndexOf('.');
    const name = count === 0 ? f.name : dot > 0 ? `${f.name.slice(0, dot)}-${count + 1}${f.name.slice(dot)}` : `${f.name}-${count + 1}`;
    entries[name] = f.data instanceof Blob ? new Uint8Array(await f.data.arrayBuffer()) : f.data;
  }
  const zipped = zipSync(entries, { level: 0 });
  return new Blob([zipped.slice().buffer], { type: 'application/zip' });
}

/** `report.docx` + `compressed` + `pdf` -> `report-compressed.pdf` */
export function outputName(original: string, action: string, ext?: string): string {
  const dot = original.lastIndexOf('.');
  const base = dot > 0 ? original.slice(0, dot) : original;
  const extension = ext ?? (dot > 0 ? original.slice(dot + 1) : '');
  return extension ? `${base}-${action}.${extension}` : `${base}-${action}`;
}
