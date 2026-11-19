import { describe, expect, it } from 'vitest';
import {
  FIXED_REF_DATE,
  exportFakeCsv,
  exportFakeJson,
  exportFakeSql,
  generateFakeRows,
  loadLocaleFaker,
  sanitizeSqlIdentifier,
} from './fakedata';
import { DEVICE_FRAMES, orientedFrame } from './frames';
import { buildPlaceholderSvg, parseSizeRows, placeholderContrast, svgToDataUri } from './placeholder';

describe('placeholder and mockup helpers', () => {
  it('builds exact placeholder SVG, data URI and contrast check', () => {
    const svg = buildPlaceholderSvg({ width: 600, height: 400, bg: '#e2e8f0', fg: '#0f172a', label: '600 x 400', pattern: 'solid' });
    expect(svg).toContain('width="600"');
    expect(svg).toContain('height="400"');
    expect(svg).toContain('600 x 400');
    expect(svgToDataUri(svg)).toMatch(/^data:image\/svg\+xml/);
    expect(placeholderContrast('#ffffff', '#0b0f19').passesAA).toBe(true);
    expect(parseSizeRows('400x300, 800x600')).toEqual([
      { width: 400, height: 300 },
      { width: 800, height: 600 },
    ]);
  });

  it('rotates generic phone/tablet frames in landscape', () => {
    const p = orientedFrame(DEVICE_FRAMES.phone, true);
    expect(p.frameW).toBeGreaterThan(p.frameH);
    expect(p.label).not.toMatch(/Apple|iPhone|Samsung/i);
  });
});

describe('seeded fake data generator', () => {
  it('produces byte-identical JSON on two runs with fixed reference date and independent field seeds', async () => {
    const f1 = await loadLocaleFaker('en');
    const f2 = await loadLocaleFaker('en');
    const r1 = generateFakeRows(f1, { seed: 'alpha-42', locale: 'en', count: 5, fields: ['id', 'name', 'email', 'birthdate'] });
    const r2 = generateFakeRows(f2, { seed: 'alpha-42', locale: 'en', count: 5, fields: ['id', 'name', 'email', 'birthdate'] });
    expect(exportFakeJson(r1, { seed: 'alpha-42', locale: 'en', refDate: FIXED_REF_DATE })).toBe(
      exportFakeJson(r2, { seed: 'alpha-42', locale: 'en', refDate: FIXED_REF_DATE }),
    );
    expect(r1[0]?.email).toMatch(/@example\.(com|org|test)$/);

    // Reordering fields must not change email or birthdate
    const reordered = generateFakeRows(f2, { seed: 'alpha-42', locale: 'en', count: 5, fields: ['birthdate', 'email', 'name'] });
    expect(reordered[0]?.email).toBe(r1[0]?.email);
    expect(reordered[0]?.birthdate).toBe(r1[0]?.birthdate);
  });

  it('supports Bengali and Arabic locales with UTF-8 BOM and CSV injection protection', async () => {
    const bn = await loadLocaleFaker('bn_BD');
    const bnRows = generateFakeRows(bn, { seed: 'dhaka', locale: 'bn_BD', count: 2, fields: ['name', 'avatar'] });
    expect((bnRows[0]?.name ?? '').length).toBeGreaterThan(0);
    expect(bnRows[0]?.avatar).toMatch(/^data:image\/svg\+xml/);

    const ar = await loadLocaleFaker('ar');
    const arRows = generateFakeRows(ar, { seed: 'cairo', locale: 'ar', count: 2, fields: ['name'] });
    expect((arRows[0]?.name ?? '').length).toBeGreaterThan(0);

    const csv = exportFakeCsv([{ name: '=SUM(A1)', email: '+880123' }], ['name', 'email'], { bom: true, guardInjection: true });
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain("'+880123");
  });

  it('escapes SQL identifiers and strings for PostgreSQL, MySQL and SQLite', () => {
    expect(sanitizeSqlIdentifier('my users!')).toEqual({ clean: 'my_users_', changed: true });
    const rows = [{ name: "O'Reilly \\ test" }];
    const pg = exportFakeSql(rows, ['name'], { table: 'users', dialect: 'postgresql', createTable: true });
    expect(pg).toContain('CREATE TABLE "users"');
    expect(pg).toContain("'O''Reilly \\ test'");

    const my = exportFakeSql(rows, ['name'], { table: 'users', dialect: 'mysql', createTable: true });
    expect(my).toContain('DEFAULT CHARSET=utf8mb4');
    expect(my).toContain("'O''Reilly \\\\ test'");
  });
});
