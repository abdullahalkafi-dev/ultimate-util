import type { PreparedImage } from '../_shared-images/input';
import { emptyResize } from '../_shared-images/geometry';
import type { ImagePool } from '../_shared-images/pool';
import { FORMAT_MIME, type OutFormat } from '../_shared-images/types';
import { stripJpeg } from '../exif-tool/strip';
import { compressedName, decideOutcome, outputFormatFor, type Outcome, type Settings } from './compress';

export interface CompressResult {
  blob: Blob;
  name: string;
  before: number;
  after: number;
  outcome: Outcome;
  width: number | null;
  height: number | null;
  format: OutFormat;
  /** 0 means lossless. */
  quality: number;
  flattened: boolean;
  /** Human-readable label for how the result was made. */
  method: string;
}

export type RunOutcome =
  | { kind: 'done'; result: CompressResult }
  | { kind: 'skipped'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'cancelled' };

/** Compresses one prepared image. `original` is the file as the user added it. */
export async function compressItem(original: File, prepared: PreparedImage, settings: Settings, pool: ImagePool): Promise<RunOutcome> {
  if (prepared.type === 'svg') return { kind: 'error', message: 'SVG is not an input here.' };
  if (prepared.animated && !settings.allowFirstFrame) {
    return {
      kind: 'skipped',
      message: 'Animated image skipped: compressing it would keep only the first frame. Tick "Allow first frame only" to convert it anyway.',
    };
  }
  const format = outputFormatFor(prepared.fromHeic ? 'heic' : prepared.type, settings.format);
  const sameFormat = !prepared.fromHeic && ((prepared.type === 'jpeg' && format === 'jpeg') || prepared.type === format);
  const before = original.size;
  const source = await prepared.blob.arrayBuffer();

  // Lossless JPEG: drop metadata segments, leave the compressed pixels byte-for-byte alone.
  if (settings.mode === 'lossless' && prepared.type === 'jpeg' && format === 'jpeg' && !settings.maxDimension) {
    try {
      const stripped = stripJpeg(new Uint8Array(source), { mode: 'all', keepOrientation: true, keepIcc: false });
      return finish(original, new Blob([stripped.bytes.slice().buffer], { type: FORMAT_MIME.jpeg }), format, 0, before, prepared, {
        width: prepared.width,
        height: prepared.height,
        flattened: false,
        method: 'Lossless: metadata removed, pixels untouched',
      });
    } catch {
      // damaged container: fall through to the decoder, which reports the real problem
    }
  }

  const maxDim = settings.maxDimension;
  const response = await pool.run(source, [
    {
      key: 'main',
      resize: maxDim
        ? { ...emptyResize(), mode: 'box', width: maxDim, height: maxDim, fit: 'inside', doNotEnlarge: true }
        : emptyResize(),
      encode: {
        format,
        quality: settings.mode === 'lossless' && format === 'jpeg' ? 95 : settings.quality,
        lossless: settings.mode === 'lossless',
        smart: settings.mode === 'smart',
        smartTarget: before,
        background: settings.background,
        padColor: null,
      },
    },
  ]);
  if (response.error === 'Cancelled') return { kind: 'cancelled' };
  if (!response.ok) return { kind: 'error', message: response.error ?? 'Compression failed.' };
  const out = response.results[0];
  if (!out?.ok || !out.bytes) return { kind: 'error', message: out?.error ?? 'Compression failed.' };

  const method =
    out.qualityUsed === 0
      ? 'Lossless'
      : settings.mode === 'smart'
        ? `Smart, quality ${out.qualityUsed}`
        : `Lossy, quality ${out.qualityUsed}`;
  return finish(original, new Blob([out.bytes], { type: FORMAT_MIME[format] }), format, out.qualityUsed ?? 0, before, prepared, {
    width: out.width ?? null,
    height: out.height ?? null,
    flattened: Boolean(out.flattened),
    method: sameFormat || prepared.fromHeic ? method : `${method} (converted)`,
  });
}

function finish(
  original: File,
  blob: Blob,
  format: OutFormat,
  quality: number,
  before: number,
  prepared: PreparedImage,
  extra: { width: number | null; height: number | null; flattened: boolean; method: string },
): RunOutcome {
  // HEIC has to be converted to be useful, so the size rule only applies to formats we can hand back as-is.
  const mustConvert = prepared.fromHeic === true;
  const outcome = mustConvert ? 'compressed' : decideOutcome(before, blob.size);
  if (outcome === 'already-optimized') {
    return {
      kind: 'done',
      result: {
        blob: original,
        name: original.name,
        before,
        after: before,
        outcome,
        width: prepared.width,
        height: prepared.height,
        format,
        quality,
        flattened: false,
        method: 'Already optimized: the original is kept',
      },
    };
  }
  return { kind: 'done', result: { blob, name: compressedName(original.name, format), before, after: blob.size, outcome, format, quality, ...extra } };
}
