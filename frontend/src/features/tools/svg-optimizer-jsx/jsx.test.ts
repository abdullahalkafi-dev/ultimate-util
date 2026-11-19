import { describe, expect, it } from 'vitest';
import { DEFAULT_JSX, barrel, componentNameFrom, parseStyle, svgToComponent, svgToVue, toReactProp } from './jsx';
import { cssBackground, diffPixels, diffVerdict, svgToBase64Uri, svgToUrlEncoded } from './outputs';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24" height="24" viewBox="0 0 24 24" class="icon"><g clip-path="url(#c)" style="fill:red;stroke-width:2;-webkit-user-select:none"><path stroke-linecap="round" d="M0 0h24"/><use xlink:href="#p"/></g><text x="1">a &amp; {b}</text></svg>';

describe('attribute mapping', () => {
  it('maps names', () => {
    expect(toReactProp('class')).toBe('className');
    expect(toReactProp('stroke-width')).toBe('strokeWidth');
    expect(toReactProp('xlink:href')).toBe('xlinkHref');
    expect(toReactProp('xml:space')).toBe('xmlSpace');
    expect(toReactProp('xmlns:xlink')).toBe('xmlnsXlink');
    expect(toReactProp('data-x-y')).toBe('data-x-y');
    expect(toReactProp('aria-label')).toBe('aria-label');
    expect(toReactProp('sodipodi:foo')).toBeNull();
  });
  it('parses style strings', () => {
    expect(parseStyle('fill:red; stroke-width: 2;-webkit-user-select:none;--c:1')).toEqual([
      ['fill', 'red'],
      ['strokeWidth', '2'],
      ['WebkitUserSelect', 'none'],
      ['--c', '1'],
    ]);
  });
  it('names components', () => {
    expect(componentNameFrom('arrow-left_2.svg')).toBe('ArrowLeft2');
    expect(componentNameFrom('24px.svg')).toBe('Icon24px');
    expect(componentNameFrom('.svg')).toBe('Icon');
  });
});

describe('svgToComponent', () => {
  it('produces a typed React component with props spread', () => {
    const { code } = svgToComponent(SVG, { ...DEFAULT_JSX, componentName: 'Home' });
    expect(code).toContain("import type { SVGProps } from 'react';");
    expect(code).toContain('const Home = (props: SVGProps<SVGSVGElement>) => (');
    expect(code).toContain('className="icon"');
    expect(code).toContain('clipPath="url(#c)"');
    expect(code).toContain('style={{ fill: "red", strokeWidth: "2", WebkitUserSelect: "none" }}');
    expect(code).toContain('strokeLinecap="round"');
    expect(code).toContain('xlinkHref="#p"');
    expect(code).toContain('{...props}');
    expect(code).not.toMatch(/ width="24"/);
    expect(code).toContain('<text x="1">{"a & {b}"}</text>');
    expect(code.trim().endsWith('export default Home;')).toBe(true);
  });
  it('supports JS, memo, forwardRef, title and dimensions', () => {
    const { code } = svgToComponent(SVG, { ...DEFAULT_JSX, typescript: false, memo: true, forwardRef: true, titleProp: true, keepDimensions: true, componentName: 'A' });
    expect(code).not.toContain('SVGProps');
    expect(code).toContain('({ title, titleId, ...props }, ref)');
    expect(code).toContain('ref={ref}');
    expect(code).toContain('width="24"');
    expect(code).toContain('{title ? <title id={titleId}>{title}</title> : null}');
    expect(code).toContain('memo(ForwardRef)');
  });
  it('can omit prop spreading', () => {
    expect(svgToComponent(SVG, { ...DEFAULT_JSX, spreadProps: false }).code).not.toContain('{...props}');
  });
  it('converts to react-native-svg', () => {
    const { code, warnings } = svgToComponent(SVG + '', { ...DEFAULT_JSX, target: 'native', componentName: 'A' });
    expect(code).toContain("import Svg, { SvgProps, G, Path, Text, Use } from 'react-native-svg';");
    expect(code).toContain('<Svg');
    expect(code).not.toContain('xmlns');
    expect(code).not.toContain('className');
    expect(code).toContain('<Use href="#p" />');
    expect(warnings).toEqual([]);
  });
  it('warns on unsupported native elements', () => {
    const { warnings } = svgToComponent('<svg viewBox="0 0 1 1"><style>.a{}</style><filter id="f"/></svg>', { ...DEFAULT_JSX, target: 'native' });
    expect(warnings.length).toBe(2);
  });
  it('drops editor namespaces', () => {
    const { code, warnings } = svgToComponent('<svg viewBox="0 0 1 1"><sodipodi:namedview/><path sodipodi:nodetypes="cc" d="M0 0"/></svg>', DEFAULT_JSX);
    expect(code).not.toContain('sodipodi');
    expect(warnings.length).toBe(2);
  });
  it('writes a barrel and a Vue SFC', () => {
    expect(barrel(['A', 'B'])).toBe("export { default as A } from './A';\nexport { default as B } from './B';\n");
    const vue = svgToVue('<svg><text>{{x}}</text></svg>', 'A');
    expect(vue).toContain('<template>');
    expect(vue).not.toContain('{{');
  });
});

describe('data URIs', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">\n  <path fill="#fff" d="M0 0"/>\n</svg>';
  it('url-encodes safely', () => {
    const u = svgToUrlEncoded(svg);
    expect(u.startsWith('data:image/svg+xml,')).toBe(true);
    expect(u).not.toMatch(/[<>#"]/);
    expect(decodeURIComponent(u.slice(19))).toContain("fill='%23fff'".replace('%23', '#'));
  });
  it('encodes base64 including unicode', () => {
    const u = svgToBase64Uri('<svg xmlns="http://www.w3.org/2000/svg"><text>é😀</text></svg>');
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(u.split(',')[1] ?? ''), (c) => c.charCodeAt(0)));
    expect(decoded).toContain('é😀');
  });
  it('builds a css snippet with a quoted url', () => {
    expect(cssBackground(svg)).toMatch(/^background-image: url\("data:image\/svg\+xml,[^"]+"\);/);
  });
});

describe('pixel diff', () => {
  const px = (...v: number[]) => new Uint8ClampedArray(v);
  it('counts differences beyond tolerance', () => {
    const a = px(0, 0, 0, 255, 10, 10, 10, 255);
    const b = px(5, 0, 0, 255, 60, 10, 10, 255);
    expect(diffPixels(a, b, 8)).toEqual({ differing: 1, total: 2 });
    expect(diffPixels(a, a)).toEqual({ differing: 0, total: 2 });
  });
  it('rejects mismatched sizes and judges verdicts', () => {
    expect(() => diffPixels(px(0, 0, 0, 0), px(0, 0, 0, 0, 0, 0, 0, 0))).toThrow();
    expect(diffVerdict({ differing: 0, total: 100 })).toBe('identical');
    expect(diffVerdict({ differing: 1, total: 10000 })).toBe('ok');
    expect(diffVerdict({ differing: 50, total: 1000 })).toBe('warn');
  });
});
