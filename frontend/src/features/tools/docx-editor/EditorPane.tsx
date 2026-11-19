'use client';

import { TextSelection } from '@tiptap/pm/state';
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Banner, Dialog, Field } from '@/components/ui';
import { createExtensions } from './extensions';
import { imageToDataUri } from './image';
import styles from './styles.module.css';

interface Props {
  /** HTML (from an imported docx) or TipTap JSON (a restored draft). */
  initial: string | JSONContent;
  onChange: (doc: JSONContent, html: string) => void;
  onReady: (editor: Editor) => void;
}

interface Match {
  from: number;
  to: number;
}

function findMatches(editor: Editor, query: string, matchCase: boolean): Match[] {
  if (!query) return [];
  const needle = matchCase ? query : query.toLowerCase();
  const out: Match[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = matchCase ? node.text : node.text.toLowerCase();
    for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) out.push({ from: pos + i, to: pos + i + needle.length });
  });
  return out;
}

export function EditorPane({ initial, onChange, onReady }: Props) {
  const extensions = useMemo(() => createExtensions(), []);
  const editor = useEditor({
    extensions,
    content: initial,
    immediatelyRender: false,
    editorProps: { attributes: { 'aria-label': 'Document editor', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: e }) => onChange(e.getJSON(), e.getHTML()),
  });
  const readyFor = useRef<Editor | null>(null);
  useEffect(() => {
    if (editor && readyFor.current !== editor) {
      readyFor.current = editor;
      onReady(editor);
      onChange(editor.getJSON(), editor.getHTML());
    }
  }, [editor, onReady, onChange]);

  if (!editor) return <div className="muted" style={{ padding: 16 }}>Loading editor…</div>;
  return (
    <div>
      <Toolbar editor={editor} />
      <FindReplace editor={editor} />
      <div className={styles.surface}>
        <div className={styles.page}>
          <EditorContent editor={editor} />
        </div>
      </div>
      <Outline editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      link: e.isActive('link'),
      table: e.isActive('table'),
      alignLeft: e.isActive({ textAlign: 'left' }),
      alignCenter: e.isActive({ textAlign: 'center' }),
      alignRight: e.isActive({ textAlign: 'right' }),
      alignJustify: e.isActive({ textAlign: 'justify' }),
      block: e.isActive('heading', { level: 1 }) ? 'h1' : e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'p',
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const chain = () => editor.chain().focus();

  async function onImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      chain()
        .setImage({ src: await imageToDataUri(file), alt: file.name.replace(/\.[^.]+$/, '') })
        .run();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The image could not be inserted.');
    }
  }

  function applyLink() {
    const value = href.trim();
    if (!value) {
      chain().extendMarkRange('link').unsetLink().run();
    } else {
      const url = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
      if (!/^(https?:|mailto:|tel:)/i.test(url)) {
        setError('Only http, https, mailto and tel links are allowed.');
        return;
      }
      chain().extendMarkRange('link').setLink({ href: url }).run();
    }
    setError('');
    setLinkOpen(false);
  }

  const B = (label: string, text: string, pressed: boolean | undefined, run: () => void, disabled = false) => (
    <button type="button" className={styles.tbtn} aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={run}>
      {text}
    </button>
  );

  return (
    <>
      <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
        <div className={styles.group}>
          {B('Undo', '↶', undefined, () => chain().undo().run(), !s.canUndo)}
          {B('Redo', '↷', undefined, () => chain().redo().run(), !s.canRedo)}
        </div>
        <div className={styles.group}>
          <select
            className="select"
            aria-label="Paragraph style"
            style={{ height: 32, padding: '0 8px', width: 130 }}
            value={s.block}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'p') chain().setParagraph().run();
              else chain().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
            }}
          >
            <option value="p">Paragraph</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
          </select>
        </div>
        <div className={styles.group}>
          {B('Bold (Ctrl+B)', 'B', s.bold, () => chain().toggleBold().run())}
          {B('Italic (Ctrl+I)', 'I', s.italic, () => chain().toggleItalic().run())}
          {B('Underline (Ctrl+U)', 'U', s.underline, () => chain().toggleUnderline().run())}
        </div>
        <div className={styles.group}>
          {B('Bulleted list', '• List', s.bullet, () => chain().toggleBulletList().run())}
          {B('Numbered list', '1. List', s.ordered, () => chain().toggleOrderedList().run())}
        </div>
        <div className={styles.group}>
          {B('Align left', 'L', s.alignLeft, () => chain().setTextAlign('left').run())}
          {B('Align center', 'C', s.alignCenter, () => chain().setTextAlign('center').run())}
          {B('Align right', 'R', s.alignRight, () => chain().setTextAlign('right').run())}
          {B('Justify', 'J', s.alignJustify, () => chain().setTextAlign('justify').run())}
        </div>
        <div className={styles.group}>
          {B('Link', 'Link', s.link, () => {
            setHref(String(editor.getAttributes('link').href ?? ''));
            setLinkOpen(true);
          })}
          {B('Insert image', 'Image', undefined, () => fileRef.current?.click())}
          {B('Insert table', 'Table', s.table, () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), s.table)}
          {B('Page break', 'Break', undefined, () => chain().insertContent({ type: 'pageBreak' }).run())}
        </div>
        {s.table && (
          <div className={styles.group} role="group" aria-label="Table tools">
            {B('Add row below', '+Row', undefined, () => chain().addRowAfter().run())}
            {B('Add column right', '+Col', undefined, () => chain().addColumnAfter().run())}
            {B('Delete row', '-Row', undefined, () => chain().deleteRow().run())}
            {B('Delete column', '-Col', undefined, () => chain().deleteColumn().run())}
            {B('Merge or split cells', 'Merge', undefined, () => chain().mergeOrSplit().run())}
            {B('Delete table', 'Del table', undefined, () => chain().deleteTable().run())}
          </div>
        )}
        <div className={styles.group}>{B('Clear formatting', 'Clear', undefined, () => chain().unsetAllMarks().clearNodes().run())}</div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden onChange={onImage} aria-label="Choose an image to insert" />
      </div>
      {error && (
        <Banner kind="error" onDismiss={() => setError('')}>
          {error}
        </Banner>
      )}
      <Dialog
        open={linkOpen}
        title="Link"
        onClose={() => setLinkOpen(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setLinkOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={applyLink}>
              {href.trim() ? 'Apply link' : 'Remove link'}
            </button>
          </>
        }
      >
        <Field label="Address" hint="Leave empty to remove the link.">
          {(id) => (
            <input id={id} className="input" value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://example.com" onKeyDown={(e) => e.key === 'Enter' && applyLink()} />
          )}
        </Field>
      </Dialog>
    </>
  );
}

