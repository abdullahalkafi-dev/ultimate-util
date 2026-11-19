import { readFirstBytes, sniffType } from '@/lib/files';
import { extractPalette, type Extraction } from './quantize';

const SAMPLE_WIDTH = 200;
const DECODABLE = new Set(['png', 'jpeg', 'gif', 'webp', 'avif', 'bmp']);

export interface ImageExtraction extends Extraction {
  /** Animated formats only contribute their first frame. */
  firstFrameOnly: boolean;
}

/** Throws an Error with a user-facing message on any problem. Never uploads anything. */
export async function extractFromFile(file: File, count: number): Promise<ImageExtraction> {
  const type = sniffType(await readFirstBytes(file));
  if (type === 'heic') throw new Error('HEIC photos cannot be read here. Convert it to JPG first (see Bulk Resizer & Converter).');
  if (!DECODABLE.has(type)) throw new Error('That does not look like a PNG, JPG, WebP, GIF or AVIF image, even if the name says so.');

  let data: ImageData;
  try {
    data = await sample(file);
  } catch {
    throw new Error(
      type === 'avif'
        ? 'This browser cannot decode AVIF images. Try a JPG or PNG instead.'
        : 'The image could not be decoded. It may be corrupt; try another file.',
    );
  }
  return { ...extractPalette(data.data, count), firstFrameOnly: type === 'gif' || type === 'webp' };
}

/** Decodes straight to a small bitmap so a huge photo never becomes a full-size canvas. */
async function sample(file: File): Promise<ImageData> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { resizeWidth: SAMPLE_WIDTH, resizeQuality: 'low' });
  } catch {
    bitmap = null;
  }
  if (bitmap) {
    const out = draw(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    return out;
  }
  // Older browsers: decode through an <img> and scale on a canvas.
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, SAMPLE_WIDTH / img.naturalWidth);
    return draw(img, Math.max(1, Math.round(img.naturalWidth * scale)), Math.max(1, Math.round(img.naturalHeight * scale)));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(source: CanvasImageSource, width: number, height: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available');
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}
