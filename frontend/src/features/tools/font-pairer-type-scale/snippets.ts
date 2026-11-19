import { findFont, fontStack, type FontChoice } from './fonts';

export interface Role {
  font: FontChoice;
  weight: number;
}

export const GOOGLE_PRIVACY_NOTE =
  'Privacy: loading fonts from fonts.googleapis.com sends each visitor\'s IP address and browser details to Google. In the EU this has led to GDPR claims. Prefer self-hosting (Fontsource) for public sites.';

/** Fontsource package slug: "Source Sans 3" -> "source-sans-3". */
export function fontsourceSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function familyParam(name: string, weights: number[]): string {
  const w = [...new Set(weights)].sort((a, b) => a - b);
  return `family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@${w.join(';')}`;
}

function webFonts(roles: Role[]): Role[] {
  return roles.filter((r) => !r.font.system);
}

/** Groups roles by family so one family used twice yields a single request entry. */
function byFamily(roles: Role[]): Map<string, number[]> {
  const m = new Map<string, number[]>();
  for (const r of webFonts(roles)) m.set(r.font.name, [...(m.get(r.font.name) ?? []), r.weight]);
  return m;
}

/** Copyable <link> for the Google Fonts CSS API (export only: the tool itself never requests it). */
export function googleLink(heading: Role, body: Role): string | null {
  const fams = byFamily([heading, body]);
  if (!fams.size) return null;
  const query = [...fams].map(([n, w]) => familyParam(n, w)).join('&');
  const url = `https://fonts.googleapis.com/css2?${query}&display=swap`;
  return `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link href="${url}" rel="stylesheet">`;
}

/** Self-hosted option: npm install plus CSS imports per weight. */
export function fontsourceSnippet(heading: Role, body: Role): string | null {
  const fams = byFamily([heading, body]);
  if (!fams.size) return null;
  const pkgs = [...fams.keys()].map((n) => `@fontsource/${fontsourceSlug(n)}`).join(' ');
  const imports = [...fams]
    .flatMap(([n, ws]) => [...new Set(ws)].sort((a, b) => a - b).map((w) => `import '@fontsource/${fontsourceSlug(n)}/${w}.css';`))
    .join('\n');
  return `npm install ${pkgs}\n\n${imports}`;
}

export function fontFamilyCss(heading: Role, body: Role): string {
  return `h1, h2, h3, h4 {\n  font-family: ${fontStack(heading.font)};\n  font-weight: ${heading.weight};\n}\n\nbody {\n  font-family: ${fontStack(body.font)};\n  font-weight: ${body.weight};\n}\n`;
}

export function pairToJson(heading: Role, body: Role, sample: string): string {
  return JSON.stringify(
    {
      heading: { family: heading.font.name, weight: heading.weight },
      body: { family: body.font.name, weight: body.weight },
      sample,
    },
    null,
    2,
  );
}

/** Restores a pair saved as JSON; unknown families come back as null so the UI can say "font unavailable". */
export function roleFromSaved(name: string, weight: number): Role | null {
  const font = findFont(name);
  return font ? { font, weight: font.weights.includes(weight) ? weight : (font.weights.find((w) => w >= 400) ?? font.weights[0] ?? 400) } : null;
}
