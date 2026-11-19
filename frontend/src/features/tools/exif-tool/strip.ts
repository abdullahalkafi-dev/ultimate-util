/**
 * Byte-level metadata removal for JPEG, PNG and WebP. Image data bytes are copied untouched, so the
 * result is lossless by construction. Pure functions on Uint8Array, no DOM.
 */

export type StripMode = 'all' | 'gps';

export interface StripOptions {
  mode: StripMode;
  /** Keep the EXIF Orientation tag (rewritten as a minimal EXIF block). Used by mode 'all'. */
  keepOrientation: boolean;
  /** Keep the ICC color profile. */
  keepIcc: boolean;
}

export interface StripResult {
  bytes: Uint8Array;
  /** Human-readable list of what was removed or changed. */
  removed: string[];
}

export class StripError extends Error {}

export const DEFAULT_STRIP: StripOptions = { mode: 'all', keepOrientation: true, keepIcc: true };

const enc = new TextEncoder();
const dec = new TextDecoder('latin1');

function startsWith(b: Uint8Array, offset: number, text: string): boolean {
  if (offset + text.length > b.length) return false;
  for (let i = 0; i < text.length; i++) if (b[offset + i] !== text.charCodeAt(i)) return false;
  return true;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ---------------------------------------------------------------- TIFF (EXIF) helpers

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

function tiffReader(t: Uint8Array) {
  const little = t[0] === 0x49 && t[1] === 0x49;
  const big = t[0] === 0x4d && t[1] === 0x4d;
  if (!little && !big) return null;
  const view = new DataView(t.buffer, t.byteOffset, t.byteLength);
  return {
    little,
    view,
    u16: (o: number) => view.getUint16(o, little),
    u32: (o: number) => view.getUint32(o, little),
    set16: (o: number, v: number) => view.setUint16(o, v, little),
  };
}

/** Reads the EXIF Orientation (1 to 8) from a TIFF block, or null. */
export function tiffOrientation(tiff: Uint8Array): number | null {
  const r = tiffReader(tiff);
  if (!r || tiff.length < 8) return null;
  try {
    const ifd = r.u32(4);
    const count = r.u16(ifd);
    for (let i = 0; i < count; i++) {
      const e = ifd + 2 + i * 12;
      if (r.u16(e) === 0x0112) {
        const v = r.u16(e + 8);
        return v >= 1 && v <= 8 ? v : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** A TIFF block holding only the Orientation tag. */
export function orientationTiff(orientation: number): Uint8Array {
  const t = new Uint8Array(8 + 2 + 12 + 4);
  const v = new DataView(t.buffer);
  t[0] = 0x4d; t[1] = 0x4d;
  v.setUint16(2, 0x002a);
  v.setUint32(4, 8);
  v.setUint16(8, 1);
  v.setUint16(10, 0x0112);
  v.setUint16(12, 3);
  v.setUint32(14, 1);
  v.setUint16(18, orientation);
  return t;
}

/** Removes the GPS IFD pointer from IFD0 and wipes the GPS IFD. Returns null when there was no GPS. */
export function removeGpsFromTiff(tiff: Uint8Array): Uint8Array | null {
  const r = tiffReader(tiff);
  if (!r || tiff.length < 8) return null;
  const out = new Uint8Array(tiff);
  const o = tiffReader(out)!;
  try {
    const ifd = o.u32(4);
    const count = o.u16(ifd);
    let gpsEntry = -1;
    for (let i = 0; i < count; i++) if (o.u16(ifd + 2 + i * 12) === 0x8825) gpsEntry = i;
    if (gpsEntry === -1) return null;
    const gpsOffset = o.u32(ifd + 2 + gpsEntry * 12 + 8);

    // wipe the GPS IFD and its out-of-line values
    if (gpsOffset > 0 && gpsOffset + 2 <= out.length) {
      const n = o.u16(gpsOffset);
      for (let i = 0; i < n; i++) {
        const e = gpsOffset + 2 + i * 12;
        if (e + 12 > out.length) break;
        const size = (TYPE_SIZE[o.u16(e + 2)] ?? 1) * o.u32(e + 4);
        const valueAt = o.u32(e + 8);
        if (size > 4 && valueAt + size <= out.length) out.fill(0, valueAt, valueAt + size);
      }
      out.fill(0, gpsOffset, Math.min(out.length, gpsOffset + 2 + n * 12 + 4));
    }

    // remove the entry: shift later entries and the next-IFD pointer up by 12 bytes
    const entriesStart = ifd + 2;
    const tail = out.slice(entriesStart + (gpsEntry + 1) * 12, entriesStart + count * 12 + 4);
    out.set(tail, entriesStart + gpsEntry * 12);
    out.fill(0, entriesStart + count * 12 - 8, entriesStart + count * 12 + 4);
    // the pointer now sits 12 bytes earlier; restore the freed tail to zero except the moved pointer
    o.set16(ifd, count - 1);
    return out;
  } catch {
    return null;
  }
}

/** Blanks `exif:GPS*` properties in an XMP packet, keeping its length. Returns null when none found. */
export function removeGpsFromXmp(xmp: Uint8Array): Uint8Array | null {
  const text = dec.decode(xmp);
  let found = false;
  const blank = (m: string) => {
    found = true;
    return ' '.repeat(m.length);
  };
  const cleaned = text
    .replace(/\s+exif:GPS\w+\s*=\s*"[^"]*"/g, blank)
    .replace(/<exif:GPS(\w+)[^>]*>[\s\S]*?<\/exif:GPS\1>/g, blank)
    .replace(/<exif:GPS\w+[^>]*\/>/g, blank);
  if (!found) return null;
  const out = new Uint8Array(xmp.length);
  for (let i = 0; i < cleaned.length; i++) out[i] = cleaned.charCodeAt(i) & 0xff;
  return out;
}

// ---------------------------------------------------------------- JPEG

const XMP_NS = 'http://ns.adobe.com/xap/1.0/\0';
const XMP_EXT_NS = 'http://ns.adobe.com/xmp/extension/\0';

export function stripJpeg(input: Uint8Array, options: StripOptions): StripResult {
  if (input[0] !== 0xff || input[1] !== 0xd8) throw new StripError('Not a JPEG file.');
  const parts: Uint8Array[] = [input.subarray(0, 2)];
  const removed: string[] = [];
  let orientation: number | null = null;
  let exifInserted = false;
  let o = 2;
  const keepExifShell = () => {
    // minimal EXIF block holding only Orientation, written right after the first APP0 / at the start
    if (options.mode === 'all' && options.keepOrientation && orientation && orientation !== 1 && !exifInserted) {
      const body = concat([enc.encode('Exif\0\0'), orientationTiff(orientation)]);
      const seg = new Uint8Array(4 + body.length);
      seg[0] = 0xff; seg[1] = 0xe1;
      seg[2] = ((body.length + 2) >> 8) & 255; seg[3] = (body.length + 2) & 255;
      seg.set(body, 4);
      parts.push(seg);
      exifInserted = true;
    }
  };

  // find orientation first so we can write it where the old EXIF block was
  let scan = 2;
  while (scan + 4 <= input.length && input[scan] === 0xff) {
    const marker = input[scan + 1]!;
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      scan += 2;
      continue;
    }
    const len = (input[scan + 2]! << 8) | input[scan + 3]!;
    if (marker === 0xe1 && startsWith(input, scan + 4, 'Exif\0\0')) {
      orientation = tiffOrientation(input.subarray(scan + 10, scan + 2 + len));
    }
    scan += 2 + len;
  }

  let sawApp0 = false;
  while (o < input.length) {
    if (input[o] !== 0xff) throw new StripError('The JPEG structure is damaged.');
    const marker = input[o + 1]!;
    if (marker === 0xff) {
      o++;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) {
      keepExifShell();
      parts.push(input.subarray(o)); // image data and everything after, untouched
      o = input.length;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      parts.push(input.subarray(o, o + 2));
      o += 2;
      continue;
    }
    if (o + 4 > input.length) throw new StripError('The JPEG is truncated.');
    const len = (input[o + 2]! << 8) | input[o + 3]!;
    const end = o + 2 + len;
    if (len < 2 || end > input.length) throw new StripError('The JPEG is truncated.');
    const segment = input.subarray(o, end);
    const data = o + 4;

    let drop = false;
    let replacement: Uint8Array | null = null;
    if (marker === 0xe0) {
      sawApp0 = true;
    } else if (marker === 0xe1) {
      const isExif = startsWith(input, data, 'Exif\0\0');
      const isXmp = startsWith(input, data, XMP_NS) || startsWith(input, data, XMP_EXT_NS);
      if (options.mode === 'all') {
        if (isExif) {
          drop = true;
          removed.push('EXIF block');
        } else if (isXmp) {
          drop = true;
          removed.push('XMP packet');
        } else {
          drop = true;
          removed.push('APP1 data');
        }
      } else if (isExif) {
        const cleaned = removeGpsFromTiff(input.subarray(data + 6, end));
        if (cleaned) {
          replacement = concat([segment.subarray(0, 10), cleaned]);
          removed.push('GPS location (EXIF)');
        }
      } else if (isXmp) {
        const cleaned = removeGpsFromXmp(input.subarray(data, end));
        if (cleaned) {
          replacement = concat([segment.subarray(0, 4), cleaned]);
          removed.push('GPS location (XMP)');
        }
      }
    } else if (options.mode === 'all') {
      if (marker === 0xe2) {
        if (startsWith(input, data, 'ICC_PROFILE\0')) {
          if (!options.keepIcc) {
            drop = true;
            removed.push('ICC color profile');
          }
        } else {
          drop = true;
          removed.push('APP2 data (FlashPix / multi-picture)');
        }
      } else if (marker === 0xed) {
        drop = true;
        removed.push('Photoshop / IPTC data');
      } else if (marker === 0xfe) {
        drop = true;
        removed.push('Comment');
      } else if ((marker >= 0xe3 && marker <= 0xec) || marker === 0xef) {
        drop = true;
        removed.push(`APP${marker - 0xe0} data`);
      }
    }

    if (!drop) parts.push(replacement ?? segment);
    // the orientation block goes right after APP0 (JFIF) if present, else after SOI
    if (marker === 0xe0 && sawApp0) keepExifShell();
    o = end;
  }
  return { bytes: concat(parts), removed: collapse(removed) };
}

function collapse(items: string[]): string[] {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  return [...counts].map(([name, n]) => (n > 1 ? `${name} x${n}` : name));
}

// ---------------------------------------------------------------- PNG

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(enc.encode(type), 4);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

const PNG_TEXT = new Set(['tEXt', 'zTXt', 'iTXt', 'tIME', 'eXIf']);
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function stripPng(input: Uint8Array, options: StripOptions): StripResult {
  if (!PNG_SIG.every((b, i) => input[i] === b)) throw new StripError('Not a PNG file.');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const parts: Uint8Array[] = [input.subarray(0, 8)];
  const removed: string[] = [];
  let orientation: number | null = null;
  let o = 8;
  let ended = false;
  while (o + 12 <= input.length) {
    const len = view.getUint32(o);
    const type = String.fromCharCode(input[o + 4]!, input[o + 5]!, input[o + 6]!, input[o + 7]!);
    const end = o + 12 + len;
    if (end > input.length) throw new StripError('The PNG is truncated.');
    const chunk = input.subarray(o, end);
    const data = input.subarray(o + 8, o + 8 + len);
    if (type === 'eXIf') orientation = tiffOrientation(data);

    if (options.mode === 'all') {
      if (PNG_TEXT.has(type)) {
        removed.push(type === 'eXIf' ? 'EXIF block' : type === 'tIME' ? 'Modification time' : type === 'iTXt' && startsWith(data, 0, 'XML:com.adobe.xmp') ? 'XMP packet' : 'Text chunk');
      } else if (type === 'iCCP' && !options.keepIcc) {
        removed.push('ICC color profile');
      } else {
        parts.push(chunk);
      }
    } else if (type === 'eXIf') {
      const cleaned = removeGpsFromTiff(data);
      if (cleaned) {
        parts.push(pngChunk('eXIf', cleaned));
        removed.push('GPS location (EXIF)');
      } else parts.push(chunk);
    } else if (type === 'iTXt' && startsWith(data, 0, 'XML:com.adobe.xmp')) {
      // keyword, NUL, compression flag, method, language, translated keyword, text
      const nul = data.indexOf(0);
      const compressed = data[nul + 1] === 1;
      const cleaned = compressed ? null : removeGpsFromXmp(data);
      if (cleaned) {
        parts.push(pngChunk('iTXt', cleaned));
        removed.push('GPS location (XMP)');
      } else parts.push(chunk);
    } else {
      parts.push(chunk);
    }
    o = end;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  if (!ended) throw new StripError('The PNG has no end marker, so it may be damaged.');
  let bytes = concat(parts);
  if (options.mode === 'all' && options.keepOrientation && orientation && orientation !== 1) {
    // insert a minimal eXIf chunk before the first IDAT
    const idat = findChunk(bytes, 'IDAT');
    const shell = pngChunk('eXIf', orientationTiff(orientation));
    bytes = concat([bytes.subarray(0, idat), shell, bytes.subarray(idat)]);
  }
  return { bytes, removed: collapse(removed) };
}

function findChunk(png: Uint8Array, type: string): number {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let o = 8;
  while (o + 12 <= png.length) {
    const t = String.fromCharCode(png[o + 4]!, png[o + 5]!, png[o + 6]!, png[o + 7]!);
    if (t === type) return o;
    o += 12 + view.getUint32(o);
  }
  return png.length;
}

// ---------------------------------------------------------------- WebP

export function stripWebp(input: Uint8Array, options: StripOptions): StripResult {
  if (!startsWith(input, 0, 'RIFF') || !startsWith(input, 8, 'WEBP')) throw new StripError('Not a WebP file.');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const riffEnd = Math.min(input.length, 8 + view.getUint32(4, true));
  const chunks: { type: string; bytes: Uint8Array }[] = [];
  const removed: string[] = [];
  let orientation: number | null = null;
  let o = 12;
  while (o + 8 <= riffEnd) {
    const type = dec.decode(input.subarray(o, o + 4));
    const len = view.getUint32(o + 4, true);
    const end = o + 8 + len + (len & 1);
    if (o + 8 + len > input.length) throw new StripError('The WebP is truncated.');
    chunks.push({ type, bytes: input.subarray(o, Math.min(end, input.length)) });
    o = end;
  }

  let flagClear = 0;
  const kept: Uint8Array[] = [];
  for (const c of chunks) {
    const dataStart = 8;
    const body = c.bytes.subarray(dataStart, dataStart + new DataView(c.bytes.buffer, c.bytes.byteOffset).getUint32(4, true));
    if (c.type === 'EXIF') {
      const tiff = startsWith(body, 0, 'Exif\0\0') ? body.subarray(6) : body;
      orientation = tiffOrientation(tiff);
      if (options.mode === 'all') {
        removed.push('EXIF block');
        flagClear |= 0x08;
        continue;
      }
      const cleaned = removeGpsFromTiff(tiff);
      if (cleaned) {
        const prefix = startsWith(body, 0, 'Exif\0\0') ? body.subarray(0, 6) : new Uint8Array(0);
        kept.push(riffChunk('EXIF', concat([prefix, cleaned])));
        removed.push('GPS location (EXIF)');
        continue;
      }
    } else if (c.type === 'XMP ') {
      if (options.mode === 'all') {
        removed.push('XMP packet');
        flagClear |= 0x04;
        continue;
      }
      const cleaned = removeGpsFromXmp(body);
      if (cleaned) {
        kept.push(riffChunk('XMP ', cleaned));
        removed.push('GPS location (XMP)');
        continue;
      }
    } else if (c.type === 'ICCP' && options.mode === 'all' && !options.keepIcc) {
      removed.push('ICC color profile');
      flagClear |= 0x20;
      continue;
    }
    kept.push(c.bytes);
  }

  // rewrite the VP8X flags
  const vp8xIndex = chunks.findIndex((c) => c.type === 'VP8X');
  if (vp8xIndex !== -1 && flagClear) {
    const idx = kept.findIndex((k) => k === chunks[vp8xIndex]!.bytes);
    if (idx !== -1) {
      const copy = new Uint8Array(kept[idx]!);
      copy[8] = copy[8]! & ~flagClear;
      kept[idx] = copy;
    }
  }
  if (options.mode === 'all' && options.keepOrientation && orientation && orientation !== 1 && vp8xIndex !== -1) {
    const idx = kept.findIndex((k) => k === chunks[vp8xIndex]!.bytes || (k[0] === 0x56 && k[1] === 0x50 && k[2] === 0x38 && k[3] === 0x58));
    if (idx !== -1) {
      const copy = new Uint8Array(kept[idx]!);
      copy[8] = copy[8]! | 0x08;
      kept[idx] = copy;
      kept.push(riffChunk('EXIF', orientationTiff(orientation)));
    }
  }
  const body = concat(kept);
  const out = new Uint8Array(12 + body.length);
  out.set(input.subarray(0, 12));
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set(body, 12);
  return { bytes: out, removed: collapse(removed) };
}

function riffChunk(type: string, data: Uint8Array): Uint8Array {
  const pad = data.length & 1;
  const out = new Uint8Array(8 + data.length + pad);
  out.set(enc.encode(type), 0);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

// ---------------------------------------------------------------- container listing (Raw tab)

export interface ContainerBlock {
  name: string;
  bytes: number;
}

/** Lists metadata-bearing blocks in the file container, without decoding anything. */
export function listMetadataBlocks(input: Uint8Array, type: 'jpeg' | 'png' | 'webp'): ContainerBlock[] {
  const blocks: ContainerBlock[] = [];
  try {
    if (type === 'jpeg') {
      let o = 2;
      while (o + 4 <= input.length && input[o] === 0xff) {
        const marker = input[o + 1]!;
        if (marker === 0xda || marker === 0xd9) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
          o += 2;
          continue;
        }
        const len = (input[o + 2]! << 8) | input[o + 3]!;
        const d = o + 4;
        let name: string | null = null;
        if (marker === 0xe1) name = startsWith(input, d, 'Exif\0\0') ? 'EXIF' : startsWith(input, d, XMP_NS) ? 'XMP' : 'APP1 (other)';
        else if (marker === 0xe2) name = startsWith(input, d, 'ICC_PROFILE\0') ? 'ICC profile' : 'APP2 (other)';
        else if (marker === 0xed) name = 'Photoshop / IPTC';
        else if (marker === 0xfe) name = 'Comment';
        else if (marker >= 0xe3 && marker <= 0xef && marker !== 0xee) name = `APP${marker - 0xe0}`;
        if (name) blocks.push({ name, bytes: len - 2 });
        o += 2 + len;
      }
    } else if (type === 'png') {
      const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
      let o = 8;
      while (o + 12 <= input.length) {
        const len = view.getUint32(o);
        const t = String.fromCharCode(input[o + 4]!, input[o + 5]!, input[o + 6]!, input[o + 7]!);
        if (PNG_TEXT.has(t) || t === 'iCCP') blocks.push({ name: t, bytes: len });
        if (t === 'IEND') break;
        o += 12 + len;
      }
    } else {
      const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
      let o = 12;
      while (o + 8 <= input.length) {
        const t = dec.decode(input.subarray(o, o + 4));
        const len = view.getUint32(o + 4, true);
        if (t === 'EXIF' || t === 'XMP ' || t === 'ICCP') blocks.push({ name: t.trim(), bytes: len });
        o += 8 + len + (len & 1);
      }
    }
  } catch {
    // partial list is fine
  }
  return blocks;
}

export type StripFormat = 'jpeg' | 'png' | 'webp';

export function stripBytes(input: Uint8Array, format: StripFormat, options: StripOptions): StripResult {
  if (format === 'jpeg') return stripJpeg(input, options);
  if (format === 'png') return stripPng(input, options);
  return stripWebp(input, options);
}
