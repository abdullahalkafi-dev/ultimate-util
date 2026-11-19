import type { ParsedRequest } from './curl';

export type CodeTarget = 'fetch' | 'axios' | 'python' | 'node';

const FORBIDDEN_BROWSER_HEADERS = new Set([
  'host',
  'content-length',
  'accept-encoding',
  'cookie',
  'origin',
  'referer',
  'user-agent',
  'connection',
]);

function tryJson(body: string | null, kind: ParsedRequest['bodyKind']): unknown | null {
  if (!body || kind !== 'json') return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

export function generateSnippet(req: ParsedRequest, target: CodeTarget): string {
  if (target === 'fetch' || target === 'axios') {
    const omitted: string[] = [];
    const kept = req.headers.filter((h) => {
      if (FORBIDDEN_BROWSER_HEADERS.has(h.name.toLowerCase())) {
        omitted.push(h.name);
        return false;
      }
      return true;
    });
    const note = omitted.length ? `// Browser omits forbidden headers: ${omitted.join(', ')}\n` : '';
    const hdrObj = Object.fromEntries(kept.map((h) => [h.name, h.value]));
    const parsedJson = tryJson(req.body, req.bodyKind);

    if (target === 'fetch') {
      const opts: Record<string, unknown> = { method: req.method };
      if (kept.length) opts['headers'] = hdrObj;
      if (req.body !== null && req.method !== 'GET' && req.method !== 'HEAD') {
        opts['body'] = parsedJson !== null ? '__JSON_BODY__' : req.body;
      }
      let jsonOpts = JSON.stringify(opts, null, 2);
      if (parsedJson !== null) {
        jsonOpts = jsonOpts.replace('"__JSON_BODY__"', `JSON.stringify(${JSON.stringify(parsedJson, null, 2).replace(/\n/g, '\n  ')})`);
      }
      return `${note}const response = await fetch(${JSON.stringify(req.url)}, ${jsonOpts});\nconst data = await response.text();`;
    }

    const cfg: Record<string, unknown> = { method: req.method.toLowerCase(), url: req.url };
    if (kept.length) cfg['headers'] = hdrObj;
    if (req.body !== null && req.method !== 'GET' && req.method !== 'HEAD') {
      cfg['data'] = parsedJson !== null ? parsedJson : req.body;
    }
    return `${note}import axios from 'axios';\n\nconst { data } = await axios(${JSON.stringify(cfg, null, 2)});`;
  }

  if (target === 'python') {
    const lines = ['import requests', ''];
    const hdrObj = Object.fromEntries(req.headers.map((h) => [h.name, h.value]));
    if (req.headers.length) lines.push(`headers = ${JSON.stringify(hdrObj, null, 4)}`, '');
    const parsedJson = tryJson(req.body, req.bodyKind);
    const args = [`${JSON.stringify(req.method)}`, `${JSON.stringify(req.url)}`];
    if (req.headers.length) args.push('headers=headers');
    if (req.body !== null && req.method !== 'GET' && req.method !== 'HEAD') {
      if (parsedJson !== null) {
        lines.push(`payload = ${JSON.stringify(parsedJson, null, 4)}`, '');
        args.push('json=payload');
      } else {
        args.push(`data=${JSON.stringify(req.body)}`);
      }
    }
    lines.push(`response = requests.request(${args.join(', ')})`);
    lines.push('print(response.status_code, response.text)');
    return lines.join('\n');
  }

  // Node https / fetch
  const hdrObj = Object.fromEntries(req.headers.map((h) => [h.name, h.value]));
  const lines = ["import https from 'node:https';", ''];
  const opts = {
    method: req.method,
    headers: hdrObj,
  };
  lines.push(`const req = https.request(${JSON.stringify(req.url)}, ${JSON.stringify(opts, null, 2)}, (res) => {`);
  lines.push("  let body = '';");
  lines.push("  res.on('data', (chunk) => (body += chunk));");
  lines.push("  res.on('end', () => console.log(res.statusCode, body));");
  lines.push('});');
  if (req.body !== null && req.method !== 'GET' && req.method !== 'HEAD') {
    lines.push(`req.write(${JSON.stringify(req.body)});`);
  }
  lines.push('req.end();');
  return lines.join('\n');
}
