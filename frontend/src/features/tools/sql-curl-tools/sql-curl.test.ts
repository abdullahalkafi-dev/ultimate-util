import { describe, expect, it } from 'vitest';
import { generateSnippet } from './codegen';
import { parseCurlOrHttp } from './curl';
import { applyRedaction } from './redact';
import { DEFAULT_SQL_OPTIONS, formatSql, minifySql, tokenStreamsMatch } from './sql';

describe('sql formatter and minifier', () => {
  it('formats twice idempotently and preserves strings and comments', () => {
    const raw = `select id, 'SELECT * FROM fake' as lbl -- keep me\nfrom users where status = 'active'`;
    const first = formatSql(raw, DEFAULT_SQL_OPTIONS);
    expect(first.warning).toBeUndefined();
    const second = formatSql(first.output, DEFAULT_SQL_OPTIONS);
    expect(second.output).toBe(first.output);
    expect(first.output).toContain("'SELECT * FROM fake'");
    expect(first.output).toContain('-- keep me');
    expect(tokenStreamsMatch(raw, first.output, 'sql')).toBe(true);
  });

  it('supports T-SQL [brackets]/TOP and PostgreSQL :: casts', () => {
    const tsql = formatSql('select top 5 [User Id] from [dbo].[Users]', { ...DEFAULT_SQL_OPTIONS, dialect: 'transactsql' });
    expect(tsql.warning).toBeUndefined();
    expect(tsql.output).toContain('[User Id]');

    const pg = formatSql("select id::text, $$hello$$ as body from logs", { ...DEFAULT_SQL_OPTIONS, dialect: 'postgresql' });
    expect(pg.warning).toBeUndefined();
    expect(pg.output).toContain('::');
    expect(pg.output).toContain('$$hello$$');
  });

  it('minifies SQL while rewriting kept -- comments into /* ... */ and keeping optimizer hints', () => {
    const q = `SELECT /*+ INDEX(u idx) */ id -- user id\nFROM users u WHERE name = 'a -- b'`;
    const kept = minifySql(q, { dialect: 'mysql', stripCommentsOnMinify: false });
    expect(kept.output).toContain('/* user id */');
    expect(kept.output).toContain("'a -- b'");
    expect(kept.output).toContain('FROM users');

    const stripped = minifySql(q, { dialect: 'mysql', stripCommentsOnMinify: true });
    expect(stripped.output).toContain('/*+ INDEX(u idx) */');
    expect(stripped.output).not.toContain('user id');
  });
});

describe('cURL and HTTP parser, redaction and codegen', () => {
  it('parses Windows cmd ^ continuations and ^" quotes', () => {
    const cmd = `curl ^\n  -X POST ^\n  "https://api.example.com/v1/items" ^\n  -H "Authorization: Bearer secret-jwt" ^\n  -d "{\\"name\\":\\"widget\\"}"`;
    const res = parseCurlOrHttp(cmd);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.request.detectedShell).toBe('cmd');
      expect(res.request.method).toBe('POST');
      expect(res.request.url).toBe('https://api.example.com/v1/items');
      expect(res.request.headers[0]).toEqual({ name: 'Authorization', value: 'Bearer secret-jwt' });
    }
  });

  it('handles -u, -F, -G, --data-raw, --data-binary and --compressed', () => {
    const getQuery = parseCurlOrHttp("curl -G 'https://example.com/search' -d 'q=test' -d 'page=2' --compressed");
    expect(getQuery.ok).toBe(true);
    if (getQuery.ok) {
      expect(getQuery.request.method).toBe('GET');
      expect(getQuery.request.url).toContain('q=test&page=2');
    }

    const multipart = parseCurlOrHttp("curl -u alice:s3cr3t -F 'file=@photo.jpg' -F 'note=hi' https://example.com/upload");
    expect(multipart.ok).toBe(true);
    if (multipart.ok) {
      expect(multipart.request.method).toBe('POST');
      expect(multipart.request.basicAuth).toEqual({ user: 'alice', pass: 's3cr3t' });
      expect(multipart.request.formFields).toContainEqual({ name: 'file', value: '<file: photo.jpg>' });
    }

    const rawAt = parseCurlOrHttp("curl --data-raw '@literal' https://example.com/hook");
    expect(rawAt.ok && rawAt.request.body).toBe('@literal');
  });

  it('redacts Authorization, Cookie, -u credentials and JSON secrets when redaction is on', () => {
    const parsed = parseCurlOrHttp(
      `curl -u admin:pass123 -H "Cookie: sid=abc" -H "X-API-Key: k99" --json '{"password":"hunter2","user":"ada"}' https://example.com/login?token=xyz`,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const redacted = applyRedaction(parsed.request, true);
      expect(redacted.redactedCount).toBeGreaterThanOrEqual(4);
      expect(redacted.request.headers.every((h) => h.value === '[REDACTED]' || h.name.toLowerCase() === 'content-type' || h.name.toLowerCase() === 'accept')).toBe(true);
      expect(redacted.request.url).toContain('token=REDACTED');
      expect(redacted.request.body).toContain('[REDACTED]');
      expect(redacted.request.body).not.toContain('hunter2');

      const fetchCode = generateSnippet(redacted.request, 'fetch');
      expect(fetchCode).not.toContain('pass123');
      expect(fetchCode).not.toContain('hunter2');
      expect(fetchCode).toContain('Browser omits forbidden headers');

      const pyCode = generateSnippet(redacted.request, 'python');
      expect(pyCode).toContain('import requests');
    }
  });

  it('parses raw HTTP/1.x requests', () => {
    const raw = 'POST /webhooks/stripe HTTP/1.1\nHost: api.example.com\nContent-Type: application/json\n\n{"ok":true}';
    const res = parseCurlOrHttp(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.request.url).toBe('https://api.example.com/webhooks/stripe');
      expect(res.request.method).toBe('POST');
    }
  });
});
