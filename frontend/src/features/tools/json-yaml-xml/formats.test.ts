import { describe, expect, it } from 'vitest';
import { semanticDiff, textDiff } from './compare';
import { convertText, detectFormat, formatText, parseAny } from './formats';
import { parseJson } from './jsonParse';
import { countUnsafeNumbers, isUnsafeNumber } from './model';

describe('parseJson', () => {
  it('keeps integers beyond 2^53 and key order', () => {
    const r = parseJson('{"b":1,"2":9007199254740993,"1":2}');
    const out = formatText('{"b":1,"2":9007199254740993,"1":2}', 'json', { mode: 'minify' });
    expect(r.ok).toBe(true);
    expect(out.output).toBe('{"b":1,"2":9007199254740993,"1":2}');
  });

  it('reports line and column for a trailing comma', () => {
    const r = parseJson('{\n  "a": 1,\n}');
    expect(r.ok).toBe(false);
    expect(r.error?.message).toMatch(/Trailing comma/);
    expect(r.error?.line).toBe(2);
  });

  it('accepts comments and trailing commas in lenient mode', () => {
    const r = parseJson("// c\n{a: 'x', /* k */ b: [1,2,],}", true);
    expect(r.ok).toBe(true);
    const out = formatText("{a: 'x', b: [1,2,],}", 'json', { mode: 'minify', lenient: true });
    expect(out.output).toBe('{"a":"x","b":[1,2]}');
  });

  it('warns about duplicate keys', () => {
    const r = parseJson('{"a":1,"a":2}');
    expect(r.ok).toBe(true);
    expect(r.warnings[0]).toMatch(/Duplicate key "a"/);
  });

  it('rejects single quotes in strict mode with a hint', () => {
    const r = parseJson("{'a':1}");
    expect(r.ok).toBe(false);
    expect(r.error?.hint).toMatch(/double quotes/);
  });

  it('detects unclosed structures and extra content', () => {
    expect(parseJson('[1,2').error?.message).toMatch(/Unclosed array/);
    expect(parseJson('{"a":1} x').error?.message).toMatch(/after the JSON value/);
  });

  it('normalizes lenient numbers on output', () => {
    expect(formatText('[+1, .5, 0x1F]', 'json', { mode: 'minify', lenient: true }).output).toBe('[1,0.5,31]');
  });
});

describe('numbers', () => {
  it('flags unsafe numbers', () => {
    expect(isUnsafeNumber('9007199254740993')).toBe(true);
    expect(isUnsafeNumber('42')).toBe(false);
    expect(isUnsafeNumber('0.1234567890123456789')).toBe(true);
    const r = parseJson('[1, 12345678901234567890]');
    expect(countUnsafeNumbers(r.node!)).toBe(1);
  });
});

describe('format and convert', () => {
  it('beautifies with indent and sorts keys', () => {
    const out = formatText('{"b":1,"a":{"d":1,"c":2}}', 'json', { sort: true, indent: 2 });
    expect(out.output).toBe('{\n  "a": {\n    "c": 2,\n    "d": 1\n  },\n  "b": 1\n}');
  });

  it('JSON to YAML keeps big integers', () => {
    const out = convertText('{"id":9007199254740993,"n":[1,2]}', 'json', 'yaml');
    expect(out.output).toContain('id: 9007199254740993');
    expect(out.output).toContain('- 1');
  });

  it('YAML to JSON', () => {
    const out = convertText('a: 1\nb:\n  - x\n  - y\n', 'yaml', 'json', { mode: 'minify' });
    expect(out.output).toBe('{"a":1,"b":["x","y"]}');
  });

  it('YAML 1.1 reads yes as boolean, 1.2 as string', () => {
    expect(convertText('a: yes', 'yaml', 'json', { mode: 'minify', yamlVersion: '1.1' }).output).toBe('{"a":true}');
    expect(convertText('a: yes', 'yaml', 'json', { mode: 'minify', yamlVersion: '1.2' }).output).toBe('{"a":"yes"}');
  });

  it('YAML duplicate keys and bad indentation give an error with position', () => {
    const r = parseAny('a: 1\na: 2\n', 'yaml');
    expect(r.ok).toBe(false);
    expect(r.error?.line).toBe(2);
  });

  it('XML to JSON maps attributes and repeated tags', () => {
    const out = convertText('<r id="1"><i>a</i><i>b</i><![CDATA[x < y]]></r>', 'xml', 'json', { mode: 'minify' });
    expect(out.ok).toBe(true);
    expect(out.output).toContain('"@_id":"1"');
    expect(out.output).toContain('"i":["a","b"]');
    expect(out.output).toContain('x < y');
  });

  it('JSON to XML wraps in a root', () => {
    const out = convertText('{"a":1,"b":"two"}', 'json', 'xml', { mode: 'minify' });
    expect(out.output).toBe('<root><a>1</a><b>two</b></root>');
  });

  it('reports XML errors with a line', () => {
    const r = parseAny('<a>\n<b></a>', 'xml');
    expect(r.ok).toBe(false);
    expect(r.error?.line).toBe(2);
  });

  it('beautifies XML in place and limits entity expansion', () => {
    expect(formatText('<a><b>1</b></a>', 'xml', { indent: 2 }).output).toBe('<a>\n  <b>1</b>\n</a>');
    const bomb = `<!DOCTYPE z [<!ENTITY a "${'x'.repeat(2000)}">]><z>&a;</z>`;
    const out = formatText(bomb, 'xml');
    expect(out.ok).toBe(false);
    expect(out.error?.message).toMatch(/exceeds/);
  });
});

describe('detectFormat', () => {
  it('detects each format', () => {
    expect(detectFormat('{"a":1}')).toBe('json');
    expect(detectFormat('<a/>')).toBe('xml');
    expect(detectFormat('a: 1')).toBe('yaml');
  });
});

describe('diff', () => {
  it('text diff marks added and removed lines', () => {
    const d = textDiff('a\nb\n', 'a\nc\n');
    expect(d.map((p) => p.kind)).toEqual(['same', 'del', 'add']);
  });

  it('semantic diff ignores key order and finds changes', () => {
    const a = parseJson('{"x":1,"y":[1,2],"z":"s"}').node!;
    const b = parseJson('{"z":"s","y":[1,3,4],"w":true,"x":1.0}').node!;
    const c = semanticDiff(a, b);
    expect(c).toContainEqual({ path: '$.y[1]', kind: 'changed', before: '2', after: '3' });
    expect(c).toContainEqual({ path: '$.y[2]', kind: 'added', after: '4' });
    expect(c).toContainEqual({ path: '$.w', kind: 'added', after: 'true' });
    expect(c.find((x) => x.path === '$.x')).toBeUndefined();
  });
});
