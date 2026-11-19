export type OutFormat = 'jpeg' | 'png' | 'webp' | 'avif';

export const FORMAT_EXT: Record<OutFormat, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', avif: 'avif' };
export const FORMAT_MIME: Record<OutFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

export const MAX_DIMENSION = 16384;
export const MAX_PIXELS = 100_000_000;
export const HARD_FILE_BYTES = 100 * 1024 * 1024;
export const SOFT_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_BATCH = 50;

export type FitMode = 'inside' | 'cover' | 'pad' | 'stretch';

export interface ResizeSpec {
  mode: 'none' | 'percent' | 'longEdge' | 'box';
  width?: number;
  height?: number;
  percent?: number;
  longEdge?: number;
  fit: FitMode;
  /** Crop focus for cover and placement for pad, each 0 to 1. */
  anchor: { x: number; y: number };
  doNotEnlarge: boolean;
}

export interface Layout {
  outW: number;
  outH: number;
  /** Source rectangle that is drawn. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Destination rectangle inside the output canvas. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  notEnlarged: boolean;
  clamped: boolean;
}

/** How the encoder should treat one output. */
export interface EncodeSpec {
  format: OutFormat;
  /** 1 to 100. */
  quality: number;
  lossless: boolean;
  /** Smart mode: try lossless first, then lossy at decreasing quality until it is smaller than `smartTarget`. */
  smart: boolean;
  /** Byte size a Smart result must beat (usually the original size). */
  smartTarget?: number;
  /** Flatten transparency onto this CSS color (always used for JPEG). */
  background: string;
  /** Pad color; null means transparent where the format supports alpha. */
  padColor: string | null;
}

export interface OutputJob {
  key: string;
  resize: ResizeSpec;
  encode: EncodeSpec;
}

export interface TransformRequest {
  id: number;
  bytes: ArrayBuffer;
  jobs: OutputJob[];
}

export interface OutputResult {
  key: string;
  ok: boolean;
  error?: string;
  bytes?: ArrayBuffer;
  width?: number;
  height?: number;
  hadAlpha?: boolean;
  flattened?: boolean;
  notEnlarged?: boolean;
  clamped?: boolean;
  /** Quality actually used; Smart mode may lower it. 0 means lossless. */
  qualityUsed?: number;
}

export interface TransformResponse {
  id: number;
  ok: boolean;
  error?: string;
  srcWidth?: number;
  srcHeight?: number;
  results: OutputResult[];
}
