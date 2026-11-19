import type { ToolLoaders } from '../types';

/** One line per tool: slug -> dynamic import of its folder. Add yours when a tool goes live. */
export const developerLoaders: ToolLoaders = {
  'json-yaml-xml': () => import('../json-yaml-xml'),
  'jwt-decoder': () => import('../jwt-decoder'),
  'regex-tester': () => import('../regex-tester'),
  'base64-url-hash': () => import('../base64-url-hash'),
  'cron-parser': () => import('../cron-parser'),
  'sql-curl-tools': () => import('../sql-curl-tools'),
};
