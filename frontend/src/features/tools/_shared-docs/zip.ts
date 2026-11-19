/** Reads a ZIP central directory without inflating anything, so bombs are rejected cheaply. */
export interface ZipScan {
  entries: string[];
  totalUncompressed: number;
}

export class ZipError extends Error {
  constructor(
    message: string,
    readonly code: 'corrupt' | 'too-many-entries' | 'too-large',
  ) {
    super(message);
  }
}

export interface ZipLimits {
  maxEntries: number;
  maxUncompressed: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = { maxEntries: 5000, maxUncompressed: 500 * 1024 * 1024 };

export function scanZip(bytes: Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS): ZipScan {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const stop = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= stop; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('The file is not a valid ZIP package.', 'corrupt');
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (count > limits.maxEntries) throw new ZipError('The file contains too many parts.', 'too-many-entries');
  const entries: string[] = [];
  let total = 0;
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new ZipError('The ZIP directory is damaged.', 'corrupt');
    }
    total += view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    entries.push(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen)));
    if (total > limits.maxUncompressed) {
      throw new ZipError('The file expands to an unsafe size and was not opened.', 'too-large');
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, totalUncompressed: total };
}
