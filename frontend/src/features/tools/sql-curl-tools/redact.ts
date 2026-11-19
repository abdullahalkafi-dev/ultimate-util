import type { HeaderEntry, ParsedRequest } from './curl';

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'x-access-token',
  'x-amz-security-token',
  'x-csrf-token',
]);

const SENSITIVE_KEYS = /^(password|passwd|secret|token|api_?key|access_?token|refresh_?token|signature|sig|auth)$/i;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/;

export interface RedactionResult {
  request: ParsedRequest;
  redactedCount: number;
  secretsFound: number;
  jwtToken: string | null;
}

function redactJsonValue(val: unknown, count: { n: number }): unknown {
  if (Array.isArray(val)) return val.map((item) => redactJsonValue(item, count));
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(k) && typeof v === 'string' && v.length > 0) {
        out[k] = '[REDACTED]';
        count.n++;
      } else {
        out[k] = redactJsonValue(v, count);
      }
    }
    return out;
  }
  return val;
}

export function applyRedaction(req: ParsedRequest, redact: boolean): RedactionResult {
  const count = { n: 0 };
  let jwtToken: string | null = null;

  for (const h of req.headers) {
    const m = JWT_RE.exec(h.value);
    if (m) {
      jwtToken = m[0];
      break;
    }
  }
  if (!jwtToken && req.body) {
    const m = JWT_RE.exec(req.body);
    if (m) jwtToken = m[0];
  }

  const headers: HeaderEntry[] = req.headers.map((h) => {
    const low = h.name.toLowerCase();
    const isSensitive = SENSITIVE_HEADERS.has(low) || /api[-_]?key|secret|token|auth/i.test(low);
    if (isSensitive) {
      count.n++;
      return redact ? { name: h.name, value: '[REDACTED]' } : h;
    }
    return h;
  });

  let url = req.url;
  const queryParams: HeaderEntry[] = req.queryParams.map((q) => {
    if (SENSITIVE_KEYS.test(q.name)) {
      count.n++;
      return redact ? { name: q.name, value: '[REDACTED]' } : q;
    }
    return q;
  });

  try {
    const u = new URL(req.url);
    if (u.username || u.password) {
      count.n++;
      if (redact) {
        u.username = 'REDACTED';
        u.password = 'REDACTED';
      }
    }
    u.searchParams.forEach((v, k) => {
      if (SENSITIVE_KEYS.test(k) && v) {
        if (redact) u.searchParams.set(k, 'REDACTED');
      }
    });
    url = u.toString();
  } catch {
    /* keep raw url */
  }

  let body = req.body;
  const formFields: HeaderEntry[] = req.formFields.map((f) => {
    if (SENSITIVE_KEYS.test(f.name) && f.value) {
      count.n++;
      return redact ? { name: f.name, value: '[REDACTED]' } : f;
    }
    return f;
  });

  if (body) {
    if (req.bodyKind === 'json') {
      try {
        const parsed: unknown = JSON.parse(body);
        const bodyCount = { n: 0 };
        const masked = redactJsonValue(parsed, bodyCount);
        count.n += bodyCount.n;
        if (redact && bodyCount.n > 0) body = JSON.stringify(masked, null, 2);
      } catch {
        /* keep raw string */
      }
    } else if (req.bodyKind === 'form' && redact) {
      body = formFields.map((f) => `${encodeURIComponent(f.name)}=${f.value === '[REDACTED]' ? '[REDACTED]' : encodeURIComponent(f.value)}`).join('&');
    }
  }

  const secretsFound = count.n + (req.basicAuth ? 1 : 0);
  const nextReq: ParsedRequest = {
    ...req,
    url,
    headers,
    queryParams,
    body,
    formFields,
    basicAuth: redact && req.basicAuth ? { user: req.basicAuth.user, pass: '[REDACTED]' } : req.basicAuth,
  };

  return {
    request: nextReq,
    redactedCount: redact ? secretsFound : 0,
    secretsFound,
    jwtToken,
  };
}
