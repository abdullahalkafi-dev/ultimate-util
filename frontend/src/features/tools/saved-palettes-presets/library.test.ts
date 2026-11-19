import { describe, expect, it } from 'vitest';
import {
  exportCss, exportJson, exportTailwind, findDuplicate, normalizeColor, parseImport, planMerge, uniqueName, validateDraft,
  type LibItem,
} from './library';

const item = (over: Partial<LibItem> & { colors?: string[] }): LibItem => ({
  id: over.id ?? 'x', kind: 'palette', name: over.name ?? 'Brand', tags: [], createdAt: '2026-01-01T00:00:00Z',
  updatedAt: over.updatedAt ?? '2026-01-01T00:00:00Z', data: { colors: over.colors ?? ['#111111', '#eeeeee'] },
});

describe('colors and validation', () => {
  it('normalizes hex and names', () => {
    expect(normalizeColor('#FFF')).toBe('#ffffff');
    expect(normalizeColor('red')).toBe('#ff0000');
    expect(normalizeColor('#12')).toBeNull();
  });
  it('validates softbox ranges', () => {
    expect(validateDraft({ kind: 'softbox', name: 'Warm', data: { kelvin: 3200, brightness: 80, shape: 'ring' } }).ok).toBe(true);
    expect(validateDraft({ kind: 'softbox', name: 'x', data: { kelvin: 20000, brightness: 80, shape: 'ring' } }).ok).toBe(false);
    expect(validateDraft({ kind: 'softbox', name: 'x', data: { kelvin: 3000, brightness: 80, shape: 'oval' } }).ok).toBe(false);
  });
  it('rejects palettes with bad colors or too few', () => {
    expect(validateDraft({ kind: 'palette', name: 'a', data: { colors: ['#fff', 'nope'] } }).ok).toBe(false);
    expect(validateDraft({ kind: 'palette', name: 'a', data: { colors: ['#fff'] } }).ok).toBe(false);
  });
  it('caps names by code points', () => {
    const r = validateDraft({ kind: 'palette', name: '😀'.repeat(80), data: { colors: ['#fff', '#000'] } });
    expect(r.ok && Array.from(r.value.name).length).toBe(60);
  });
});

describe('import', () => {
  it('imports bare color arrays and reports invalid ones', () => {
    const r = parseImport('["#fff","red","bad","#000"]');
    expect(r.drafts[0]?.data.colors).toEqual(['#ffffff', '#ff0000', '#000000']);
    expect(r.errors).toHaveLength(1);
  });
  it('reports bad JSON and per-item failures', () => {
    expect(parseImport('{').errors).toHaveLength(1);
    const r = parseImport(JSON.stringify({ items: [{ kind: 'palette', name: 'ok', data: { colors: ['#fff', '#000'] } }, { kind: 'nope' }] }));
    expect(r.drafts).toHaveLength(1);
    expect(r.errors).toHaveLength(1);
  });
});

describe('merge', () => {
  it('creates new, dedupes identical, newest wins on same name', () => {
    const remote = [
      item({ id: 'r1', name: 'A', colors: ['#111111', '#222222'], updatedAt: '2026-02-01T00:00:00Z' }),
      item({ id: 'r2', name: 'B', colors: ['#333333', '#444444'], updatedAt: '2026-01-01T00:00:00Z' }),
    ];
    const local = [
      item({ id: 'l1', name: 'A', colors: ['#aaaaaa', '#bbbbbb'], updatedAt: '2026-01-15T00:00:00Z' }),
      item({ id: 'l2', name: 'B', colors: ['#cccccc', '#dddddd'], updatedAt: '2026-03-01T00:00:00Z' }),
      item({ id: 'l3', name: 'C', colors: ['#333333', '#444444'] }),
      item({ id: 'l4', name: 'D', colors: ['#010101', '#020202'] }),
    ];
    const plan = planMerge(local, remote);
    expect(plan.create.map((d) => d.name)).toEqual(['D']);
    expect(plan.update.map((u) => u.id)).toEqual(['r2']);
    expect(plan.skipped).toBe(2);
  });
  it('respects the account cap', () => {
    const remote = Array.from({ length: 99 }, (_, i) => item({ id: `r${i}`, name: `R${i}`, colors: ['#000000', `#0000${String(i).padStart(2, '0')}`] }));
    const local = [item({ id: 'a', name: 'N1', colors: ['#fa0001', '#fa0002'] }), item({ id: 'b', name: 'N2', colors: ['#fb0001', '#fb0002'] })];
    const plan = planMerge(local, remote, 100);
    expect(plan.create).toHaveLength(1);
    expect(plan.overflow).toBe(1);
  });
});

describe('export and naming', () => {
  const items = [item({ name: 'Brand Blue', colors: ['#2446f0', '#ffffff'] })];
  it('css variables', () => expect(exportCss(items)).toContain('--brand-blue-1: #2446f0;'));
  it('tailwind', () => expect(exportTailwind(items)).toContain("'brand-blue-2': '#ffffff'"));
  it('json roundtrips through import', () => expect(parseImport(exportJson(items)).drafts).toHaveLength(1));
  it('unique names and duplicate detection', () => {
    expect(uniqueName('Brand', ['brand', 'Brand (2)'])).toBe('Brand (3)');
    expect(findDuplicate(items, { kind: 'palette', data: { colors: ['#2446f0', '#ffffff'] } })).toBeDefined();
    expect(findDuplicate(items, { kind: 'palette', data: { colors: ['#2446f0', '#000000'] } })).toBeUndefined();
  });
});
