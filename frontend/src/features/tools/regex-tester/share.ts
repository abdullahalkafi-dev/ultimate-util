import { normalizeFlags } from './engine';

export const MAX_SHARED_PATTERN = 2000;

/** Share links carry the pattern and flags only, in the hash. Test text and replacement never go in a URL. */
export function buildShareHash(pattern: string, flags: string): string {
  const params = new URLSearchParams();
  params.set('p', pattern);
  params.set('f', normalizeFlags(flags));
  return `#${params.toString()}`;
}

export interface ParsedShare {
  pattern: string;
  flags: string;
  notices: string[];
}

export function parseShareHash(hash: string, supports: (flag: string) => boolean = () => true): ParsedShare | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const p = params.get('p');
  if (p === null) return null;
  const notices: string[] = [];
  if (p.length > MAX_SHARED_PATTERN) return { pattern: '', flags: 'g', notices: [`The shared pattern is longer than ${MAX_SHARED_PATTERN} characters and was ignored.`] };
  const rawFlags = params.get('f') ?? '';
  let flags = '';
  for (const f of new Set(rawFlags)) {
    if (!'dgimsuvy'.includes(f)) notices.push(`Unknown flag "${f}" was dropped.`);
    else if (!supports(f)) notices.push(`Flag "${f}" is not supported by this browser and was dropped.`);
    else flags += f;
  }
  if (flags.includes('u') && flags.includes('v')) {
    flags = flags.replace('u', '');
    notices.push('Flags u and v cannot be combined; u was dropped.');
  }
  return { pattern: p, flags: normalizeFlags(flags), notices };
}

export function toLiteral(pattern: string, flags: string): string {
  const body = pattern.replace(/\//g, (m, offset: number) => (pattern[offset - 1] === '\\' ? m : '\\/')).replace(/\n/g, '\\n');
  return `/${body}/${normalizeFlags(flags)}`;
}

export function toConstructor(pattern: string, flags: string): string {
  const escaped = pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  return `new RegExp("${escaped}", "${normalizeFlags(flags)}")`;
}
