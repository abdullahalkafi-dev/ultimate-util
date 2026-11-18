import type { ToolLoaders } from '../types';

/** One line per tool: slug -> dynamic import of its folder. Add yours when a tool goes live. */
export const mediaLoaders: ToolLoaders = {
  // 'example-slug': () => import('../example-slug'),
};
