import jsQR from 'jsqr';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function decodeImageData(data: ImageData): string | null {
  return jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

/** Decodes a QR from an image file. Throws a readable message when it is not a QR. */
export async function decodeQrFile(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('That image is over 10 MB.');
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Use a PNG, JPG or WebP image.');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Image decoding is not available.');
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const text = decodeImageData(ctx.getImageData(0, 0, c.width, c.height));
  if (!text) throw new Error('No QR code found in that image.');
  return text;
}
