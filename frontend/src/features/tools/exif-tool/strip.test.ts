import { describe, expect, it } from 'vitest';
import { buildSampleExifTiff, diffMetadata, formatDms, inspectBytes, normalizeParsedTags } from './inspect';
import { crc32, listMetadataBlocks, orientationTiff, removeGpsFromTiff, removeGpsFromXmp, stripJpeg, stripPng, stripWebp, tiffOrientation } from './strip';

const enc = new TextEncoder();
const cat = (...p: Uint8Array[]) => {
  const out = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of p) {
    out.set(x, o);
    o += x.length;
  }
  return out;
};
const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b);
const has = (b: Uint8Array, s: string) => text(b).includes(s);

/** TIFF with Make, Orientation and a GPS IFD holding a recognizable latitude. */
function tiffWithGps(orientation = 6, little = true): Uint8Array {
  const t = new Uint8Array(200);
  const v = new DataView(t.buffer);
  const u16 = (o: number, x: number) => v.setUint16(o, x, little);
  const u32 = (o: number, x: number) => v.setUint32(o, x, little);
  t[0] = t[1] = little ? 0x49 : 0x4d;
  u16(2, 42);
  u32(4, 8);
  u16(8, 3);
  u16(10, 0x010f); u16(12, 2); u32(14, 6); u32(18, 50);
  u16(22, 0x0112); u16(24, 3); u32(26, 1); u16(30, orientation);
  u16(34, 0x8825); u16(36, 4); u32(38, 1); u32(42, 56);
  u32(46, 0);
  t.set(enc.encode('Canon\0'), 50);
  u16(56, 2);
  u16(58, 1); u16(60, 2); u32(62, 2); t.set(enc.encode('N\0'), 66);
  u16(70, 2); u16(72, 5); u32(74, 3); u32(78, 86);
  u32(82, 0);
  [51, 1, 30, 1, 7, 1].forEach((n, i) => u32(86 + i * 4, n));
  t.set(enc.encode('SECRETGPS'), 120); // outside the GPS IFD: must survive
  return t.slice(0, 140);
}

const seg = (marker: number, body: Uint8Array) => cat(new Uint8Array([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255]), body);
const IMAGE_DATA = new Uint8Array([0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0x56, 0xff, 0xd9]);

function jpegFixture(): Uint8Array {
  return cat(
    new Uint8Array([0xff, 0xd8]),
    seg(0xe0, enc.encode('JFIF\0\x01\x01\0\0\x01\0\x01\0\0')),
    seg(0xe1, cat(enc.encode('Exif\0\0'), tiffWithGps())),
    seg(0xe1, enc.encode('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta exif:GPSLatitude="51,30N" dc:creator="Ann"/>')),
    seg(0xe2, enc.encode('ICC_PROFILE\0\x01\x01profiledata')),
    seg(0xed, enc.encode('Photoshop 3.0\0iptc')),
    seg(0xfe, enc.encode('a secret comment')),
    seg(0xdb, new Uint8Array(65)),
    IMAGE_DATA,
  );
}

describe('stripJpeg', () => {
  it('removes everything but keeps orientation, ICC and the image data', () => {
    const input = jpegFixture();
    const { bytes, removed } = stripJpeg(input, { mode: 'all', keepOrientation: true, keepIcc: true });
    expect(has(bytes, 'Canon')).toBe(false);
    expect(has(bytes, 'SECRETGPS')).toBe(false);
    expect(has(bytes, 'xmpmeta')).toBe(false);
    expect(has(bytes, 'a secret comment')).toBe(false);
    expect(has(bytes, 'Photoshop')).toBe(false);
    expect(has(bytes, 'ICC_PROFILE')).toBe(true);
    expect(has(bytes, 'JFIF')).toBe(true);
    // the only EXIF block left is the minimal orientation one
    const idx = text(bytes).indexOf('Exif\0\0');
    expect(tiffOrientation(bytes.subarray(idx + 6))).toBe(6);
    expect(text(bytes).split('Exif\0\0').length).toBe(2);
    // image data is byte-identical at the tail
    expect(Array.from(bytes.slice(bytes.length - IMAGE_DATA.length))).toEqual(Array.from(IMAGE_DATA));
    expect(removed).toEqual(expect.arrayContaining(['EXIF block', 'XMP packet', 'Comment', 'Photoshop / IPTC data']));
  });

  it('drops orientation and ICC when asked', () => {
    const { bytes } = stripJpeg(jpegFixture(), { mode: 'all', keepOrientation: false, keepIcc: false });
    expect(has(bytes, 'Exif')).toBe(false);
    expect(has(bytes, 'ICC_PROFILE')).toBe(false);
  });

  it('GPS only keeps camera data and removes GPS from EXIF and XMP', () => {
    const { bytes, removed } = stripJpeg(jpegFixture(), { mode: 'gps', keepOrientation: true, keepIcc: true });
    expect(has(bytes, 'Canon')).toBe(true);
    expect(has(bytes, 'a secret comment')).toBe(true);
    expect(has(bytes, 'dc:creator="Ann"')).toBe(true);
    expect(has(bytes, 'GPSLatitude')).toBe(false);
    const idx = text(bytes).indexOf('Exif\0\0');
    const tiff = bytes.subarray(idx + 6, idx + 6 + 140);
    expect(tiffOrientation(tiff)).toBe(6);
    expect(removeGpsFromTiff(tiff)).toBeNull(); // no GPS pointer left
    expect(removed).toEqual(expect.arrayContaining(['GPS location (EXIF)', 'GPS location (XMP)']));
  });

  it('rejects truncated and non-JPEG input', () => {
    expect(() => stripJpeg(new Uint8Array([1, 2, 3, 4]), { mode: 'all', keepOrientation: true, keepIcc: true })).toThrow();
    expect(() => stripJpeg(jpegFixture().slice(0, 40), { mode: 'all', keepOrientation: true, keepIcc: true })).toThrow();
  });

  it('lists metadata blocks', () => {
    const names = listMetadataBlocks(jpegFixture(), 'jpeg').map((b) => b.name);
    expect(names).toEqual(['EXIF', 'XMP', 'ICC profile', 'Photoshop / IPTC', 'Comment']);
  });
});

