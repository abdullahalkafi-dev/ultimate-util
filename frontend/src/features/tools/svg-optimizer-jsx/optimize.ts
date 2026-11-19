import { optimize, type PluginConfig } from 'svgo/browser';
import { customPlugin, sanitizeSvg, SvgError, type RemovalEntry, type XNode } from './sanitize';

export type Risk = 'safe' | 'risky';

export interface PluginInfo {
  id: string;
  label: string;
  explain: string;
  risk: Risk;
}

/** The plugins of SVGO's default preset that users can toggle, with plain-language explanations. */
export const PLUGINS: PluginInfo[] = [
  { id: 'removeDoctype', label: 'Remove DOCTYPE', explain: 'Deletes the legacy <!DOCTYPE> line.', risk: 'safe' },
  { id: 'removeXMLProcInst', label: 'Remove XML declaration', explain: 'Deletes the <?xml ...?> header that browsers do not need.', risk: 'safe' },
  { id: 'removeComments', label: 'Remove comments', explain: 'Deletes comments written by design tools.', risk: 'safe' },
  { id: 'removeMetadata', label: 'Remove metadata', explain: 'Deletes <metadata> blocks (RDF, license, tool info).', risk: 'safe' },
  { id: 'removeEditorsNSData', label: 'Remove editor data', explain: 'Deletes Figma, Illustrator, Inkscape and Sketch private attributes and elements.', risk: 'safe' },
  { id: 'removeDeprecatedAttrs', label: 'Remove deprecated attributes', explain: 'Deletes attributes that no current browser uses.', risk: 'safe' },
  { id: 'cleanupAttrs', label: 'Clean attribute whitespace', explain: 'Trims newlines and repeated spaces inside attribute values.', risk: 'safe' },
  { id: 'mergeStyles', label: 'Merge <style> elements', explain: 'Combines several <style> blocks into one.', risk: 'safe' },
  { id: 'inlineStyles', label: 'Inline <style> rules', explain: 'Moves CSS rules onto elements when that is safe. Skipped when it would change specificity.', risk: 'risky' },
  { id: 'minifyStyles', label: 'Minify CSS', explain: 'Compresses CSS in <style> elements.', risk: 'safe' },
  { id: 'cleanupIds', label: 'Shorten and remove IDs', explain: 'Renames IDs to short names and drops unused ones. Breaks outside CSS or JS that targets an ID.', risk: 'risky' },
  { id: 'removeUselessDefs', label: 'Remove unused <defs>', explain: 'Deletes definitions that nothing references.', risk: 'safe' },
  { id: 'cleanupNumericValues', label: 'Round numeric values', explain: 'Rounds numbers and converts units like 1in to px.', risk: 'safe' },
  { id: 'convertColors', label: 'Shorten colors', explain: 'Turns rgb(255,0,0) and color names into the shortest hex.', risk: 'safe' },
  { id: 'removeUnknownsAndDefaults', label: 'Remove unknown and default values', explain: 'Deletes attributes that equal their defaults or are not valid SVG.', risk: 'risky' },
  { id: 'removeNonInheritableGroupAttrs', label: 'Remove useless group attributes', explain: 'Deletes group attributes that children cannot inherit.', risk: 'safe' },
  { id: 'removeUselessStrokeAndFill', label: 'Remove useless stroke and fill', explain: 'Deletes stroke or fill settings that have no visible effect.', risk: 'safe' },
  { id: 'cleanupEnableBackground', label: 'Clean enable-background', explain: 'Removes an obsolete filter attribute.', risk: 'safe' },
  { id: 'removeHiddenElems', label: 'Remove hidden elements', explain: 'Deletes elements that cannot be seen (zero size, opacity 0, display none).', risk: 'risky' },
  { id: 'removeEmptyText', label: 'Remove empty text', explain: 'Deletes <text> elements without content.', risk: 'safe' },
  { id: 'convertShapeToPath', label: 'Convert shapes to paths', explain: 'Rewrites rect, line, polygon as <path> to enable merging.', risk: 'risky' },
  { id: 'convertEllipseToCircle', label: 'Ellipse to circle', explain: 'Uses <circle> when both radii match.', risk: 'safe' },
  { id: 'moveElemsAttrsToGroup', label: 'Move attributes to group', explain: 'Hoists attributes shared by all children onto their <g>.', risk: 'safe' },
  { id: 'moveGroupAttrsToElems', label: 'Move group attributes to children', explain: 'Pushes transforms down to single paths.', risk: 'safe' },
  { id: 'collapseGroups', label: 'Collapse groups', explain: 'Removes <g> wrappers that do nothing.', risk: 'safe' },
  { id: 'convertPathData', label: 'Optimize path data', explain: 'Rewrites path commands in the shortest form, rounded to the precision below.', risk: 'risky' },
  { id: 'convertTransform', label: 'Optimize transforms', explain: 'Merges and shortens transform attributes.', risk: 'safe' },
  { id: 'removeEmptyAttrs', label: 'Remove empty attributes', explain: 'Deletes attributes with empty values.', risk: 'safe' },
  { id: 'removeEmptyContainers', label: 'Remove empty containers', explain: 'Deletes <g>, <defs> and similar elements without children.', risk: 'safe' },
  { id: 'mergePaths', label: 'Merge paths', explain: 'Joins adjacent paths with the same style into one.', risk: 'risky' },
  { id: 'removeUnusedNS', label: 'Remove unused namespaces', explain: 'Deletes xmlns declarations that nothing uses.', risk: 'safe' },
  { id: 'sortAttrs', label: 'Sort attributes', explain: 'Orders attributes the same way everywhere so gzip compresses better.', risk: 'safe' },
  { id: 'sortDefsChildren', label: 'Sort <defs> children', explain: 'Orders definitions for better compression.', risk: 'safe' },
  { id: 'removeDesc', label: 'Remove <desc>', explain: 'Deletes descriptions. Turn off to keep text alternatives for screen readers.', risk: 'safe' },
];

