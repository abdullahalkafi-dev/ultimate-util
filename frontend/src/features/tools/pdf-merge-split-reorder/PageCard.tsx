'use client';

import { memo, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { Icon } from '@/components/ui';
import type { PageItem } from './arrange';
import type { SourceFile } from './sources';
import styles from './styles.module.css';
import { thumbnail } from './thumbs';

interface Props {
  item: PageItem;
  position: number;
  total: number;
  file: SourceFile | null;
  hue: number;
  selected: boolean;
  dragging: boolean;
  dropTarget: boolean;
  disabled: boolean;
  onToggle: (uid: string, shift: boolean) => void;
  onKey: (e: KeyboardEvent<HTMLLIElement>, uid: string) => void;
  onRotate: (uid: string) => void;
  onDuplicate: (uid: string) => void;
  onRemove: (uid: string) => void;
  onBlankAfter: (uid: string) => void;
  onDragStart: (e: DragEvent, uid: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent, uid: string) => void;
  onDrop: (e: DragEvent, uid: string) => void;
  register: (uid: string, el: HTMLLIElement | null) => void;
}

/** Thumbnails render only once the card scrolls near the viewport. */
function useVisible() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, visible] as const;
}

function PageCardImpl(p: Props) {
  const { item, file } = p;
  const [boxRef, visible] = useVisible();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!visible || !file) return;
    let live = true;
    thumbnail(file.id, file.doc, item.index, file.sizes[item.index]?.width ?? 600)
      .then((url) => live && setSrc(url))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [visible, file, item.index]);

  const label = file ? `${file.label}, page ${item.index + 1}` : 'Blank page';
  const aspect = item.width / Math.max(1, item.height);
  const turned = item.rotation % 180 === 90;
  const boxStyle = { aspectRatio: turned ? `${1 / aspect}` : `${aspect}`, maxHeight: 150, maxWidth: '100%', height: turned ? undefined : 150 };

  return (
    <li
      ref={(el) => p.register(item.uid, el)}
      className={styles.card}
      style={{ borderTopColor: file ? `hsl(${p.hue} 60% 50%)` : 'var(--line2)' }}
      role="option"
      aria-selected={p.selected}
      aria-label={`Page ${p.position} of ${p.total}: ${label}${item.rotation ? `, rotated ${item.rotation} degrees` : ''}`}
      tabIndex={0}
      draggable={!p.disabled}
      data-dragging={p.dragging}
      data-drop={p.dropTarget}
      onClick={(e) => p.onToggle(item.uid, e.shiftKey)}
      onKeyDown={(e) => p.onKey(e, item.uid)}
      onDragStart={(e) => p.onDragStart(e, item.uid)}
      onDragEnd={p.onDragEnd}
      onDragOver={(e) => p.onDragOver(e, item.uid)}
      onDrop={(e) => p.onDrop(e, item.uid)}
    >
      <span className={styles.check} aria-hidden="true">
        {p.selected && <Icon name="check" />}
      </span>
      <div className={styles.thumbBox} ref={boxRef}>
        <div className={styles.thumbInner} style={{ transform: `rotate(${item.rotation}deg)` }}>
          {!file ? (
            <div className={styles.blank} style={{ width: 100 * aspect, height: 100, ...(turned ? {} : {}) }}>
              Blank
            </div>
          ) : src ? (
             
            <img src={src} alt="" draggable={false} />
          ) : (
            <div className={styles.blank} style={boxStyle}>
              {failed ? 'No preview' : '...'}
            </div>
          )}
        </div>
      </div>
      <div className={styles.meta}>
        <span title={label}>{file ? file.label : 'Blank page'}</span>
        <span className="tabular faint">{file ? `p${item.index + 1}` : ''}</span>
      </div>
      <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn sm icon ghost" aria-label={`Rotate page ${p.position} clockwise`} title="Rotate 90 degrees" disabled={p.disabled} onClick={() => p.onRotate(item.uid)}>
          <Icon name="rotate" />
        </button>
        <button type="button" className="btn sm icon ghost" aria-label={`Duplicate page ${p.position}`} title="Duplicate" disabled={p.disabled} onClick={() => p.onDuplicate(item.uid)}>
          <Icon name="copy" />
        </button>
        <button type="button" className="btn sm icon ghost" aria-label={`Insert blank page after page ${p.position}`} title="Insert blank page after" disabled={p.disabled} onClick={() => p.onBlankAfter(item.uid)}>
          <Icon name="plus" />
        </button>
        <button type="button" className="btn sm icon ghost" aria-label={`Delete page ${p.position}`} title="Delete" disabled={p.disabled} onClick={() => p.onRemove(item.uid)}>
          <Icon name="trash" />
        </button>
      </div>
    </li>
  );
}

export const PageCard = memo(PageCardImpl);
