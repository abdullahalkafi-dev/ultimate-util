import type { SniffedType } from '@/lib/files';

export interface ImageInfo {
  width: number;
  height: number;
  animated: boolean;
}

const u16be = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u32be = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const u16le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u24le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
const u32le = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
const tag = (b: Uint8Array, o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);

function pngInfo(b: Uint8Array): ImageInfo | null {
  if (b.length < 24) return null;
  let animated = false;
  let o = 8;
  while (o + 8 <= b.length) {
    const len = u32be(b, o);
    const type = tag(b, o + 4);
    if (type === 'acTL') animated = true;
    if (type === 'IDAT') break;
    o += 12 + len;
  }
  return { width: u32be(b, 16), height: u32be(b, 20), animated };
}

function jpegInfo(b: Uint8Array): ImageInfo | null {
  let o = 2;
  while (o + 4 < b.length) {
    if (b[o] !== 0xff) {
      o++;
      continue;
    }
    const marker = b[o + 1]!;
    if (marker === 0xff) {
      o++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2;
      continue;
    }
    const len = u16be(b, o + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: u16be(b, o + 5), width: u16be(b, o + 7), animated: false };
    o += 2 + len;
  }
  return null;
}

function gifInfo(b: Uint8Array): ImageInfo | null {
  if (b.length < 13) return null;
  // Two Graphic Control Extensions mean at least two frames.
  let frames = 0;
  for (let i = 13; i + 1 < b.length && frames < 2; i++) {
    if (b[i] === 0x21 && b[i + 1] === 0xf9) frames++;
  }
  return { width: u16le(b, 6), height: u16le(b, 8), animated: frames > 1 };
}

function webpInfo(b: Uint8Array): ImageInfo | null {
  if (b.length < 30) return null;
  const kind = tag(b, 12);
  if (kind === 'VP8X') {
    return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1, animated: (b[20]! & 0x02) !== 0 };
  }
  if (kind === 'VP8 ') return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff, animated: false };
  if (kind === 'VP8L') {
    const bits = u32le(b, 21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, animated: false };
  }
  return null;
}

function bmpInfo(b: Uint8Array): ImageInfo | null {
  if (b.length < 26) return null;
  return { width: u32le(b, 18), height: Math.abs(u32le(b, 22) | 0), animated: false };
}

/** Reads dimensions (and animation) from file headers without decoding pixels. */
export function readImageInfo(bytes: Uint8Array, type: SniffedType): ImageInfo | null {
  try {
    switch (type) {
      case 'png': return pngInfo(bytes);
      case 'jpeg': return jpegInfo(bytes);
      case 'gif': return gifInfo(bytes);
      case 'webp': return webpInfo(bytes);
      case 'bmp': return bmpInfo(bytes);
      default: return null;
    }
  } catch {
    return null;
  }
}
