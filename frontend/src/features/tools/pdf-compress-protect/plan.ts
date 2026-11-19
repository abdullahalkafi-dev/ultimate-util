export interface CompressSettings {
  /** Images are limited to the pixel size that gives this many dpi on a full A4 page. */
  dpi: number;
  /** JPEG quality 0.1 to 1. */
  quality: number;
}

export type PresetId = 'light' | 'balanced' | 'strong';

export const PRESETS: Record<PresetId, CompressSettings & { label: string; hint: string }> = {
  light: { label: 'Light', hint: 'Best quality, smaller savings', dpi: 220, quality: 0.85 },
  balanced: { label: 'Balanced', hint: 'Good for email and portals', dpi: 150, quality: 0.7 },
  strong: { label: 'Strong', hint: 'Smallest file, text in scans may soften', dpi: 100, quality: 0.5 },
};

/** Settings tried in order by "target size" mode, from gentle to the floor. */
export const TARGET_LADDER: CompressSettings[] = [
  { dpi: 220, quality: 0.85 },
  { dpi: 180, quality: 0.75 },
  { dpi: 150, quality: 0.7 },
  { dpi: 120, quality: 0.6 },
  { dpi: 100, quality: 0.5 },
  { dpi: 80, quality: 0.4 },
  { dpi: 72, quality: 0.3 },
];

const A4_LONG_SIDE_INCHES = 11.69;

/** Longest allowed side in pixels for an image at the given dpi. */
export const maxSideFor = (dpi: number) => Math.round(dpi * A4_LONG_SIDE_INCHES);

/** New pixel size for an image: never upscaled, aspect ratio kept. */
export function targetSize(width: number, height: number, dpi: number): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height);
  const limit = maxSideFor(dpi);
  if (longest <= limit) return { width, height, scaled: false };
  const k = limit / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), scaled: true };
}

export interface Choice {
  bytes: Uint8Array;
  /** True when `bytes` is the untouched input. */
  original: boolean;
}

/** Output must never be larger than the input. */
export function pickSmaller(original: Uint8Array, candidate: Uint8Array | null): Choice {
  if (candidate && candidate.length < original.length) return { bytes: candidate, original: false };
  return { bytes: original, original: true };
}

/** First ladder step whose output fits, else the smallest seen (the floor). */
export function bestForTarget(results: { settings: CompressSettings; size: number }[], targetBytes: number) {
  const fit = results.find((r) => r.size <= targetBytes);
  if (fit) return { ...fit, reached: true };
  const smallest = results.reduce((a, b) => (b.size < a.size ? b : a));
  return { ...smallest, reached: false };
}
