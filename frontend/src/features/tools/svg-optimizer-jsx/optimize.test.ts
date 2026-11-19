import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, PLUGINS, optimizeSvg } from './optimize';

const FIGMA = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: Figma -->
<svg width="24" height="24" xmlns="http://www.w3.org/2000/svg" xmlns:sketch="http://www.bohemiancoding.com/sketch/ns" xmlns:xlink="http://www.w3.org/1999/xlink">
  <title>icon</title>
  <metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></metadata>
  <defs></defs>
  <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" sketch:type="MSPage">
    <g id="Group" transform="translate(2.000000, 2.000000)" fill="#FF0000">
      <path d="M 0.000000 0.000000 L 10.000000 0.000000 L 10.000000 10.000000 Z" id="Path"></path>
    </g>
  </g>
</svg>`;

describe('optimizeSvg', () => {
  it('shrinks editor output, keeps a viewBox and the namespace', () => {
    const r = optimizeSvg(FIGMA, DEFAULT_OPTIONS);
    expect(r.bytesAfter).toBeLessThan(r.bytesBefore * 0.7);
    expect(r.svg).toContain('viewBox="0 0 24 24"');
    expect(r.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(r.svg).not.toMatch(/sketch|metadata|Generator/);
  });

  it('keeps an existing viewBox even when other settings change', () => {
    const r = optimizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"><rect width="10" height="20"/></svg>', DEFAULT_OPTIONS);
    expect(r.svg).toContain('viewBox="0 0 10 20"');
  });

  it('flags a missing viewBox without dimensions', () => {
    const r = optimizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="20"/></svg>', DEFAULT_OPTIONS);
    expect(r.missingViewBox).toBe(true);
  });

  it('honors disabled plugins', () => {
    const src = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><!-- keep me --><rect width="4" height="4"/></svg>';
    expect(optimizeSvg(src, DEFAULT_OPTIONS).svg).not.toContain('keep me');
    expect(optimizeSvg(src, { ...DEFAULT_OPTIONS, disabled: ['removeComments'] }).svg).toContain('keep me');
  });

  it('sanitizes before optimizing', () => {
    const r = optimizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4" onload="x()"><script>1</script><rect width="4" height="4"/></svg>', DEFAULT_OPTIONS);
    expect(r.svg).not.toMatch(/onload|script/);
    expect(r.removed.length).toBeGreaterThan(1);
  });

  it('replaces a single color with currentColor but leaves gradients alone', () => {
    const src =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path fill="#123456" d="M0 0h4v4z"/><path stroke="#123456" fill="url(#g)" d="M0 0h2"/></svg>';
    const r = optimizeSvg(src, { ...DEFAULT_OPTIONS, currentColor: 'single', disabled: ['cleanupIds', 'mergePaths'] });
    expect(r.svg).toContain('fill="currentColor"');
    expect(r.svg).toContain('stroke="currentColor"');
    expect(r.svg).toContain('url(#g)');
  });

  it('skips currentColor for multi-color in single mode', () => {
    const src = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><path fill="#f00" d="M0 0h2v2z"/><path fill="#00f" d="M2 2h2v2z"/></svg>';
    const r = optimizeSvg(src, { ...DEFAULT_OPTIONS, currentColor: 'single' });
    expect(r.svg).not.toContain('currentColor');
    expect(r.warnings.join(' ')).toMatch(/several colors/);
  });

  it('adds accessibility title or aria-hidden', () => {
    const src = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><path d="M0 0h4v4z"/></svg>';
    expect(optimizeSvg(src, { ...DEFAULT_OPTIONS, a11y: 'decorative' }).svg).toContain('aria-hidden="true"');
    const t = optimizeSvg(src, { ...DEFAULT_OPTIONS, a11y: 'title', titleText: 'Home' }).svg;
    expect(t).toContain('<title id="svg-title">Home</title>');
    expect(t).toContain('role="img"');
  });

  it('adds ID prefixes on request', () => {
    const src = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><path fill="url(#g)" d="M0 0h4v4z"/></svg>';
    const r = optimizeSvg(src, { ...DEFAULT_OPTIONS, idPrefix: 'icon1', disabled: ['cleanupIds'] });
    expect(r.svg).toContain('icon1-g');
  });

  it('lists every plugin with an explanation', () => {
    for (const p of PLUGINS) expect(p.explain.length).toBeGreaterThan(5);
  });
});
