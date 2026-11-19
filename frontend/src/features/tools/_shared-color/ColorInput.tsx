'use client';

import { useEffect, useRef, useState } from 'react';
import { Field } from '@/components/ui';
import { parseColor, rgbToHex, type ParsedColor } from './convert';

interface Props {
  label: string;
  /** Canonical value shown when the user is not typing, for example "#ff9a3c". */
  value: string;
  onValid: (color: ParsedColor, hex: string) => void;
  /** Also render a native color picker (the touch-friendly way to choose). */
  picker?: boolean;
}

/** Text field for any CSS color. Invalid input shows an inline error and keeps the last valid color. */
export function ColorInput({ label, value, onValid, picker = true }: Props) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | undefined>();
  const [note, setNote] = useState<string | undefined>();
  const committed = useRef(value);

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
      setError(undefined);
      setNote(undefined);
    }
  }, [value]);

  function edit(next: string) {
    setText(next);
    const result = parseColor(next);
    if (!result.ok) {
      setError(result.error);
      setNote(undefined);
      return;
    }
    setError(undefined);
    const parts: string[] = [];
    if (result.adjusted) parts.push('Value was out of range and has been adjusted to fit sRGB.');
    if (result.alpha < 1) parts.push('Includes transparency.');
    setNote(parts.join(' ') || undefined);
    const hex = rgbToHex(result.rgb, result.alpha);
    committed.current = hex;
    onValid(result, hex);
  }

  return (
    <Field label={label} error={error} hint={note}>
      {(id) => (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input
            id={id}
            className="input mono"
            value={text}
            onChange={(e) => edit(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
          />
          {picker && (
            <input
              type="color"
              aria-label={`${label}, color picker`}
              value={value.slice(0, 7).toLowerCase()}
              onChange={(e) => edit(e.target.value)}
              style={{ width: 44, height: 40, padding: 2, flex: '0 0 auto' }}
            />
          )}
        </div>
      )}
    </Field>
  );
}
