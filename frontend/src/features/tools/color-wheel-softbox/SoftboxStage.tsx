'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SegmentedControl } from '@/components/ui';
import { rgbToHex } from '../_shared-color/convert';
import { SHAPES, lightColor, stageStyle, stepBrightness, stepKelvin, type Shape, type SoftboxSettings } from './softbox';
import type { FullscreenMode } from './device';
import styles from './styles.module.css';

const IDLE_MS = 3000;
const SHIFT_MS = 60_000;
const SHIFTS = [
  [0, 0],
  [6, 0],
  [6, 6],
  [0, 6],
];

interface Props {
  settings: SoftboxSettings;
  onChange: (patch: Partial<SoftboxSettings>) => void;
  fullscreen: FullscreenMode;
  onExit: () => void;
  presetCount: number;
  onPreset: (index: number) => void;
  onCopy: (hex: string) => void;
  wakeLockFailed: boolean;
  pixelShift: boolean;
}

/** The full-viewport light. Rendered into document.body so no ancestor transform can break position: fixed. */
export function SoftboxStage({
  settings,
  onChange,
  fullscreen,
  onExit,
  presetCount,
  onPreset,
  onCopy,
  wakeLockFailed,
  pixelShift,
}: Props) {
  const [idle, setIdle] = useState(false);
  const [help, setHelp] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const [shiftIndex, setShiftIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<number | null>(null);
  const latest = useRef(settings);
  latest.current = settings;

  const wake = useCallback(() => {
    setIdle(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  useEffect(() => {
    wake();
    const hint = setTimeout(() => setHintVisible(false), IDLE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      clearTimeout(hint);
    };
  }, [wake]);

  useEffect(() => {
    if (!pixelShift) return;
    const id = setInterval(() => setShiftIndex((i) => (i + 1) % SHIFTS.length), SHIFT_MS);
    return () => clearInterval(id);
  }, [pixelShift]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      wake();
      const s = latest.current;
      const target = e.target as HTMLElement | null;
      // Sliders and fields keep their own keys; only Escape always exits.
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName) && e.key !== 'Escape') return;
      if (e.key === 'Escape' || e.key.toLowerCase() === 'f') {
        e.preventDefault();
        onExit();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        onChange({ brightness: stepBrightness(s.brightness, 5) });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        onChange({ brightness: stepBrightness(s.brightness, -5) });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onChange({ kelvin: stepKelvin(s.kelvin, -100) });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onChange({ kelvin: stepKelvin(s.kelvin, 100) });
      } else if (/^[1-9]$/.test(e.key)) {
        const index = Number(e.key) - 1;
        if (index < presetCount) onPreset(index);
      } else if (e.key.toLowerCase() === 'c') {
        onCopy(rgbToHex(lightColor(s)));
      } else if (e.key === '?') {
        setHelp((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChange, onCopy, onExit, onPreset, presetCount, wake]);

  const style = stageStyle(settings);
  const [dx, dy] = SHIFTS[shiftIndex] ?? [0, 0];
  const controlsClass = idle ? styles.controlsOff : '';

  return createPortal(
    <div
      className={`${styles.stage} ${idle ? styles.stageHidden : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Softbox light, fullscreen"
      onPointerMove={wake}
      onPointerDown={wake}
      onTouchStart={(e) => {
        wake();
        touchStart.current = e.touches[0]?.clientY ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        const end = e.changedTouches[0]?.clientY;
        touchStart.current = null;
        if (fullscreen === 'pseudo' && start !== null && end !== undefined && end - start > 140) onExit();
      }}
      onDoubleClick={() => fullscreen === 'pseudo' && onExit()}
    >
      <div
        className={styles.stageInner}
        style={{ background: style.background, transform: pixelShift ? `translate(${dx}px, ${dy}px)` : undefined }}
      >
        {style.panel && (
          <div
            className={styles.panelGlow}
            style={{
              inset: style.panel.inset,
              borderRadius: style.panel.borderRadius,
              background: style.panel.background,
              boxShadow: style.panel.boxShadow,
            }}
          />
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        Fullscreen light on, press Escape to exit.
      </p>

      {/* In real fullscreen the browser owns Esc; this button still works as a fallback. */}
      <button type="button" className={`${styles.exit} ${fullscreen === 'native' ? controlsClass : ''}`} onClick={onExit}>
        Exit
      </button>

      {(hintVisible || wakeLockFailed) && !idle && (
        <div className={styles.hint} role="status">
          {hintVisible && <div>Esc to exit, ? for keys.</div>}
          {wakeLockFailed && <div>Your device may dim or lock the screen. Change auto-lock in settings.</div>}
        </div>
      )}

      {help && (
        <div className={styles.hint} style={{ top: 80 }}>
          <strong>Keys</strong>
          <div>Up / Down: brightness. Left / Right: warmer / cooler. 1 to 9: presets. C: copy color. F or Esc: exit.</div>
        </div>
      )}

      <div className={`${styles.bar} ${controlsClass}`}>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="sb-bright">Brightness {settings.brightness}%</label>
            <input
              id="sb-bright"
              type="range"
              min={5}
              max={100}
              value={settings.brightness}
              onChange={(e) => onChange({ brightness: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label htmlFor="sb-kelvin">Warmth {settings.kelvin} K</label>
            <input
              id="sb-kelvin"
              type="range"
              min={1000}
              max={10000}
              step={100}
              value={settings.kelvin}
              onChange={(e) => onChange({ kelvin: Number(e.target.value) })}
            />
          </div>
        </div>
        <SegmentedControl<Shape>
          label="Shape"
          value={settings.shape}
          onChange={(shape) => onChange({ shape })}
          options={SHAPES.map((s) => ({ id: s, label: s[0]?.toUpperCase() + s.slice(1) }))}
        />
      </div>
    </div>,
    document.body,
  );
}
