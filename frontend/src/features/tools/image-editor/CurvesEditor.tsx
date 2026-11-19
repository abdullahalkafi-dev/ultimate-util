'use client';

import { useRef } from 'react';
import { curveLut, IDENTITY_CURVE, type CurvePoint } from './adjust';
import styles from './styles.module.css';

const SIZE = 256;

/** Master RGB curve: click to add a point, drag to move, double-click or Delete to remove. Arrow keys nudge. */
export function CurvesEditor({ points, onChange }: { points: CurvePoint[]; onChange: (p: CurvePoint[]) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);

  const toPoint = (e: { clientX: number; clientY: number }): CurvePoint => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: Math.round(Math.max(0, Math.min(255, ((e.clientX - r.left) / r.width) * 255))),
      y: Math.round(Math.max(0, Math.min(255, 255 - ((e.clientY - r.top) / r.height) * 255))),
    };
  };

  const move = (i: number, p: CurvePoint) => {
    const next = points.map((q) => ({ ...q }));
    const prev = next[i - 1], after = next[i + 1];
    // Endpoints keep their x; inner points stay between their neighbours so the curve stays a function.
    const x = i === 0 ? 0 : i === next.length - 1 ? 255 : Math.max((prev?.x ?? 0) + 1, Math.min((after?.x ?? 255) - 1, p.x));
    next[i] = { x, y: p.y };
    onChange(next);
  };

  const remove = (i: number) => {
    if (i === 0 || i === points.length - 1) return;
    onChange(points.filter((_, k) => k !== i));
  };

  const lut = curveLut(points);
  let path = '';
  for (let x = 0; x < 256; x++) path += `${x === 0 ? 'M' : 'L'}${x},${SIZE - (lut[x] as number)} `;

  return (
    <div className="stack" style={{ gap: 6 }}>
      <svg
        ref={svg}
        className={styles.curve}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="group"
        aria-label="RGB curve editor. Click to add a point, drag a point to move it."
        onPointerDown={(e) => {
          if ((e.target as Element).getAttribute('data-point')) return;
          const p = toPoint(e);
          const next = [...points, p].sort((a, b) => a.x - b.x);
          onChange(next);
          drag.current = next.findIndex((q) => q.x === p.x && q.y === p.y);
          svg.current?.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current !== null) move(drag.current, toPoint(e));
        }}
        onPointerUp={() => { drag.current = null; }}
      >
        <line x1="0" y1={SIZE} x2={SIZE} y2="0" stroke="currentColor" opacity="0.2" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
        {points.map((p, i) => (
          <circle
            key={i}
            data-point="1"
            tabIndex={0}
            role="slider"
            aria-label={`Curve point ${i + 1}, input ${p.x}, output ${p.y}`}
            aria-valuenow={p.y}
            aria-valuemin={0}
            aria-valuemax={255}
            cx={p.x}
            cy={SIZE - p.y}
            r="7"
            fill="var(--accent)"
            stroke="#fff"
            strokeWidth="2"
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              drag.current = i;
              svg.current?.setPointerCapture(e.pointerId);
            }}
            onDoubleClick={() => remove(i)}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 10 : 1;
              if (e.key === 'ArrowUp') { e.preventDefault(); move(i, { x: p.x, y: p.y + step }); }
              else if (e.key === 'ArrowDown') { e.preventDefault(); move(i, { x: p.x, y: p.y - step }); }
              else if (e.key === 'ArrowLeft') { e.preventDefault(); move(i, { x: p.x - step, y: p.y }); }
              else if (e.key === 'ArrowRight') { e.preventDefault(); move(i, { x: p.x + step, y: p.y }); }
              else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(i); }
            }}
          />
        ))}
      </svg>
      <button type="button" className="btn sm" onClick={() => onChange(IDENTITY_CURVE.map((p) => ({ ...p })))}>
        Reset curve
      </button>
    </div>
  );
}
