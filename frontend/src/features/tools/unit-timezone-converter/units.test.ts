import { describe, expect, it } from 'vitest';
import { exactString, formatNumber } from './format';
import { parseUnitQuery } from './parse';
import { parseTimeQuery } from './timeQuery';
import { buildPlanner, ianaOffsetAt, resolveLocal, resolveZoneText, slotWindows } from './timezone';

describe('unit-timezone-converter', () => {
  it('converts 5 km in miles to 6 significant digits', () => {
    const r = parseUnitQuery('5 km in miles');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.query.value).toBeCloseTo(3.10685596, 6);
      expect(formatNumber(r.query.value!)).toBe('3.10686');
    }
  });

  it('distinguishes decimal GB and binary GiB and warns when mixing', () => {
    const gb = parseUnitQuery('10 GB to MB');
    expect(gb.ok && gb.query.value).toBe(10_000);
    const gib = parseUnitQuery('10 GiB to MiB');
    expect(gib.ok && gib.query.value).toBe(10_240);
    const mixed = parseUnitQuery('10 GB to GiB');
    expect(mixed.ok && mixed.query.notes.some((n) => n.includes('Mixing families'))).toBe(true);
  });

  it('handles temperature offset formulas and rejects below absolute zero', () => {
    const cToF = parseUnitQuery('100 C to F');
    expect(cToF.ok && cToF.query.value).toBeCloseTo(212, 8);
    const kToC = parseUnitQuery('0 K to C');
    expect(kToC.ok && kToC.query.value).toBeCloseTo(-273.15, 8);
    const belowZero = parseUnitQuery('-500 C to F');
    expect(belowZero.ok).toBe(false);
    if (!belowZero.ok) expect(belowZero.error).toMatch(/absolute zero/i);
  });

  it('handles compound length, Arabic-Indic digits and incompatible category errors', () => {
    const comp = parseUnitQuery('5 ft 3 in to cm');
    expect(comp.ok && comp.query.value).toBeCloseTo(160.02, 5);

    const ar = parseUnitQuery('٥ km to m');
    expect(ar.ok && ar.query.value).toBe(5000);

    const bad = parseUnitQuery('5 kg to km');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/mass.*length/);
  });

  it('handles exact precision formatting and fuel economy zero check', () => {
    expect(exactString(0.1 + 0.2)).toBe('0.3');
    expect(parseUnitQuery('0 mpg to l/100km').ok).toBe(false);
  });

  it('never guesses ambiguous abbreviations like IST', () => {
    const res = resolveZoneText('IST', Date.parse('2026-01-01T00:00:00Z'));
    expect(res.kind).toBe('ambiguous');
    if (res.kind === 'ambiguous') {
      expect(res.options.map((o) => o.id)).toContain('Asia/Kolkata');
    }

    const q = parseTimeQuery('3pm IST to PST', Date.parse('2026-01-01T00:00:00Z'));
    expect(q?.ok).toBe(true);
    if (q?.ok) {
      expect(q.query.ambiguousFrom?.abbr).toBe('IST');
    }
  });

  it('detects DST spring-forward gap and fall-back overlap in America/New_York', () => {
    const gap = resolveLocal({ y: 2026, mo: 3, d: 8, h: 2, mi: 30 }, { kind: 'iana', id: 'America/New_York' });
    expect(gap.status).toBe('gap');

    const overlap = resolveLocal({ y: 2026, mo: 11, d: 1, h: 1, mi: 30 }, { kind: 'iana', id: 'America/New_York' });
    expect(overlap.status).toBe('overlap');
  });

  it('computes fractional timezone offsets such as Asia/Kathmandu (+5:45)', () => {
    expect(ianaOffsetAt(Date.parse('2026-06-01T00:00:00Z'), 'Asia/Kathmandu')).toBe(345);
  });

  it('computes meeting planner overlap windows', () => {
    const planner = buildPlanner(
      [
        { kind: 'iana', id: 'Europe/London' },
        { kind: 'iana', id: 'America/New_York' },
      ],
      { kind: 'iana', id: 'Europe/London' },
      { y: 2026, mo: 6, d: 10 },
      9,
      17,
    );
    expect(planner.rows).toHaveLength(2);
    const windows = slotWindows(planner.overlap);
    expect(windows.length).toBeGreaterThan(0);
  });
});
