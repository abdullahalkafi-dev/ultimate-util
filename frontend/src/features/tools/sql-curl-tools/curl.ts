export type ShellKind = 'auto' | 'posix' | 'cmd' | 'powershell';

export interface HeaderEntry {
  name: string;
  value: string;
}

export interface ParsedRequest {
  source: 'curl' | 'http';
  detectedShell?: 'posix' | 'cmd' | 'powershell';
  method: string;
  url: string;
  headers: HeaderEntry[];
  queryParams: HeaderEntry[];
  body: string | null;
  bodyKind: 'none' | 'json' | 'form' | 'multipart' | 'raw' | 'file-placeholder';
  formFields: HeaderEntry[];
  basicAuth?: { user: string; pass: string };
  notes: string[];
  warnings: string[];
  ignoredOptions: string[];
  extraRequestsCount: number;
}

export type ParseCurlResult =
  | { ok: true; request: ParsedRequest }
  | { ok: false; error: string };

export function detectShellStyle(raw: string): 'posix' | 'cmd' | 'powershell' {
  if (/\^\r?\n|\^"/.test(raw)) return 'cmd';
  if (/`\r?\n/.test(raw)) return 'powershell';
  return 'posix';
}

export function tokenizeShell(raw: string, shell: 'posix' | 'cmd' | 'powershell'): { tokens: string[]; error?: string } {
  let text = raw.trim();
  if (shell === 'cmd') {
    text = text.replace(/\^\r?\n\s*/g, ' ');
  } else if (shell === 'powershell') {
    text = text.replace(/`\r?\n\s*/g, ' ');
  } else {
    text = text.replace(/\\\r?\n\s*/g, ' ');
  }

  const tokens: string[] = [];
  let cur = '';
  let hasToken = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      if (hasToken) {
        tokens.push(cur);
        cur = '';
        hasToken = false;
      }
      i++;
      continue;
    }

    hasToken = true;

    // $'...' ANSI-C quoting
    if (shell === 'posix' && ch === '$' && text[i + 1] === "'") {
      i += 2;
      while (i < text.length && text[i] !== "'") {
        if (text[i] === '\\' && i + 1 < text.length) {
          const n = text[i + 1]!;
          cur += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n;
          i += 2;
        } else {
          cur += text[i];
          i++;
        }
      }
      if (i >= text.length) return { tokens: [], error: "Unterminated $'...' quote in cURL command." };
      i++;
      continue;
    }

    if (ch === "'") {
      i++;
      while (i < text.length && text[i] !== "'") {
        cur += text[i];
        i++;
      }
      if (i >= text.length) return { tokens: [], error: 'Unterminated single quote in cURL command.' };
      i++;
      continue;
    }

    if (ch === '"') {
      i++;
      while (i < text.length && text[i] !== '"') {
        if (shell === 'cmd' && text[i] === '^' && i + 1 < text.length) {
          cur += text[i + 1];
          i += 2;
        } else if (text[i] === '\\' && i + 1 < text.length && ['"', '\\', '$', '`'].includes(text[i + 1]!)) {
          cur += text[i + 1];
          i += 2;
        } else {
          cur += text[i];
          i++;
        }
      }
      if (i >= text.length) return { tokens: [], error: 'Unterminated double quote in cURL command.' };
      i++;
      continue;
    }

    if (shell === 'cmd' && ch === '^' && i + 1 < text.length) {
      cur += text[i + 1];
      i += 2;
      continue;
    }

    if (shell === 'posix' && ch === '\\' && i + 1 < text.length) {
      cur += text[i + 1];
      i += 2;
      continue;
    }

    cur += ch;
    i++;
  }

  if (hasToken) tokens.push(cur);
  return { tokens };
}

