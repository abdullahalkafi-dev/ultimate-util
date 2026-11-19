'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banner,
  CopyButton,
  DropZone,
  ErrorBanner,
  Field,
  Icon,
  ProgressBar,
  SegmentedControl,
  Tabs,
  useToast,
} from '@/components/ui';
import { downloadText, formatBytes } from '@/lib/files';
import { readJson, writeJson } from '@/lib/storage';
import { generateSnippet, type CodeTarget } from './codegen';
import { parseCurlOrHttp, type ShellKind } from './curl';
import { applyRedaction } from './redact';
import {
  DEFAULT_SQL_OPTIONS,
  SQL_DIALECTS,
  formatSql,
  minifySql,
  type SqlDialect,
  type SqlFormatOptions,
  type SqlProcessResult,
} from './sql';
import styles from './styles.module.css';

type ToolTab = 'sql' | 'curl';
type CurlSubTab = 'summary' | 'headers' | 'body' | 'code';

const STORAGE_KEY = 'uu-sql-curl-tools';
const SQL_WORKER_THRESHOLD = 250_000;
const SOFT_SQL_BYTES = 5 * 1024 * 1024;

const SAMPLE_SQL = `SELECT u.id, u.email, COUNT(o.id) AS orders -- active buyers\nFROM users u INNER JOIN orders o ON o.user_id = u.id\nWHERE u.status IN ('active','verified','vip') AND o.total >= 50\nGROUP BY u.id, u.email ORDER BY orders DESC;`;

const SAMPLE_CURL = `curl -X POST 'https://api.example.com/v1/webhooks?token=sec_live_123' \\\n  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.sig' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"event":"invoice.paid","secret":"whsec_abc"}'`;

interface SavedSettings {
  sqlOpts: SqlFormatOptions;
  redact: boolean;
  codeTarget: CodeTarget;
}

