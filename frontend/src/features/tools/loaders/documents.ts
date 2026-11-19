import type { ToolLoaders } from '../types';

/** One line per tool: slug -> dynamic import of its folder. Add yours when a tool goes live. */
export const documentsLoaders: ToolLoaders = {
  'docx-editor': () => import('../docx-editor'),
  'pdf-docx-converter': () => import('../pdf-docx-converter'),
  'pdf-merge-split-reorder': () => import('../pdf-merge-split-reorder'),
  'pdf-compress-protect': () => import('../pdf-compress-protect'),
  'ocr': () => import('../ocr'),
};
