'use client';

import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { hslToRgb, oklchInGamut, oklchToRgb, rgbToHex } from '../_shared-color/convert';
import { MAX_CHROMA, hueName, nudge, pointToState, resolve, stateToPoint, type ColorState } from './wheel';
import styles from './styles.module.css';

const SIZE = 220; // canvas pixels; CSS scales it up, which keeps repaint cheap while dragging lightness

interface Props {
  state: ColorState;
  onChange: (next: ColorState) => void;
}

/** Hue around the circle, saturation (HSL) or chroma (OKLCH) from center to rim. */
export function ColorWheel({ state, onChange }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const { mode, l } = state;

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const image = ctx.createImageData(SIZE, SIZE);
    const r = SIZE / 2;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = x + 0.5 - r, dy = y + 0.5 - r;
        const dist = Math.hypot(dx, dy);
        if (dist > r) continue;
        const h = (Math.atan2(dy, dx) * 180) / Math.PI;
        const t = dist / r;
        const i = (y * SIZE + x) * 4;
        let rgb;
        if (mode === 'hsl') {
          rgb = hslToRgb({ h, s: t * 100, l });
        } else {
          const lch = { l, c: t * MAX_CHROMA, h: (h + 360) % 360 };
          if (!oklchInGamut(lch)) continue; // leave out-of-gamut area empty rather than fake it
          rgb = oklchToRgb(lch).rgb;
        }
        image.data[i] = rgb.r;
        image.data[i + 1] = rgb.g;
        image.data[i + 2] = rgb.b;
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [mode, l]);

  function fromPointer(e: PointerEvent) {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    const radius = box.width / 2;
    const dx = e.clientX - (box.left + radius);
    const dy = e.clientY - (box.top + radius);
    onChange(pointToState(dx, dy, radius, state));
  }

  function onKey(e: KeyboardEvent) {
    const next = nudge(state, e.key, e.shiftKey);
    if (!next) return;
    e.preventDefault();
    onChange(next);
  }

  const point = stateToPoint(state);
  const { rgb } = resolve(state);
  const hex = rgbToHex(rgb);
  const sat = state.mode === 'hsl' ? Math.round(state.s) : Math.round((state.c / MAX_CHROMA) * 100);

  return (
    <div
      ref={wrap}
      className={styles.wheelWrap}
      role="slider"
      tabIndex={0}
      aria-label="Color wheel. Arrow left and right change hue, up and down change saturation, Page Up and Page Down change lightness"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(state.h)}
      aria-valuetext={`${hueName(state.h)}, hue ${Math.round(state.h)} degrees, saturation ${sat} percent, ${hex}`}
      onKeyDown={onKey}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        fromPointer(e);
      }}
      onPointerMove={(e) => dragging.current && fromPointer(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <canvas ref={canvas} width={SIZE} height={SIZE} aria-hidden="true" />
      <span
        className={styles.marker}
        style={{ left: `${50 + point.x * 50}%`, top: `${50 + point.y * 50}%`, background: hex }}
      />
    </div>
  );
}