describe('TIFF helpers', () => {
  it('removes GPS in both byte orders and keeps other tags', () => {
    for (const little of [true, false]) {
      const tiff = tiffWithGps(3, little);
      const cleaned = removeGpsFromTiff(tiff)!;
      expect(cleaned).not.toBeNull();
      expect(tiffOrientation(cleaned)).toBe(3);
      expect(text(cleaned)).toContain('Canon');
      expect(removeGpsFromTiff(cleaned)).toBeNull();
      // GPS latitude bytes are zeroed
      expect(Array.from(cleaned.slice(86, 110)).every((b) => b === 0)).toBe(true);
    }
  });

  it('builds a valid minimal orientation block', () => {
    expect(tiffOrientation(orientationTiff(8))).toBe(8);
  });

  it('blanks GPS in XMP while keeping the length', () => {
    const xmp = enc.encode('<a exif:GPSLatitude="1" dc:title="x"><exif:GPSLongitude>2</exif:GPSLongitude></a>');
    const cleaned = removeGpsFromXmp(xmp)!;
    expect(cleaned.length).toBe(xmp.length);
    expect(text(cleaned)).not.toContain('GPS');
    expect(text(cleaned)).toContain('dc:title');
    expect(removeGpsFromXmp(cleaned)).toBeNull();
  });
});

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const body = cat(enc.encode(type), data);
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(body, 4);
  v.setUint32(8 + data.length, crc32(body));
  return out;
}

function pngFixture(): Uint8Array {
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, 2);
  new DataView(ihdr.buffer).setUint32(4, 2);
  ihdr[8] = 8; ihdr[9] = 2;
  return cat(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('iCCP', enc.encode('sRGB\0\0data')),
    pngChunk('tEXt', enc.encode('Author\0Secret Person')),
    pngChunk('iTXt', enc.encode('XML:com.adobe.xmp\0\0\0\0\0<x exif:GPSLatitude="1"/>')),
    pngChunk('eXIf', tiffWithGps(6, false)),
    pngChunk('tIME', new Uint8Array(7)),
    pngChunk('IDAT', new Uint8Array([1, 2, 3, 4, 5])),
    pngChunk('IEND', new Uint8Array(0)),
  );
}

describe('stripPng', () => {
  it('removes text, time and EXIF chunks, keeps orientation and image data', () => {
    const { bytes } = stripPng(pngFixture(), { mode: 'all', keepOrientation: true, keepIcc: true });
    expect(has(bytes, 'Secret Person')).toBe(false);
    expect(has(bytes, 'tIME')).toBe(false);
    expect(has(bytes, 'xmp')).toBe(false);
    expect(has(bytes, 'iCCP')).toBe(true);
    expect(has(bytes, 'Canon')).toBe(false);
    const idx = text(bytes).indexOf('eXIf');
    expect(tiffOrientation(bytes.subarray(idx + 4))).toBe(6);
    expect(has(bytes, 'IDAT')).toBe(true);
    expect(has(bytes, 'IEND')).toBe(true);
  });

  it('GPS only rewrites eXIf and XMP with valid CRCs', () => {
    const { bytes, removed } = stripPng(pngFixture(), { mode: 'gps', keepOrientation: true, keepIcc: true });
    expect(removed).toEqual(expect.arrayContaining(['GPS location (EXIF)', 'GPS location (XMP)']));
    expect(has(bytes, 'GPSLatitude')).toBe(false);
    expect(has(bytes, 'Secret Person')).toBe(true);
    // every chunk CRC is valid
    const v = new DataView(bytes.buffer, bytes.byteOffset);
    let o = 8;
    while (o < bytes.length) {
      const len = v.getUint32(o);
      expect(crc32(bytes.subarray(o + 4, o + 8 + len))).toBe(v.getUint32(o + 8 + len));
      o += 12 + len;
    }
  });

  it('rejects a PNG without IEND', () => {
    expect(() => stripPng(pngFixture().slice(0, 60), { mode: 'all', keepOrientation: true, keepIcc: true })).toThrow();
  });
});

