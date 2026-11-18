'use client';

import { useId, useRef, useState, type DragEvent } from 'react';
import { formatBytes } from '@/lib/files';
import { Icon } from './icons';

interface Props {
  onFiles: (files: File[]) => void;
  /** MIME types or extensions for the picker, e.g. ['.docx', 'image/*']. */
  accept?: string[];
  multiple?: boolean;
  maxBytes?: number;
  title?: string;
  hint?: string;
  /** Also accept pasted images/files while the page is focused. */
  paste?: boolean;
  onReject?: (message: string) => void;
}

/** Drag, click or paste files in. Keyboard users get a real button. */
export function DropZone({
  onFiles,
  accept,
  multiple = false,
  maxBytes,
  title = 'Drop a file here',
  hint,
  paste = false,
  onReject,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const id = useId();

  function deliver(list: FileList | File[] | null) {
    if (!list) return;
    let files = Array.from(list);
    if (!multiple) files = files.slice(0, 1);
    if (maxBytes) {
      const tooBig = files.filter((f) => f.size > maxBytes);
      if (tooBig.length) {
        onReject?.(`${tooBig[0]?.name} is larger than ${formatBytes(maxBytes)}.`);
        files = files.filter((f) => f.size <= maxBytes);
      }
    }
    if (files.length) onFiles(files);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    deliver(e.dataTransfer.files);
  }

  return (
    <div
      className="dropzone"
      data-over={over}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      onPaste={paste ? (e) => deliver(e.clipboardData.files) : undefined}
      onClick={() => input.current?.click()}
    >
      <Icon name="upload" />
      <div className="dz-title">{title}</div>
      <div className="hint">
        {hint ?? (accept ? `Accepted: ${accept.join(', ')}` : 'Any file')}
        {maxBytes ? ` · up to ${formatBytes(maxBytes)}` : ''}
      </div>
      <button
        type="button"
        className="btn sm"
        onClick={(e) => {
          e.stopPropagation();
          input.current?.click();
        }}
        aria-describedby={id}
      >
        Choose {multiple ? 'files' : 'a file'}
      </button>
      <span id={id} className="sr-only">
        You can also drag and drop {multiple ? 'files' : 'a file'} onto this area.
      </span>
      <input
        ref={input}
        type="file"
        hidden
        multiple={multiple}
        accept={accept?.join(',')}
        onChange={(e) => {
          deliver(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
