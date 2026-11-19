import { contrastRatio, formatRatio } from '../_shared-color/contrast';
import { clamp, hexToRgb } from '../_shared-color/convert';

export type PlaceholderPattern = 'solid' | 'diagonal' | 'grid' | 'gradient';
export type PlaceholderFormat = 'svg' | 'png' | 'jpeg' | 'webp';

export interface PlaceholderOptions {
  width: number;
  height: number;
  bg: string;
  fg: string;
  label: string;
  pattern: PlaceholderPattern;
}

export const MAX_PLACEHOLDER_SIDE = 8000;
export const MAX_PLACEHOLDER_PIXELS = 64_000_000;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function placeholderContrast(bg: string, fg: string): { ratio: string; passesAA: boolean } {
  const b = hexToRgb(bg) ?? { r: 226, g: 232, b: 240 };
  const f = hexToRgb(fg) ?? { r: 15, g: 23, b: 42 };
  const r = contrastRatio(f, b);
  return { ratio: formatRatio(r), passesAA: r >= 4.5 };
}

export function buildPlaceholderSvg(opts: PlaceholderOptions): string {
  const w = clamp(Math.round(opts.width), 1, MAX_PLACEHOLDER_SIDE);
  const h = clamp(Math.round(opts.height), 1, MAX_PLACEHOLDER_SIDE);
  const text = (opts.label || `${w} × ${h}`).trim();
  const minDim = Math.min(w, h);
  const showText = minDim >= 24 && text.length > 0;
  const fontSize = Math.max(11, Math.min(64, Math.floor(Math.min(w / Math.max(4, text.length * 0.68), h * 0.28))));
  const isRtl = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(text);

  let defs = '';
  let fill = opts.bg;
  let overlay = '';
  if (opts.pattern === 'gradient') {
    defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${escapeXml(opts.bg)}"/><stop offset="100%" stop-color="${escapeXml(opts.fg)}" stop-opacity="0.2"/></linearGradient></defs>`;
    fill = 'url(#g)';
  } else if (opts.pattern === 'diagonal') {
    overlay = `<line x1="0" y1="0" x2="${w}" y2="${h}" stroke="${escapeXml(opts.fg)}" stroke-opacity="0.18" stroke-width="2"/><line x1="${w}" y1="0" x2="0" y2="${h}" stroke="${escapeXml(opts.fg)}" stroke-opacity="0.18" stroke-width="2"/>`;
  } else if (opts.pattern === 'grid') {
    defs = `<defs><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M 32 0 L 0 0 0 32" fill="none" stroke="${escapeXml(opts.fg)}" stroke-opacity="0.14" stroke-width="1"/></pattern></defs>`;
    overlay = `<rect width="${w}" height="${h}" fill="url(#grid)"/>`;
  }

  const labelEl = showText
    ? `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" direction="${isRtl ? 'rtl' : 'ltr'}" fill="${escapeXml(opts.fg)}" font-family="system-ui, -apple-system, sans-serif" font-weight="600" font-size="${fontSize}">${escapeXml(text)}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}<rect width="${w}" height="${h}" fill="${fill}"/>${overlay}${labelEl}</svg>`;
}

export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function imgTagSnippet(dataUri: string, width: number, height: number, alt: string): string {
  return `<img src="${dataUri}" width="${width}" height="${height}" alt="${escapeXml(alt || 'Placeholder')}" />`;
}

export function parseSizeRows(text: string): { width: number; height: number }[] {
  const out: { width: number; height: number }[] = [];
  for (const line of text.split(/[\n,]+/)) {
    const m = /^\s*(\d{1,4})\s*[x×]\s*(\d{1,4})\s*$/i.exec(line);
    if (m) {
      const w = clamp(Number(m[1]), 1, MAX_PLACEHOLDER_SIDE);
      const h = clamp(Number(m[2]), 1, MAX_PLACEHOLDER_SIDE);
      if (w * h <= MAX_PLACEHOLDER_PIXELS) out.push({ width: w, height: h });
    }
  }
  return out.slice(0, 20);
}
