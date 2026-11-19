import type { ToolLoaders } from '../types';

/** One line per tool: slug -> dynamic import of its folder. Add yours when a tool goes live. */
export const everydayLoaders: ToolLoaders = {
  'qr-barcode': () => import('../qr-barcode'),
  'unit-timezone-converter': () => import('../unit-timezone-converter'),
  'password-generator': () => import('../password-generator'),
  'word-counter': () => import('../word-counter'),
};
