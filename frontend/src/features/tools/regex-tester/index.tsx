'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Banner, CopyButton, EmptyState, Field, ProgressBar, Tabs } from '@/components/ui';
import { downloadText } from '@/lib/files';
import { readJson, writeJson } from '@/lib/storage';
import { CHEATSHEET, NOTES } from './cheatsheet';
import { COUNT_LIMIT, MAX_MATCHES, normalizeFlags, supportsFlag, type MatchInfo } from './engine';
import { explain } from './explain';
import { patternHints } from './hints';
import { buildShareHash, parseShareHash, toConstructor, toLiteral } from './share';
import s from './styles.module.css';
import { useRegexRunner } from './useRegexRunner';

const PREFS_KEY = 'uu.regex.prefs';
const EXAMPLES_KEY = 'uu.regex.examples';
const HIGHLIGHT_WINDOW = 100_000;
const SOFT_LIMIT = 1_000_000;

const FLAGS = [
  { f: 'g', label: 'global' },
  { f: 'i', label: 'ignore case' },
  { f: 'm', label: 'multiline' },
  { f: 's', label: 'dot all' },
  { f: 'u', label: 'unicode' },
  { f: 'v', label: 'unicode sets' },
  { f: 'y', label: 'sticky' },
  { f: 'd', label: 'indices' },
] as const;

const EXAMPLE = { pattern: '(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})', flags: 'g', text: 'Released 2024-03-15, patched 2024-04-02, retired 2026-11-19.', replacement: '$<day>/$<month>/$<year>' };

interface Saved {
  name: string;
  pattern: string;
  flags: string;
  text?: string;
}
type Tab = 'matches' | 'groups' | 'replace' | 'explain';

function isSavedList(v: unknown): v is Saved[] {
  return Array.isArray(v) && v.every((x) => x && typeof x.name === 'string' && typeof x.pattern === 'string' && typeof x.flags === 'string');
}

function showWhitespace(t: string): string {
  return t.replace(/\r/g, '␍').replace(/\t/g, '→').replace(/ /g, '·').replace(/\n/g, '↵\n');
}

