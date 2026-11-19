import type { RasterType } from '../_shared-images/input';
import { FORMAT_EXT, type OutFormat } from '../_shared-images/types';
import { sanitizeFileName, stripExtension } from '../_shared-images/naming';

export type Mode = 'smart' | 'lossy' | 'lossless';
export type FormatChoice = 'keep' | OutFormat;

export interface Settings {
  mode: Mode;
  quality: number;
  format: FormatChoice;
  /** Max width and height in pixels; 0 means no limit. */
  maxDimension: number;
  /** Background used when transparency must be flattened (PNG with alpha to JPG). */
  background: string;
  /** Animated images: allow compressing them to a still image (first frame only). */
  allowFirstFrame: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'smart',
  quality: 80,
  format: 'keep',
  maxDimension: 0,
  background: '#ffffff',
  allowFirstFrame: false,
};

/** Format used for "Keep": same as the input where we can encode it, a sensible default otherwise. */
export function outputFormatFor(input: RasterType | 'heic', choice: FormatChoice): OutFormat {
  if (choice !== 'keep') return choice;
  switch (input) {
    case 'jpeg': return 'jpeg';
    case 'webp': return 'webp';
    case 'avif': return 'avif';
    case 'heic': return 'jpeg';
    default: return 'png'; // png, gif, bmp
  }
}

export function savedPercent(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round(((before - after) / before) * 100);
}

export type Outcome = 'compressed' | 'already-optimized';

/** Never hand back something bigger than (or equal to) the input. */
export function decideOutcome(originalBytes: number, outputBytes: number): Outcome {
  return outputBytes < originalBytes ? 'compressed' : 'already-optimized';
}

export function compressedName(original: string, format: OutFormat): string {
  const base = sanitizeFileName(stripExtension(original)) || 'image';
  return `${base}-compressed.${FORMAT_EXT[format]}`;
}

export interface Totals {
  files: number;
  before: number;
  after: number;
  saved: number;
  percent: number;
}

export function totals(items: { before: number; after: number }[]): Totals {
  const before = items.reduce((n, i) => n + i.before, 0);
  const after = items.reduce((n, i) => n + i.after, 0);
  return { files: items.length, before, after, saved: before - after, percent: savedPercent(before, after) };
}
