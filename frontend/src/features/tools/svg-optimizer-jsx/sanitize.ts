import { optimize, type PluginConfig } from 'svgo/browser';

export interface RemovalEntry {
  kind: string;
  label: string;
  count: number;
}

export interface SanitizeResult {
  svg: string;
  removed: RemovalEntry[];
}

/** Minimal shape of the SVGO syntax tree nodes the plugins touch. */
export interface XNode {
  type: string;
  name?: string;
  value?: string;
  attributes?: Record<string, string>;
  children?: XNode[];
}
type Parent = { children: XNode[] };

export class SvgError extends Error {
  readonly line?: number;
  readonly column?: number;
  constructor(message: string, line?: number, column?: number) {
    super(message);
    this.name = 'SvgError';
    this.line = line;
    this.column = column;
  }
}

/** Wraps a visitor so it can be used as an SVGO custom plugin. */
export function customPlugin(
  name: string,
  visitor: {
    root?: { enter?: (n: XNode) => void; exit?: (n: XNode) => void };
    element?: { enter?: (n: XNode, p: Parent) => void; exit?: (n: XNode, p: Parent) => void };
  },
): PluginConfig {
  return { name, fn: () => visitor } as unknown as PluginConfig;
}

const REMOVED_ELEMENTS: Record<string, { kind: string; label: string }> = {
  script: { kind: 'script', label: '<script> elements' },
  foreignobject: { kind: 'foreignObject', label: '<foreignObject> elements (embedded HTML; may change what you see)' },
  iframe: { kind: 'embedded', label: '<iframe> elements' },
  embed: { kind: 'embedded', label: '<embed> elements' },
  object: { kind: 'embedded', label: '<object> elements' },
  applet: { kind: 'embedded', label: '<applet> elements' },
  audio: { kind: 'embedded', label: '<audio> elements' },
  video: { kind: 'embedded', label: '<video> elements' },
};

