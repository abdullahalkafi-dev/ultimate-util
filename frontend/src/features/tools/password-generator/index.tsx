'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banner, EmptyState, Field, Icon, SliderField, Tabs, useToast } from '@/components/ui';
import { downloadText } from '@/lib/files';
import { readJson, writeJson } from '@/lib/storage';
import {
  AMBIGUOUS,
  DEFAULT_SYMBOLS,
  OptionsError,
  generatePassphrase,
  generatePassword,
  generatePin,
  passphraseEntropyBits,
  passwordEntropyBits,
  pinEntropyBits,
  strengthLabel,
  type ClassId,
  type PasswordOptions,
} from './generate';
import { RandomStream, hasSecureRandom } from './random';
import { WORDLIST } from './wordlist';
import { checkPassword, type CheckResult } from './check';
import styles from './styles.module.css';

type Mode = 'password' | 'passphrase' | 'pin' | 'check';

interface Settings {
  length: number;
  lower: boolean;
  upper: boolean;
  digit: boolean;
  symbol: boolean;
  symbolSet: string;
  avoidAmbiguous: boolean;
  exclude: string;
  requireEach: boolean;
  firstIsLetter: boolean;
  siteRules: boolean;
  maxLength: number;
  minDigits: number;
  minSymbols: number;
  words: number;
  separator: string;
  capitalize: boolean;
  addNumber: boolean;
  pinLength: number;
  avoidObvious: boolean;
  bulk: number;
}

const DEFAULTS: Settings = {
  length: 20, lower: true, upper: true, digit: true, symbol: true, symbolSet: DEFAULT_SYMBOLS,
  avoidAmbiguous: false, exclude: '', requireEach: true, firstIsLetter: false,
  siteRules: false, maxLength: 16, minDigits: 1, minSymbols: 1,
  words: 6, separator: '-', capitalize: false, addNumber: false,
  pinLength: 6, avoidObvious: true, bulk: 1,
};
const STORE_KEY = 'uu.password-generator.settings';
const CLASS_LABEL: Record<ClassId, string> = { lower: 'Lowercase', upper: 'Uppercase', digit: 'Digits', symbol: 'Symbols' };

function loadSettings(): Settings {
  const saved = readJson<Partial<Settings>>(STORE_KEY, {}, (v): v is Partial<Settings> => typeof v === 'object' && v !== null);
  const merged = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    if (typeof saved[k] === typeof DEFAULTS[k]) (merged as Record<string, unknown>)[k] = saved[k];
  }
  return merged;
}

function toPasswordOptions(s: Settings): PasswordOptions {
  const length = s.siteRules ? Math.min(s.length, s.maxLength) : s.length;
  return {
    length,
    lower: s.lower, upper: s.upper, digit: s.digit, symbol: s.symbol,
    symbolSet: s.symbolSet,
    exclude: s.exclude + (s.avoidAmbiguous ? AMBIGUOUS : ''),
    requireEach: s.requireEach,
    minCounts: s.siteRules ? { digit: s.digit ? s.minDigits : 0, symbol: s.symbol ? s.minSymbols : 0 } : undefined,
    firstIsLetter: s.firstIsLetter,
  };
}

interface Output {
  values: string[];
  bits: number;
  error: string | null;
}

function produce(mode: Mode, s: Settings, rng: RandomStream): Output {
  const count = Math.max(1, Math.min(100, s.bulk));
  try {
    if (mode === 'password') {
      const o = toPasswordOptions(s);
      const bits = passwordEntropyBits(o);
      return { values: Array.from({ length: count }, () => generatePassword(o, rng)), bits, error: null };
    }
    if (mode === 'passphrase') {
      const o = { words: s.words, separator: s.separator, capitalize: s.capitalize, addNumber: s.addNumber };
      return { values: Array.from({ length: count }, () => generatePassphrase(o, rng)), bits: passphraseEntropyBits(o), error: null };
    }
    const o = { length: s.pinLength, avoidObvious: s.avoidObvious };
    return { values: Array.from({ length: count }, () => generatePin(o, rng)), bits: pinEntropyBits(o), error: null };
  } catch (e) {
    return { values: [], bits: 0, error: e instanceof OptionsError ? e.message : 'Could not generate a value.' };
  }
}

