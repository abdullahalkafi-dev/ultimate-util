import { XMLParser } from 'fast-xml-parser';

export type Target = 'react' | 'native';

export interface JsxOptions {
  target: Target;
  typescript: boolean;
  memo: boolean;
  forwardRef: boolean;
  spreadProps: boolean;
  titleProp: boolean;
  /** Keep width/height on the root element. */
  keepDimensions: boolean;
  componentName: string;
}

export const DEFAULT_JSX: JsxOptions = {
  target: 'react',
  typescript: true,
  memo: false,
  forwardRef: false,
  spreadProps: true,
  titleProp: false,
  keepDimensions: false,
  componentName: 'Icon',
};

interface JNode {
  tag: string;
  attrs: [string, string][];
  children: (JNode | string)[];
}

type RawNode = Record<string, unknown>;

/** "my-icon_2.svg" -> "MyIcon2" */
export function componentNameFrom(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  const pascal = base
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  if (!pascal) return 'Icon';
  return /^[0-9]/.test(pascal) ? `Icon${pascal}` : pascal;
}

const kebabToCamel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** SVG attribute name -> React prop name. Returns null for attributes React cannot express. */
export function toReactProp(name: string): string | null {
  if (name === 'class') return 'className';
  if (name === 'for') return 'htmlFor';
  if (name.startsWith('data-') || name.startsWith('aria-')) return name;
  if (name === 'xmlns') return 'xmlns';
  if (name.includes(':')) {
    const [prefix, local] = name.split(':');
    const l = local ?? '';
    const cap = l.charAt(0).toUpperCase() + l.slice(1);
    if (prefix === 'xmlns') return `xmlns${cap}`;
    if (prefix === 'xlink' || prefix === 'xml') return `${prefix}${cap}`;
    return null;
  }
  return kebabToCamel(name);
}

/** "fill:red;stroke-width:2" -> { fill: 'red', strokeWidth: '2' } */
export function parseStyle(style: string): [string, string][] {
  const out: [string, string][] = [];
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const value = decl.slice(i + 1).trim();
    if (!prop || !value) continue;
    let key: string;
    if (prop.startsWith('--')) key = prop;
    else if (prop.startsWith('-ms-')) key = kebabToCamel(prop.slice(1));
    else key = kebabToCamel(prop.startsWith('-') ? prop.slice(1).replace(/^./, (c) => c.toUpperCase()) : prop);
    out.push([key, value]);
  }
  return out;
}

const q = (s: string) => JSON.stringify(s);
const isIdent = (k: string) => /^[A-Za-z_$][\w$]*$/.test(k);

function styleToObject(style: string): string {
  const pairs = parseStyle(style).map(([k, v]) => `${isIdent(k) ? k : q(k)}: ${q(v)}`);
  return `{{ ${pairs.join(', ')} }}`;
}

function parseToTree(svg: string): JNode {
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: false,
    processEntities: true,
    allowBooleanAttributes: false,
  });
  const raw = parser.parse(svg) as RawNode[];
  const convert = (n: RawNode): JNode | string | null => {
    if ('#text' in n) return String(n['#text']);
    const tag = Object.keys(n).find((k) => k !== ':@');
    if (!tag || tag.startsWith('?') || tag.startsWith('!')) return null;
    const attrObj = (n[':@'] ?? {}) as Record<string, string>;
    const kids = (n[tag] as RawNode[]).map(convert).filter((c): c is JNode | string => c !== null);
    return { tag, attrs: Object.entries(attrObj), children: kids };
  };
  const root = raw.map(convert).find((c): c is JNode => typeof c === 'object' && c !== null && c.tag.replace(/^svg:/, '') === 'svg');
  if (!root) throw new Error('No <svg> root element found.');
  return root;
}

const NATIVE_TAGS: Record<string, string> = {
  svg: 'Svg', g: 'G', path: 'Path', circle: 'Circle', ellipse: 'Ellipse', rect: 'Rect', line: 'Line', polygon: 'Polygon',
  polyline: 'Polyline', text: 'Text', tspan: 'TSpan', textPath: 'TextPath', defs: 'Defs', linearGradient: 'LinearGradient',
  radialGradient: 'RadialGradient', stop: 'Stop', clipPath: 'ClipPath', mask: 'Mask', use: 'Use', symbol: 'Symbol',
  image: 'Image', pattern: 'Pattern', marker: 'Marker',
};

const escText = (t: string) => (/[{}<>&]/.test(t) ? `{${q(t)}}` : t);

export interface JsxOutput {
  code: string;
  warnings: string[];
}