export default function SqlCurlTools() {
  const toast = useToast();
  const [tab, setTab] = useState<ToolTab>('sql');

  // SQL state
  const [sqlInput, setSqlInput] = useState('');
  const [sqlOpts, setSqlOpts] = useState<SqlFormatOptions>(DEFAULT_SQL_OPTIONS);
  const [sqlResult, setSqlResult] = useState<SqlProcessResult>({ output: '' });
  const [sqlWorking, setSqlWorking] = useState(false);
  const sqlWorkerRef = useRef<Worker | null>(null);
  const sqlReqId = useRef(0);

  // cURL state
  const [curlInput, setCurlInput] = useState('');
  const [shell, setShell] = useState<ShellKind>('auto');
  const [redact, setRedact] = useState(true);
  const [curlSub, setCurlSub] = useState<CurlSubTab>('summary');
  const [codeTarget, setCodeTarget] = useState<CodeTarget>('fetch');
  const [headerSortAsc, setHeaderSortAsc] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = readJson<Partial<SavedSettings> | null>(STORAGE_KEY, null);
    if (saved) {
      if (saved.sqlOpts) setSqlOpts({ ...DEFAULT_SQL_OPTIONS, ...saved.sqlOpts });
      if (typeof saved.redact === 'boolean') setRedact(saved.redact);
      if (saved.codeTarget) setCodeTarget(saved.codeTarget);
    }
    setLoaded(true);
    return () => {
      sqlWorkerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    writeJson(STORAGE_KEY, { sqlOpts, redact, codeTarget });
  }, [sqlOpts, redact, codeTarget, loaded]);

  function runSql(mode: 'format' | 'minify', sourceText = sqlInput) {
    if (!sourceText.trim()) {
      setSqlResult({ output: '' });
      return;
    }
    if (sourceText.length < SQL_WORKER_THRESHOLD) {
      const res =
        mode === 'format'
          ? formatSql(sourceText, sqlOpts)
          : minifySql(sourceText, { dialect: sqlOpts.dialect, stripCommentsOnMinify: sqlOpts.stripCommentsOnMinify });
      setSqlResult(res);
      return;
    }

    sqlWorkerRef.current?.terminate();
    const id = ++sqlReqId.current;
    try {
      const w = new Worker(new URL('./sql.worker.ts', import.meta.url), { type: 'module' });
      sqlWorkerRef.current = w;
      setSqlWorking(true);
      w.onmessage = (e: MessageEvent<{ id: number; res: SqlProcessResult }>) => {
        if (e.data.id !== sqlReqId.current) return;
        setSqlResult(e.data.res);
        setSqlWorking(false);
        w.terminate();
      };
      w.onerror = () => {
        if (id !== sqlReqId.current) return;
        setSqlWorking(false);
        w.terminate();
        setSqlResult({ output: sourceText, error: 'SQL worker failed.' });
      };
      w.postMessage({ id, mode, input: sourceText, opts: sqlOpts });
    } catch {
      const res =
        mode === 'format'
          ? formatSql(sourceText, sqlOpts)
          : minifySql(sourceText, { dialect: sqlOpts.dialect, stripCommentsOnMinify: sqlOpts.stripCommentsOnMinify });
      setSqlResult(res);
    }
  }

  function cancelSql() {
    sqlReqId.current++;
    sqlWorkerRef.current?.terminate();
    sqlWorkerRef.current = null;
    setSqlWorking(false);
  }

  async function onSqlFile(files: File[]) {
    const file = files[0];
    if (!file) return;
    const text = await file.text();
    setSqlInput(text);
    toast(`Loaded ${file.name} (${formatBytes(file.size)})`, 'info');
  }

  // cURL parse & redaction
  const parsedCurl = useMemo(() => (curlInput.trim() ? parseCurlOrHttp(curlInput, shell) : null), [curlInput, shell]);
  const redactedCurl = useMemo(
    () => (parsedCurl && parsedCurl.ok ? applyRedaction(parsedCurl.request, redact) : null),
    [parsedCurl, redact],
  );

  const sortedHeaders = useMemo(() => {
    const list = redactedCurl?.request.headers ?? [];
    if (headerSortAsc === null) return list;
    return [...list].sort((a, b) => (headerSortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));
  }, [redactedCurl, headerSortAsc]);

  const codeSnippet = useMemo(
    () => (redactedCurl ? generateSnippet(redactedCurl.request, codeTarget) : ''),
    [redactedCurl, codeTarget],
  );

  const prettyBody = useMemo(() => {
    const req = redactedCurl?.request;
    if (!req?.body) return '';
    if (req.bodyKind === 'json') {
      try {
        return JSON.stringify(JSON.parse(req.body), null, 2);
      } catch {
        return req.body;
      }
    }
    return req.body;
  }, [redactedCurl]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Tabs<ToolTab>
        label="SQL and cURL sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'sql', label: 'SQL Formatter' },
          { id: 'curl', label: 'cURL / HTTP Inspector' },
        ]}
      />

      {tab === 'sql' && (
        <div className="stack" style={{ gap: 16 }}>
          <section className="panel stack" aria-label="SQL options">
            <div className="grid-3">
              <Field label="SQL dialect">
                {(id) => (
                  <select
                    id={id}
                    className="select"
                    value={sqlOpts.dialect}
                    onChange={(e) => setSqlOpts((o) => ({ ...o, dialect: e.target.value as SqlDialect }))}
                  >
                    {SQL_DIALECTS.map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Keyword case">
                {(id) => (
                  <select
                    id={id}
                    className="select"
                    value={sqlOpts.keywordCase}
                    onChange={(e) => setSqlOpts((o) => ({ ...o, keywordCase: e.target.value as SqlFormatOptions['keywordCase'] }))}
                  >
                    <option value="upper">UPPERCASE</option>
                    <option value="lower">lowercase</option>
                    <option value="preserve">Preserve</option>
                  </select>
                )}
              </Field>
              <Field label="Indent">
                {(id) => (
                  <select
                    id={id}
                    className="select"
                    value={sqlOpts.indent}
                    onChange={(e) => setSqlOpts((o) => ({ ...o, indent: e.target.value as SqlFormatOptions['indent'] }))}
                  >
                    <option value="2">2 spaces</option>
                    <option value="4">4 spaces</option>
                    <option value="tab">Tab</option>
                  </select>
                )}
              </Field>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={sqlOpts.stripCommentsOnMinify}
                    onChange={(e) => setSqlOpts((o) => ({ ...o, stripCommentsOnMinify: e.target.checked }))}
                  />
                  Strip regular comments on minify
                </label>
                <Field label="Wrap IN() items after">
                  {(id) => (
                    <input
                      id={id}
                      type="number"
                      className="input"
                      style={{ width: 84 }}
                      min={0}
                      max={50}
                      value={sqlOpts.wrapInListAfter}
                      onChange={(e) => setSqlOpts((o) => ({ ...o, wrapInListAfter: Math.max(0, Math.min(50, Number(e.target.value) || 0)) }))}
                    />
                  )}
                </Field>
              </div>
              <div className="row">
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    setSqlInput(SAMPLE_SQL);
                    setSqlResult(formatSql(SAMPLE_SQL, sqlOpts));
                  }}
                >
                  Try an example
                </button>
                <button type="button" className="btn sm" onClick={() => { setSqlInput(''); setSqlResult({ output: '' }); }}>
                  Clear
                </button>
              </div>
            </div>
          </section>

          {sqlInput.length > SOFT_SQL_BYTES && (
            <Banner kind="warn">Large SQL input ({formatBytes(sqlInput.length)}); formatting runs in a background worker.</Banner>
          )}
          {sqlWorking && <ProgressBar label="Formatting SQL in background worker…" onCancel={cancelSql} />}
          {sqlResult.warning && <Banner kind="warn">{sqlResult.warning}</Banner>}
          {sqlResult.error && <ErrorBanner>{sqlResult.error}</ErrorBanner>}

          <div className="split">
            <div className="panel stack">
              <Field label="Input SQL">
                {(id) => (
                  <textarea
                    id={id}
                    className="textarea code"
                    style={{ minHeight: 280 }}
                    value={sqlInput}
                    placeholder="Paste SQL here or drop a .sql file below…"
                    onChange={(e) => setSqlInput(e.target.value)}
                  />
                )}
              </Field>
              <DropZone accept={['.sql', 'text/plain']} title="Drop a .sql file" onFiles={(f) => void onSqlFile(f)} />
              <div className="row">
                <button type="button" className="btn primary" disabled={!sqlInput.trim() || sqlWorking} onClick={() => runSql('format')}>
                  Format
                </button>
                <button type="button" className="btn" disabled={!sqlInput.trim() || sqlWorking} onClick={() => runSql('minify')}>
                  Minify
                </button>
              </div>
            </div>

            <div className="panel stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 className="panel-title" style={{ margin: 0 }}>Output</h2>
                <div className="row">
                  <CopyButton text={sqlResult.output} label="Copy SQL" />
                  <button
                    type="button"
                    className="btn sm"
                    disabled={!sqlResult.output}
                    onClick={() => downloadText(sqlResult.output, 'query-formatted.sql', 'application/sql')}
                  >
                    <Icon name="download" /> .sql
                  </button>
                </div>
              </div>
              <pre className={styles.codeOut} aria-live="polite">{sqlResult.output || 'Formatted output will appear here.'}</pre>
            </div>
          </div>
        </div>
      )}

      {tab === 'curl' && (
        <div className="stack" style={{ gap: 16 }}>
          <Banner kind="info">
            <Icon name="lock" /> This tool only reads the text you paste. It never sends network requests, opens URLs, or reads files referenced by <code>@file</code>.
          </Banner>

          <section className="panel stack" aria-label="cURL input">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row">
                <SegmentedControl<ShellKind>
                  label="Shell quoting style"
                  value={shell}
                  onChange={setShell}
                  options={[
                    { id: 'auto', label: 'Auto shell' },
                    { id: 'posix', label: 'POSIX / bash' },
                    { id: 'cmd', label: 'Windows cmd' },
                    { id: 'powershell', label: 'PowerShell' },
                  ]}
                />
                <label className="check">
                  <input type="checkbox" checked={redact} onChange={(e) => setRedact(e.target.checked)} />
                  Redact secrets
                </label>
              </div>
              <div className="row">
                <button type="button" className="btn sm" onClick={() => setCurlInput(SAMPLE_CURL)}>Try an example</button>
                <button type="button" className="btn sm" onClick={() => setCurlInput('')}>Clear</button>
              </div>
            </div>

            <Field label="Paste a cURL command or raw HTTP request">
              {(id) => (
                <textarea
                  id={id}
                  className="textarea code"
                  style={{ minHeight: 150 }}
                  value={curlInput}
                  placeholder="curl -X POST 'https://api.example.com/v1/items' -H 'Authorization: Bearer ...'"
                  onChange={(e) => setCurlInput(e.target.value)}
                />
              )}
            </Field>
          </section>

          {parsedCurl && !parsedCurl.ok && <ErrorBanner>{parsedCurl.error}</ErrorBanner>}

          {redactedCurl && (
            <div className="stack" style={{ gap: 12 }} aria-live="polite">
              {!redact && redactedCurl.secretsFound > 0 && (
                <Banner kind="warn">
                  Detected {redactedCurl.secretsFound} potential secret(s) in this request. Enable &ldquo;Redact secrets&rdquo; before sharing.
                </Banner>
              )}
              {redact && redactedCurl.redactedCount > 0 && (
                <Banner kind="info">
                  {redactedCurl.redactedCount} value(s) redacted. Check the output before sharing.
                </Banner>
              )}
              {redactedCurl.request.warnings.map((w) => (
                <Banner key={w} kind="warn">{w}</Banner>
              ))}
              {redactedCurl.request.notes.map((n) => (
                <Banner key={n} kind="info">{n}</Banner>
              ))}
              {redactedCurl.jwtToken && (
                <div className="row">
                  <span className="hint">Bearer JWT detected.</span>
                  <CopyButton text={redactedCurl.jwtToken} label="Copy raw JWT" />
                  <Link href="/tools/jwt-decoder" className="btn sm">Open JWT Decoder</Link>
                </div>
              )}

              <Tabs<CurlSubTab>
                label="Parsed request views"
                value={curlSub}
                onChange={setCurlSub}
                tabs={[
                  { id: 'summary', label: 'Summary' },
                  { id: 'headers', label: `Headers (${redactedCurl.request.headers.length})` },
                  { id: 'body', label: 'Body' },
                  { id: 'code', label: 'Code snippets' },
                ]}
              />

              {curlSub === 'summary' && (
                <section className="panel stack">
                  <div className="row">
                    <span className="tag local">{redactedCurl.request.method}</span>
                    <code className="mono" style={{ wordBreak: 'break-all' }}>{redactedCurl.request.url}</code>
                  </div>
                  {redactedCurl.request.detectedShell && (
                    <p className="hint" style={{ margin: 0 }}>Detected shell style: {redactedCurl.request.detectedShell}</p>
                  )}
                  {redactedCurl.request.basicAuth && (
                    <p className="muted" style={{ margin: 0 }}>
                      Basic Auth user: <code className="mono">{redactedCurl.request.basicAuth.user}</code> · password:{' '}
                      <code className="mono">{redactedCurl.request.basicAuth.pass}</code>
                    </p>
                  )}
                  {redactedCurl.request.queryParams.length > 0 && (
                    <>
                      <h3 className="panel-title" style={{ margin: '6px 0 0' }}>Query parameters</h3>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th scope="col">Parameter</th>
                            <th scope="col">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {redactedCurl.request.queryParams.map((q, i) => (
                            <tr key={`${q.name}-${i}`}>
                              <td className="mono">{q.name}</td>
                              <td className="mono">{q.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                  {redactedCurl.request.ignoredOptions.length > 0 && (
                    <p className="hint" style={{ margin: 0 }}>
                      Ignored options: <code className="mono">{redactedCurl.request.ignoredOptions.join(' ')}</code>
                    </p>
                  )}
                </section>
              )}

              {curlSub === 'headers' && (
                <section className="panel stack">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="row">
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => setHeaderSortAsc((prev) => (prev === null ? true : !prev))}
                      >
                        Sort by name {headerSortAsc === true ? '↑' : headerSortAsc === false ? '↓' : ''}
                      </button>
                    </div>
                    <div className="row">
                      <CopyButton
                        text={sortedHeaders.map((h) => `${h.name}: ${h.value}`).join('\n')}
                        label="Copy lines"
                      />
                      <CopyButton
                        text={JSON.stringify(Object.fromEntries(sortedHeaders.map((h) => [h.name, h.value])), null, 2)}
                        label="Copy JSON"
                      />
                    </div>
                  </div>
                  {sortedHeaders.length === 0 ? (
                    <p className="muted" style={{ margin: 0 }}>No headers in this request.</p>
                  ) : (
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th scope="col" aria-sort={headerSortAsc === true ? 'ascending' : headerSortAsc === false ? 'descending' : 'none'}>
                            Header
                          </th>
                          <th scope="col">Value</th>
                          <th scope="col">Copy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedHeaders.map((h, idx) => (
                          <tr key={`${h.name}-${idx}`}>
                            <td className="mono"><strong>{h.name}</strong></td>
                            <td className="mono" style={{ wordBreak: 'break-all' }}>{h.value}</td>
                            <td><CopyButton text={`${h.name}: ${h.value}`} label="Copy" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              )}

              {curlSub === 'body' && (
                <section className="panel stack">
                  {redactedCurl.request.formFields.length > 0 ? (
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th scope="col">Field</th>
                          <th scope="col">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {redactedCurl.request.formFields.map((f, i) => (
                          <tr key={`${f.name}-${i}`}>
                            <td className="mono">{f.name}</td>
                            <td className="mono">{f.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : prettyBody ? (
                    <>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="tag local">{redactedCurl.request.bodyKind}</span>
                        <CopyButton text={prettyBody} label="Copy body" />
                      </div>
                      <pre className={styles.codeOut}>{prettyBody}</pre>
                    </>
                  ) : (
                    <p className="muted" style={{ margin: 0 }}>This request has no body.</p>
                  )}
                </section>
              )}

              {curlSub === 'code' && (
                <section className="panel stack">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <SegmentedControl<CodeTarget>
                      label="Snippet language"
                      value={codeTarget}
                      onChange={setCodeTarget}
                      options={[
                        { id: 'fetch', label: 'fetch' },
                        { id: 'axios', label: 'axios' },
                        { id: 'python', label: 'Python requests' },
                        { id: 'node', label: 'Node https' },
                      ]}
                    />
                    <div className="row">
                      <CopyButton text={codeSnippet} label="Copy code" />
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => downloadText(codeSnippet, codeTarget === 'python' ? 'request.py' : 'request.js')}
                      >
                        <Icon name="download" /> Download
                      </button>
                    </div>
                  </div>
                  <pre className={styles.codeOut}>{codeSnippet}</pre>
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
