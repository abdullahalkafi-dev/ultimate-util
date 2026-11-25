'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Banner,
  CopyButton,
  ErrorBanner,
  Field,
  Icon,
  SegmentedControl,
  Tabs,
  useToast,
} from '@/components/ui';
import { readJson, removeKey, writeJson } from '@/lib/storage';
import { DEFAULT_FORMAT, exactString, formatNumber, localeDecimal, type FormatOptions } from './format';
import { parseUnitQuery } from './parse';
import { parseTimeQuery } from './timeQuery';
import {
  allZones,
  buildPlanner,
  formatOffset,
  formatZoned,
  localZoneId,
  offsetAt,
  resolveLocal,
  searchZones,
  slotWindows,
  usingFallbackZones,
  zoneLabel,
  type ZoneRef,
} from './timezone';
import { CATEGORIES, UNITS, UNIT_BY_ID, unitsIn, type Category } from './units';
import styles from './styles.module.css';

type ToolTab = 'smart' | 'units' | 'time';
const STORAGE_KEY = 'uu-unit-timezone-converter';

const EXAMPLES = [
  '5 km in miles',
  '10 GB to GiB',
  '100 C to F',
  '5 ft 3 in to cm',
  '3pm IST to PST',
  '2026-03-08 02:30 America/New_York to UTC',
];

interface SavedPrefs {
  format: FormatOptions;
  hour12: boolean;
  unitChoices: Record<string, string>;
  zoneChoices: Record<string, string>;
  savedZones: string[];
}