export type ColorMode = 'off' | 'single' | 'all';
export type A11yMode = 'none' | 'title' | 'decorative';

export interface OptimizeOptions {
  /** Plugin ids switched off. */
  disabled: string[];
  precision: number;
  multipass: boolean;
  /** Empty means no prefixing. */
  idPrefix: string;
  currentColor: ColorMode;
  a11y: A11yMode;
  titleText: string;
}

export const DEFAULT_OPTIONS: OptimizeOptions = {
  disabled: [],
  precision: 3,
  multipass: true,
  idPrefix: '',
  currentColor: 'off',
  a11y: 'none',
  titleText: '',
};

export interface OptimizeResult {
  /** Sanitized input (before SVGO). */
  sanitized: string;
  /** Final output. */
  svg: string;
  removed: RemovalEntry[];
  bytesBefore: number;
  bytesAfter: number;
  warnings: string[];
  /** True when the output has no viewBox even after trying to add one. */
  missingViewBox: boolean;
  multicolor: boolean;
}

const byteLength = (s: string) => new TextEncoder().encode(s).length;

function parseLength(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const m = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/.exec(v);
  return m ? Number(m[1]) : undefined;
}

/** Adds viewBox from width/height and guarantees the SVG namespace so the file renders standalone. */
const ensureRootPlugin = customPlugin('ensureRoot', {
  element: {
    enter(node) {
      if (node.name !== 'svg') return;
      const a = node.attributes ?? (node.attributes = {});
      if (!a.xmlns) a.xmlns = 'http://www.w3.org/2000/svg';
      if (!a.viewBox) {
        const w = parseLength(a.width);
        const h = parseLength(a.height);
        if (w && h) a.viewBox = `0 0 ${w} ${h}`;
      }
    },
  },
});

const PAINT_ATTRS = ['fill', 'stroke'];
const KEEP_PAINT = /^(none|currentcolor|inherit|context-fill|context-stroke|transparent)$/i;

