export interface SafetyAssessment {
  kind: 'url' | 'wifi' | 'vcard' | 'text';
  blocked: boolean;
  warnings: string[];
  host?: string;
  decodedHost?: string;
  safeUrl?: string;
}

const SHORTENERS = new Set([
  'bit.ly',
  't.co',
  'tinyurl.com',
  'is.gd',
  'goo.gl',
  'ow.ly',
  'buff.ly',
  'rb.gy',
  'cutt.ly',
  'shorturl.at',
]);

function hasMixedScripts(host: string): boolean {
  const hasLatin = /[a-z]/i.test(host);
  const hasCyrillic = /[\u0400-\u04ff]/.test(host);
  const hasGreek = /[\u0370-\u03ff]/.test(host);
  return [hasLatin, hasCyrillic, hasGreek].filter(Boolean).length > 1;
}

export function inspectDecodedContent(text: string): SafetyAssessment {
  const trimmed = text.trim();
  if (/^WIFI:/i.test(trimmed)) return { kind: 'wifi', blocked: false, warnings: [] };
  if (/^BEGIN:VCARD/i.test(trimmed)) return { kind: 'vcard', blocked: false, warnings: [] };

  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
    return {
      kind: 'url',
      blocked: true,
      warnings: ['Dangerous link scheme blocked. This content can only be copied as plain text.'],
    };
  }

  let parsed: URL | null = null;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      parsed = new URL(trimmed);
    } catch {
      parsed = null;
    }
  }
  if (!parsed) return { kind: 'text', blocked: false, warnings: [] };

  const warnings: string[] = [];
  const host = parsed.hostname.toLowerCase();
  let decodedHost = host;
  try {
    decodedHost = decodeURIComponent(host);
  } catch {
    decodedHost = host;
  }

  if (host.includes('xn--')) warnings.push('Internationalized (punycode) domain — verify the host carefully.');
  if (hasMixedScripts(decodedHost)) warnings.push('Mixed scripts detected in hostname (possible lookalike domain).');
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) warnings.push('Points directly to an IP address instead of a domain name.');
  if (SHORTENERS.has(host)) warnings.push('Shortened URL hides the final destination.');
  if (trimmed.length > 220) warnings.push('Unusually long URL.');
  if (parsed.protocol === 'http:') warnings.push('Unencrypted http:// link.');

  return {
    kind: 'url',
    blocked: false,
    warnings,
    host,
    decodedHost,
    safeUrl: parsed.toString(),
  };
}
