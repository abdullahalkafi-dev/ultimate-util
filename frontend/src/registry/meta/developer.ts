import type { ToolMeta } from '../types';

export const developerTools: ToolMeta[] = [
  {
    id: 'F-018', slug: 'json-yaml-xml', name: 'JSON / YAML / XML Formatter', category: 'developer', tier: 'client',
    icon: 'braces', status: 'soon', keywords: ['json', 'yaml', 'xml', 'format', 'beautify', 'minify', 'diff', 'validate'],
    description: 'Validate, beautify, minify and diff side by side.',
  },
  {
    id: 'F-019', slug: 'jwt-decoder', name: 'JWT Decoder', category: 'developer', tier: 'client',
    icon: 'key', status: 'soon', keywords: ['jwt', 'token', 'decode', 'auth', 'bearer', 'claims'],
    description: 'Inspect token headers and expiry without leaking it.',
  },
  {
    id: 'F-020', slug: 'regex-tester', name: 'Regex Tester', category: 'developer', tier: 'client',
    icon: 'regex', status: 'soon', keywords: ['regex', 'regexp', 'pattern', 'match', 'test', 'cheatsheet'],
    description: 'Live matches with a plain-English token breakdown.',
  },
  {
    id: 'F-021', slug: 'base64-url-hash', name: 'Base64, URL & Hash', category: 'developer', tier: 'client',
    icon: 'hash', status: 'soon', keywords: ['base64', 'url', 'encode', 'decode', 'hash', 'md5', 'sha', 'bcrypt', 'hmac'],
    description: 'Encode, decode, and generate MD5, SHA-256, bcrypt.',
  },
  {
    id: 'F-022', slug: 'cron-parser', name: 'Cron Parser', category: 'developer', tier: 'client',
    icon: 'clock', status: 'soon', keywords: ['cron', 'schedule', 'crontab', 'quartz', 'kubernetes', 'next runs'],
    description: 'Read cron in plain words and preview the next 10 runs.',
  },
  {
    id: 'F-023', slug: 'sql-curl-tools', name: 'SQL & cURL Tools', category: 'developer', tier: 'client',
    icon: 'db', status: 'soon', keywords: ['sql', 'format', 'curl', 'fetch', 'axios', 'http', 'headers', 'webhook'],
    description: 'Format SQL, turn cURL into fetch or axios.',
  },
];