export default function UnitTimezoneConverter() {
  const toast = useToast();
  const [tab, setTab] = useState<ToolTab>('smart');
  const [query, setQuery] = useState('5 km in miles');
  const [formatOpts, setFormatOpts] = useState<FormatOptions>(DEFAULT_FORMAT);
  const [alternateNum, setAlternateNum] = useState(false);
  const [unitChoices, setUnitChoices] = useState<Record<string, string>>({});
  const [zoneChoices, setZoneChoices] = useState<Record<string, string>>({});

  // Category converter state
  const [category, setCategory] = useState<Category>('length');
  const [fromId, setFromId] = useState('km');
  const [toId, setToId] = useState('mi');
  const [amountStr, setAmountStr] = useState('5');

  // Timezone & meeting planner state
  const [baseZoneId, setBaseZoneId] = useState('UTC');
  const [targetZoneIds, setTargetZoneIds] = useState<string[]>(['UTC', 'Europe/London', 'America/New_York', 'Asia/Tokyo']);
  const [zoneQuery, setZoneQuery] = useState('');
  const [dateStr, setDateStr] = useState('2026-06-10');
  const [timeStr, setTimeStr] = useState('09:00');
  const [hour12, setHour12] = useState(false);
  const [overlapPick, setOverlapPick] = useState<'earlier' | 'later'>('earlier');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);

  const zonesList = useMemo(() => allZones(), []);

  useEffect(() => {
    const local = localZoneId();
    const dec = localeDecimal();
    const saved = readJson<Partial<SavedPrefs> | null>(STORAGE_KEY, null);
    if (saved) {
      if (saved.format) setFormatOpts({ ...DEFAULT_FORMAT, ...saved.format });
      if (typeof saved.hour12 === 'boolean') setHour12(saved.hour12);
      if (saved.unitChoices) setUnitChoices(saved.unitChoices);
      if (saved.zoneChoices) setZoneChoices(saved.zoneChoices);
      if (Array.isArray(saved.savedZones) && saved.savedZones.length) setTargetZoneIds(saved.savedZones.slice(0, 20));
    }
    setBaseZoneId(local);

    // Restore from URL hash (#q=... or #t=...&from=...&to=...)
    if (typeof window !== 'undefined' && window.location.hash.length > 1) {
      try {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const q = params.get('q');
        const t = params.get('t');
        const f = params.get('from');
        const to = params.get('to');
        if (q) {
          setTab('smart');
          setQuery(q);
        } else if (t && f && to) {
          setTab('smart');
          setQuery(`${t.replace('T', ' ')} ${f} to ${to}`);
        }
      } catch {
        toast('Ignored invalid share link hash.', 'info');
      }
    }
    void dec;
    setLoaded(true);
  }, [toast]);

  useEffect(() => {
    if (!loaded) return;
    writeJson(STORAGE_KEY, { format: formatOpts, hour12, unitChoices, zoneChoices, savedZones: targetZoneIds });
  }, [formatOpts, hour12, unitChoices, zoneChoices, targetZoneIds, loaded]);

  // World clock ticks once per second while tab is visible
  useEffect(() => {
    if (tab !== 'time') return;
    const tick = () => {
      if (document.visibilityState === 'visible') setNowMs(Date.now());
    };
    const id = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [tab]);

  const deferredQuery = useDeferredValue(query);
  const sysDecimal = useMemo(() => localeDecimal(), []);

  const smartResult = useMemo(() => {
    const trimmed = deferredQuery.trim();
    if (!trimmed) return { kind: 'empty' as const };
    const timeRes = parseTimeQuery(trimmed, nowMs, zoneChoices);
    const unitRes = parseUnitQuery(trimmed, {
      decimal: sysDecimal,
      choices: unitChoices,
      alternateNumber: alternateNum,
    });
    // "5 km in miles" also looks like "<time> <zone> in <zone>"; a failed time parse must not hide a valid unit reading.
    if (timeRes && (timeRes.ok || !unitRes.ok)) return { kind: 'time' as const, result: timeRes };
    return { kind: 'unit' as const, result: unitRes };
  }, [deferredQuery, nowMs, zoneChoices, sysDecimal, unitChoices, alternateNum]);

  // Category tab computations
  const catUnits = useMemo(() => unitsIn(category), [category]);
  const fromUnit = UNIT_BY_ID.get(fromId) ?? catUnits[0]!;
  const toUnit = UNIT_BY_ID.get(toId) ?? catUnits[1] ?? catUnits[0]!;
  const catAmount = Number(amountStr);
  const catValid = amountStr.trim() !== '' && Number.isFinite(catAmount);
  const catBase = catValid ? fromUnit.toBase(catAmount) : 0;
  const catResult = catValid ? toUnit.fromBase(catBase) : null;

  function changeCategory(next: Category) {
    setCategory(next);
    const list = unitsIn(next);
    setFromId(list[0]!.id);
    setToId((list[1] ?? list[0])!.id);
  }

  // Timezone & meeting planner computations
  const parsedDateParts = useMemo(() => {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const [h, mi] = timeStr.split(':').map(Number);
    if (!y || !mo || !d || h === undefined || mi === undefined) return null;
    return { y, mo, d, h, mi };
  }, [dateStr, timeStr]);

  const baseZoneRef: ZoneRef = { kind: 'iana', id: baseZoneId };
  const baseResolution = useMemo(
    () => (parsedDateParts ? resolveLocal(parsedDateParts, baseZoneRef) : null),
    [parsedDateParts, baseZoneId],
  );
  const resolvedBaseUtc =
    baseResolution?.status === 'ok' || baseResolution?.status === 'gap'
      ? baseResolution.utcMs
      : baseResolution?.status === 'overlap'
        ? overlapPick === 'earlier'
          ? baseResolution.earlier
          : baseResolution.later
        : nowMs;

  const planner = useMemo(() => {
    const day = parsedDateParts ?? { y: 2026, mo: 6, d: 10 };
    return buildPlanner(
      targetZoneIds.map((id) => ({ kind: 'iana', id })),
      baseZoneRef,
      { y: day.y, mo: day.mo, d: day.d },
      9,
      17,
    );
  }, [targetZoneIds, baseZoneId, parsedDateParts]);

  const overlapWindows = useMemo(() => slotWindows(planner.overlap), [planner]);
  const zoneSearchHits = useMemo(() => searchZones(zoneQuery, 10), [zoneQuery]);

  function copyShareLink() {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}${window.location.pathname}#q=${encodeURIComponent(query)}`;
    navigator.clipboard.writeText(url).then(
      () => toast('Copied share link', 'success'),
      () => toast('Copy blocked by browser', 'error'),
    );
  }

  function resetChoices() {
    setUnitChoices({});
    setZoneChoices({});
    removeKey(STORAGE_KEY);
    toast('Cleared remembered choices and zones', 'info');
  }

  const sameCatUnits =
    smartResult.kind === 'unit' && smartResult.result.ok
      ? UNITS.filter((u) => u.category === (smartResult.result.ok ? smartResult.result.query.from.category : 'length'))
      : [];

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Tabs<ToolTab>
          label="Converter modes"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'smart', label: 'Smart Search' },
            { id: 'units', label: 'Unit Converter' },
            { id: 'time', label: 'Time Zones & Meeting Planner' },
          ]}
        />
        <button type="button" className="btn sm ghost" onClick={resetChoices}>
          Reset choices
        </button>
      </div>

      {tab === 'smart' && (
        <div className="stack" style={{ gap: 16 }}>
          <section className="panel stack" aria-label="Smart conversion search">
            <Field label='Type a unit or time conversion (for example "5 km in miles" or "3pm IST to PST")'>
              {(id) => (
                <input
                  id={id}
                  className={`input ${styles.searchInput}`}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setAlternateNum(false);
                  }}
                  placeholder="5 km in miles"
                  autoComplete="off"
                />
              )}
            </Field>
            <div className="row" style={{ gap: 6 }}>
              <span className="hint">Examples:</span>
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="btn sm" onClick={() => setQuery(ex)}>
                  {ex}
                </button>
              ))}
            </div>
            <div className="row">
              <Field label="Precision">
                {(id) => (
                  <select
                    id={id}
                    className="select"
                    value={String(formatOpts.precision)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFormatOpts((f) => ({ ...f, precision: v === 'auto' ? 'auto' : Number(v) }));
                    }}
                  >
                    <option value="auto">Auto (6 sig figs)</option>
                    {[0, 1, 2, 3, 4, 6, 8, 10, 12].map((d) => (
                      <option key={d} value={d}>{d} decimals</option>
                    ))}
                  </select>
                )}
              </Field>
              <label className="check" style={{ alignSelf: 'flex-end', marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={formatOpts.scientific}
                  onChange={(e) => setFormatOpts((f) => ({ ...f, scientific: e.target.checked }))}
                />
                Scientific notation for huge/tiny values
              </label>
              <button type="button" className="btn sm" style={{ alignSelf: 'flex-end', marginBottom: 4 }} onClick={copyShareLink}>
                <Icon name="link" /> Copy share link
              </button>
            </div>
          </section>

          {smartResult.kind === 'unit' && !smartResult.result.ok && smartResult.result.error && (
            <ErrorBanner>
              {smartResult.result.error}{' '}
              {smartResult.result.suggestions.length > 0 && `Did you mean: ${smartResult.result.suggestions.join(', ')}?`}
            </ErrorBanner>
          )}

          {smartResult.kind === 'unit' && smartResult.result.ok && (
            <section className="stack" aria-live="polite">
              {smartResult.result.query.ambiguities.map((amb) => (
                <div key={amb.key} className="panel stack" style={{ gap: 8 }}>
                  <strong>Which &ldquo;{amb.key}&rdquo; did you mean?</strong>
                  <div className="row" role="radiogroup" aria-label={`Variant for ${amb.key}`}>
                    {amb.options.map((opt) => (
                      <label key={opt.id} className="check">
                        <input
                          type="radio"
                          name={`amb-${amb.key}`}
                          checked={amb.chosen.id === opt.id}
                          onChange={() => setUnitChoices((c) => ({ ...c, [amb.key]: opt.id }))}
                        />
                        {opt.variant ?? opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {smartResult.result.query.numberReadings && (
                <Banner kind="info">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      Ambiguous separator: interpreted as <strong>{smartResult.result.query.numberReadings[alternateNum ? 1 : 0]!.label}</strong>
                    </span>
                    <button type="button" className="btn sm" onClick={() => setAlternateNum((v) => !v)}>
                      Use {smartResult.result.query.numberReadings[alternateNum ? 0 : 1]!.label}
                    </button>
                  </div>
                </Banner>
              )}

              <div className={styles.answerCard}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="tag local">
                    Understood: {smartResult.result.query.compoundText ?? `${smartResult.result.query.amount} ${smartResult.result.query.from.label}`}
                    {smartResult.result.query.to ? ` to ${smartResult.result.query.to.label}` : ''}
                  </span>
                  {smartResult.result.query.value !== null && (
                    <div className="row">
                      <CopyButton text={`${formatNumber(smartResult.result.query.value, formatOpts)} ${smartResult.result.query.to!.symbol}`} label="Copy result" />
                      <CopyButton text={exactString(smartResult.result.query.value)} label="Copy exact" />
                    </div>
                  )}
                </div>
                {smartResult.result.query.value !== null ? (
                  <div className={styles.answerValue} style={{ marginTop: 10 }}>
                    {formatNumber(smartResult.result.query.value, formatOpts)} {smartResult.result.query.to!.symbol}
                  </div>
                ) : (
                  <div className={styles.answerValue} style={{ marginTop: 10 }}>
                    {formatNumber(smartResult.result.query.amount, formatOpts)} {smartResult.result.query.from.symbol}
                  </div>
                )}
              </div>

              {smartResult.result.query.notes.map((n) => (
                <Banner key={n} kind="info">{n}</Banner>
              ))}

              <section className="panel">
                <h2 className="panel-title">All {smartResult.result.query.from.category} units</h2>
                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">Unit</th>
                        <th scope="col">Value</th>
                        <th scope="col">Copy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sameCatUnits.map((u) => {
                        const val = u.fromBase(smartResult.result.ok ? smartResult.result.query.baseValue : 0);
                        const txt = `${formatNumber(val, formatOpts)} ${u.symbol}`;
                        return (
                          <tr key={u.id}>
                            <td><strong>{u.label}</strong> <span className="faint">({u.symbol})</span></td>
                            <td className="tabular mono">{txt}</td>
                            <td><CopyButton text={exactString(val)} label="Exact" /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>
          )}

          {smartResult.kind === 'time' && !smartResult.result.ok && (
            <ErrorBanner>{smartResult.result.error}</ErrorBanner>
          )}

          {smartResult.kind === 'time' && smartResult.result.ok && (() => {
            const tq = smartResult.result.query;
            return (
              <section className="stack" aria-live="polite">
                {tq.ambiguousFrom && (() => {
                  const ambFrom = tq.ambiguousFrom;
                  return (
                    <div className="panel stack" style={{ gap: 8 }}>
                      <strong>Which {ambFrom.abbr} did you mean? (Abbreviations are never guessed.)</strong>
                      <div className="row" role="radiogroup" aria-label={`Choose ${ambFrom.abbr}`}>
                        {ambFrom.options.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            className="btn sm"
                            onClick={() => setZoneChoices((c) => ({ ...c, [ambFrom.abbr]: opt.id }))}
                          >
                            {opt.label} ({opt.id} · {opt.offsetLabel})
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {!tq.ambiguousFrom && (
                  <>
                    {tq.targets
                      .filter((t) => t.resolution.kind === 'ambiguous')
                      .map((t) => {
                        const amb = t.resolution as Extract<typeof t.resolution, { kind: 'ambiguous' }>;
                        return (
                          <div key={amb.abbr} className="panel stack" style={{ gap: 8 }}>
                            <strong>Which {amb.abbr} did you mean?</strong>
                            <div className="row">
                              {amb.options.map((opt) => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  className="btn sm"
                                  onClick={() => setZoneChoices((c) => ({ ...c, [amb.abbr]: opt.id }))}
                                >
                                  {opt.label} ({opt.id} · {opt.offsetLabel})
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}

                    {tq.resolution.status === 'gap' && (
                      <Banner kind="warn">
                        That local time falls in a DST spring-forward gap and does not exist. Shifted forward by {tq.resolution.shiftedBy} minutes.
                      </Banner>
                    )}
                    {tq.resolution.status === 'overlap' && (
                      <Banner kind="warn">
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <span>That local time happens twice (DST fall-back overlap).</span>
                          <SegmentedControl<'earlier' | 'later'>
                            label="DST overlap occurrence"
                            value={overlapPick}
                            onChange={setOverlapPick}
                            options={[
                              { id: 'earlier', label: 'Earlier occurrence' },
                              { id: 'later', label: 'Later occurrence' },
                            ]}
                          />
                        </div>
                      </Banner>
                    )}

                    {tq.targets.every((t) => t.resolution.kind === 'ok') && (
                      <div className="panel stack">
                        {tq.targets.map((t) => {
                          const res = t.resolution as Extract<typeof t.resolution, { kind: 'ok' }>;
                          const utc =
                            tq.resolution.status === 'overlap'
                              ? overlapPick === 'earlier'
                                ? tq.resolution.earlier
                                : tq.resolution.later
                              : tq.resolution.utcMs;
                          const fmt = formatZoned(utc, res.zone, hour12);
                          return (
                            <div key={t.text} className="row" style={{ justifyContent: 'space-between' }}>
                              <div>
                                <strong>{res.label}</strong>
                                <div className="muted">{fmt.date} · {fmt.offset} ({fmt.abbr})</div>
                              </div>
                              <div className="row">
                                <span className="answerValue mono" style={{ fontSize: 22 }}>{fmt.time}</span>
                                <CopyButton text={`${fmt.time} ${fmt.date} (${res.label})`} label="Copy" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </section>
            );
          })()}
        </div>
      )}

      {tab === 'units' && (
        <div className="stack" style={{ gap: 16 }}>
          <section className="panel stack" aria-label="Category unit converter">
            <div className="row" style={{ gap: 6 }}>
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`btn sm ${category === c.id ? 'primary' : ''}`}
                  aria-pressed={category === c.id}
                  onClick={() => changeCategory(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="grid-3">
              <Field label="Value">
                {(id) => (
                  <input id={id} className="input mono" type="number" step="any" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
                )}
              </Field>
              <Field label="From">
                {(id) => (
                  <select id={id} className="select" value={fromUnit.id} onChange={(e) => setFromId(e.target.value)}>
                    {catUnits.map((u) => (
                      <option key={u.id} value={u.id}>{u.label} ({u.symbol})</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="To">
                {(id) => (
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <select id={id} className="select grow" value={toUnit.id} onChange={(e) => setToId(e.target.value)}>
                      {catUnits.map((u) => (
                        <option key={u.id} value={u.id}>{u.label} ({u.symbol})</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn sm"
                      aria-label="Swap units"
                      onClick={() => {
                        setFromId(toUnit.id);
                        setToId(fromUnit.id);
                      }}
                    >
                      <Icon name="swap" />
                    </button>
                  </div>
                )}
              </Field>
            </div>
            {catValid && catResult !== null && (
              <div className={styles.answerCard} aria-live="polite">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className={styles.answerValue}>
                    {formatNumber(catAmount, formatOpts)} {fromUnit.symbol} = {formatNumber(catResult, formatOpts)} {toUnit.symbol}
                  </div>
                  <CopyButton text={exactString(catResult)} label="Copy exact" />
                </div>
              </div>
            )}
          </section>

          {catValid && (
            <section className="panel">
              <h2 className="panel-title">All {category} conversions</h2>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Unit</th>
                    <th scope="col">Converted value</th>
                    <th scope="col">Copy</th>
                  </tr>
                </thead>
                <tbody>
                  {catUnits.map((u) => {
                    const val = u.fromBase(catBase);
                    return (
                      <tr key={u.id}>
                        <td><strong>{u.label}</strong> ({u.symbol})</td>
                        <td className="mono tabular">{formatNumber(val, formatOpts)} {u.symbol}</td>
                        <td><CopyButton text={exactString(val)} label="Exact" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </div>
      )}

      {tab === 'time' && (
        <div className="stack" style={{ gap: 16 }}>
          {usingFallbackZones() && (
            <Banner kind="info">
              Your browser does not list IANA time zones dynamically, so a bundled list of major regions is shown.
            </Banner>
          )}

          <section className="panel stack" aria-label="Time conversion controls">
            <div className="grid-3">
              <Field label="Date">
                {(id) => <input id={id} className="input" type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />}
              </Field>
              <Field label="Time">
                {(id) => <input id={id} className="input" type="time" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} />}
              </Field>
              <Field label="Base time zone">
                {(id) => (
                  <select id={id} className="select" value={baseZoneId} onChange={(e) => setBaseZoneId(e.target.value)}>
                    {zonesList.map((z) => (
                      <option key={z} value={z}>{z}</option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <label className="check">
                <input type="checkbox" checked={hour12} onChange={(e) => setHour12(e.target.checked)} />
                12-hour clock (AM/PM)
              </label>
              <span className="hint">Device zone: {localZoneId()} ({formatOffset(offsetAt(nowMs, { kind: 'iana', id: localZoneId() }))})</span>
            </div>
            {baseResolution?.status === 'gap' && (
              <Banner kind="warn">
                {dateStr} {timeStr} falls in a DST gap in {baseZoneId} and was shifted forward by {baseResolution.shiftedBy} minutes.
              </Banner>
            )}
            {baseResolution?.status === 'overlap' && (
              <Banner kind="warn">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{dateStr} {timeStr} occurs twice in {baseZoneId} (DST fall-back).</span>
                  <SegmentedControl<'earlier' | 'later'>
                    label="DST overlap occurrence"
                    value={overlapPick}
                    onChange={setOverlapPick}
                    options={[
                      { id: 'earlier', label: 'Earlier' },
                      { id: 'later', label: 'Later' },
                    ]}
                  />
                </div>
              </Banner>
            )}
          </section>

          <section className="panel stack" aria-label="World clock and compared zones">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 className="panel-title" style={{ margin: 0 }}>World clock &amp; converted times</h2>
              <Field label="Add city or IANA zone">
                {(id) => (
                  <input
                    id={id}
                    className="input"
                    style={{ width: 240 }}
                    placeholder="Tokyo, London, Asia/Dhaka…"
                    value={zoneQuery}
                    onChange={(e) => setZoneQuery(e.target.value)}
                  />
                )}
              </Field>
            </div>
            {zoneSearchHits.length > 0 && (
              <div className="row" style={{ gap: 6 }}>
                {zoneSearchHits.map((hit) => (
                  <button
                    key={hit.id}
                    type="button"
                    className="btn sm"
                    disabled={targetZoneIds.includes(hit.id) || targetZoneIds.length >= 20}
                    onClick={() => {
                      setTargetZoneIds((prev) => (prev.includes(hit.id) ? prev : [...prev, hit.id].slice(0, 20)));
                      setZoneQuery('');
                    }}
                  >
                    + {hit.label} ({hit.offsetLabel})
                  </button>
                ))}
              </div>
            )}

            <div style={{ overflowX: 'auto' }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Zone</th>
                    <th scope="col">Selected time</th>
                    <th scope="col">Live clock now</th>
                    <th scope="col">Offset</th>
                    <th scope="col">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {targetZoneIds.map((zid) => {
                    const ref: ZoneRef = { kind: 'iana', id: zid };
                    const sel = formatZoned(resolvedBaseUtc, ref, hour12);
                    const live = formatZoned(nowMs, ref, hour12);
                    return (
                      <tr key={zid}>
                        <td><strong>{zoneLabel(ref)}</strong></td>
                        <td className="mono">{sel.time} <span className="faint">({sel.date})</span></td>
                        <td className="mono tabular">{live.time}</td>
                        <td className="tabular">{sel.offset}</td>
                        <td>
                          {targetZoneIds.length > 1 && (
                            <button
                              type="button"
                              className="btn sm ghost"
                              aria-label={`Remove ${zid}`}
                              onClick={() => setTargetZoneIds((list) => list.filter((x) => x !== zid))}
                            >
                              <Icon name="x" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel stack" aria-label="Meeting planner working hours overlap">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 className="panel-title" style={{ margin: 0 }}>Meeting planner (09:00–17:00 working hours)</h2>
              <span className="tag local">
                {overlapWindows.length === 0
                  ? 'No shared working hours'
                  : `Overlap (${zoneLabel(baseZoneRef)}): ${overlapWindows
                      .map(([s, e]) => `${String(Math.floor(s / 2)).padStart(2, '0')}:${s % 2 ? '30' : '00'}–${String(Math.floor(e / 2)).padStart(2, '0')}:${e % 2 ? '30' : '00'}`)
                      .join(', ')}`}
              </span>
            </div>
            <div className={styles.plannerWrap}>
              <div className={styles.plannerGrid} role="table" aria-label="Hourly overlap grid">
                <span className="muted">Zone</span>
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h} className="faint tabular" style={{ textAlign: 'center' }}>{h}</span>
                ))}
                {planner.rows.map((row) => (
                  <div key={row.zone.kind === 'iana' ? row.zone.id : row.zone.minutes} style={{ display: 'contents' }}>
                    <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {zoneLabel(row.zone)}
                    </span>
                    {Array.from({ length: 24 }, (_, h) => {
                      const slot = row.slots[h * 2]!;
                      const isOverlap = planner.overlap.includes(h * 2);
                      return (
                        <span
                          key={h}
                          className={`${styles.slot} ${isOverlap ? styles.slotOverlap : slot.working ? styles.slotWork : ''}`}
                          title={`${zoneLabel(row.zone)}: ${String(slot.localHour).padStart(2, '0')}:00${slot.working ? ' (working hours)' : ''}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <p className="hint" style={{ margin: 0 }}>
              Green blocks are local working hours (09:00–17:00); blue blocks show hours where every selected zone is in working hours.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
