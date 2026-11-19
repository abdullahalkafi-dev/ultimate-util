import { describe, expect, it } from 'vitest';
import { ALL_FONTS, PAIRINGS, SAMPLES, findFont, fontStack, isRtl } from './fonts';
import { fontsourceSlug, fontsourceSnippet, googleLink, roleFromSaved, type Role } from './snippets';

const role = (name: string, weight: number): Role => {
  const font = findFont(name);
  if (!font) throw new Error(name);
  return { font, weight };
};

describe('curated pairings', () => {
  it('has 30 to 50 pairs that all reference known fonts and weights', () => {
    expect(PAIRINGS.length).toBeGreaterThanOrEqual(30);
    expect(PAIRINGS.length).toBeLessThanOrEqual(50);
    for (const pr of PAIRINGS) {
      const h = findFont(pr.heading);
      const b = findFont(pr.body);
      expect(h, pr.heading).toBeDefined();
      expect(b, pr.body).toBeDefined();
      expect(h?.weights).toContain(pr.headingWeight);
      expect(b?.weights).toContain(pr.bodyWeight);
      expect(pr.reason.length).toBeGreaterThan(10);
    }
  });
  it('has unique font names', () => {
    expect(new Set(ALL_FONTS.map((f) => f.name)).size).toBe(ALL_FONTS.length);
  });
});

describe('font stacks', () => {
  it('quotes names with spaces and adds a generic fallback', () => {
    expect(fontStack({ name: 'Playfair Display', category: 'serif' })).toBe("'Playfair Display', Georgia, 'Times New Roman', serif");
    expect(fontStack({ name: 'Inter', category: 'sans' })).toMatch(/^Inter, system-ui/);
  });
  it('escapes quotes in custom names', () => {
    expect(fontStack({ name: "O'Neil Sans", category: 'sans' })).toContain("'O\\'Neil Sans'");
  });
});

describe('snippets', () => {
  it('builds a Google Fonts link with merged weights', () => {
    const link = googleLink(role('Playfair Display', 700), role('Source Sans 3', 400)) ?? '';
    expect(link).toContain('family=Playfair+Display:wght@700&family=Source+Sans+3:wght@400&display=swap');
  });
  it('merges one family used for both roles', () => {
    const link = googleLink(role('Inter', 800), role('Inter', 400)) ?? '';
    expect(link.match(/family=Inter/g)).toHaveLength(1);
    expect(link).toContain('wght@400;800');
  });
  it('returns null when only system fonts are used', () => {
    expect(googleLink(role('System UI', 700), role('Transitional serif', 400))).toBeNull();
    expect(fontsourceSnippet(role('System UI', 700), role('Transitional serif', 400))).toBeNull();
  });
  it('builds a Fontsource snippet', () => {
    const s = fontsourceSnippet(role('Playfair Display', 700), role('Source Sans 3', 400)) ?? '';
    expect(s).toContain('npm install @fontsource/playfair-display @fontsource/source-sans-3');
    expect(s).toContain("import '@fontsource/source-sans-3/400.css';");
    expect(fontsourceSlug('Noto Sans JP')).toBe('noto-sans-jp');
  });
  it('restores saved roles and rejects unknown fonts', () => {
    expect(roleFromSaved('Inter', 700)?.weight).toBe(700);
    expect(roleFromSaved('Inter', 123)?.weight).toBe(400);
    expect(roleFromSaved('Gone Font', 400)).toBeNull();
  });
});

describe('samples', () => {
  it('detects RTL text', () => {
    expect(isRtl(SAMPLES.find((s) => s.id === 'ar')?.body ?? '')).toBe(true);
    expect(isRtl('Hello')).toBe(false);
  });
});
