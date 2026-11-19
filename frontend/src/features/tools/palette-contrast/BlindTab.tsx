'use client';

import { hexToRgb, rgbToHex } from '../_shared-color/convert';
import { VISIONS, simulate } from './cvd';
import styles from './styles.module.css';

export function BlindTab({ palette }: { palette: string[] }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="hint">
        A simulation, not a substitute for testing with people. Colors are approximated with the Machado model at full severity.
      </p>
      {VISIONS.map((v) => (
        <div key={v.id} className="panel stack" style={{ gap: 8 }}>
          <div>
            <h2 className="panel-title" style={{ margin: 0 }}>{v.label}</h2>
            <span className="muted">{v.note}</span>
          </div>
          <div className={styles.strip} role="img" aria-label={`${v.label}: ${palette.map((h) => rgbToHex(simulate(hexToRgb(h) ?? { r: 0, g: 0, b: 0 }, v.id))).join(', ')}`}>
            {palette.map((h, i) => {
              const rgb = hexToRgb(h);
              return <span key={`${h}-${i}`} style={{ background: rgb ? rgbToHex(simulate(rgb, v.id)) : h }} />;
            })}
          </div>
          <div className="row mono faint" style={{ fontSize: 12 }}>
            {palette.map((h, i) => {
              const rgb = hexToRgb(h);
              return <span key={`${h}-${i}`}>{rgb ? rgbToHex(simulate(rgb, v.id)) : h}</span>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