function splitHeaderLine(line: string): HeaderEntry | null {
  const idx = line.indexOf(':');
  if (idx <= 0) return null;
  return { name: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
}

function encodeBase64Ascii(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function parseRawHttp(raw: string): ParseCurlResult {
  const norm = raw.replace(/\r\n/g, '\n').replace(/\n[ \t]+/g, ' ');
  const lines = norm.split('\n');
  const first = (lines[0] ?? '').trim();
  const reqLine = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\s+(\S+)(?:\s+HTTP\/[0-9.]+)?$/i.exec(first);
  if (!reqLine) {
    return { ok: false, error: 'Not a cURL command or valid HTTP/1.x request line.' };
  }
  const method = reqLine[1]!.toUpperCase();
  const target = reqLine[2]!;
  const headers: HeaderEntry[] = [];
  let i = 1;
  while (i < lines.length) {
    const line = lines[i]!;
    i++;
    if (line.trim() === '') break;
    const h = splitHeaderLine(line);
    if (h) headers.push(h);
  }
  const bodyText = lines.slice(i).join('\n');
  const host = headers.find((h) => h.name.toLowerCase() === 'host')?.value;
  let url = target;
  if (!/^https?:\/\//i.test(target)) {
    url = host ? `https://${host}${target.startsWith('/') ? '' : '/'}${target}` : target;
  }

  const queryParams: HeaderEntry[] = [];
  try {
    const u = new URL(url);
    u.searchParams.forEach((v, k) => queryParams.push({ name: k, value: v }));
  } catch {
    /* keep raw target */
  }

  const trimmedBody = bodyText.trim() ? bodyText : null;
  const ct = headers.find((h) => h.name.toLowerCase() === 'content-type')?.value.toLowerCase() ?? '';
  let bodyKind: ParsedRequest['bodyKind'] = 'none';
  const formFields: HeaderEntry[] = [];
  if (trimmedBody) {
    if (ct.includes('json')) bodyKind = 'json';
    else if (ct.includes('x-www-form-urlencoded')) {
      bodyKind = 'form';
      new URLSearchParams(trimmedBody).forEach((v, k) => formFields.push({ name: k, value: v }));
    } else {
      bodyKind = 'raw';
    }
  }

  return {
    ok: true,
    request: {
      source: 'http',
      method,
      url,
      headers,
      queryParams,
      body: trimmedBody,
      bodyKind,
      formFields,
      notes: /\n[ \t]+/.test(raw) ? ['Obsolete header line folding was unfolded.'] : [],
      warnings: [],
      ignoredOptions: [],
      extraRequestsCount: 0,
    },
  };
}

export function parseCurlOrHttp(raw: string, shellOverride: ShellKind = 'auto'): ParseCurlResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Paste a cURL command or HTTP request.' };

  if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+/i.test(trimmed)) {
    return parseRawHttp(trimmed);
  }

  if (/^(Invoke-WebRequest|iwr\b|wget\b|http\b|https\b)/i.test(trimmed)) {
    return { ok: false, error: 'Only cURL commands and raw HTTP requests are supported (not wget, HTTPie, or PowerShell Invoke-WebRequest).' };
  }

  const detectedShell = shellOverride === 'auto' ? detectShellStyle(trimmed) : shellOverride;
  const tokRes = tokenizeShell(trimmed, detectedShell);
  if (tokRes.error) return { ok: false, error: tokRes.error };
  const allTokens = tokRes.tokens;
  if (allTokens.length === 0) return { ok: false, error: 'Paste a cURL command.' };
  const firstWord = allTokens[0]!.replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase();
  if (firstWord !== 'curl') {
    return { ok: false, error: `Expected a command starting with "curl" or an HTTP request line, found "${allTokens[0]}".` };
  }

  const nextIdx = allTokens.indexOf('--next');
  const tokens = nextIdx === -1 ? allTokens.slice(1) : allTokens.slice(1, nextIdx);
  const extraRequestsCount = nextIdx === -1 ? 0 : allTokens.filter((t) => t === '--next').length;

  let methodExplicit: string | null = null;
  let url = '';
  const headers: HeaderEntry[] = [];
  const dataParts: string[] = [];
  const formFields: HeaderEntry[] = [];
  const notes: string[] = [];
  const warnings: string[] = [];
  const ignoredOptions: string[] = [];
  let basicAuth: { user: string; pass: string } | undefined;
  let useGet = false;
  let isJsonFlag = false;
  let isBinaryData = false;
  let hasDataFile = false;

  const takeValue = (idx: number, flag: string): [string | null, number] => {
    if (flag.includes('=')) {
      const eq = flag.indexOf('=');
      return [flag.slice(eq + 1), idx];
    }
    if (idx + 1 < tokens.length) return [tokens[idx + 1]!, idx + 1];
    return [null, idx];
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (!t.startsWith('-') || t === '-') {
      if (!url) url = t;
      continue;
    }

    const flag = t.includes('=') ? t.slice(0, t.indexOf('=')) : t;

    if (flag === '-X' || flag === '--request') {
      const [val, ni] = takeValue(i, t);
      i = ni;
      if (val) methodExplicit = val.toUpperCase();
    } else if (flag === '-I' || flag === '--head') {
      methodExplicit = 'HEAD';
    } else if (flag === '-G' || flag === '--get') {
      useGet = true;
    } else if (flag === '-H' || flag === '--header') {
      const [val, ni] = takeValue(i, t);
      i = ni;
      if (val) {
        const h = splitHeaderLine(val);
        if (h) headers.push(h);
      }
    } else if (flag === '--url') {
      const [val, ni] = takeValue(i, t);
      i = ni;
      if (val) url = val;
    } else if (flag === '-d' || flag === '--data' || flag === '--data-ascii' || flag === '--data-raw' || flag === '--data-binary' || flag === '--data-urlencode') {
      const [val, ni] = takeValue(i, t);
      i = ni;
      if (val !== null) {
        if (flag === '--data-binary') isBinaryData = true;
        if (flag !== '--data-raw' && val.startsWith('@')) {
          hasDataFile = true;
          const fileName = val.slice(1) || 'stdin';
          dataParts.push(`<contents of ${fileName}>`);
          notes.push(
            flag === '--data-binary'
              ? `${flag} ${val}: file is never read; binary bytes would keep CR/LF intact.`
              : `${flag} ${val}: file is never read; curl strips CR/LF from text files.`,
          );
        } else {
          dataParts.push(val);
        }
      }
    } else if (flag === '--json') {
      const [val, ni] = takeValue(i, t);
      i = ni;
      isJsonFlag = true;
      if (val !== null) dataParts.push(val);
    } else if (flag === '-F' || flag === '--form' || flag === '--form-string') {
      const [val, ni] = takeValue(i, t);
      i = ni;
      if (val) {
        const eq = val.indexOf('=');
        const k = eq > 0 ? val.slice(0, eq) : val;
        const v = eq > 0 ? val.slice(eq + 1) : '';
        formFields.push({ name: k, value: v.startsWith('@') ? `<file: ${v.slice(1)}>` : v });
        if (v.startsWith('@')) notes.push(`Multipart file "${v.slice(1)}" is a placeholder and is never read from disk.`);
      }
    } else if (flag === '-u' || flag === '--user') {
      const [val, ni] = takeValue(i, t);
      i = ni;
      if (val !== null) {
        const colon = val.indexOf(':');
        const user = colon >= 0 ? val.slice(0, colon) : val;
        const pass = colon >= 0 ? val.slice(colon + 1) : '';
        basicAuth = { user, pass };
        headers.push({ name: 'Authorization', value: `Basic ${encodeBase64Ascii(`${user}:${pass}`)}` });
      }
    } else if (flag === '--oauth2-bearer') {
      const [val, ni] = takeValue(i, t);
      i = ni;
      if (val) headers.push({ name: 'Authorization', value: `Bearer ${val}` });
    } else if (flag === '-A' || flag === '--user-agent') {
      const [val, ni] = takeValue(i, t);
      i = ni;
      if (val) headers.push({ name: 'User-Agent', value: val });
    } else if (flag === '-e' || flag === '--referer') {
      const [val, ni] = takeValue(i, t);
      i = ni;
      if (val) headers.push({ name: 'Referer', value: val });
    } else if (flag === '-b' || flag === '--cookie') {
      const [val, ni] = takeValue(i, t);
      i = ni;
      if (val) headers.push({ name: 'Cookie', value: val });
    } else if (flag === '--compressed') {
      notes.push('--compressed: curl requests gzip/deflate/br Accept-Encoding automatically.');
    } else if (flag === '-k' || flag === '--insecure') {
      warnings.push('-k / --insecure disables TLS certificate verification.');
    } else if (flag === '-L' || flag === '--location') {
      notes.push('-L / --location follows HTTP redirects.');
    } else if (flag === '-s' || flag === '--silent' || flag === '-v' || flag === '--verbose' || flag === '-i' || flag === '--include') {
      /* benign output flags */
    } else {
      ignoredOptions.push(t);
    }
  }

  // Handle HTTP/2 pseudo-headers copied from DevTools
  const filteredHeaders: HeaderEntry[] = [];
  let pMethod: string | null = null;
  let pScheme = 'https';
  let pAuthority = '';
  let pPath = '';
  for (const h of headers) {
    const low = h.name.toLowerCase();
    if (low === ':method') pMethod = h.value.toUpperCase();
    else if (low === ':scheme') pScheme = h.value;
    else if (low === ':authority') pAuthority = h.value;
    else if (low === ':path') pPath = h.value;
    else filteredHeaders.push(h);
  }
  if (!url && pAuthority) url = `${pScheme}://${pAuthority}${pPath}`;
  if (!url) return { ok: false, error: 'No URL found in this cURL command.' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `https://${url}`;

  // Decode Authorization: Basic if supplied via header
  if (!basicAuth) {
    const authH = filteredHeaders.find((h) => h.name.toLowerCase() === 'authorization');
    if (authH && /^Basic\s+(\S+)$/i.test(authH.value)) {
      try {
        const decoded = atob(RegExp.$1);
        const c = decoded.indexOf(':');
        basicAuth = { user: c >= 0 ? decoded.slice(0, c) : decoded, pass: c >= 0 ? decoded.slice(c + 1) : '' };
      } catch {
        /* ignore invalid base64 */
      }
    }
  }

  let body: string | null = null;
  let bodyKind: ParsedRequest['bodyKind'] = 'none';
  if (formFields.length > 0) {
    bodyKind = 'multipart';
    if (!filteredHeaders.some((h) => h.name.toLowerCase() === 'content-type')) {
      filteredHeaders.push({ name: 'Content-Type', value: 'multipart/form-data; boundary=----Boundary' });
    }
  } else if (dataParts.length > 0) {
    const joined = dataParts.join('&');
    if (dataParts.length > 1) notes.push(`Combined ${dataParts.length} -d data flags with "&".`);
    if (useGet) {
      try {
        const u = new URL(url);
        new URLSearchParams(joined).forEach((v, k) => u.searchParams.append(k, v));
        url = u.toString();
        notes.push('-G / --get moved data into the URL query string.');
      } catch {
        body = joined;
      }
    } else {
      body = joined;
      if (hasDataFile) bodyKind = 'file-placeholder';
      else if (isJsonFlag) bodyKind = 'json';
      else {
        const ct = filteredHeaders.find((h) => h.name.toLowerCase() === 'content-type')?.value.toLowerCase() ?? '';
        if (!ct) {
          filteredHeaders.push({ name: 'Content-Type', value: 'application/x-www-form-urlencoded' });
          bodyKind = 'form';
        } else if (ct.includes('json')) {
          bodyKind = 'json';
        } else if (ct.includes('x-www-form-urlencoded')) {
          bodyKind = 'form';
        } else {
          bodyKind = 'raw';
        }
      }
      if (bodyKind === 'form' && body) {
        new URLSearchParams(body).forEach((v, k) => formFields.push({ name: k, value: v }));
      }
    }
  }

  if (isJsonFlag) {
    if (!filteredHeaders.some((h) => h.name.toLowerCase() === 'content-type')) {
      filteredHeaders.push({ name: 'Content-Type', value: 'application/json' });
    }
    if (!filteredHeaders.some((h) => h.name.toLowerCase() === 'accept')) {
      filteredHeaders.push({ name: 'Accept', value: 'application/json' });
    }
  }
  void isBinaryData;

  const method = methodExplicit ?? pMethod ?? ((body !== null || formFields.length > 0) && !useGet ? 'POST' : 'GET');
  if (extraRequestsCount > 0) {
    notes.push(`Found ${extraRequestsCount} additional --next request(s); showing the first request.`);
  }

  const queryParams: HeaderEntry[] = [];
  try {
    const u = new URL(url);
    u.searchParams.forEach((v, k) => queryParams.push({ name: k, value: v }));
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    request: {
      source: 'curl',
      detectedShell,
      method,
      url,
      headers: filteredHeaders,
      queryParams,
      body,
      bodyKind,
      formFields,
      basicAuth,
      notes,
      warnings,
      ignoredOptions,
      extraRequestsCount,
    },
  };
}
