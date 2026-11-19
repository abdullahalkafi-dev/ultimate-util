'use client';

import { useId, useState } from 'react';
import styles from './beforeAfter.module.css';

interface Props {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
}

/**
 * Draggable before/after comparison. The range input is the real control, so arrow keys, Home and End
 * work; two buttons offer a non-drag alternative.
 */
export function BeforeAfter({ beforeUrl, afterUrl, beforeLabel = 'Original', afterLabel = 'Compressed' }: Props) {
  const [position, setPosition] = useState(50);
  const [zoom, setZoom] = useState(false);
  const id = useId();

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className={`${styles.frame} ${zoom ? styles.zoomed : ''} checker`}>
        <div className={styles.stage}>
          { }
          <img className={styles.img} src={afterUrl} alt={`${afterLabel} version`} draggable={false} />
          { }
          <img
            className={`${styles.img} ${styles.over}`}
            src={beforeUrl}
            alt={`${beforeLabel} version`}
            draggable={false}
            style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          />
          <span className={styles.line} style={{ left: `${position}%` }} aria-hidden />
          <span className={`${styles.label} ${styles.left}`}>{beforeLabel}</span>
          <span className={`${styles.label} ${styles.right}`}>{afterLabel}</span>
        </div>
      </div>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <label htmlFor={id} className="sr-only">
          Comparison position, {beforeLabel} on the left and {afterLabel} on the right
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          style={{ flex: 1 }}
        />
      </div>
      <div className="row">
        <button type="button" className="btn sm" onClick={() => setPosition(100)}>
          Show {beforeLabel.toLowerCase()}
        </button>
        <button type="button" className="btn sm" onClick={() => setPosition(0)}>
          Show {afterLabel.toLowerCase()}
        </button>
        <button type="button" className="btn sm" aria-pressed={zoom} onClick={() => setZoom((z) => !z)}>
          {zoom ? 'Fit to width' : 'View at 100%'}
        </button>
      </div>
    </div>
  );
}
