import type { RasterType } from '../_shared-images/input';
import { computeLayout, emptyResize } from '../_shared-images/geometry';
import { renderName } from '../_shared-images/naming';
import { FORMAT_EXT, MAX_DIMENSION, MAX_PIXELS, type FitMode, type OutFormat, type OutputJob, type ResizeSpec } from '../_shared-images/types';

export type ResizeMode = 'none' | 'pixels' | 'percent' | 'longEdge' | 'preset';
export type FormatChoice = 'keep' | OutFormat;
export type ZipLayout = 'flat' | 'folders';

export interface SizeRow {
  id: number;
  width: number;
  height: number;
}

export interface Settings {
  resizeMode: ResizeMode;
  width: number;
  height: number;
  lockAspect: boolean;
  percent: number;
  longEdge: number;
  presetId: string;
  fit: FitMode;
  anchor: { x: number; y: number };
  doNotEnlarge: boolean;
  padColor: string;
  padTransparent: boolean;
  format: FormatChoice;
  quality: number;
  background: string;
  pattern: string;
  /** Extra sizes, each producing its own output (max 8). Replaces the base size when present. */
  sizes: SizeRow[];
  svgScales: number[];
  svgBaseWidth: number;
  zip: ZipLayout;
}

export const MAX_SIZE_ROWS = 8;

export const DEFAULT_SETTINGS: Settings = {
  resizeMode: 'pixels',
  width: 1200,
  height: 0,
  lockAspect: true,
  percent: 50,
  longEdge: 1600,
  presetId: 'ig-square',
  fit: 'inside',
  anchor: { x: 0.5, y: 0.5 },
  doNotEnlarge: true,
  padColor: '#ffffff',
  padTransparent: false,
  format: 'webp',
  quality: 80,
  background: '#ffffff',
  pattern: '{name}-{w}x{h}',
  sizes: [],
  svgScales: [1],
  svgBaseWidth: 512,
  zip: 'flat',
};

export interface Preset {
  id: string;
  group: string;
  label: string;
  width: number;
  height: number;
  fit: FitMode;
}

export const PRESETS: Preset[] = [
  { id: 'ig-square', group: 'Instagram', label: 'Square post 1080×1080', width: 1080, height: 1080, fit: 'cover' },
  { id: 'ig-portrait', group: 'Instagram', label: 'Portrait post 1080×1350', width: 1080, height: 1350, fit: 'cover' },
  { id: 'ig-story', group: 'Instagram', label: 'Story 1080×1920', width: 1080, height: 1920, fit: 'cover' },
  { id: 'x-header', group: 'X / Twitter', label: 'Header 1500×500', width: 1500, height: 500, fit: 'cover' },
  { id: 'x-post', group: 'X / Twitter', label: 'Post image 1600×900', width: 1600, height: 900, fit: 'cover' },
  { id: 'fb-cover', group: 'Facebook', label: 'Cover 820×312', width: 820, height: 312, fit: 'cover' },
  { id: 'fb-post', group: 'Facebook', label: 'Post 1200×630', width: 1200, height: 630, fit: 'cover' },
  { id: 'li-banner', group: 'LinkedIn', label: 'Banner 1584×396', width: 1584, height: 396, fit: 'cover' },
  { id: 'yt-thumb', group: 'YouTube', label: 'Thumbnail 1280×720', width: 1280, height: 720, fit: 'cover' },
  { id: 'og', group: 'Web', label: 'Open Graph image 1200×630', width: 1200, height: 630, fit: 'cover' },
  { id: 'fav-512', group: 'Web', label: 'Favicon / app icon 512×512', width: 512, height: 512, fit: 'pad' },
  { id: 'fav-192', group: 'Web', label: 'Favicon / app icon 192×192', width: 192, height: 192, fit: 'pad' },
  { id: 'fav-32', group: 'Web', label: 'Favicon 32×32', width: 32, height: 32, fit: 'pad' },
  { id: 'market-2000', group: 'Marketplace', label: 'Square 2000×2000', width: 2000, height: 2000, fit: 'pad' },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);

/** Format used for "Keep". GIF, BMP and SVG sources become PNG. */
export function resolveFormat(choice: FormatChoice, type: RasterType | 'svg'): OutFormat {
  if (choice !== 'keep') return choice;
  return type === 'jpeg' || type === 'webp' || type === 'avif' ? type : 'png';
}

/** The resize rules the settings produce, one per output size. A row has a label used in file names and folders. */
export interface SizePlan {
  key: string;
  label: string;
  preset?: string;
  resize: ResizeSpec;
}