function collectPaints(root: XNode, into: Set<string>) {
  const visit = (n: XNode) => {
    if (n.type === 'element') {
      for (const k of PAINT_ATTRS) {
        const v = n.attributes?.[k];
        if (v && !KEEP_PAINT.test(v.trim()) && !/^url\(/i.test(v.trim())) into.add(v.trim().toLowerCase());
      }
    }
    n.children?.forEach(visit);
  };
  visit(root);
}

export function countPaints(svg: string): number {
  const set = new Set<string>();
  const plugin = customPlugin('count', { root: { exit: (r) => collectPaints(r, set) } });
  optimize(svg, { plugins: [plugin] });
  return set.size;
}

function currentColorPlugin(mode: ColorMode): PluginConfig {
  const paints = new Set<string>();
  return customPlugin('currentColor', {
    root: {
      enter(root) {
        collectPaints(root, paints);
        if (mode === 'single' && paints.size > 1) paints.clear();
      },
    },
    element: {
      enter(node) {
        if (!paints.size || !node.attributes) return;
        for (const k of PAINT_ATTRS) {
          const v = node.attributes[k]?.trim().toLowerCase();
          if (v && paints.has(v)) node.attributes[k] = 'currentColor';
        }
      },
    },
  });
}

function a11yPlugin(mode: A11yMode, title: string): PluginConfig | null {
  if (mode === 'none') return null;
  return customPlugin('a11y', {
    element: {
      enter(node) {
        if (node.name !== 'svg') return;
        const a = node.attributes ?? (node.attributes = {});
        if (mode === 'decorative') {
          a['aria-hidden'] = 'true';
          delete a.role;
          return;
        }
        const text = title.trim();
        if (!text) return;
        a.role = 'img';
        a['aria-labelledby'] = 'svg-title';
        const children = (node.children ??= []);
        children.unshift({
          type: 'element',
          name: 'title',
          attributes: { id: 'svg-title' },
          children: [{ type: 'text', value: text }],
        });
      },
    },
  });
}

export function buildPlugins(o: OptimizeOptions): PluginConfig[] {
  const overrides: Record<string, false> = {};
  for (const id of o.disabled) overrides[id] = false;
  const plugins: PluginConfig[] = [
    ensureRootPlugin,
    {
      name: 'preset-default',
      params: { floatPrecision: o.precision, overrides: { ...overrides, convertPathData: o.disabled.includes('convertPathData') ? false : { floatPrecision: o.precision } } },
    } as unknown as PluginConfig,
  ];
  if (o.idPrefix.trim()) {
    plugins.push({ name: 'prefixIds', params: { prefix: o.idPrefix.trim(), delim: '-' } } as unknown as PluginConfig);
  }
  if (o.currentColor !== 'off') plugins.push(currentColorPlugin(o.currentColor));
  const a = a11yPlugin(o.a11y, o.titleText);
  if (a) plugins.push(a);
  // Run again so the guarantees hold even if a preset plugin dropped them.
  plugins.push(ensureRootPlugin);
  return plugins;
}

/** Full pipeline: sanitize first, then optimize. Pure and DOM-free so it can run in a worker. */
export function optimizeSvg(input: string, options: OptimizeOptions): OptimizeResult {
  const { svg: sanitized, removed } = sanitizeSvg(input);
  const warnings: string[] = [];
  let out: string;
  try {
    out = optimize(sanitized, { plugins: buildPlugins(options), multipass: options.multipass, js2svg: { pretty: false } }).data;
  } catch (e) {
    throw new SvgError(`Optimization failed: ${(e as Error).message}`);
  }
  if (/<(animate|animateTransform|animateMotion|set)\b/.test(out) || /@keyframes|animation\s*:/.test(out)) {
    warnings.push('Animation detected. Some plugins (merge paths, shapes to paths, ID cleanup) can break animations; compare the preview.');
  }
  if (/<image\b[^>]*data:image\//.test(out)) {
    warnings.push('An embedded raster image makes up much of this file. Consider a real image format instead.');
  }
  if (/<text\b/.test(out)) warnings.push('Text stays as text. If the font is missing on the viewer\'s device it will render differently; convert text to outlines in your design tool.');
  if (removed.some((r) => r.kind === 'foreignObject')) warnings.push('A <foreignObject> was removed; the picture may look different.');
  if (removed.some((r) => r.kind === 'external-reference')) warnings.push('External references were removed for privacy; those parts will not render.');
  const multicolor = countPaints(out) > 1;
  if (options.currentColor === 'all' && multicolor) warnings.push('currentColor replacement flattens this multi-color graphic into one color.');
  if (options.currentColor === 'single' && multicolor) warnings.push('This graphic has several colors, so currentColor was not applied. Choose "All colors" to force it.');
  const missingViewBox = !/<svg\b[^>]*\sviewBox=/.test(out);
  if (missingViewBox) warnings.push('No viewBox and no usable width/height: scaling may not work.');
  return {
    sanitized,
    svg: out,
    removed,
    bytesBefore: byteLength(input),
    bytesAfter: byteLength(out),
    warnings,
    missingViewBox,
    multicolor,
  };
}
