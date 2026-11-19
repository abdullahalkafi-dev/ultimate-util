function includesAscii(bytes: Uint8Array, text: string): boolean {
  const needle = Array.from(text, (c) => c.charCodeAt(0));
  const first = needle[0]!;
  const end = bytes.length - needle.length;
  for (let i = 0; i <= end; i++) {
    if (bytes[i] !== first) continue;
    let k = 1;
    while (k < needle.length && bytes[i + k] === needle[k]) k++;
    if (k === needle.length) return true;
  }
  return false;
}

/** Signed PDFs carry a /ByteRange entry. */
export const looksSigned = (bytes: Uint8Array) => includesAscii(bytes, '/ByteRange');

/** PDF/A files declare themselves in XMP metadata (usually stored uncompressed). */
export const looksPdfA = (bytes: Uint8Array) => includesAscii(bytes, 'pdfaid:part');
