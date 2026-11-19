'use client';

import { Field } from '@/components/ui';
import type { ParsedRanges } from './ranges';
import styles from './styles.module.css';

/** Text input for page ranges; the offending tokens are marked in a mirror line below. */
export function RangeInput({
  label,
  value,
  onChange,
  parsed,
  placeholder = '1-3, 5, 8-',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  parsed: ParsedRanges;
  placeholder?: string;
}) {
  const parts: { text: string; bad: boolean; message?: string }[] = [];
  let at = 0;
  for (const err of parsed.errors) {
    if (err.start > at) parts.push({ text: value.slice(at, err.start), bad: false });
    parts.push({ text: value.slice(err.start, err.end), bad: true, message: err.message });
    at = err.end;
  }
  parts.push({ text: value.slice(at), bad: false });
  const firstError = parsed.errors[0];

  return (
    <Field label={label} error={firstError ? `${firstError.message}${parsed.errors.length > 1 ? ` (and ${parsed.errors.length - 1} more)` : ''}` : undefined} hint="Use commas and dashes, for example 1-3, 5, 8- or 2-last.">
      {(id) => (
        <>
          <input
            id={id}
            className="input mono"
            value={value}
            placeholder={placeholder}
            aria-invalid={parsed.errors.length > 0}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          {parsed.errors.length > 0 && (
            <div className={styles.rangeShow} aria-hidden="true">
              {parts.map((p, i) => (p.bad ? <mark key={i} title={p.message}>{p.text || '␣'}</mark> : <span key={i}>{p.text}</span>))}
            </div>
          )}
        </>
      )}
    </Field>
  );
}