function Colored({ value }: { value: string }) {
  return (
    <>
      {[...value].map((ch, i) => {
        const cls = /[0-9]/.test(ch) ? styles.digit : /[A-Za-z]/.test(ch) ? '' : styles.symbol;
        return <span key={i} className={cls}>{ch}</span>;
      })}
    </>
  );
}

function Meter({ bits }: { bits: number }) {
  const label = strengthLabel(bits);
  const pct = Math.min(100, (bits / 128) * 100);
  const color = bits < 40 ? 'var(--danger)' : bits < 60 ? 'var(--warn)' : 'var(--ok)';
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{label}</b>
        <span className="tabular muted">{bits.toFixed(1)} bits, computed from how it was generated</span>
      </div>
      <div className="progress" aria-hidden="true"><span style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}

export default function PasswordGenerator() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('password');
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [supported, setSupported] = useState(true);
  const [seed, setSeed] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [readOut, setReadOut] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [keepRecent, setKeepRecent] = useState(false);
  const rngRef = useRef<RandomStream | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
    setSupported(hasSecureRandom());
    rngRef.current = new RandomStream();
    setReady(true);
  }, []);

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      writeJson(STORE_KEY, next); // settings only, never generated values
      return next;
    });
  }, []);

  const output = useMemo<Output>(() => {
    if (!ready || !supported || mode === 'check' || !rngRef.current) return { values: [], bits: 0, error: null };
    // seed is a dependency on purpose: Regenerate bumps it.
    void seed;
    return produce(mode, settings, rngRef.current);
  }, [ready, supported, mode, settings, seed]);

  useEffect(() => {
    if (keepRecent && output.values[0]) setRecent((r) => [output.values[0]!, ...r].slice(0, 10));
     
  }, [output]);

  // Clipboard reminder: 60 s timer plus a check when the tab becomes visible again.
  const copiedAt = useRef(0);
  useEffect(() => {
    if (!copied) return;
    const remind = () => {
      if (Date.now() - copiedAt.current >= 60_000) toast('Reminder: clear your clipboard if you have not already.', 'info');
    };
    const timer = setTimeout(remind, 60_000);
    const onVisible = () => document.visibilityState === 'visible' && remind();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [copied, toast]);

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedAt.current = Date.now();
      setCopied(text);
      toast('Copied. Paste it into your password manager, then clear your clipboard.', 'success');
    } catch {
      toast('Copy was blocked. Select the text and press Ctrl+C.', 'error');
    }
  }

  async function clearClipboard() {
    try {
      let current: string | null = null;
      try {
        current = await navigator.clipboard.readText();
      } catch {
        current = null; // permission refused: the user asked explicitly, so clear anyway
      }
      if (current !== null && current !== copied) {
        toast('The clipboard holds something else now, so it was left alone.', 'info');
      } else {
        await navigator.clipboard.writeText('');
        toast('Clipboard cleared.', 'success');
      }
    } catch {
      toast('Could not clear the clipboard. Copy something else to replace it.', 'error');
    }
    setCopied(null);
  }

  const first = output.values[0] ?? '';
  const shown = hidden && !revealed ? '•'.repeat(first.length) : null;
  const bulk = settings.bulk > 1;

  if (!supported) {
    return (
      <Banner kind="error">
        This browser cannot generate secure randomness (<span className="mono">crypto.getRandomValues</span> is missing), so nothing is generated.
        Update your browser or try a current version of Chrome, Firefox, Safari or Edge.
      </Banner>
    );
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Tabs
        label="Generator type"
        value={mode}
        onChange={(m) => { setMode(m); setRevealed(false); }}
        tabs={[
          { id: 'password', label: 'Password' },
          { id: 'passphrase', label: 'Passphrase' },
          { id: 'pin', label: 'PIN' },
          { id: 'check', label: 'Check mine' },
        ]}
      />

      {mode === 'check' ? (
        <CheckMine />
      ) : (
        <div className="split">
          <div className="stack">
            <section className="panel stack" aria-label="Result">
              {output.error ? (
                <Banner kind="error">{output.error}</Banner>
              ) : (
                <>
                  <div
                    className={`${styles.output} mono`}
                    dir="ltr"
                    tabIndex={0}
                    role="textbox"
                    aria-readonly="true"
                    aria-label={mode === 'pin' ? 'Generated PIN' : mode === 'passphrase' ? 'Generated passphrase' : 'Generated password'}
                  >
                    {first ? (shown ?? <Colored value={first} />) : '…'}
                  </div>
                  <div className="sr-only" aria-live="polite">
                    {first ? `Generated, ${first.length} characters, ${Math.round(output.bits)} bits${readOut ? `: ${first}` : ''}` : ''}
                  </div>
                  <Meter bits={output.bits} />
                  {output.bits < 60 && (
                    <span className="hint">Below 60 bits. Fine for a throwaway account, not for anything that matters.</span>
                  )}
                </>
              )}
              <div className="row">
                <button type="button" className="btn primary" onClick={() => void copyText(bulk ? output.values.join('\n') : first)} disabled={!first}>
                  <Icon name="copy" />{bulk ? 'Copy all' : 'Copy'}
                </button>
                <button type="button" className="btn" onClick={() => setSeed((n) => n + 1)}>
                  <Icon name="refresh" />Regenerate
                </button>
                {bulk && (
                  <button type="button" className="btn" disabled={!first} onClick={() => downloadText(output.values.join('\n') + '\n', 'passwords.txt')}>
                    <Icon name="download" />Download .txt
                  </button>
                )}
              </div>
              {copied && (
                <Banner kind="info" onDismiss={() => setCopied(null)}>
                  Copied. Paste it into your password manager, then clear your clipboard.{' '}
                  <button type="button" className="btn sm" onClick={() => void clearClipboard()}>Clear clipboard now</button>
                </Banner>
              )}
              {bulk && first && (
                <ul className={styles.bulk} aria-label={`${output.values.length} generated values`}>
                  {output.values.map((v, i) => (
                    <li key={i} className="mono" dir="ltr">{hidden && !revealed ? '•'.repeat(v.length) : v}</li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel stack">
              <h2 className="panel-title" style={{ margin: 0 }}>Display and privacy</h2>
              <label className="row"><input type="checkbox" checked={hidden} onChange={(e) => { setHidden(e.target.checked); setRevealed(false); }} /> Hide generated value (shoulder surfing)</label>
              {hidden && (
                <button type="button" className="btn sm" aria-pressed={revealed} onClick={() => setRevealed((r) => !r)}>
                  {revealed ? 'Hide again' : 'Reveal'}
                </button>
              )}
              <label className="row"><input type="checkbox" checked={readOut} onChange={(e) => setReadOut(e.target.checked)} /> Read it out to screen readers</label>
              <label className="row"><input type="checkbox" checked={keepRecent} onChange={(e) => { setKeepRecent(e.target.checked); if (!e.target.checked) setRecent([]); }} /> Keep a recent list in memory (cleared when you close the tab)</label>
              {keepRecent && (
                recent.length === 0 ? <span className="hint">Nothing yet.</span> : (
                  <div className="stack" style={{ gap: 6 }}>
                    <ul className={styles.bulk}>{recent.map((v, i) => <li key={i} className="mono" dir="ltr">{v}</li>)}</ul>
                    <button type="button" className="btn sm" onClick={() => setRecent([])}>Clear recent</button>
                  </div>
                )
              )}
              <p className="hint" style={{ margin: 0 }}>
                Generated values are never saved or sent anywhere. Only these settings are remembered on this device.
                Use a password manager, a unique password per site, and turn on two-factor or passkeys.
              </p>
            </section>
          </div>

          <div className="stack">
            <section className="panel stack">
              <h2 className="panel-title" style={{ margin: 0 }}>Options</h2>
              {mode === 'password' && <PasswordControls s={settings} set={set} />}
              {mode === 'passphrase' && <PassphraseControls s={settings} set={set} />}
              {mode === 'pin' && (
                <>
                  <SliderField label="PIN length" min={4} max={12} value={settings.pinLength} onChange={(v) => set('pinLength', v)} unit="digits" />
                  <label className="row"><input type="checkbox" checked={settings.avoidObvious} onChange={(e) => set('avoidObvious', e.target.checked)} /> Avoid obvious PINs (1111, 1234, 4321, 1212)</label>
                </>
              )}
              <SliderField label="How many to generate" min={1} max={100} value={settings.bulk} onChange={(v) => set('bulk', v)} />
              <p className="hint" style={{ margin: 0 }}>Downloaded lists are plain unencrypted text. Delete the file after use.</p>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

type SetFn = <K extends keyof Settings>(key: K, value: Settings[K]) => void;

function PasswordControls({ s, set }: { s: Settings; set: SetFn }) {
  const classes: ClassId[] = ['lower', 'upper', 'digit', 'symbol'];
  const short = s.length < 8;
  return (
    <>
      <SliderField label="Length" min={8} max={128} value={s.length} onChange={(v) => set('length', v)} unit="characters" />
      <Field label="Or type a length (4 to 128)">
        {(id) => (
          <input id={id} className="input" type="number" min={4} max={128} value={s.length} style={{ width: 110 }}
            onChange={(e) => { const n = Math.round(Number(e.target.value)); if (Number.isFinite(n)) set('length', Math.min(128, Math.max(4, n))); }} />
        )}
      </Field>
      {short && <Banner kind="warn">Too short to be safe. Only use this for legacy sites that force it.</Banner>}
      <fieldset className={styles.fieldset}>
        <legend>Character types</legend>
        {classes.map((c) => (
          <label key={c} className="row">
            <input type="checkbox" checked={s[c]} onChange={(e) => set(c, e.target.checked)} /> {CLASS_LABEL[c]}
          </label>
        ))}
      </fieldset>
      <Field label="Symbols to use">
        {(id) => <input id={id} className="input mono" value={s.symbolSet} autoComplete="off" spellCheck={false} onChange={(e) => set('symbolSet', e.target.value)} />}
      </Field>
      <label className="row"><input type="checkbox" checked={s.avoidAmbiguous} onChange={(e) => set('avoidAmbiguous', e.target.checked)} /> Avoid look-alikes ({AMBIGUOUS})</label>
      <Field label="Also exclude these characters" hint="For example & or quotes, when a site rejects them.">
        {(id) => <input id={id} className="input mono" value={s.exclude} autoComplete="off" spellCheck={false} onChange={(e) => set('exclude', e.target.value)} />}
      </Field>
      <label className="row"><input type="checkbox" checked={s.requireEach} onChange={(e) => set('requireEach', e.target.checked)} /> Include at least one of each selected type</label>
      <label className="row"><input type="checkbox" checked={s.firstIsLetter} onChange={(e) => set('firstIsLetter', e.target.checked)} /> First character is a letter</label>
      <label className="row"><input type="checkbox" checked={s.siteRules} onChange={(e) => set('siteRules', e.target.checked)} /> This site has picky rules</label>
      {s.siteRules && (
        <div className="grid-3">
          <Field label="Max length">{(id) => <input id={id} className="input" type="number" min={4} max={128} value={s.maxLength} onChange={(e) => set('maxLength', Math.min(128, Math.max(4, Number(e.target.value) || 4)))} />}</Field>
          <Field label="Min digits">{(id) => <input id={id} className="input" type="number" min={0} max={10} value={s.minDigits} onChange={(e) => set('minDigits', Math.min(10, Math.max(0, Number(e.target.value) || 0)))} />}</Field>
          <Field label="Min symbols">{(id) => <input id={id} className="input" type="number" min={0} max={10} value={s.minSymbols} onChange={(e) => set('minSymbols', Math.min(10, Math.max(0, Number(e.target.value) || 0)))} />}</Field>
        </div>
      )}
    </>
  );
}

function PassphraseControls({ s, set }: { s: Settings; set: SetFn }) {
  return (
    <>
      <SliderField label="Words" min={3} max={12} value={s.words} onChange={(v) => set('words', v)} />
      <Field label="Separator" hint="Some sites reject spaces or non-ASCII separators.">
        {(id) => <input id={id} className="input mono" value={s.separator} maxLength={4} autoComplete="off" onChange={(e) => set('separator', e.target.value)} />}
      </Field>
      <label className="row"><input type="checkbox" checked={s.capitalize} onChange={(e) => set('capitalize', e.target.checked)} /> Capitalize each word</label>
      <label className="row"><input type="checkbox" checked={s.addNumber} onChange={(e) => set('addNumber', e.target.checked)} /> Add a random digit to one random word</label>
      <div className="hint">
        Word list: EFF large list, {WORDLIST.length.toLocaleString()} words, {Math.log2(WORDLIST.length).toFixed(2)} bits per word.
        Capitalizing adds no entropy; the random digit adds {Math.log2(s.words * 10).toFixed(1)} bits.
      </div>
      <div className="hint">
        Word list by the Electronic Frontier Foundation,{' '}
        <a href="https://www.eff.org/deeplinks/2016/07/new-wordlists-random-passphrases" target="_blank" rel="noreferrer noopener">EFF long wordlist</a>,
        licensed under{' '}
        <a href="https://creativecommons.org/licenses/by/3.0/us/" target="_blank" rel="noreferrer noopener">CC BY 3.0 US</a>.
      </div>
    </>
  );
}

function CheckMine() {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!value) { setResult(null); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      checkPassword(value)
        .then((r) => { if (!cancelled) { setResult(r); setFailed(false); } })
        .catch(() => { if (!cancelled) setFailed(true); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [value]);

  // The typed password never leaves memory; clear it when the tab is left.
  useEffect(() => () => setValue(''), []);

  const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
  return (
    <div className="split">
      <section className="panel stack">
        <Field label="Password to check" hint="Checked on this device only. It is never stored, put in the URL or sent anywhere.">
          {(id) => (
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input id={id} className="input mono" dir="ltr" type={show ? 'text' : 'password'} value={value} autoComplete="off" spellCheck={false}
                onChange={(e) => setValue(e.target.value)} />
              <button type="button" className="btn" aria-pressed={show} onClick={() => setShow((x) => !x)}>{show ? 'Hide' : 'Show'}</button>
            </div>
          )}
        </Field>
        {!value && <EmptyState icon="lock" title="Type or paste a password">You get an estimate and tips. Nothing is scored until you type.</EmptyState>}
        {failed && <Banner kind="error">The strength checker could not load. Reload the page and try again.</Banner>}
        {value && loading && !result && <span className="muted" role="status">Loading the dictionaries…</span>}
        {value && result && (
          <div className="stack" aria-live="polite">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>{labels[result.score]} ({result.score} of 4)</b>
              <span className="tabular muted">about {result.guessesLog2.toFixed(1)} bits of guessing work</span>
            </div>
            <div className="progress" aria-hidden="true"><span style={{ width: `${((result.score + 1) / 5) * 100}%`, background: result.score < 2 ? 'var(--danger)' : result.score < 3 ? 'var(--warn)' : 'var(--ok)' }} /></div>
            {result.truncated && <span className="hint">Only the first 100 characters were analysed.</span>}
            {result.warning && <Banner kind="warn">{result.warning}</Banner>}
            {result.common && <Banner kind="error">This is a very common password. Generate a random one instead.</Banner>}
            {result.suggestions.length > 0 && <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>{result.suggestions.map((t) => <li key={t}>{t}</li>)}</ul>}
          </div>
        )}
      </section>
      <section className="panel stack">
        <h2 className="panel-title" style={{ margin: 0 }}>Estimated time to crack</h2>
        {result ? (
          <table className={styles.table}>
            <tbody>
              {result.times.map((t) => (
                <tr key={t.label}><th scope="row">{t.label}</th><td className="tabular">{t.display}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <span className="hint">Appears once you type something.</span>}
        <p className="hint" style={{ margin: 0 }}>
          This estimate comes from pattern matching against common words and passwords, so it suits human-chosen passwords.
          Generated passwords are scored from how they were made instead, which is more accurate for random strings.
        </p>
      </section>
    </div>
  );
}
