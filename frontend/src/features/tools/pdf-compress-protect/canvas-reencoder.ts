import type { Reencoder } from './compress';
import { targetSize, type CompressSettings } from './plan';

async function encode(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array | null> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

function drawTo(width: number, height: number, settings: CompressSettings) {
  const size = targetSize(width, height, settings.dpi);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  // JPEG has no alpha: flatten onto white so transparent areas do not turn black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx, size };
}

/** Browser codec: decode with createImageBitmap / ImageData, downscale and re-encode as JPEG. */
export const canvasReencoder: Reencoder = {
  async fromJpeg(bytes, width, height, settings) {
    const bitmap = await createImageBitmap(new Blob([bytes.slice().buffer], { type: 'image/jpeg' }));
    const { canvas, ctx, size } = drawTo(width, height, settings);
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const out = await encode(canvas, settings.quality);
    canvas.width = canvas.height = 0;
    return out ? { bytes: out, width: size.width, height: size.height } : null;
  },
  async fromRaw(pixels, width, height, comps, settings) {
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, j = 0; i < width * height; i++, j += 4) {
      if (comps === 3) {
        rgba[j] = pixels[i * 3]!;
        rgba[j + 1] = pixels[i * 3 + 1]!;
        rgba[j + 2] = pixels[i * 3 + 2]!;
      } else {
        rgba[j] = rgba[j + 1] = rgba[j + 2] = pixels[i]!;
      }
      rgba[j + 3] = 255;
    }
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    source.getContext('2d')?.putImageData(new ImageData(rgba, width, height), 0, 0);
    const { canvas, ctx, size } = drawTo(width, height, settings);
    ctx.drawImage(source, 0, 0, size.width, size.height);
    source.width = source.height = 0;
    const out = await encode(canvas, settings.quality);
    canvas.width = canvas.height = 0;
    return out ? { bytes: out, width: size.width, height: size.height } : null;
  },
};