const SAFE_DATA = /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i;
const URL_FN = /url\(\s*(['"]?)([\s\S]*?)\1\s*\)/gi;

const isSafeRef = (v: string) => {
  const t = v.trim();
  return t.startsWith('#') || SAFE_DATA.test(t);
};

/** Replaces non-local url(...) with `none`; returns how many were replaced. */
function cleanUrls(value: string): { value: string; count: number } {
  let count = 0;
  const out = value.replace(URL_FN, (m, _q, target: string) => {
    if (isSafeRef(target)) return m;
    count++;
    return 'none';
  });
  return { value: out, count };
}

export function cleanCss(css: string): { css: string; imports: number; urls: number } {
  let imports = 0;
  let out = css.replace(/@import[^;{]*;?/gi, () => {
    imports++;
    return '';
  });
  const r = cleanUrls(out);
  out = r.value;
  let extra = 0;
  out = out.replace(/expression\s*\([^)]*\)|javascript:/gi, () => {
    extra++;
    return '';
  });
  return { css: out, imports, urls: r.count + extra };
}

/** Removes DOCTYPE (with any internal subset), ENTITY declarations and stylesheet PIs from raw text. */
export function stripDoctype(input: string): { text: string; doctype: number; entities: number } {
  let text = input.replace(/^﻿/, '');
  let doctype = 0;
  let entities = 0;
  for (;;) {
    const start = text.search(/<!DOCTYPE/i);
    if (start < 0) break;
    let i = start + 9;
    let depth = 0;
    let quote = '';
    for (; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '[') depth++;
      else if (c === ']') depth = Math.max(0, depth - 1);
      else if (c === '>' && depth === 0) break;
    }
    const block = text.slice(start, i + 1);
    entities += (block.match(/<!ENTITY/gi) ?? []).length;
    doctype++;
    text = text.slice(0, start) + text.slice(i + 1);
  }
  text = text.replace(/<!ENTITY[^>]*>/gi, () => {
    entities++;
    return '';
  });
  if (doctype || entities) {
    // References to the removed custom entities would otherwise fail to parse.
    text = text.replace(/&(?!(?:amp|lt|gt|quot|apos);)[A-Za-z_][\w.-]*;/g, '');
  }
  text = text.replace(/<\?xml-stylesheet[^>]*\?>/gi, '');
  return { text, doctype, entities };
}

/** Quick content check before parsing: the root element must be <svg>. */
export function looksLikeSvg(text: string): boolean {
  const stripped = text
    .replace(/^﻿/, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  return /^\s*<(svg:)?svg[\s>/]/i.test(stripped);
}

/** Describes what a non-SVG text looks like, for the error message. */
export function describeNonSvg(text: string): string {
  const t = text.trimStart().slice(0, 200).toLowerCase();
  if (t.startsWith('<!doctype html') || t.startsWith('<html')) return 'an HTML document';
  if (t.startsWith('<')) return 'XML with a different root element';
  if (t.startsWith('{') || t.startsWith('[')) return 'JSON';
  return 'plain text';
}

function createSanitizePlugin(tally: Map<string, RemovalEntry>): PluginConfig {
  const add = (kind: string, label: string, n = 1) => {
    const key = `${kind}:${label}`;
    const e = tally.get(key);
    if (e) e.count += n;
    else tally.set(key, { kind, label, count: n });
  };
  const detach = (parent: Parent, node: XNode) => {
    parent.children = parent.children.filter((c) => c !== node);
  };
  return customPlugin('sanitize', {
    element: {
      enter(node, parent) {
        const name = (node.name ?? '').toLowerCase().replace(/^svg:/, '');
        const rule = REMOVED_ELEMENTS[name];
        if (rule) {
          add(rule.kind, rule.label);
          detach(parent, node);
          return;
        }
        const attrs = node.attributes ?? {};
        if ((name === 'set' || name === 'animate') && /^(xlink:)?href$/i.test(attrs.attributeName ?? '')) {
          add('animation', 'Animations that rewrite links');
          detach(parent, node);
          return;
        }
        for (const key of Object.keys(attrs)) {
          const lower = key.toLowerCase();
          const value = attrs[key] ?? '';
          if (lower.startsWith('on')) {
            add('event-handler', 'Event handler attributes (onload, onclick, ...)');
            delete attrs[key];
          } else if (lower === 'href' || lower === 'xlink:href') {
            if (!isSafeRef(value)) {
              add('external-reference', 'External or script links (href / xlink:href)');
              delete attrs[key];
            }
          } else if (/url\(|javascript:|expression\(/i.test(value)) {
            const r = cleanUrls(value);
            if (/javascript:|expression\(/i.test(r.value)) {
              add('external-reference', 'Script URLs in attributes');
              delete attrs[key];
            } else if (r.count) {
              add('external-reference', 'External url() references');
              attrs[key] = r.value;
            }
          }
        }
        if (name === 'style') {
          for (const child of node.children ?? []) {
            if (typeof child.value === 'string') {
              const r = cleanCss(child.value);
              if (r.imports) add('external-style', '@import rules in <style>', r.imports);
              if (r.urls) add('external-style', 'External url() in <style>', r.urls);
              child.value = r.css;
            }
          }
        }
      },
    },
  });
}

/** Sanitizes raw SVG text. Output is regenerated by SVGO's serializer, never echoed from the input. */
export function sanitizeSvg(input: string): SanitizeResult {
  const { text, doctype, entities } = stripDoctype(input);
  if (!text.trim()) throw new SvgError('The file is empty.');
  if (!looksLikeSvg(text)) throw new SvgError(`This is not an SVG: it looks like ${describeNonSvg(text)}.`);
  const tally = new Map<string, RemovalEntry>();
  if (doctype) tally.set('doctype', { kind: 'doctype', label: 'DOCTYPE declarations', count: doctype });
  if (entities) tally.set('entity', { kind: 'entity', label: 'ENTITY declarations (never resolved)', count: entities });
  try {
    const out = optimize(text, {
      plugins: [createSanitizePlugin(tally)],
      js2svg: { pretty: false },
    });
    return { svg: out.data, removed: [...tally.values()] };
  } catch (e) {
    const err = e as { message?: string; line?: number; column?: number };
    const where = err.line ? ` (line ${err.line}, column ${err.column ?? 0})` : '';
    throw new SvgError(`Invalid SVG markup${where}: ${(err.message ?? '').replace(/^.*?:\s*/, '')}`, err.line, err.column);
  }
}
