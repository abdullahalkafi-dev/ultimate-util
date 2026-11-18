import type { ToolLoaders } from '../types';

/** One line per tool: slug -> dynamic import of its folder. Add yours when a tool goes live. */
export const everydayLoaders: ToolLoaders = {
  'word-counter': () => import('../word-counter'),
};