function FindReplace({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [info, setInfo] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const show = () => {
    setOpen(true);
    setTimeout(() => input.current?.focus(), 0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && editor.isFocused) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor]);

  function go(direction: 1 | -1) {
    const matches = findMatches(editor, query, matchCase);
    if (!matches.length) return setInfo('No matches');
    const { from, to } = editor.state.selection;
    const next = direction === 1 ? (matches.find((m) => m.from >= to) ?? matches[0]) : ([...matches].reverse().find((m) => m.to <= from) ?? matches[matches.length - 1]);
    if (!next) return;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, next.from, next.to)).scrollIntoView());
    setInfo(`${matches.length} match${matches.length === 1 ? '' : 'es'}`);
  }

  function replaceCurrent() {
    const { from, to } = editor.state.selection;
    const sel = editor.state.doc.textBetween(from, to);
    const same = matchCase ? sel === query : sel.toLowerCase() === query.toLowerCase();
    if (same && query) editor.chain().insertContentAt({ from, to }, replacement).run();
    go(1);
  }

  function replaceAll() {
    const matches = findMatches(editor, query, matchCase);
    if (!matches.length) return setInfo('No matches');
    const tr = editor.state.tr;
    for (const m of [...matches].reverse()) {
      if (replacement) tr.replaceWith(m.from, m.to, editor.state.schema.text(replacement, editor.state.doc.resolve(m.from).marks()));
      else tr.delete(m.from, m.to);
    }
    editor.view.dispatch(tr);
    setInfo(`Replaced ${matches.length}`);
  }

  if (!open) {
    return (
      <div className={styles.find}>
        <button type="button" className="btn sm" onClick={show}>
          Find and replace
        </button>
        <span className="hint">Shortcut: Ctrl+F inside the editor</span>
      </div>
    );
  }
  return (
    <div className={styles.find} role="search" aria-label="Find and replace">
      <input
        ref={input}
        className="input"
        style={{ width: 180 }}
        aria-label="Find"
        placeholder="Find"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setInfo('');
        }}
        onKeyDown={(e) => e.key === 'Enter' && go(e.shiftKey ? -1 : 1)}
      />
      <input className="input" style={{ width: 180 }} aria-label="Replace with" placeholder="Replace with" value={replacement} onChange={(e) => setReplacement(e.target.value)} />
      <button type="button" className="btn sm" onClick={() => go(-1)}>
        Previous
      </button>
      <button type="button" className="btn sm" onClick={() => go(1)}>
        Next
      </button>
      <button type="button" className="btn sm" onClick={replaceCurrent}>
        Replace
      </button>
      <button type="button" className="btn sm" onClick={replaceAll}>
        Replace all
      </button>
      <label className="row" style={{ gap: 6 }}>
        <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> Match case
      </label>
      <span className="muted" aria-live="polite">
        {info}
      </span>
      <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>
        Close
      </button>
    </div>
  );
}

function Outline({ editor }: { editor: Editor }) {
  const raw = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const list: { pos: number; level: number; text: string }[] = [];
      e.state.doc.descendants((n, pos) => {
        if (n.type.name === 'heading') list.push({ pos, level: Number(n.attrs.level), text: n.textContent });
      });
      return JSON.stringify(list);
    },
  });
  const headings = JSON.parse(raw) as { pos: number; level: number; text: string }[];
  if (!headings.length) return null;
  return (
    <details style={{ padding: 10 }}>
      <summary>Document outline ({headings.length})</summary>
      <ul className={styles.outline}>
        {headings.map((h) => (
          <li key={h.pos} style={{ marginLeft: (h.level - 1) * 12, listStyle: 'none' }}>
            <button type="button" onClick={() => editor.chain().focus().setTextSelection(h.pos + 1).scrollIntoView().run()}>
              {h.text || '(empty heading)'}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
