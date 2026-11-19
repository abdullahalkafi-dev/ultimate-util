import { sniffType } from '@/lib/files';
import { encodePixels, type Pixels } from './codecs';
import { computeLayout } from './geometry';
import { MAX_PIXELS, type OutputJob, type OutputResult, type TransformResponse } from './types';

/** Worker-side pipeline: decode once, then render every requested output. */

export function parseHexColor(color: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return [255, 255, 255];
  let hex = m[1]!;
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Draws onto `ctx`, halving step by step first so big reductions stay sharp. */
function drawReduced(
  ctx: OffscreenCanvasRenderingContext2D,
  source: CanvasImageSource,
  rect: { sx: number; sy: number; sw: number; sh: number },
  dest: { dx: number; dy: number; dw: number; dh: number },
) {
  let cur = source;
  let { sx, sy, sw, sh } = rect;
  while (sw / dest.dw >= 2 || sh / dest.dh >= 2) {
    const w = Math.max(dest.dw, Math.ceil(sw / 2));
    const h = Math.max(dest.dh, Math.ceil(sh / 2));
    const step = new OffscreenCanvas(w, h);
    const sctx = step.getContext('2d')!;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(cur, sx, sy, sw, sh, 0, 0, w, h);
    cur = step;
    sx = 0; sy = 0; sw = w; sh = h;
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, sx, sy, sw, sh, dest.dx, dest.dy, dest.dw, dest.dh);
}

async function decode(bytes: ArrayBuffer): Promise<ImageBitmap> {
  try {
    // Orientation from EXIF is applied by the browser, so output pixels are upright.
    return await createImageBitmap(new Blob([bytes]), { imageOrientation: 'from-image' });
  } catch (nativeError) {
    const type = sniffType(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 512)));
    try {
      let decoded: ImageData | null = null;
      if (type === 'avif') decoded = await (await import('@jsquash/avif/decode')).default(bytes);
      else if (type === 'webp') decoded = await (await import('@jsquash/webp/decode')).default(bytes);
      else if (type === 'jpeg') decoded = await (await import('@jsquash/jpeg/decode')).default(bytes);
      else if (type === 'png') decoded = await (await import('@jsquash/png/decode')).default(bytes);
      if (decoded) return await createImageBitmap(decoded);
    } catch {
      // fall through to the native error
    }
    throw nativeError;
  }
}

function hasAlpha(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true;
  return false;
}

function flatten(data: Uint8ClampedArray, bg: [number, number, number]) {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]! / 255;
    if (a === 1) continue;
    data[i] = Math.round(data[i]! * a + bg[0] * (1 - a));
    data[i + 1] = Math.round(data[i + 1]! * a + bg[1] * (1 - a));
    data[i + 2] = Math.round(data[i + 2]! * a + bg[2] * (1 - a));
    data[i + 3] = 255;
  }
}

async function renderOne(bitmap: ImageBitmap, job: OutputJob): Promise<OutputResult> {
  const layout = computeLayout(bitmap.width, bitmap.height, job.resize);
  if (layout.outW * layout.outH > MAX_PIXELS * 2) throw new Error('The output size is too large for this browser.');
  const canvas = new OffscreenCanvas(layout.outW, layout.outH);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const padded = layout.dw !== layout.outW || layout.dh !== layout.outH;
  if (padded && job.encode.padColor) {
    ctx.fillStyle = job.encode.padColor;
    ctx.fillRect(0, 0, layout.outW, layout.outH);
  }
  drawReduced(ctx, bitmap, layout, layout);
  const image = ctx.getImageData(0, 0, layout.outW, layout.outH);
  const alpha = hasAlpha(image.data);
  const mustFlatten = job.encode.format === 'jpeg' && alpha;
  if (job.encode.format === 'jpeg') flatten(image.data, parseHexColor(job.encode.background));
  const pixels: Pixels = { data: image.data, width: image.width, height: image.height };
  const encoded = await encodePixels(pixels, job.encode);
  const out = new Uint8Array(encoded.bytes); // own copy so the buffer can be transferred
  return {
    key: job.key,
    ok: true,
    bytes: out.buffer,
    width: layout.outW,
    height: layout.outH,
    hadAlpha: alpha,
    flattened: mustFlatten,
    notEnlarged: layout.notEnlarged,
    clamped: layout.clamped,
    qualityUsed: encoded.quality,
  };
}

export async function runTransform(id: number, bytes: ArrayBuffer, jobs: OutputJob[]): Promise<TransformResponse> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(bytes);
  } catch {
    return { id, ok: false, error: 'This image could not be decoded. It may be corrupt, truncated or an unsupported variant.', results: [] };
  }
  if (bitmap.width * bitmap.height > MAX_PIXELS) {
    const mp = Math.round((bitmap.width * bitmap.height) / 1e6);
    bitmap.close();
    return { id, ok: false, error: `This image is ${mp} megapixels, above the 100 megapixel limit.`, results: [] };
  }
  const results: OutputResult[] = [];
  for (const job of jobs) {
    try {
      results.push(await renderOne(bitmap, job));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      const memory = /memory|allocation|RangeError/i.test(message);
      results.push({
        key: job.key,
        ok: false,
        error: memory ? 'The browser ran out of memory. Resize the image smaller first and try again.' : message,
      });
    }
  }
  const response: TransformResponse = { id, ok: true, srcWidth: bitmap.width, srcHeight: bitmap.height, results };
  bitmap.close();
  return response;
}
