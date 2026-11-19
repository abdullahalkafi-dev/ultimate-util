import { formatOklch, hexToRgb, rgbToHex } from '../_shared-color/convert';
import { shadeScale } from './harmony';

export type ExportFormat = 'css' | 'tailwind3' | 'tailwind4' | 'scss' | 'json';

export const EXPORT_FORMATS: { id: ExportFormat; label: string; ext: string }[] = [
  { id: 'css', label: 'CSS variables', ext: 'css' },
  { id: 'tailwind4', label: 'Tailwind v4 (@theme)', ext: 'css' },
  { id: 'tailwind3', label: 'Tailwind v3 (config)', ext: 'js' },
  { id: 'scss', label: 'SCSS variables', ext: 'scss' },
  { id: 'json', label: 'JSON', ext: 'json' },
];

export interface NamedColor {
  name: string;
  hex: string;
}

/** ASCII slug for use as a CSS / config key. Returns '' when nothing usable remains. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface SlugResult {
  names: string[];
  /** True when a name had to be replaced or reduced to ASCII. */
  sanitized: boolean;
}

/** Slugs for every color; empty ones become color-N and duplicates get -2, -3 suffixes. */
export function uniqueSlugs(names: string[]): SlugResult {
  const seen = new Map<string, number>();
  let sanitized = false;
  const out = names.map((raw, i) => {
    let slug = slugify(raw);
    if (slug !== raw.trim().toLowerCase()) sanitized = true;
    if (!slug) slug = `color-${i + 1}`;
    const n = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, n);
    return n === 1 ? slug : `${slug}-${n}`;
  });
  return { names: out, sanitized };
}

export interface ExportOptions {
  /** Tailwind only: expand each color into a 50..900 scale with the color at 500. */
  shades: boolean;
}

export function exportPalette(colors: NamedColor[], format: ExportFormat, options: ExportOptions = { shades: false }): string {
  const { names } = uniqueSlugs(colors.map((c) => c.name));
  const items = colors.map((c, i) => ({ name: names[i] ?? `color-${i + 1}`, hex: c.hex.toLowerCase() }));
  const scale = (hex: string) => {
    const rgb = hexToRgb(hex);
    return rgb ? shadeScale(rgb) : [];
  };

  switch (format) {
    case 'css':
      return `:root {\n${items.map((c) => `  --${c.name}: ${c.hex};`).join('\n')}\n}\n`;
    case 'scss':
      return items.map((c) => `$${c.name}: ${c.hex};`).join('\n') + '\n';
    case 'tailwind4': {
      const lines = items.flatMap((c) =>
        options.shades ? scale(c.hex).map((s) => `  --color-${c.name}-${s.step}: ${s.hex};`) : [`  --color-${c.name}: ${c.hex};`],
      );
      return `@theme {\n${lines.join('\n')}\n}\n`;
    }
    case 'tailwind3': {
      const body = items
        .map((c) => {
          if (!options.shades) return `        '${c.name}': '${c.hex}',`;
          const inner = scale(c.hex).map((s) => `          ${s.step}: '${s.hex}',`).join('\n');
          return `        '${c.name}': {\n${inner}\n        },`;
        })
        .join('\n');
      return `/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n  theme: {\n    extend: {\n      colors: {\n${body}\n      },\n    },\n  },\n};\n`;
    }
    case 'json':
      return (
        JSON.stringify(
          items.map((c) => {
            const rgb = hexToRgb(c.hex);
            return { name: c.name, hex: c.hex, oklch: rgb ? formatOklch(rgb) : null };
          }),
          null,
          2,
        ) + '\n'
      );
  }
}

/** File name such as palette-3a7bd5.css, based on the first color. */
export function exportFileName(colors: NamedColor[], ext: string): string {
  const first = colors[0] ? rgbToHexSafe(colors[0].hex) : 'colors';
  return `palette-${first}.${ext}`;
}

function rgbToHexSafe(hex: string): string {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHex(rgb).slice(1) : 'colors';
}
