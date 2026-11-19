import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';
import { parseAllDocuments, stringify as yamlStringify } from 'yaml';
import { parseJson } from './jsonParse';
import {
  jsToNode,
  nodeToJs,
  sortKeys,
  type Format,
  type JNode,
  type ParseIssue,
  type ParseOptions,
  type ParseResult,
} from './model';

export interface FormatOptions extends ParseOptions {
  mode?: 'beautify' | 'minify';
  /** Number of spaces, or 'tab'. */
  indent?: 2 | 4 | 'tab';
  sort?: boolean;
}

export interface TextResult {
  ok: boolean;
  output?: string;
  error?: ParseIssue;
  warnings: string[];
}

const XML_COMMON = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  commentPropName: '#comment',
  cdataPropName: '#cdata',
  parseTagValue: false,
  parseAttributeValue: false,
  allowBooleanAttributes: true,
} as const;

/** DOCTYPE entities are expanded only within tight limits (billion-laughs guard); external ones are never fetched. */
const ENTITY_LIMITS = { enabled: true, maxEntitySize: 1000, maxTotalExpansions: 1000, maxExpandedLength: 100_000, maxEntityCount: 50 };

export function detectFormat(text: string): Format {
  const t = text.trimStart();
  if (t.startsWith('<')) return 'xml';
  if (t.startsWith('{') || t.startsWith('[')) {
    if (parseJson(text, true).ok) return 'json';
    return t.startsWith('{') && /^\{\s*"/.test(t) ? 'json' : 'yaml';
  }
  if (t === '') return 'json';
  if (parseJson(text, false).ok) return 'json';
  return 'yaml';
}

function xmlIssue(text: string): ParseIssue | undefined {
  const v = XMLValidator.validate(text, { allowBooleanAttributes: true });
  if (v === true) return undefined;
  const { msg, line, col } = v.err;
  return { message: msg, line, col, offset: 0, hint: 'Check that every tag is closed in the right order and attribute values are quoted.' };
}

function parseYaml(text: string, version: '1.1' | '1.2'): ParseResult {
  const warnings: string[] = [];
  const docs = parseAllDocuments(text, { version, intAsBigInt: true, uniqueKeys: true });
  const list = Array.isArray(docs) ? docs : [docs];
  for (const d of list) {
    const err = d.errors[0];
    if (err) {
      const pos = err.linePos?.[0];
      const hint = /tab/i.test(err.message) ? 'YAML indentation must use spaces, not tabs.' : err.code === 'DUPLICATE_KEY' ? 'The same key appears twice in one mapping.' : undefined;
      return {
        ok: false,
        error: { message: err.message.split('\n')[0] ?? err.message, hint, line: pos?.line ?? 1, col: pos?.col ?? 1, offset: err.pos[0] },
        warnings,
      };
    }
    for (const w of d.warnings) warnings.push(w.message.split('\n')[0] ?? w.message);
  }
  const values = list.filter((d) => d.contents !== null || list.length === 1).map((d) => jsToNode(d.toJS({ mapAsMap: true, maxAliasCount: 100 })));
  if (values.length > 1) warnings.push(`${values.length} YAML documents found; they are treated as a list.`);
  return { ok: true, node: values.length === 1 ? values[0] : { t: 'arr', items: values }, warnings };
}

function parseXml(text: string): ParseResult {
  const bad = xmlIssue(text);
  if (bad) return { ok: false, error: bad, warnings: [] };
  const warnings: string[] = [];
  if (/<!ENTITY/i.test(text)) warnings.push('DOCTYPE entities were found. External entities are never loaded; internal ones are expanded within safe limits.');
  try {
    const obj = new XMLParser({ ...XML_COMMON, processEntities: ENTITY_LIMITS }).parse(text) as unknown;
    return { ok: true, node: jsToNode(obj), warnings };
  } catch (e) {
    return { ok: false, error: { message: e instanceof Error ? e.message : 'Could not read the XML', line: 1, col: 1, offset: 0 }, warnings };
  }
}

export function parseAny(text: string, format: Format, opts: ParseOptions = {}): ParseResult {
  if (text.trim() === '') return { ok: false, error: { message: 'Nothing to parse yet', line: 1, col: 1, offset: 0 }, warnings: [] };
  if (format === 'json') return parseJson(text, opts.lenient);
  if (format === 'yaml') return parseYaml(text, opts.yamlVersion ?? '1.2');
  return parseXml(text);
}

/** JSON-legal text for a number token that may have come from a lenient (JSON5) source. */
function jsonNumber(raw: string): string {
  if (/^[+-]?0[xX]/.test(raw)) return (raw.startsWith('-') ? '-' : '') + BigInt(raw.replace(/^[+-]/, '')).toString();
  let r = raw.replace(/^\+/, '');
  r = r.replace(/^(-?)\./, '$10.').replace(/\.(?=[eE]|$)/, '');
  return r;
}

function quote(s: string): string {
  return JSON.stringify(s);
}

export function writeJson(node: JNode, indent: string): string {
  const nl = indent ? '\n' : '';
  const sep = indent ? ': ' : ':';
  const go = (n: JNode, depth: number): string => {
    switch (n.t) {
      case 'null': return 'null';
      case 'bool': return String(n.v);
      case 'num': return jsonNumber(n.raw);
      case 'str': return quote(n.v);
      case 'arr': {
        if (n.items.length === 0) return '[]';
        const pad = indent.repeat(depth + 1);
        return `[${nl}${n.items.map((c) => pad + go(c, depth + 1)).join(`,${nl}`)}${nl}${indent.repeat(depth)}]`;
      }
      case 'obj': {
        if (n.entries.length === 0) return '{}';
        const pad = indent.repeat(depth + 1);
        return `{${nl}${n.entries.map(([k, v]) => pad + quote(k) + sep + go(v, depth + 1)).join(`,${nl}`)}${nl}${indent.repeat(depth)}}`;
      }
    }
  };
  return go(node, 0);
}

function indentString(indent: FormatOptions['indent']): string {
  return indent === 'tab' ? '\t' : ' '.repeat(indent ?? 2);
}

/** Plain objects for XMLBuilder. Numbers become their text so big values are not rounded. */
function toXmlShape(node: JNode): unknown {
  switch (node.t) {
    case 'null': return '';
    case 'bool': return String(node.v);
    case 'num': return jsonNumber(node.raw);
    case 'str': return node.v;
    case 'arr': return node.items.map(toXmlShape);
    case 'obj': {
      const o: Record<string, unknown> = {};
      for (const [k, v] of node.entries) Object.defineProperty(o, k, { value: toXmlShape(v), enumerable: true, writable: true, configurable: true });
      return o;
    }
  }
}

export function writeXml(node: JNode, indent: string, rootName = 'root'): string {
  const shape = toXmlShape(node);
  const isSingleRoot = node.t === 'obj' && node.entries.filter(([k]) => !k.startsWith('?') && k !== '#comment').length === 1;
  const wrapped = isSingleRoot ? shape : { [rootName]: shape };
  const builder = new XMLBuilder({ ...XML_COMMON, format: indent !== '', indentBy: indent, suppressEmptyNode: true });
  return String(builder.build(wrapped)).trim();
}

export function writeYaml(node: JNode, indent: string, flow = false): string {
  const width = indent === '\t' ? 2 : indent.length;
  return yamlStringify(nodeToJs(node), { indent: width, lineWidth: 0, collectionStyle: flow ? 'flow' : 'any' }).trimEnd();
}

export function render(node: JNode, to: Format, opts: FormatOptions = {}): string {
  const minify = opts.mode === 'minify';
  const indent = minify ? '' : indentString(opts.indent);
  const n = opts.sort ? sortKeys(node) : node;
  if (to === 'json') return writeJson(n, indent);
  if (to === 'yaml') return writeYaml(n, indent || '  ', minify);
  return writeXml(n, indent);
}

/** Beautify or minify in the same format. XML keeps element order exactly (including mixed content). */
export function formatText(text: string, format: Format, opts: FormatOptions = {}): TextResult {
  if (format === 'xml' && !opts.sort) {
    const bad = xmlIssue(text);
    if (bad) return { ok: false, error: bad, warnings: [] };
    const minify = opts.mode === 'minify';
    const indent = minify ? '' : indentString(opts.indent);
    const common = { ...XML_COMMON, preserveOrder: true, processEntities: ENTITY_LIMITS, trimValues: true } as const;
    try {
      const tree = new XMLParser(common).parse(text) as unknown;
      const out = new XMLBuilder({ ...XML_COMMON, preserveOrder: true, format: !minify, indentBy: indent, suppressEmptyNode: true }).build(tree) as string;
      return { ok: true, output: out.trim(), warnings: [] };
    } catch (e) {
      return { ok: false, error: { message: e instanceof Error ? e.message : 'Could not read the XML', line: 1, col: 1, offset: 0, hint: 'Entity definitions beyond the safety limits are rejected.' }, warnings: [] };
    }
  }
  const parsed = parseAny(text, format, opts);
  if (!parsed.ok || !parsed.node) return { ok: false, error: parsed.error, warnings: parsed.warnings };
  return { ok: true, output: render(parsed.node, format, opts), warnings: parsed.warnings };
}

export function convertText(text: string, from: Format, to: Format, opts: FormatOptions = {}): TextResult {
  const parsed = parseAny(text, from, opts);
  if (!parsed.ok || !parsed.node) return { ok: false, error: parsed.error, warnings: parsed.warnings };
  const warnings = [...parsed.warnings];
  if (from === 'xml' && to !== 'xml') warnings.push('XML mapping: attributes become keys prefixed with "@_", text next to attributes becomes "#text", repeated tags become arrays. All values are strings.');
  if (to === 'xml' && from !== 'xml') warnings.push('XML needs one root element; the data was wrapped in <root> when it had none. Keys starting with "@_" become attributes.');
  return { ok: true, output: render(parsed.node, to, opts), warnings };
}
