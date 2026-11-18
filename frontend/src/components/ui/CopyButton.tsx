'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

interface Props {
  text: string | (() => string);
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
  onCopied?: () => void;
}

/** Copies text. Falls back to a hidden textarea when the Clipboard API is refused. */
export function CopyButton({ text, label = 'Copy', className = '', size = 'sm', onCopied }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  async function copy() {
    const value = typeof text === 'function' ? text() : text;
    let ok = false;
    try {
      await navigator.clipboard.writeText(value);
      ok = true;
    } catch {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      area.remove();
    }
    setState(ok ? 'copied' : 'failed');
    if (ok) onCopied?.();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1600);
  }

  return (
    <button type="button" className={`btn ${size === 'sm' ? 'sm' : ''} ${className}`} onClick={copy}>
      <Icon name={state === 'copied' ? 'check' : 'copy'} />
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Press Ctrl+C' : label}</span>
    </button>
  );
}