export function svgToComponent(svg: string, o: JsxOptions): JsxOutput {
  const warnings: string[] = [];
  const root = parseToTree(svg);
  const used = new Set<string>();
  const native = o.target === 'native';

  const writeAttrs = (n: JNode, isRoot: boolean): string[] => {
    const parts: string[] = [];
    for (const [name, value] of n.attrs) {
      if (isRoot && !o.keepDimensions && (name === 'width' || name === 'height') && n.attrs.some(([k]) => k === 'viewBox')) continue;
      if (native && (name === 'xmlns' || name.startsWith('xmlns:') || name === 'class')) continue;
      if (name.startsWith('xmlns:') && !native && isRoot) {
        const prop = toReactProp(name);
        if (prop) parts.push(`${prop}=${q(value)}`);
        continue;
      }
      if (name === 'style') {
        parts.push(`style=${styleToObject(value)}`);
        continue;
      }
      const prop = native && name === 'xlink:href' ? 'href' : toReactProp(name);
      if (!prop) {
        warnings.push(`Dropped attribute "${name}" (namespace not supported in JSX).`);
        continue;
      }
      parts.push(/["&{}<>]/.test(value) ? `${prop}={${q(value)}}` : `${prop}="${value}"`);
    }
    return parts;
  };

  const write = (n: JNode | string, depth: number, isRoot: boolean, inText: boolean): string => {
    const pad = '  '.repeat(depth);
    if (typeof n === 'string') {
      const text = inText ? n : n.trim();
      return text ? pad + escText(text) : '';
    }
    const local = n.tag.replace(/^svg:/, '');
    if (local.includes(':')) {
      warnings.push(`Dropped <${n.tag}> (unsupported namespace).`);
      return '';
    }
    if (native) {
      if (local === 'title' || local === 'desc' || local === 'metadata') return '';
      if (local === 'style') {
        warnings.push('A <style> element was dropped: react-native-svg does not support CSS. Inline styles first (keep "Inline <style> rules" on).');
        return '';
      }
    }
    let tag = local;
    if (native) {
      tag = NATIVE_TAGS[local] ?? '';
      if (!tag) {
        warnings.push(`<${local}> is not supported by react-native-svg and was dropped.`);
        return '';
      }
      if (!isRoot) used.add(tag);
    }
    const attrs = writeAttrs(n, isRoot);
    const textual = local === 'text' || local === 'tspan' || local === 'textPath' || local === 'style';
    if (isRoot) {
      if (o.forwardRef) attrs.push('ref={ref}');
      if (o.titleProp && !native) attrs.push('aria-labelledby={titleId}');
      if (o.spreadProps) attrs.push('{...props}');
    }
    const kids = n.children
      .map((c) => write(c, depth + 1, false, textual))
      .filter((s) => s !== '');
    if (isRoot && o.titleProp && !native) {
      kids.unshift(`${'  '.repeat(depth + 1)}{title ? <title id={titleId}>{title}</title> : null}`);
    }
    const open = attrs.length > 3 || attrs.join(' ').length > 70
      ? `<${tag}\n${attrs.map((a) => `${pad}  ${a}`).join('\n')}\n${pad}`
      : `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}`;
    if (!kids.length) return `${pad}${open}${open.endsWith('\n' + pad) ? '' : ' '}/>`;
    if (textual && n.children.every((c) => typeof c === 'string')) {
      const text = (n.children as string[]).join('');
      const body = local === 'style' || /[{}<>&]/.test(text) ? `{${q(text)}}` : text;
      return `${pad}${open}>${body}</${tag}>`;
    }
    return `${pad}${open}>\n${kids.join('\n')}\n${pad}</${tag}>`;
  };

  const body = write(root, 1, true, false);

  const ts = o.typescript;
  const name = o.componentName;
  const lines: string[] = [];
  const reactImports: string[] = [];
  if (o.memo) reactImports.push('memo');
  if (o.forwardRef) reactImports.push('forwardRef');
  if (native) {
    const names = ['G', 'Path', 'Circle', 'Ellipse', 'Rect', 'Line', 'Polygon', 'Polyline', 'Text', 'TSpan', 'TextPath', 'Defs', 'LinearGradient', 'RadialGradient', 'Stop', 'ClipPath', 'Mask', 'Use', 'Symbol', 'Image', 'Pattern', 'Marker'].filter((x) => used.has(x));
    lines.push(`import * as React from 'react';`);
    if (reactImports.length) lines.push(`import { ${reactImports.join(', ')} } from 'react';`);
    lines.push(`import Svg, { ${[...(ts ? ['SvgProps'] : []), ...names].join(', ')} } from 'react-native-svg';`);
  } else {
    lines.push(`import * as React from 'react';`);
    if (ts) lines.push(`import type { SVGProps } from 'react';`);
    if (reactImports.length) lines.push(`import { ${reactImports.join(', ')} } from 'react';`);
  }
  lines.push('');

  const propsType = native ? 'SvgProps' : 'SVGProps<SVGSVGElement>';
  const extra = o.titleProp && !native ? ' & { title?: string; titleId?: string }' : '';
  const destructure = o.titleProp && !native ? '{ title, titleId, ...props }' : 'props';
  const argsTs = ts ? `: ${propsType}${extra}` : '';
  const sig = o.forwardRef
    ? `(${destructure}${argsTs}, ref${ts ? `: React.Ref<${native ? 'Svg' : 'SVGSVGElement'}>` : ''})`
    : `(${destructure}${argsTs})`;
  lines.push(`const ${name} = ${sig} => (\n${body}\n);`);
  lines.push('');
  let exported = name;
  if (o.forwardRef) {
    lines.push(`const ForwardRef = forwardRef(${exported});`);
    exported = 'ForwardRef';
  }
  if (o.memo) {
    lines.push(`const Memo = memo(${exported});`);
    exported = 'Memo';
  }
  lines.push(`export default ${exported};`);
  lines.push('');
  return { code: lines.join('\n'), warnings: [...new Set(warnings)] };
}

/** Vue 3 single-file component. */
export function svgToVue(svg: string, name: string): string {
  // `{{` would be read as an interpolation inside a Vue template.
  const safe = svg.replace(/\{\{/g, '{&#123;');
  return `<template>\n  ${safe}\n</template>\n\n<script>\nexport default {\n  name: '${name}',\n};\n</script>\n`;
}

/** Barrel file for a batch of components. */
export function barrel(names: string[]): string {
  return names.map((n) => `export { default as ${n} } from './${n}';`).join('\n') + '\n';
}
