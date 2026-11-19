import type { ToolLoaders } from '../types';

/** One line per tool: slug -> dynamic import of its folder. Add yours when a tool goes live. */
export const designLoaders: ToolLoaders = {
  'color-wheel-softbox': () => import('../color-wheel-softbox'),
  'palette-contrast': () => import('../palette-contrast'),
  'css-tailwind-generators': () => import('../css-tailwind-generators'),
  'svg-optimizer-jsx': () => import('../svg-optimizer-jsx'),
  'font-pairer-type-scale': () => import('../font-pairer-type-scale'),
  'placeholder-mockup-generator': () => import('../placeholder-mockup-generator'),
};
