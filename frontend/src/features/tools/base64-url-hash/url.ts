/** URL percent encoding in three modes. */

export type UrlMode = 'component' | 'full' | 'form';

export type UrlResult =
  | { ok: true; value: string; hints: string[] }
  | { ok: false; error: string; position?: number; canLenient?: boolean; canLatin1?: boolean };

function loneSurrogate(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = text.charCodeAt(i + 1);
      if (n >= 0xdc00 && n <= 0xdfff) i++;
      else return i;
    } else if (c >= 0xdc00 && c <= 0xdfff) return i;
  }
  return -1;
}

export function encodeUrl(text: string, mode: UrlMode): UrlResult {
  const bad = loneSurrogate(text);
  if (bad !== -1) return { ok: false, error: `Invalid Unicode (lone surrogate) at position ${bad + 1}.`, position: bad };
  const hints: string[] = [];
  if (/%[0-9a-f]{2}/i.test(text)) {
    hints.push('The input already contains percent sequences (%XX). Encoding again double-encodes them (% becomes %25).');
  }
  if (mode === 'component' && /^[a-z][a-z0-9+.-]*:\/\//i.test(text.trim())) {
    hints.push('This looks like a full URL. Use Full URL mode to keep https:// readable.');
  }
  let value: string;
  if (mode === 'component') value = encodeURIComponent(text);
  else if (mode === 'full') value = encodeURI(text);
  else value = new URLSearchParams({ k: text }).toString().slice(2);
  return { ok: true, value, hints };
}

const isHex = (s: string) => /^[0-9a-fA-F]{2}$/.test(s);

/** First malformed percent escape or invalid UTF-8 run; -1 when the text decodes. */
export function findDecodeError(text: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '%' && !isHex(text.slice(i + 1, i + 3))) return i;
  }
  try {
    decodeURIComponent(text);
    return -1;
  } catch {
    const re = /(?:%[0-9a-fA-F]{2})+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      try {
        decodeURIComponent(m[0]);
      } catch {
        return m.index;
      }
    }
    return 0;
  }
}

export interface DecodeOptions {
  lenient?: boolean;
  latin1?: boolean;
}

export function decodeUrl(text: string, mode: UrlMode, opts: DecodeOptions = {}): UrlResult {
  const src = mode === 'form' ? text.replace(/\+/g, ' ') : text;
  if (opts.latin1) {
    return { ok: true, value: new TextDecoder('windows-1252').decode(percentBytes(src)), hints: ['Decoded as Windows-1252 (Latin-1 family).'] };
  }
  if (opts.lenient) return { ok: true, value: decodeLenient(src), hints: ['Malformed sequences were left as typed.'] };
  try {
    return {
      ok: true,
      value: mode === 'full' ? decodeURI(src) : decodeURIComponent(src),
      hints: mode === 'full' ? ['Full URL mode keeps escapes of reserved characters such as %2F, %3F and %26.'] : [],
    };
  } catch {
    const pos = findDecodeError(src);
    const malformed = src[pos] === '%' && !isHex(src.slice(pos + 1, pos + 3));
    return {
      ok: false,
      error: malformed
        ? `Malformed percent sequence at position ${pos + 1}: "${src.slice(pos, pos + 3)}".`
        : `The escape sequence at position ${pos + 1} is not valid UTF-8.`,
      position: pos,
      canLenient: true,
      canLatin1: !malformed,
    };
  }
}

function percentBytes(src: string): Uint8Array {
  const out: number[] = [];
  const enc = new TextEncoder();
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '%' && isHex(src.slice(i + 1, i + 3))) {
      out.push(parseInt(src.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const cp = src.codePointAt(i)!;
      if (cp > 0xffff) i++;
      out.push(...enc.encode(String.fromCodePoint(cp)));
    }
  }
  return Uint8Array.from(out);
}

/** Decodes valid runs and keeps malformed escapes literally. */
export function decodeLenient(src: string): string {
  return src.replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run.replace(/%[0-9a-fA-F]{2}/g, (e) => {
        try {
          return decodeURIComponent(e);
        } catch {
          return e;
        }
      });
    }
  });
}

export interface UrlBreakdown {
  scheme: string;
  host: string;
  port: string;
  path: string;
  hash: string;
  query: { key: string; value: string }[];
}

export function parseUrl(text: string): UrlBreakdown | null {
  const t = text.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return null;
  try {
    const u = new URL(t);
    return {
      scheme: u.protocol.replace(/:$/, ''),
      host: u.hostname,
      port: u.port,
      path: u.pathname,
      hash: u.hash.replace(/^#/, ''),
      query: [...u.searchParams.entries()].map(([key, value]) => ({ key, value })),
    };
  } catch {
    return null;
  }
}
