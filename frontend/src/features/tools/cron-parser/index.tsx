'use client';

import { useDeferredValue, useEffect, useId, useMemo, useState } from 'react';
import {
  Banner,
  CopyButton,
  ErrorBanner,
  Field,
  Icon,
  SegmentedControl,
  Tabs,
} from '@/components/ui';
import { readJson, writeJson } from '@/lib/storage';
import { buildField, classifyField, modesFor, type Choice, type Mode } from './builder';
import { describe, normalizedMeaning } from './describe';
import {
  DIALECTS,
  FIELD_LABEL,
  fieldOrder,
  neverRuns,
  parseCron,
  splitFields,
  type Dialect,
  type FieldKey,
} from './parse';
import {
  formatRun,
  listTimeZones,
  nextRuns,
  relativeTime,
  upcomingDstChanges,
} from './schedule';
import { crontabLine, kubernetesYaml, toEventBridge } from './snippets';
import styles from './styles.module.css';

const STORAGE_KEY = 'uu-cron-parser';
type SubTab = 'runs' | 'builder' | 'snippets';

interface SavedSettings {
  dialect: Dialect;
  tz: string;
}

const EXAMPLES: { label: string; expr: string; dialect: Dialect }[] = [
  { label: 'Weekdays every 15m', expr: '*/15 9-17 * * 1-5', dialect: 'unix' },
  { label: 'Midnight daily', expr: '0 0 * * *', dialect: 'unix' },
  { label: '15th OR Friday (OR rule)', expr: '0 0 15 * 5', dialect: 'unix' },
  { label: 'Every 2nd day on Fri (AND)', expr: '0 0 */2 * 5', dialect: 'unix' },
  { label: '3rd Friday (Quartz)', expr: '0 0 12 ? * 6#3', dialect: 'quartz' },
  { label: 'AWS weekdays 12:00 UTC', expr: 'cron(0 12 ? * MON-FRI *)', dialect: 'aws' },
  { label: '@daily macro', expr: '@daily', dialect: 'unix' },
  { label: 'Never runs (Feb 30)', expr: '0 0 30 2 *', dialect: 'unix' },
];

const DEFAULT_FALLBACK_FIELDS: Record<FieldKey, string> = {
  second: '0',
  minute: '*',
  hour: '*',
  dom: '*',
  month: '*',
  dow: '*',
  year: '*',
};

function defaultFieldsFor(dialect: Dialect): string[] {
  return fieldOrder(dialect).map((k) => DEFAULT_FALLBACK_FIELDS[k]);
}