function riff(type: string, data: Uint8Array): Uint8Array {
  const pad = data.length & 1;
  const out = new Uint8Array(8 + data.length + pad);
  out.set(enc.encode(type));
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

function webpFixture(): Uint8Array {
  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x08 | 0x04; // EXIF + XMP flags
  const body = cat(
    enc.encode('WEBP'),
    riff('VP8X', vp8x),
    riff('VP8 ', new Uint8Array([1, 2, 3, 4, 5])),
    riff('EXIF', tiffWithGps(6, true)),
    riff('XMP ', enc.encode('<x exif:GPSLatitude="1" dc:title="t"/>')),
  );
  const out = cat(enc.encode('RIFF'), new Uint8Array(4), body);
  new DataView(out.buffer).setUint32(4, body.length, true);
  return out;
}

describe('stripWebp', () => {
  it('removes EXIF/XMP chunks, fixes flags and RIFF size, keeps pixels', () => {
    const { bytes } = stripWebp(webpFixture(), { mode: 'all', keepOrientation: false, keepIcc: true });
    expect(has(bytes, 'EXIF')).toBe(false);
    expect(has(bytes, 'XMP ')).toBe(false);
    expect(has(bytes, 'VP8 ')).toBe(true);
    expect(bytes[20]! & 0x0c).toBe(0);
    expect(new DataView(bytes.buffer).getUint32(4, true)).toBe(bytes.length - 8);
  });

  it('keeps a minimal orientation chunk when asked', () => {
    const { bytes } = stripWebp(webpFixture(), { mode: 'all', keepOrientation: true, keepIcc: true });
    const idx = text(bytes).indexOf('EXIF');
    expect(tiffOrientation(bytes.subarray(idx + 8))).toBe(6);
    expect(has(bytes, 'Canon')).toBe(false);
    expect(new DataView(bytes.buffer).getUint32(4, true)).toBe(bytes.length - 8);
  });

  it('GPS only edits both chunks in place', () => {
    const { bytes } = stripWebp(webpFixture(), { mode: 'gps', keepOrientation: true, keepIcc: true });
    expect(has(bytes, 'GPSLatitude')).toBe(false);
    expect(has(bytes, 'Canon')).toBe(true);
    expect(has(bytes, 'dc:title')).toBe(true);
  });
});

describe('exif inspection and diff', () => {
  it('formats decimal coordinates to DMS and flags GPS + camera risks', () => {
    expect(formatDms(23.8103, 'N', 'S')).toContain('23° 48\'');
    const res = normalizeParsedTags(
      { Make: 'Canon', Model: 'EOS R', latitude: 23.81, longitude: 90.41, DateTimeOriginal: new Date('2026-01-01T10:00:00Z') },
      [{ name: 'EXIF', bytes: 224 }],
      true,
    );
    expect(res.gps?.latDms).toContain('N');
    expect(res.riskFlags.length).toBeGreaterThanOrEqual(3);
  });

  it('builds a sample EXIF block and diffs removed fields after stripping', async () => {
    const sampleJpg = cat(new Uint8Array([0xff, 0xd8]), seg(0xe1, cat(enc.encode('Exif\0\0'), buildSampleExifTiff())), IMAGE_DATA);
    const before = await inspectBytes(sampleJpg, 'jpeg');
    expect(before.gps).not.toBeNull();
    expect(before.fields.some((f) => f.key === 'Make' && f.value === 'SampleCam')).toBe(true);

    const { bytes } = stripJpeg(sampleJpg, { mode: 'all', keepOrientation: true, keepIcc: true });
    const after = await inspectBytes(bytes, 'jpeg');
    expect(after.gps).toBeNull();
    const diff = diffMetadata(before.fields, after.fields);
    expect(diff.some((d) => d.key === 'Make' && d.status === 'removed')).toBe(true);
  });
});
