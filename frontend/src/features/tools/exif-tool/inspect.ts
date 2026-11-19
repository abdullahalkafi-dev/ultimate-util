import { listMetadataBlocks, type ContainerBlock, type StripFormat } from './strip';

export type MetaCategory = 'camera' | 'location' | 'dates' | 'software' | 'other';

export interface MetaField {
  key: string;
  value: string;
  category: MetaCategory;
  isGps: boolean;
  risk?: 'high' | 'medium';
}

export interface GpsSummary {
  lat: number;
  lon: number;
  altitude?: number;
  latDms: string;
  lonDms: string;
}

export interface InspectionResult {
  fields: MetaField[];
  gps: GpsSummary | null;
  riskFlags: string[];
  blocks: ContainerBlock[];
  hasThumbnail: boolean;
  thumbnailBytes?: Uint8Array;
  parseWarning?: string;
}

export function formatDms(decimal: number, posHem: string, negHem: string): string {
  const hem = decimal >= 0 ? posHem : negHem;
  const abs = Math.abs(decimal);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  return `${deg}° ${min}' ${sec.toFixed(2)}" ${hem}`;
}

function stringifyVal(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? String(val) : val.toISOString();
  if (val instanceof Uint8Array || ArrayBuffer.isView(val)) return `Opaque binary (${val.byteLength} bytes)`;
  if (Array.isArray(val)) return val.map((v) => stringifyVal(v)).join(', ');
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

const CAMERA_KEYS = /^(Make|Model|LensMake|LensModel|FocalLength|FNumber|ExposureTime|ISO|ISOSpeedRatings|ShutterSpeedValue|ApertureValue|Flash|WhiteBalance|SerialNumber|BodySerialNumber|LensSerialNumber|Orientation|ImageWidth|ImageHeight)$/i;
const DATE_KEYS = /(Date|Time|CreateDate|ModifyDate|DateTimeOriginal|OffsetTime)/i;
const SOFTWARE_KEYS = /^(Software|Artist|Author|Creator|Copyright|OwnerName|CameraOwnerName|HostComputer|ProcessingSoftware)$/i;

export function classifyKey(key: string): MetaCategory {
  if (key.toLowerCase().includes('gps') || key === 'latitude' || key === 'longitude') return 'location';
  if (DATE_KEYS.test(key)) return 'dates';
  if (SOFTWARE_KEYS.test(key)) return 'software';
  if (CAMERA_KEYS.test(key)) return 'camera';
  return 'other';
}

export function normalizeParsedTags(
  raw: Record<string, unknown> | null | undefined,
  blocks: ContainerBlock[],
  hasThumbnail: boolean,
  thumbnailBytes?: Uint8Array,
  parseWarning?: string,
): InspectionResult {
  const fields: MetaField[] = [];
  const riskFlags: string[] = [];
  let gps: GpsSummary | null = null;

  if (raw && typeof raw === 'object') {
    const lat = typeof raw['latitude'] === 'number' && Number.isFinite(raw['latitude']) ? raw['latitude'] : null;
    const lon = typeof raw['longitude'] === 'number' && Number.isFinite(raw['longitude']) ? raw['longitude'] : null;
    const alt = typeof raw['GPSAltitude'] === 'number' && Number.isFinite(raw['GPSAltitude']) ? raw['GPSAltitude'] : undefined;
    if (lat !== null && lon !== null) {
      gps = {
        lat,
        lon,
        altitude: alt,
        latDms: formatDms(lat, 'N', 'S'),
        lonDms: formatDms(lon, 'E', 'W'),
      };
      riskFlags.push('Contains GPS coordinates');
    }

    for (const [k, v] of Object.entries(raw)) {
      if (v === undefined || v === null) continue;
      if (k === 'thumbnail') continue;
      const str = stringifyVal(v);
      if (!str) continue;
      const cat = classifyKey(k);
      const isGps = cat === 'location';
      const isRisky = isGps || /serial|owner|artist|author|creator|software|device|make|model/i.test(k);
      fields.push({
        key: k,
        value: str,
        category: cat,
        isGps,
        risk: isGps ? 'high' : isRisky ? 'medium' : undefined,
      });
    }
  }

  if (!gps && fields.some((f) => f.isGps)) riskFlags.push('Contains GPS metadata');
  if (fields.some((f) => /^(Make|Model)$/i.test(f.key))) riskFlags.push('Contains camera/device model');
  if (fields.some((f) => /^(Artist|Author|Creator|OwnerName|SerialNumber|BodySerialNumber)$/i.test(f.key))) {
    riskFlags.push('Contains author or serial number');
  }
  if (hasThumbnail) riskFlags.push('Contains embedded preview thumbnail');

  return {
    fields: fields.sort((a, b) => a.key.localeCompare(b.key)),
    gps,
    riskFlags,
    blocks,
    hasThumbnail,
    thumbnailBytes,
    parseWarning,
  };
}

export async function inspectBytes(
  bytes: Uint8Array,
  containerType: StripFormat | null,
): Promise<InspectionResult> {
  const exifr = await import('exifr');
  const blocks = containerType ? listMetadataBlocks(bytes, containerType) : [];
  let parsed: Record<string, unknown> | undefined;
  let parseWarning: string | undefined;
  try {
    parsed = (await exifr.parse(bytes, {
      tiff: true,
      exif: true,
      gps: true,
      xmp: true,
      iptc: true,
      icc: false,
      jfif: false,
      mergeOutput: true,
      makerNote: true,
      userComment: true,
    })) as Record<string, unknown> | undefined;
  } catch {
    parseWarning = 'Some metadata blocks are damaged and could only be read partially.';
  }

  let thumb: Uint8Array | undefined;
  try {
    const rawThumb = await exifr.thumbnail(bytes);
    if (rawThumb && rawThumb.length > 0) thumb = new Uint8Array(rawThumb);
  } catch {
    thumb = undefined;
  }

  return normalizeParsedTags(parsed, blocks, Boolean(thumb), thumb, parseWarning);
}

export interface FieldDiffRow {
  key: string;
  before: string;
  after: string | null;
  status: 'removed' | 'kept' | 'changed';
}

export function diffMetadata(before: MetaField[], after: MetaField[]): FieldDiffRow[] {
  const afterMap = new Map(after.map((f) => [f.key, f.value]));
  return before.map((f) => {
    const next = afterMap.get(f.key);
    if (next === undefined) return { key: f.key, before: f.value, after: null, status: 'removed' };
    if (next !== f.value) return { key: f.key, before: f.value, after: next, status: 'changed' };
    return { key: f.key, before: f.value, after: next, status: 'kept' };
  });
}

/** Builds a small TIFF block with Camera Make/Model, Orientation=1, and GPS coordinates for the example file. */
export function buildSampleExifTiff(): Uint8Array {
  const enc = new TextEncoder();
  const buf = new Uint8Array(320);
  const v = new DataView(buf.buffer);
  // Big-endian TIFF
  buf[0] = 0x4d;
  buf[1] = 0x4d;
  v.setUint16(2, 42);
  v.setUint32(4, 8);
  // 4 IFD0 entries: Make (0x010f), Model (0x0110), Orientation (0x0112), GPSIFD (0x8825)
  v.setUint16(8, 4);
  const writeEntry = (idx: number, tag: number, type: number, count: number, valOrOffset: number) => {
    const o = 10 + idx * 12;
    v.setUint16(o, tag);
    v.setUint16(o + 2, type);
    v.setUint32(o + 4, count);
    if (type === 3 && count === 1) v.setUint16(o + 8, valOrOffset);
    else v.setUint32(o + 8, valOrOffset);
  };
  const make = enc.encode('SampleCam\0');
  const model = enc.encode('Demo M1\0');
  buf.set(make, 64);
  buf.set(model, 80);

  writeEntry(0, 0x010f, 2, make.length, 64);
  writeEntry(1, 0x0110, 2, model.length, 80);
  writeEntry(2, 0x0112, 3, 1, 1);
  writeEntry(3, 0x8825, 4, 1, 100);
  v.setUint32(10 + 4 * 12, 0);

  // GPS IFD at offset 100: LatRef (1), Lat (2), LonRef (3), Lon (4)
  v.setUint16(100, 4);
  const writeGps = (idx: number, tag: number, type: number, count: number, val: number) => {
    const o = 102 + idx * 12;
    v.setUint16(o, tag);
    v.setUint16(o + 2, type);
    v.setUint32(o + 4, count);
    v.setUint32(o + 8, val);
  };
  // ASCII inline ('N\0\0\0' = 0x4e000000, 'E\0\0\0' = 0x45000000)
  writeGps(0, 1, 2, 2, 0x4e000000);
  writeGps(1, 2, 5, 3, 160);
  writeGps(2, 3, 2, 2, 0x45000000);
  writeGps(3, 4, 5, 3, 190);
  v.setUint32(102 + 4 * 12, 0);

  // 23 deg 48 min 37 sec N
  const lat = [23, 1, 48, 1, 37, 1];
  lat.forEach((n, i) => v.setUint32(160 + i * 4, n));
  // 90 deg 24 min 45 sec E
  const lon = [90, 1, 24, 1, 45, 1];
  lon.forEach((n, i) => v.setUint32(190 + i * 4, n));
  return buf.subarray(0, 224);
}

/** Inserts an APP1 EXIF segment into a fresh JPEG right after SOI. */
export function injectExifIntoJpeg(jpeg: Uint8Array, tiff: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const header = enc.encode('Exif\0\0');
  const len = 2 + header.length + tiff.length;
  const seg = new Uint8Array(2 + len);
  seg[0] = 0xff;
  seg[1] = 0xe1;
  seg[2] = (len >> 8) & 255;
  seg[3] = len & 255;
  seg.set(header, 4);
  seg.set(tiff, 4 + header.length);
  const out = new Uint8Array(jpeg.length + seg.length);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(seg, 2);
  out.set(jpeg.subarray(2), 2 + seg.length);
  return out;
}