export default function CronParserTool() {
  const [expr, setExpr] = useState('*/15 9-17 * * 1-5');
  const [dialect, setDialect] = useState<Dialect>('unix');
  const [tz, setTz] = useState('UTC');
  const [tzFilter, setTzFilter] = useState('');
  const [runCount, setRunCount] = useState(10);
  const [showUtc, setShowUtc] = useState(false);
  const [subTab, setSubTab] = useState<SubTab>('runs');
  const [loaded, setLoaded] = useState(false);
  const errorId = useId();

  const allZones = useMemo(() => listTimeZones(), []);

  useEffect(() => {
    let browserTz = 'UTC';
    try {
      browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      browserTz = 'UTC';
    }
    const saved = readJson<Partial<SavedSettings> | null>(STORAGE_KEY, null);
    if (saved?.dialect && DIALECTS.some((d) => d.id === saved.dialect)) {
      setDialect(saved.dialect);
    }
    if (saved?.tz && allZones.includes(saved.tz)) {
      setTz(saved.tz);
    } else if (allZones.includes(browserTz)) {
      setTz(browserTz);
    }
    setLoaded(true);
  }, [allZones]);

  useEffect(() => {
    if (!loaded) return;
    writeJson(STORAGE_KEY, { dialect, tz });
  }, [dialect, tz, loaded]);

  const deferredExpr = useDeferredValue(expr);
  const effectiveTz = dialect === 'aws' ? 'UTC' : tz;

  const parseResult = useMemo(() => parseCron(deferredExpr, dialect), [deferredExpr, dialect]);
  const neverMsg = useMemo(() => (parseResult.ok ? neverRuns(parseResult.parsed) : null), [parseResult]);

  const now = useMemo(() => Date.now(), [deferredExpr, dialect, effectiveTz, runCount]);

  const runSearch = useMemo(() => {
    if (!parseResult.ok || parseResult.parsed.reboot || neverMsg) return null;
    return nextRuns(parseResult.parsed, { tz: effectiveTz, from: now, count: runCount });
  }, [parseResult, neverMsg, effectiveTz, now, runCount]);

  const dstChanges = useMemo(
    () => (dialect === 'aws' ? [] : upcomingDstChanges(effectiveTz, now, 2)),
    [effectiveTz, now, dialect],
  );

  const filteredZones = useMemo(() => {
    const q = tzFilter.trim().toLowerCase();
    if (!q) return allZones;
    const matched = allZones.filter((z) => z.toLowerCase().includes(q));
    return matched.includes(tz) ? matched : [tz, ...matched];
  }, [allZones, tzFilter, tz]);

  const builderFields = useMemo(() => {
    const rawParts = splitFields(expr, dialect);
    const keys = fieldOrder(dialect, rawParts.length);
    return keys.map((key, idx) => {
      const raw = rawParts[idx] ?? DEFAULT_FALLBACK_FIELDS[key];
      return { key, raw, choice: classifyField(raw, key, dialect) };
    });
  }, [expr, dialect]);

  function updateBuilderField(index: number, choice: Choice) {
    const rawParts = splitFields(expr, dialect);
    const keys = fieldOrder(dialect, rawParts.length);
    const parts = rawParts.length === keys.length ? [...rawParts] : defaultFieldsFor(dialect);
    const key = keys[index]!;
    parts[index] = buildField(choice, key === 'dom' || key === 'month' ? '1' : '0');
    const joined = parts.join(' ');
    setExpr(dialect === 'aws' ? `cron(${joined})` : joined);
  }

  function insertSymbol(sym: string) {
    setExpr((prev) => `${prev}${sym}`);
  }

  const withSeconds = parseResult.ok && parseResult.parsed.keys.includes('second');
  const parsedFields = parseResult.ok ? parseResult.parsed.fields : [];
  const rawTokens = splitFields(deferredExpr, dialect);
  const ebExpr = useMemo(() => {
    if (!parseResult.ok || parseResult.parsed.reboot) return null;
    return toEventBridge(
      parseResult.parsed.fields.map((f) => f.raw),
      dialect,
    );
  }, [parseResult, dialect]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="panel stack" aria-label="Cron expression input">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <SegmentedControl<Dialect>
            label="Cron dialect"
            value={dialect}
            onChange={setDialect}
            options={DIALECTS.map((d) => ({ id: d.id, label: d.label }))}
          />
          <button type="button" className="btn sm" onClick={() => setExpr('')}>
            Clear
          </button>
        </div>

        <Field label="Cron expression" hint={`Fields (${DIALECTS.find((d) => d.id === dialect)?.label}): ${DIALECTS.find((d) => d.id === dialect)?.summary}`}>
          {(id) => (
            <input
              id={id}
              className={`input ${styles.exprInput}`}
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              placeholder="*/15 9-17 * * 1-5"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={!parseResult.ok ? true : undefined}
              aria-describedby={!parseResult.ok ? errorId : undefined}
            />
          )}
        </Field>

        <div className="row" style={{ gap: 6 }}>
          <span className="hint">Symbols:</span>
          {['*', '/', '-', ',', '?', 'L', 'W', '#'].map((sym) => (
            <button key={sym} type="button" className="btn sm mono" onClick={() => insertSymbol(sym)}>
              {sym}
            </button>
          ))}
        </div>

        <div className="row" style={{ gap: 6 }}>
          <span className="hint">Try an example:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              className="btn sm"
              onClick={() => {
                setDialect(ex.dialect);
                setExpr(ex.expr);
              }}
            >
              {ex.label}
            </button>
          ))}
        </div>

        <div className="grid-3">
          <Field label="Filter timezones">
            {(id) => (
              <input
                id={id}
                className="input"
                placeholder="Search city or region…"
                value={tzFilter}
                disabled={dialect === 'aws'}
                onChange={(e) => setTzFilter(e.target.value)}
              />
            )}
          </Field>
          <Field label="Timezone">
            {(id) => (
              <select
                id={id}
                className="select"
                value={effectiveTz}
                disabled={dialect === 'aws'}
                onChange={(e) => setTz(e.target.value)}
              >
                {filteredZones.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            )}
          </Field>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label="Next runs">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  className="input"
                  style={{ width: 90 }}
                  min={1}
                  max={50}
                  value={runCount}
                  onChange={(e) => setRunCount(Math.min(50, Math.max(1, Number(e.target.value) || 10)))}
                />
              )}
            </Field>
            <label className="check" style={{ marginBottom: 8 }}>
              <input type="checkbox" checked={showUtc} onChange={(e) => setShowUtc(e.target.checked)} />
              Show UTC
            </label>
          </div>
        </div>
      </section>

      {!parseResult.ok && (
        <div id={errorId}>
          <ErrorBanner>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span>{parseResult.error}</span>
              {parseResult.suggest && parseResult.suggest !== dialect && (
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => setDialect(parseResult.suggest!)}
                >
                  Switch to {DIALECTS.find((d) => d.id === parseResult.suggest)?.label}
                </button>
              )}
            </div>
          </ErrorBanner>
        </div>
      )}

      {parseResult.ok && (
        <>
          <section className={styles.summaryBox} aria-live="polite">
            <p className={styles.summaryText}>&ldquo;{describe(parseResult.parsed)}&rdquo;</p>
            {parseResult.parsed.expanded !== deferredExpr.trim() && !parseResult.parsed.reboot && (
              <p className="hint" style={{ margin: '6px 0 0' }}>
                Expanded: <code className="mono">{parseResult.parsed.expanded}</code>
              </p>
            )}
          </section>

          {neverMsg && <Banner kind="warn">{neverMsg}</Banner>}
          {parseResult.warnings.map((w) => (
            <Banner key={w} kind="warn">{w}</Banner>
          ))}
          {parseResult.notes.map((n) => (
            <Banner key={n} kind="info">{n}</Banner>
          ))}

          {!parseResult.parsed.reboot && (
            <section className="panel" aria-label="Field breakdown">
              <h2 className="panel-title">Field breakdown</h2>
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Field</th>
                      <th scope="col">Raw</th>
                      <th scope="col">Meaning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedFields.map((f) => (
                      <tr key={f.key}>
                        <td><strong>{FIELD_LABEL[f.key]}</strong></td>
                        <td className="mono">{f.raw}</td>
                        <td>{normalizedMeaning(f)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {!parseResult.ok && rawTokens.length > 0 && (
        <section className="panel" aria-label="Token breakdown">
          <h2 className="panel-title">Entered fields</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Position</th>
                <th scope="col">Token</th>
              </tr>
            </thead>
            <tbody>
              {rawTokens.map((tok, i) => (
                <tr key={i} className={parseResult.fieldIndex === i ? styles.errorCell : undefined}>
                  <td>{FIELD_LABEL[fieldOrder(dialect, rawTokens.length)[i] ?? 'minute'] ?? `Field ${i + 1}`}</td>
                  <td className="mono">{tok}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Tabs<SubTab>
        label="Cron tools"
        value={subTab}
        onChange={setSubTab}
        tabs={[
          { id: 'runs', label: 'Next runs' },
          { id: 'builder', label: 'Visual builder' },
          { id: 'snippets', label: 'Snippets & Dialect notes' },
        ]}
      />

      {subTab === 'runs' && (
        <section className="panel stack" aria-label="Upcoming scheduled runs">
          {parseResult.ok && parseResult.parsed.reboot ? (
            <p className="muted" style={{ margin: 0 }}>
              <code>@reboot</code> runs once when the cron daemon starts, so there are no calendar run times.
            </p>
          ) : !parseResult.ok ? (
            <p className="muted" style={{ margin: 0 }}>Fix the expression above to preview upcoming runs.</p>
          ) : neverMsg ? (
            <p className="muted" style={{ margin: 0 }}>{neverMsg}</p>
          ) : runSearch && runSearch.runs.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No runs found within the 10-year search window.</p>
          ) : (
            <>
              <ol className="stack" style={{ margin: 0, paddingLeft: 20, gap: 8 }}>
                {runSearch?.runs.map((r) => {
                  const fmt = formatRun(effectiveTz, r.instant, withSeconds);
                  return (
                    <li key={`${r.instant}-${r.dst ?? ''}`} className="row" style={{ justifyContent: 'space-between' }}>
                      <span>
                        <span className="mono">{fmt.local}</span>
                        {showUtc && <span className="faint mono"> · {fmt.utc}</span>}
                        {r.dst === 'gap' && (
                          <span className="tag local" style={{ marginLeft: 8 }}>
                            <Icon name="alert" /> DST spring-forward gap (skipped or shifted by scheduler)
                          </span>
                        )}
                        {r.dst === 'overlap' && (
                          <span className="tag local" style={{ marginLeft: 8 }}>
                            <Icon name="alert" /> DST fall-back overlap (runs once or twice)
                          </span>
                        )}
                      </span>
                      <span className="muted tabular">{relativeTime(r.instant - now)}</span>
                    </li>
                  );
                })}
              </ol>
              {runSearch?.reason === 'timeout' && (
                <p className="hint" style={{ margin: 0 }}>Search stopped at the 200 ms time limit.</p>
              )}
              {dstChanges.length > 0 && (
                <div className="hint">
                  Upcoming DST shifts in {effectiveTz}:{' '}
                  {dstChanges.map((c) => `${formatRun(effectiveTz, c.instant, false).local} (${c.kind})`).join('; ')}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {subTab === 'builder' && (
        <section className="panel stack" aria-label="Visual cron builder">
          <div className="grid-2">
            {builderFields.map((bf, idx) => (
              <FieldBuilderCard
                key={bf.key}
                fieldKey={bf.key}
                dialect={dialect}
                choice={bf.choice}
                onChange={(c) => updateBuilderField(idx, c)}
              />
            ))}
          </div>
        </section>
      )}

      {subTab === 'snippets' && (
        <section className="panel stack" aria-label="Export snippets and dialect notes">
          {parseResult.ok && !parseResult.parsed.reboot ? (
            <>
              <div className="stack" style={{ gap: 6 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>Expression</strong>
                  <CopyButton text={expr.trim()} label="Copy expression" />
                </div>
                <pre className={styles.codeBlock}>{expr.trim()}</pre>
              </div>

              {(dialect === 'unix' || dialect === 'k8s') && (
                <>
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>Crontab line</strong>
                      <CopyButton text={crontabLine(parseResult.parsed.expanded)} label="Copy crontab" />
                    </div>
                    <pre className={styles.codeBlock}>{crontabLine(parseResult.parsed.expanded)}</pre>
                  </div>

                  <div className="stack" style={{ gap: 6 }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>Kubernetes CronJob YAML</strong>
                      <CopyButton text={kubernetesYaml(parseResult.parsed.expanded, effectiveTz)} label="Copy YAML" />
                    </div>
                    <pre className={styles.codeBlock}>{kubernetesYaml(parseResult.parsed.expanded, effectiveTz)}</pre>
                  </div>

                  <div className="stack" style={{ gap: 6 }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>AWS EventBridge</strong>
                      {ebExpr && <CopyButton text={ebExpr} label="Copy EventBridge" />}
                    </div>
                    {ebExpr ? (
                      <pre className={styles.codeBlock}>{ebExpr}</pre>
                    ) : (
                      <p className="hint" style={{ margin: 0 }}>
                        Cannot convert automatically because both day-of-month and day-of-week are restricted; EventBridge requires `?` in one of them.
                      </p>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Enter a valid expression to generate snippets.</p>
          )}

          <hr className="divider" />
          <div className="stack" style={{ gap: 6 }}>
            <strong>Dialect differences</strong>
            <ul className="muted" style={{ margin: 0, paddingLeft: 20 }}>
              <li>Unix 5-field: minute hour day-of-month month day-of-week (0 and 7 are Sunday).</li>
              <li>Quartz (6–7 fields): adds seconds first and optional year last; Sunday is 1; supports L, W, # and requires `?` in dom or dow.</li>
              <li>AWS EventBridge: 6 fields (`cron(min hour dom month dow year)`), always UTC, requires `?` in dom or dow.</li>
              <li>Kubernetes CronJob: 5-field Unix syntax, no `@reboot`, timezone set with `.spec.timeZone`.</li>
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function FieldBuilderCard({
  fieldKey,
  dialect,
  choice,
  onChange,
}: {
  fieldKey: FieldKey;
  dialect: Dialect;
  choice: Choice;
  onChange: (next: Choice) => void;
}) {
  const modes = modesFor(fieldKey, dialect);
  return (
    <div className={`${styles.builderCard} stack`} style={{ gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{FIELD_LABEL[fieldKey]}</strong>
        <select
          className="select"
          style={{ width: 'auto', minHeight: 34 }}
          aria-label={`${FIELD_LABEL[fieldKey]} mode`}
          value={choice.mode}
          onChange={(e) => onChange({ ...choice, mode: e.target.value as Mode })}
        >
          {modes.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </div>

      {choice.mode === 'values' && (
        <Field label="Comma-separated values">
          {(id) => (
            <input
              id={id}
              className="input mono"
              value={choice.values.join(',')}
              onChange={(e) =>
                onChange({
                  ...choice,
                  values: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })
              }
            />
          )}
        </Field>
      )}

      {choice.mode === 'range' && (
        <div className="grid-2">
          <Field label="From">
            {(id) => (
              <input id={id} className="input mono" value={choice.from} onChange={(e) => onChange({ ...choice, from: e.target.value })} />
            )}
          </Field>
          <Field label="To">
            {(id) => (
              <input id={id} className="input mono" value={choice.to} onChange={(e) => onChange({ ...choice, to: e.target.value })} />
            )}
          </Field>
        </div>
      )}

      {choice.mode === 'step' && (
        <div className="grid-2">
          <Field label="Start (blank for *)">
            {(id) => (
              <input id={id} className="input mono" value={choice.from} onChange={(e) => onChange({ ...choice, from: e.target.value })} />
            )}
          </Field>
          <Field label="Every N">
            {(id) => (
              <input id={id} className="input mono" value={choice.step} onChange={(e) => onChange({ ...choice, step: e.target.value })} />
            )}
          </Field>
        </div>
      )}

      {(choice.mode === 'lastMinus' || choice.mode === 'nearest') && (
        <Field label={choice.mode === 'lastMinus' ? 'Days before last day' : 'Day of month'}>
          {(id) => (
            <input id={id} className="input mono" value={choice.day} onChange={(e) => onChange({ ...choice, day: e.target.value })} />
          )}
        </Field>
      )}

      {(choice.mode === 'nth' || choice.mode === 'lastDow') && (
        <div className="grid-2">
          <Field label="Day of week (1–7)">
            {(id) => (
              <input id={id} className="input mono" value={choice.dow} onChange={(e) => onChange({ ...choice, dow: e.target.value })} />
            )}
          </Field>
          {choice.mode === 'nth' && (
            <Field label="Occurrence (1–5)">
              {(id) => (
                <input id={id} className="input mono" value={choice.nth} onChange={(e) => onChange({ ...choice, nth: e.target.value })} />
              )}
            </Field>
          )}
        </div>
      )}

      {choice.mode === 'custom' && (
        <Field label="Custom field token">
          {(id) => (
            <input id={id} className="input mono" value={choice.custom} onChange={(e) => onChange({ ...choice, custom: e.target.value })} />
          )}
        </Field>
      )}
    </div>
  );
}
