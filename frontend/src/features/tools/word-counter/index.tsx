'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { CopyButton, EmptyState, Field, StatTile } from '@/components/ui';
import { LIMITS, WPM, analyze, formatDuration, keywords } from './count';

const SAMPLE =
  'Write or paste text here. Everything is counted instantly in your browser, and nothing is uploaded. Try pasting an email, an essay or a product description.';

/** Reference tool: logic lives in count.ts (tested), this file is only the screen. */
export default function WordCounter() {
  const [text, setText] = useState('');
  const [wpm, setWpm] = useState<number>(WPM.reading);
  // The deferred copy keeps typing smooth when a very large text is pasted.
  const deferred = useDeferredValue(text);
  const stats = useMemo(() => analyze(deferred), [deferred]);
  const top = useMemo(() => keywords(deferred, 10), [deferred]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="split">
        <div className="stack">
          <Field label="Your text">
            {(id) => (
              <textarea
                id={id}
                className="textarea"
                style={{ minHeight: 280 }}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={SAMPLE}
                spellCheck
              />
            )}
          </Field>
          <div className="row">
            <button type="button" className="btn sm" onClick={() => setText(SAMPLE)}>
              Try an example
            </button>
            <CopyButton text={text} label="Copy text" />
            <button type="button" className="btn sm" onClick={() => setText('')} disabled={!text}>
              Clear
            </button>
          </div>
        </div>

        <div className="stack">
          <div className="grid-3" role="group" aria-label="Counts" aria-live="polite">
            <StatTile value={stats.words.toLocaleString()} label="Words" />
            <StatTile value={stats.characters.toLocaleString()} label="Characters" />
            <StatTile value={stats.charactersNoSpaces.toLocaleString()} label="Without spaces" />
            <StatTile value={stats.sentences.toLocaleString()} label="Sentences" />
            <StatTile value={stats.paragraphs.toLocaleString()} label="Paragraphs" />
            <StatTile value={stats.lines.toLocaleString()} label="Lines" />
          </div>

          <div className="panel">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 className="panel-title" style={{ margin: 0 }}>Time</h2>
              <Field label="Reading speed (words per minute)">
                {(id) => (
                  <input id={id} className="input" style={{ width: 110 }} type="number" min={50} max={1000} value={wpm}
                    onChange={(e) => setWpm(Math.min(1000, Math.max(50, Number(e.target.value) || WPM.reading)))} />
                )}
              </Field>
            </div>
            <div className="grid-2" style={{ marginTop: 10 }}>
              <StatTile value={formatDuration(stats.words, wpm)} label="Reading time" />
              <StatTile value={formatDuration(stats.words, WPM.speaking)} label="Speaking time" />
            </div>
          </div>
        </div>
      </div>

      <div className="split">
        <section className="panel">
          <h2 className="panel-title">Length limits</h2>
          <div className="stack" style={{ gap: 10 }}>
            {LIMITS.map((l) => {
              const over = stats.characters > l.max;
              return (
                <div key={l.id}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{l.label}</span>
                    <span className="tabular" style={{ color: over ? 'var(--danger)' : 'var(--muted)', fontWeight: 600 }}>
                      {stats.characters} / {l.max} {over ? `(${stats.characters - l.max} over)` : ''}
                    </span>
                  </div>
                  <div className="progress"><span style={{ width: `${Math.min(100, (stats.characters / l.max) * 100)}%`, background: over ? 'var(--danger)' : undefined }} /></div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <h2 className="panel-title">Top keywords</h2>
          {top.length === 0 ? (
            <EmptyState icon="count" title="No keywords yet">Add some text and the most used words appear here.</EmptyState>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {top.map((k) => (
                  <tr key={k.word} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '6px 0', fontWeight: 600 }}>{k.word}</td>
                    <td className="tabular muted" style={{ textAlign: 'right' }}>{k.count}×</td>
                    <td className="tabular faint" style={{ textAlign: 'right', width: 70 }}>{k.density.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
