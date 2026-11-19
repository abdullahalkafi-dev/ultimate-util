import { describe, expect, it } from 'vitest';
import {
  MAX_VERSIONS, PAYLOAD_BUDGET_BYTES, byteLength, emptyNote, fileNameFor, fitVersions, looksLikeSecret, normalizeTags, prepareMarkdown,
  searchNotes, snippetAround, splitForLimit, stripSecrets, withSnapshot,
} from './notes';

describe('secret blocks', () => {
  it('extracts ||secrets|| and leaves tokens', () => {
    const { md, secrets } = prepareMarkdown('key: ||abc123|| and ||x y||');
    expect(secrets).toEqual(['abc123', 'x y']);
    expect(md).not.toContain('abc123');
  });
  it('masks them in search snippets and does not match their content', () => {
    const n = { title: 'AWS', body: 'root key ||SUPERSECRET|| here', tags: [] };
    expect(searchNotes([n], 'supersecret')).toHaveLength(0);
    expect(searchNotes([n], 'root')).toHaveLength(1);
    expect(snippetAround(n.body, 'root')).not.toContain('SUPERSECRET');
    expect(stripSecrets(n.body)).toContain('••••');
  });
});

describe('search', () => {
  it('folds diacritics and case, requires all terms', () => {
    const n = { title: 'Café Wi-Fi', body: 'password list', tags: ['home'] };
    expect(searchNotes([n], 'CAFE wifi')).toHaveLength(0);
    expect(searchNotes([n], 'cafe password')).toHaveLength(1);
    expect(searchNotes([n], 'home')).toHaveLength(1);
  });
});

describe('versions', () => {
  const at = (t: number, body: string) => emptyNote({ title: 't', body, versions: [] , ...{} }) && { ...emptyNote({ title: 't', body }), versions: [] };
  it('snapshots previous content at most once per 5 minutes', () => {
    const a = { ...emptyNote({ title: 't', body: 'one' }) };
    const b = withSnapshot(a, { ...a, body: 'two' }, 1_000_000);
    expect(b.versions).toHaveLength(1);
    expect(b.versions[0]!.body).toBe('one');
    const c = withSnapshot(b, { ...b, body: 'three' }, 1_000_000 + 60_000);
    expect(c.versions).toHaveLength(1);
    const d = withSnapshot(c, { ...c, body: 'four' }, 1_000_000 + 6 * 60_000);
    expect(d.versions.map((v) => v.body)).toEqual(['one', 'three']);
    void at;
  });
  it('keeps at most 10', () => {
    const versions = Array.from({ length: 15 }, (_, i) => ({ title: '', body: `v${i}`, savedAt: i }));
    expect(fitVersions({ ...emptyNote(), versions }).versions).toHaveLength(MAX_VERSIONS);
  });
  it('drops oldest versions to fit the payload budget', () => {
    const big = 'x'.repeat(20_000);
    const versions = Array.from({ length: 5 }, (_, i) => ({ title: '', body: big, savedAt: i }));
    const fitted = fitVersions({ ...emptyNote({ body: 'y'.repeat(30_000) }), versions });
    expect(byteLength(JSON.stringify(fitted))).toBeLessThanOrEqual(PAYLOAD_BUDGET_BYTES);
    expect(fitted.versions.length).toBeLessThan(5);
  });
});

describe('limits and helpers', () => {
  it('splits over-limit text without losing a character', () => {
    const body = ('line of text\n'.repeat(5000)) + 'é'.repeat(100);
    const [a, b] = splitForLimit(body, 50_000);
    expect(a + b).toBe(body);
    expect(byteLength(a)).toBeLessThanOrEqual(50_000);
  });
  it('counts UTF-8 bytes', () => {
    expect(byteLength('é')).toBe(2);
    expect(byteLength('😀')).toBe(4);
  });
  it('detects secret-looking pastes', () => {
    expect(looksLikeSecret('-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
    expect(looksLikeSecret('AKIAABCDEFGHIJKLMNOP')).toBe(true);
    expect(looksLikeSecret('hello world')).toBe(false);
  });
  it('normalizes tags and file names', () => {
    expect(normalizeTags('Work, work, API ,')).toEqual(['work', 'api']);
    expect(fileNameFor('a/b: c?')).toBe('ab-c.md');
    expect(fileNameFor('')).toBe('note.md');
  });
});