export default function RegexTester() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('g');
  const [text, setText] = useState('');
  const [replacement, setReplacement] = useState('');
  const [tab, setTab] = useState<Tab>('matches');
  const [timeoutSec, setTimeoutSec] = useState(2);
  const [cheatOpen, setCheatOpen] = useState(false);
  const [cheatQuery, setCheatQuery] = useState('');
  const [ws, setWs] = useState(false);
  const [notices, setNotices] = useState<string[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [saveName, setSaveName] = useState('');
  const [saveText, setSaveText] = useState(false);
  const [announce, setAnnounce] = useState('');
  const patternRef = useRef<HTMLInputElement>(null);

  const support = useMemo(() => ({ v: typeof window !== 'undefined' && supportsFlag('v'), d: typeof window !== 'undefined' && supportsFlag('d') }), []);

  // Load preferences, saved examples and a shared link (pattern and flags only).
  useEffect(() => {
    const prefs = readJson<{ timeoutSec?: number; flags?: string }>(PREFS_KEY, {});
    if (typeof prefs.timeoutSec === 'number' && prefs.timeoutSec >= 0.5 && prefs.timeoutSec <= 10) setTimeoutSec(prefs.timeoutSec);
    if (typeof prefs.flags === 'string') setFlags(normalizeFlags(prefs.flags));
    setSaved(readJson<Saved[]>(EXAMPLES_KEY, [], isSavedList));
    const shared = parseShareHash(window.location.hash, supportsFlag);
    if (shared) {
      setPattern(shared.pattern);
      setFlags(shared.flags);
      setNotices(shared.notices);
    }
  }, []);

  useEffect(() => {
    writeJson(PREFS_KEY, { timeoutSec, flags });
  }, [timeoutSec, flags]);

  const runnerReq = useMemo(() => ({ pattern, flags, text, replacement: tab === 'replace' ? replacement : undefined }), [pattern, flags, text, replacement, tab]);
  const { result, status, cancel, fallback } = useRegexRunner(runnerReq, timeoutSec * 1000);

  useEffect(() => {
    if (status === 'done' && result?.ok) setAnnounce(`${result.countCapped ? '1M+' : result.total} ${result.total === 1 ? 'match' : 'matches'}`);
  }, [status, result]);

  const hints = useMemo(() => patternHints(pattern, flags, text), [pattern, flags, text]);
  const tokens = useMemo(() => (tab === 'explain' ? explain(pattern, flags) : []), [tab, pattern, flags]);

  function toggleFlag(f: string) {
    setFlags((cur) => {
      let next = cur.includes(f) ? cur.replace(f, '') : cur + f;
      if (!cur.includes(f) && f === 'u') next = next.replace('v', '');
      if (!cur.includes(f) && f === 'v') next = next.replace('u', '');
      return normalizeFlags(next);
    });
  }

  function insert(snippet: string, isFlag: boolean) {
    if (isFlag) return toggleFlag(snippet);
    const el = patternRef.current;
    const start = el?.selectionStart ?? pattern.length;
    const end = el?.selectionEnd ?? pattern.length;
    setPattern(pattern.slice(0, start) + snippet + pattern.slice(end));
    // Put the caret between empty brackets, e.g. "(?:|)" style entries, otherwise after the snippet.
    const inside = /^(\(.*\)|\[.*\])$/.test(snippet) && !/\\/.test(snippet) ? snippet.length - 1 : snippet.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + inside, start + inside);
    });
    setAnnounce(`Inserted ${snippet}`);
  }

  function tryExample() {
    setPattern(EXAMPLE.pattern);
    setFlags(EXAMPLE.flags);
    setText(EXAMPLE.text);
    setReplacement(EXAMPLE.replacement);
  }

  function persist(list: Saved[]) {
    setSaved(list);
    writeJson(EXAMPLES_KEY, list);
  }

  function saveExample() {
    const name = saveName.trim() || pattern.slice(0, 30);
    if (!pattern) return;
    persist([{ name, pattern, flags, text: saveText ? text : undefined }, ...saved.filter((x) => x.name !== name)].slice(0, 50));
    setSaveName('');
  }

  async function copyShare() {
    const url = `${window.location.origin}${window.location.pathname}${buildShareHash(pattern, flags)}`;
    try {
      await navigator.clipboard.writeText(url);
      setAnnounce('Share link copied. It contains the pattern and flags only.');
    } catch {
      setAnnounce('Could not copy the link.');
    }
  }

  const matches = result?.matches ?? [];
  const regexError = result && !result.ok ? result.error : null;
  const usedUnits = text.length;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="panel stack" style={{ gap: 10 }}>
        <Field label="Pattern" error={regexError ? regexError.message : undefined}>
          {(id) => (
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <span className="mono faint" aria-hidden>/</span>
              <input
                id={id}
                ref={patternRef}
                className="input mono"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="Type a pattern, e.g. \b\w+@\w+\.\w+"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                aria-invalid={regexError ? true : undefined}
              />
              <span className="mono faint" aria-hidden>/{flags}</span>
            </div>
          )}
        </Field>
        {regexError?.position !== undefined && (
          <pre className={`mono ${s.caret}`} aria-hidden>
            {pattern}
            {'\n'}
            {' '.repeat(regexError.position)}^
          </pre>
        )}

        <div className="row" role="group" aria-label="Flags">
          {FLAGS.map(({ f, label }) => {
            const unsupported = (f === 'v' && !support.v) || (f === 'd' && !support.d);
            const blocked = (f === 'u' && flags.includes('v')) || (f === 'v' && flags.includes('u'));
            return (
              <button
                key={f}
                type="button"
                className={`btn sm ${s.flag}`}
                aria-pressed={flags.includes(f)}
                disabled={unsupported}
                title={unsupported ? `${label} is not supported by this browser` : blocked ? `Using ${f} replaces ${f === 'u' ? 'v' : 'u'}` : label}
                onClick={() => toggleFlag(f)}
              >
                <span className="mono">{f}</span> <span className="faint">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            <button type="button" className="btn sm" onClick={tryExample}>Try an example</button>
            <CopyButton text={() => toLiteral(pattern, flags)} label="Copy as /literal/" />
            <CopyButton text={() => toConstructor(pattern, flags)} label="Copy as new RegExp" />
            <button type="button" className="btn sm" onClick={() => void copyShare()} disabled={!pattern}>Share link</button>
          </div>
          <label className="row" style={{ gap: 6 }}>
            Timeout
            <select className="select" style={{ width: 90 }} value={timeoutSec} onChange={(e) => setTimeoutSec(Number(e.target.value))} aria-label="Matching timeout">
              {[0.5, 1, 2, 5, 10].map((v) => (
                <option key={v} value={v}>{v} s</option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          Engine: JavaScript (ECMAScript). Share links contain the pattern and flags only, never your test text.
        </p>
        <span className="sr-only" role="status" aria-live="polite">{announce}</span>
      </div>

      {notices.map((n) => (
        <Banner key={n} kind="warn" onDismiss={() => setNotices((l) => l.filter((x) => x !== n))}>{n}</Banner>
      ))}
      {hints.map((h) => (
        <Banner key={h.id} kind={h.level === 'warn' ? 'warn' : 'info'}>{h.text}</Banner>
      ))}
      {hints.some((h) => h.id === 'nested' || h.id === 'overlap' || h.id === 'dotstar') && (
        <p className="hint" style={{ margin: 0 }}>This check is a heuristic. No warning does not prove a pattern is safe, and the timeout only protects this page.</p>
      )}
      {fallback && <Banner kind="warn">Web Workers are unavailable, so matching runs on the main page without timeout protection and with a smaller text limit.</Banner>}

      <div className="split">
        <div className="stack">
          <Field label="Test text" hint={usedUnits > SOFT_LIMIT ? 'Large text: only the first part is highlighted.' : undefined}>
            {(id) => (
              <textarea id={id} className={`textarea mono ${s.text}`} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} dir="auto" placeholder="Paste the text to test against" />
            )}
          </Field>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={ws} onChange={(e) => setWs(e.target.checked)} /> Show whitespace
            </label>
            <button type="button" className="btn sm" onClick={() => setText('')} disabled={!text}>Clear text</button>
          </div>
          {text && pattern && (
            <section aria-label="Highlighted matches">
              <h2 className="panel-title">Highlighted</h2>
              <Highlighted text={text} matches={matches} showWs={ws} />
              {usedUnits > HIGHLIGHT_WINDOW && <p className="hint">Highlighting covers the first {HIGHLIGHT_WINDOW.toLocaleString()} characters. Counts include everything.</p>}
            </section>
          )}
        </div>

        <div className="stack" aria-live="polite">
          <div role="status" className="row" style={{ justifyContent: 'space-between' }}>
            {status === 'idle' && <span className="muted">Type a pattern to start.</span>}
            {(status === 'running' || status === 'slow') && (
              status === 'slow' ? <ProgressBar label="Still running… this pattern may be backtracking heavily." onCancel={cancel} /> : <span className="muted">Matching…</span>
            )}
            {status === 'cancelled' && <span className="muted">Cancelled.</span>}
            {status === 'done' && result?.ok && (
              <b className="tabular">
                {result.countCapped ? `${(COUNT_LIMIT / 1_000_000).toFixed(0)}M+` : result.total.toLocaleString()} {result.total === 1 ? 'match' : 'matches'} in {result.ms} ms
              </b>
            )}
          </div>
          {status === 'timeout' && (
            <Banner kind="error">
              Matching stopped after {timeoutSec} s. This usually means catastrophic backtracking: nested quantifiers like (a+)+, overlapping alternatives, or several .* in a row. Simplify the pattern, make the repeated parts unambiguous, or raise the timeout.
            </Banner>
          )}
          {result?.truncated && <Banner kind="info">Showing the first {MAX_MATCHES.toLocaleString()} matches. The count covers all of them.</Banner>}

          <Tabs<Tab>
            label="Results"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'matches', label: 'Matches' },
              { id: 'groups', label: 'Groups' },
              { id: 'replace', label: 'Replace' },
              { id: 'explain', label: 'Explain' },
            ]}
          />

          {tab === 'matches' && <MatchesTable matches={matches} hasPattern={pattern !== ''} ok={!regexError} />}
          {tab === 'groups' && <GroupsTable matches={matches} indices={flags.includes('d')} />}
          {tab === 'replace' && (
            <div className="stack">
              <Field label="Replacement" hint="$1, $<name>, $&, $`, $' and $$ work as in JavaScript.">
                {(id) => <input id={id} className="input mono" value={replacement} onChange={(e) => setReplacement(e.target.value)} spellCheck={false} autoComplete="off" />}
              </Field>
              {result?.replaceIssues.map((i) => (
                <Banner key={i} kind="warn">{i}</Banner>
              ))}
              {!flags.includes('g') && pattern && <p className="hint">Without the g flag only the first match is replaced.</p>}
              <Field label="Result">
                {(id) => <textarea id={id} className={`textarea mono ${s.text}`} readOnly value={result?.replaced ?? ''} spellCheck={false} />}
              </Field>
              <div className="row">
                <CopyButton text={result?.replaced ?? ''} label="Copy result" />
                <button type="button" className="btn sm" disabled={!result?.replaced} onClick={() => downloadText(result?.replaced ?? '', 'replaced.txt')}>Download</button>
              </div>
            </div>
          )}
          {tab === 'explain' && (
            <div className="stack" style={{ gap: 4 }}>
              {tokens.length === 0 && <EmptyState icon="regex" title="Nothing to explain">Type a pattern to see it broken down token by token.</EmptyState>}
              {tokens.map((t, i) => (
                <div key={i} className={s.token} style={{ paddingLeft: t.depth * 18 }}>
                  <code className={`mono ${s.tokenCode}`}>{t.token}</code>
                  <span>{t.text}</span>
                </div>
              ))}
              {flags.includes('y') && <p className="hint">Sticky (y): each match must start exactly where the previous one ended.</p>}
            </div>
          )}
        </div>
      </div>

      <section className="panel stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="btn sm" aria-expanded={cheatOpen} onClick={() => setCheatOpen(!cheatOpen)}>
            {cheatOpen ? 'Hide cheatsheet' : 'Show cheatsheet'}
          </button>
        </div>
        {cheatOpen && (
          <div className="stack">
            <Field label="Search the cheatsheet">
              {(id) => <input id={id} className="input" type="search" value={cheatQuery} onChange={(e) => setCheatQuery(e.target.value)} />}
            </Field>
            {CHEATSHEET.map((g) => {
              const q = cheatQuery.trim().toLowerCase();
              const entries = g.entries.filter((e) => !q || e.label.toLowerCase().includes(q) || e.insert.toLowerCase().includes(q));
              if (entries.length === 0) return null;
              return (
                <div key={g.title}>
                  <h3 className="panel-title">{g.title}</h3>
                  <div className="row">
                    {entries.map((e) => (
                      <button key={e.insert} type="button" className={`btn sm ${s.cheat}`} onClick={() => insert(e.insert, g.title === 'Flags')} title={e.note ?? e.label}>
                        <code className="mono">{e.insert}</code> <span className="muted">{e.label}</span>
                        {e.note && <span className="faint"> ({e.note})</span>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>
              {NOTES.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section className="panel stack">
        <h2 className="panel-title" style={{ margin: 0 }}>Saved examples</h2>
        <p className="hint" style={{ margin: 0 }}>Stored only in this browser. Test text is saved only if you tick the box.</p>
        <div className="row">
          <input className="input" style={{ maxWidth: 240 }} value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name (optional)" aria-label="Example name" />
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={saveText} onChange={(e) => setSaveText(e.target.checked)} /> Save test text too
          </label>
          <button type="button" className="btn sm primary" onClick={saveExample} disabled={!pattern}>Save example</button>
          <button type="button" className="btn sm" disabled={saved.length === 0} onClick={() => downloadText(JSON.stringify(saved, null, 2), 'regex-examples.json', 'application/json')}>Export JSON</button>
        </div>
        {saved.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No saved examples yet.</p>
        ) : (
          <ul className={s.saved}>
            {saved.map((x) => (
              <li key={x.name} className="row" style={{ justifyContent: 'space-between' }}>
                <span>
                  <b>{x.name}</b> <code className="mono muted">/{x.pattern}/{x.flags}</code>
                </span>
                <span className="row">
                  <button type="button" className="btn sm" onClick={() => { setPattern(x.pattern); setFlags(x.flags); if (x.text !== undefined) setText(x.text); }}>Load</button>
                  <button type="button" className="btn sm" onClick={() => persist(saved.filter((y) => y.name !== x.name))} aria-label={`Delete ${x.name}`}>Delete</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Highlighted({ text, matches, showWs }: { text: string; matches: MatchInfo[]; showWs: boolean }) {
  const nodes = useMemo(() => {
    const limit = Math.min(text.length, HIGHLIGHT_WINDOW);
    const out: ReactNode[] = [];
    const fmt = (t: string) => (showWs ? showWhitespace(t) : t);
    let pos = 0;
    for (const m of matches) {
      if (m.index >= limit) break;
      if (m.index < pos) continue;
      out.push(<Fragment key={`t${pos}`}>{fmt(text.slice(pos, m.index))}</Fragment>);
      if (m.value === '') {
        out.push(<span key={`e${m.n}`} className={s.empty} title={`Empty match #${m.n}`} />);
        pos = m.index;
      } else {
        const end = Math.min(m.end, limit);
        out.push(
          <mark key={`m${m.n}`} className={m.n % 2 ? s.markA : s.markB} title={`Match ${m.n}`}>
            {fmt(text.slice(m.index, end))}
            <sup className={s.badge}>{m.n}</sup>
          </mark>,
        );
        pos = end;
      }
    }
    out.push(<Fragment key="rest">{fmt(text.slice(pos, limit))}</Fragment>);
    return out;
  }, [text, matches, showWs]);
  return <div className={s.preview} dir="auto">{nodes}</div>;
}

function MatchesTable({ matches, hasPattern, ok }: { matches: MatchInfo[]; hasPattern: boolean; ok: boolean }) {
  if (!hasPattern) return <p className="muted">Type a pattern to see matches.</p>;
  if (!ok) return <p className="muted">Fix the pattern to see matches.</p>;
  if (matches.length === 0) return <p className="muted">No matches.</p>;
  const shown = matches.slice(0, 500);
  return (
    <div className={s.table}>
      <table>
        <thead>
          <tr><th>#</th><th title="UTF-16 code unit offset, as JavaScript reports it">Index</th><th title="Position counted in Unicode characters (code points)">Char</th><th>Value</th></tr>
        </thead>
        <tbody>
          {shown.map((m) => (
            <tr key={m.n}>
              <td>{m.n}</td>
              <td className="tabular">{m.index}–{m.end}</td>
              <td className="tabular">{m.charIndex}</td>
              <td className="mono">{m.value === '' ? <i className="muted">(empty)</i> : m.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {matches.length > shown.length && <p className="hint">Showing the first {shown.length} rows.</p>}
    </div>
  );
}

function GroupsTable({ matches, indices }: { matches: MatchInfo[]; indices: boolean }) {
  const rows = matches.slice(0, 200);
  if (rows.length === 0) return <p className="muted">No matches yet.</p>;
  if (rows.every((m) => m.groups.length === 0)) return <p className="muted">The pattern has no capture groups. Wrap part of it in (…) to capture it.</p>;
  const asJson = JSON.stringify(rows.map((m) => ({ match: m.value, groups: m.groups.map((g) => ({ group: g.name ?? g.n, value: g.value ?? null })) })), null, 2);
  return (
    <div className="stack">
      <div className={s.table}>
        <table>
          <thead>
            <tr><th>Match</th><th>Group</th><th>Value</th>{indices && <th>Range</th>}</tr>
          </thead>
          <tbody>
            {rows.flatMap((m) =>
              m.groups.map((g, i) => (
                <tr key={`${m.n}-${g.n}`}>
                  <td>{i === 0 ? m.n : ''}</td>
                  <td className="mono">{g.name ? `${g.n} (${g.name})` : g.n}</td>
                  <td className="mono">{g.value === undefined ? <i className="muted">(did not participate)</i> : g.value === '' ? <i className="muted">(empty)</i> : g.value}</td>
                  {indices && <td className="tabular">{g.range ? `${g.range[0]}–${g.range[1]}` : ''}</td>}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <div className="row">
        <CopyButton text={asJson} label="Copy as JSON" />
      </div>
    </div>
  );
}
