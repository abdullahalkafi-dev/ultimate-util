import { describe, expect, it } from 'vitest';
import { SvgError, sanitizeSvg } from './sanitize';

const kinds = (r: ReturnType<typeof sanitizeSvg>) => r.removed.map((x) => x.kind);

describe('sanitizeSvg', () => {
  it('removes scripts, handlers, foreignObject and external hrefs', () => {
    const r = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><foreignObject><div>x</div></foreignObject><image href="https://evil.test/a.png"/><circle r="4"/></svg>',
    );
    expect(r.svg).not.toMatch(/script|onload|foreignObject|evil/i);
    expect(r.svg).toContain('<circle');
    expect(kinds(r)).toEqual(expect.arrayContaining(['script', 'event-handler', 'foreignObject', 'external-reference']));
  });

  it('keeps local fragment references and data images', () => {
    const r = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><defs><path id="a" d="M0 0"/></defs><use href="#a"/><image href="data:image/png;base64,AAAA"/></svg>');
    expect(r.svg).toContain('href="#a"');
    expect(r.svg).toContain('data:image/png;base64');
    expect(r.removed).toEqual([]);
  });

  it('removes javascript: links and external url() values', () => {
    const r = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect width="1" height="1" fill="url(http://x.test/p)"/></a></svg>');
    expect(r.svg).not.toMatch(/javascript|x\.test/);
  });

  it('cleans @import and external url() inside <style>', () => {
    const r = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://x.test/a.css); .a{fill:url(https://x.test/i.svg#a)}</style></svg>');
    expect(r.svg).not.toMatch(/x\.test|@import/);
    expect(kinds(r)).toContain('external-style');
  });

  it('strips DOCTYPE and entity declarations and never expands them', () => {
    const bomb =
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;"><!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;&b;</text></svg>';
    const r = sanitizeSvg(bomb);
    expect(r.svg).not.toMatch(/DOCTYPE|ENTITY|passwd/);
    expect(kinds(r)).toEqual(expect.arrayContaining(['doctype', 'entity']));
  });

  it('rejects non-SVG and empty input', () => {
    expect(() => sanitizeSvg('')).toThrow(SvgError);
    expect(() => sanitizeSvg('<html><body/></html>')).toThrow(/HTML/);
    expect(() => sanitizeSvg('hello')).toThrow(/not an SVG/);
  });

  it('reports malformed XML', () => {
    expect(() => sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>')).toThrow(/Invalid SVG/);
  });

  it('preserves unicode text', () => {
    const r = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" xml:lang="ar"><text>مرحبا 😀</text></svg>');
    expect(r.svg).toContain('مرحبا 😀');
  });
});