export function sizePlans(s: Settings): SizePlan[] {
  const common = { fit: s.fit, anchor: s.anchor, doNotEnlarge: s.doNotEnlarge } as const;
  if (s.sizes.length) {
    return s.sizes.map((row, i) => ({
      key: `size-${i}`,
      label: `${row.width || 'auto'}w`,
      resize: { ...common, mode: 'box', width: row.width || undefined, height: row.height || undefined },
    }));
  }
  switch (s.resizeMode) {
    case 'none':
      return [{ key: 'base', label: 'original', resize: emptyResize() }];
    case 'percent':
      return [{ key: 'base', label: `${s.percent}pct`, resize: { ...common, mode: 'percent', percent: s.percent } }];
    case 'longEdge':
      return [{ key: 'base', label: `${s.longEdge}px`, resize: { ...common, mode: 'longEdge', longEdge: s.longEdge } }];
    case 'preset': {
      const p = presetById(s.presetId);
      if (!p) return [{ key: 'base', label: 'original', resize: emptyResize() }];
      // A preset defines its own fit unless the user changed it afterwards.
      return [{ key: 'base', label: p.id, preset: p.id, resize: { ...common, mode: 'box', width: p.width, height: p.height } }];
    }
    default:
      return [{ key: 'base', label: `${s.width || 'auto'}w`, resize: { ...common, mode: 'box', width: s.width || undefined, height: s.height || undefined } }];
  }
}

export function encodeSpecFor(s: Settings, format: OutFormat) {
  return {
    format,
    quality: s.quality,
    lossless: false,
    smart: false,
    background: s.background,
    padColor: s.padTransparent && format !== 'jpeg' ? null : s.padColor,
  };
}

export function rasterJobs(s: Settings, type: RasterType): OutputJob[] {
  const format = resolveFormat(s.format, type);
  return sizePlans(s).map((p) => ({ key: p.key, resize: p.resize, encode: encodeSpecFor(s, format) }));
}

export interface SvgJob {
  key: string;
  label: string;
  preset?: string;
  scale: number;
  /** Pixel size to draw the SVG at. */
  rasterW: number;
  rasterH: number;
  /** Final resize applied to the raster (crop or pad for fill/pad modes). */
  resize: ResizeSpec;
  skipped?: string;
}

/** Plans SVG outputs: each size row times each scale. Vector sources are never limited by "do not enlarge". */
export function svgJobs(s: Settings, base: { width: number; height: number }): SvgJob[] {
  const jobs: SvgJob[] = [];
  for (const plan of sizePlans(s)) {
    const free: ResizeSpec = { ...plan.resize, doNotEnlarge: false };
    const layout = computeLayout(Math.round(base.width), Math.round(base.height), free);
    for (const scale of s.svgScales.length ? s.svgScales : [1]) {
      const boxW = layout.outW * scale;
      const boxH = layout.outH * scale;
      let rasterW = boxW;
      let rasterH = boxH;
      if (layout.dw !== layout.outW || layout.dh !== layout.outH) {
        // pad: the artwork is smaller than the box
        rasterW = layout.dw * scale;
        rasterH = layout.dh * scale;
      } else if (layout.sw !== base.width || layout.sh !== base.height) {
        // fill: draw the whole artwork at cover size, the crop happens afterwards
        const k = Math.max(boxW / layout.sw, boxH / layout.sh);
        rasterW = Math.round(base.width * k);
        rasterH = Math.round(base.height * k);
      }
      const tooBig = Math.max(rasterW, boxW, rasterH, boxH) > MAX_DIMENSION || rasterW * rasterH > MAX_PIXELS;
      jobs.push({
        key: `${plan.key}@${scale}x`,
        label: plan.label,
        preset: plan.preset,
        scale,
        rasterW: Math.max(1, Math.round(rasterW)),
        rasterH: Math.max(1, Math.round(rasterH)),
        resize: { ...free, mode: 'box', width: boxW, height: boxH },
        skipped: tooBig ? `${scale}x is above the ${MAX_DIMENSION} px canvas limit, so it was skipped.` : undefined,
      });
    }
  }
  return jobs;
}

export interface PathContext {
  baseName: string;
  width: number;
  height: number;
  index: number;
  preset?: string;
  scale?: string;
  label: string;
  format: OutFormat;
}

/** Output path inside the ZIP (or the download name). */
export function outputPath(s: Settings, ctx: PathContext): string {
  const name = renderName(s.pattern, { name: ctx.baseName, w: ctx.width, h: ctx.height, n: ctx.index, preset: ctx.preset, scale: ctx.scale });
  const file = `${name || 'image'}.${FORMAT_EXT[ctx.format]}`;
  return s.zip === 'folders' ? `${ctx.label}${ctx.scale ? `-${ctx.scale}` : ''}/${file}` : file;
}

export function outputCount(fileCount: number, s: Settings, svgFiles = 0): number {
  const per = Math.max(1, s.sizes.length);
  const svgPer = per * Math.max(1, s.svgScales.length);
  return (fileCount - svgFiles) * per + svgFiles * svgPer;
}

/** Predicted output size for the live preview. */
export function previewSize(srcW: number, srcH: number, s: Settings): { width: number; height: number; notEnlarged: boolean }[] {
  return sizePlans(s).map((p) => {
    const l = computeLayout(srcW, srcH, p.resize);
    return { width: l.outW, height: l.outH, notEnlarged: l.notEnlarged };
  });
}

export function lockedHeight(width: number, srcW: number | null, srcH: number | null): number {
  return srcW && srcH ? Math.max(1, Math.round((width * srcH) / srcW)) : 0;
}
