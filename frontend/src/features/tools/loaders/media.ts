import type { ToolLoaders } from '../types';

/** One line per tool: slug -> dynamic import of its folder. Add yours when a tool goes live. */
export const mediaLoaders: ToolLoaders = {
  'image-editor': () => import('../image-editor'),
  'image-compressor': () => import('../image-compressor'),
  'bulk-resizer-converter': () => import('../bulk-resizer-converter'),
  'background-remover': () => import('../background-remover'),
  'exif-tool': () => import('../exif-tool'),
  'video-gif-maker': () => import('../video-gif-maker'),
};
