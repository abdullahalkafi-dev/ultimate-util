import { describe, expect, it } from 'vitest';
import { buildExport, detectSecret, editDistance, fillVariables, findDuplicate, fuzzySearch, guessKind, isTrashed, parseImport, parseVariables, trashFolder, untrashFolder, type Searchable } from './snippets';
import { guessLanguage } from './highlight';

describe('variables', () => {
  it('parses unique variables in order with defaults and choices', () => {
    const v = parseVariables('Write about {{topic}} in a {{tone:formal,casual|formal}} tone. Repeat {{topic}} and {{ lang | English}}.');
    expect(v.map((x) => x.name)).toEqual(['topic', 'tone', 'lang']);
    expect(v[1]).toMatchObject({ choices: ['formal', 'casual'], default: 'formal' });
  });
  it('fills exactly, uses defaults, never adds a newline', () => {
    const body = 'Topic: {{topic}} / {{tone|polite}} / {{topic}}';
    expect(fillVariables(body, { topic: 'cats' })).toBe('Topic: cats / polite / cats');
    expect(fillVariables(body, { topic: 'x', tone: 'blunt' })).toBe('Topic: x / blunt / x');
  });
  it('treats an escaped brace as literal', () => {
    expect(parseVariables('\\{{notAVar}}')).toEqual([]);
    expect(fillVariables('\\{{keep}} {{a}}', { a: '1' })).toBe('{{keep}} 1');
  });
  it('ignores non-variable braces', () => {
    expect(parseVariables('{{ }} and {{1bad}} and {}')).toEqual([]);
  });
});

describe('secret detector', () => {
  it('flags key-like strings and not normal text', () => {
    expect(detectSecret('AKIAIOSFODNN7EXAMPLE')).toBeTruthy();
    expect(detectSecret('-----BEGIN OPENSSH PRIVATE KEY-----')).toBeTruthy();
    expect(detectSecret('ghp_abcdefghijklmnopqrstuvwxyz0123456789')).toBeTruthy();
    expect(detectSecret('sk-abcdefghijklmnopqrstuvwxyz123456')).toBeTruthy();
    expect(detectSecret('password=hunter2hunter2')).toBeTruthy();
    expect(detectSecret('git reset --soft HEAD~1')).toBeNull();
    expect(detectSecret('Write a poem about {{topic}}')).toBeNull();
  });
});

describe('fuzzy search', () => {
  const mk = (title: string, over: Partial<Searchable> = {}): Searchable => ({ title, tags: [], description: '', body: '', language: 'text', isFavorite: false, ...over });
  it('tolerates typos (dokcer -> docker)', () => {
    const items = [mk('docker run'), mk('git undo'), mk('kubectl pods')];
    expect(fuzzySearch(items, 'dokcer')[0]!.title).toBe('docker run');
  });
  it('ranks title above body and requires all tokens', () => {
    const items = [mk('notes', { body: 'docker is here' }), mk('docker compose')];
    expect(fuzzySearch(items, 'docker').map((i) => i.title)).toEqual(['docker compose', 'notes']);
    expect(fuzzySearch(items, 'docker zzzz')).toHaveLength(0);
  });
  it('edit distance counts transposition as one edit', () => {
    expect(editDistance('docker', 'dokcer')).toBe(1);
  });
});

describe('duplicates, trash, kind, language', () => {
  it('finds duplicates ignoring whitespace', () => {
    expect(findDuplicate([{ id: '1', body: 'a  b\nc' }], 'a b c')?.id).toBe('1');
    expect(findDuplicate([{ id: '1', body: 'a b' }], 'a b', '1')).toBeUndefined();
  });
  it('round-trips the trash marker', () => {
    expect(isTrashed(trashFolder('work'))).toBe(true);
    expect(untrashFolder(trashFolder('work'))).toBe('work');
    expect(untrashFolder('')).toBe('');
  });
  it('guesses kind and language', () => {
    expect(guessKind('docker ps -a')).toBe('command');
    expect(guessKind('Hello {{name}}')).toBe('prompt');
    expect(guessLanguage('{"a": 1}')).toBe('json');
    expect(guessLanguage('git status')).toBe('bash');
  });
});

describe('import/export', () => {
  const item = { title: 't', kind: 'code' as const, language: 'text', description: '', body: 'x', tags: ['a'], folder: '', isFavorite: false };
  it('round-trips', () => {
    const r = parseImport(buildExport([item]));
    expect(r.valid).toEqual([item]);
    expect(r.invalid).toBe(0);
  });
  it('reports malformed JSON, wrong files and invalid items', () => {
    expect(() => parseImport('{nope')).toThrow(/not valid JSON/);
    expect(() => parseImport('{"a":1}')).toThrow(/not a snippet export/);
    const text = JSON.stringify({ app: 'ultimate-util-snippets', v: 1, items: [item, { title: '' }] });
    expect(parseImport(text)).toMatchObject({ invalid: 1 });
  });
});
