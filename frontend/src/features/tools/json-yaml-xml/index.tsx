'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Banner, CopyButton, DropZone, EmptyState, Field, ProgressBar, SegmentedControl, StatTile, Tabs } from '@/components/ui';
import { downloadText, formatBytes } from '@/lib/files';
import { semanticDiff, textDiff, childPath, type LinePart, type SemanticChange } from './compare';
import { detectFormat, formatText, parseAny } from './formats';
import { countUnsafeNumbers, isUnsafeNumber, type Format, type JNode } from './model';
import { runPipeline, WORKER_THRESHOLD, type PipelineRequest, type PipelineResponse, type View } from './pipeline';
import s from './styles.module.css';

const EXAMPLES: Record<Format, string> = {
  json: '{\n  "id": 9007199254740993,\n  "name": "Ada",\n  "tags": ["admin", "dev"],\n  "profile": { "active": true, "score": 4.5 }\n}',
  yaml: 'name: Ada\nactive: yes\nversion: 1.10\nservers:\n  - host: a.example.com\n    port: 8080\n  - host: b.example.com\n    port: 8081\n',
  xml: '<?xml version="1.0"?>\n<users>\n  <user id="1"><name>Ada</name></user>\n  <user id="2"><name>Grace</name></user>\n</users>',
};

const FORMATS = [
  { id: 'json' as const, label: 'JSON' },
  { id: 'yaml' as const, label: 'YAML' },
  { id: 'xml' as const, label: 'XML' },
];
const EXT: Record<Format, string> = { json: 'json', yaml: 'yaml', xml: 'xml' };
const MIME: Record<Format, string> = { json: 'application/json', yaml: 'text/yaml', xml: 'application/xml' };

export default function JsonYamlXml() {
  const [text, setText] = useState('');
  const [formatChoice, setFormatChoice] = useState<Format | 'auto'>('auto');
  const [view, setView] = useState<View>('format');
  const [to, setTo] = useState<Format>('yaml');
  const [mode, setMode] = useState<'beautify' | 'minify'>('beautify');
  const [indent, setIndent] = useState<'2' | '4' | 'tab'>('2');
  const [sort, setSort] = useState(false);
  const [lenient, setLenient] = useState(false);
  const [yamlVersion, setYamlVersion] = useState<'1.2' | '1.1'>('1.2');
  const [other, setOther] = useState('');
  const [fileName, setFileName] = useState('');
  const [rejected, setRejected] = useState('');
  const [res, setRes] = useState<PipelineResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const seq = useRef(0);

  const format: Format = formatChoice === 'auto' ? detectFormat(text) : formatChoice;
  const opts = useMemo(
    () => ({ mode, indent: indent === 'tab' ? ('tab' as const) : (Number(indent) as 2 | 4), sort, lenient, yamlVersion }),
    [mode, indent, sort, lenient, yamlVersion],
  );

  useEffect(() => () => workerRef.current?.terminate(), []);

  // Debounced run; large input goes to a worker so the page stays usable.
  useEffect(() => {
    const id = ++seq.current;
    if (text.trim() === '') {
      setRes(null);
      setBusy(false);
      return;
    }
    const req: PipelineRequest = { text, format, view, to, opts };
    const timer = setTimeout(() => {
      if (text.length <= WORKER_THRESHOLD) {
        setRes(runPipeline(req));
        setBusy(false);
        return;
      }
      workerRef.current?.terminate();
      const worker = new Worker(new URL('./pipeline.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      setBusy(true);
      worker.onmessage = (e: MessageEvent<{ id: number; res: PipelineResponse }>) => {
        if (seq.current !== id) return;
        setRes(e.data.res);
        setBusy(false);
        worker.terminate();
        workerRef.current = null;
      };
      worker.onerror = () => {
        setBusy(false);
        workerRef.current = null;
      };
      worker.postMessage({ id, req });
    }, 150);
    return () => clearTimeout(timer);
  }, [text, format, view, to, opts]);

  function cancel() {
    workerRef.current?.terminate();
    workerRef.current = null;
    seq.current++;
    setBusy(false);
  }

  async function onFiles(files: File[]) {
    const f = files[0];
    if (!f) return;
    setRejected('');
    setFileName(f.name);
    const content = await f.text();
    setText(content);
    const ext = f.name.split('.').pop()?.toLowerCase();
    setFormatChoice(ext === 'json' ? 'json' : ext === 'yaml' || ext === 'yml' ? 'yaml' : ext === 'xml' ? 'xml' : 'auto');
  }

  const parse = res?.parse;
  const output = res?.output;
  const lines = text === '' ? 0 : text.split('\n').length;
  const unsafe = parse?.node ? countUnsafeNumbers(parse.node) : 0;
  const outFormat: Format = view === 'convert' ? to : format;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <SegmentedControl
          label="Input format"
          value={formatChoice === 'auto' ? format : formatChoice}
          options={FORMATS}
          onChange={(f) => setFormatChoice(f)}
        />
        <div className="row">
          {formatChoice !== 'auto' && (
            <button type="button" className="btn sm" onClick={() => setFormatChoice('auto')}>
              Auto-detect ({format.toUpperCase()})
            </button>
          )}
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={lenient} onChange={(e) => setLenient(e.target.checked)} />
            Allow comments and trailing commas (JSON)
          </label>
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <Field label={fileName ? `Input (${fileName})` : 'Input'}>
            {(id) => (
              <textarea
                id={id}
                className={`textarea ${s.editor}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
                aria-invalid={parse ? !parse.ok : undefined}
                placeholder="Paste JSON, YAML or XML here"
                wrap="off"
              />
            )}
          </Field>
          <div className="row">
            <button type="button" className="btn sm" onClick={() => { setText(EXAMPLES[formatChoice === 'auto' ? 'json' : formatChoice]); setFileName(''); }}>
              Try an example
            </button>
            <button type="button" className="btn sm" onClick={() => { setText(''); setOther(''); setFileName(''); }} disabled={!text}>
              Clear
            </button>
          </div>
          <DropZone onFiles={onFiles} accept={['.json', '.yaml', '.yml', '.xml']} title="Drop .json, .yaml, .yml, .xml" onReject={setRejected} maxBytes={50 * 1024 * 1024} />
          {rejected && <Banner kind="warn">{rejected}</Banner>}
        </div>

        <div className="stack">
          <div aria-live="polite">
            {busy ? (
              <ProgressBar label="Parsing a large document…" onCancel={cancel} />
            ) : !parse ? (
              <EmptyState icon="braces" title="Nothing yet">Paste, type or drop a document. The format is detected automatically.</EmptyState>
            ) : parse.ok ? (
              <Banner kind="ok">
                Valid {format.toUpperCase()}, {lines.toLocaleString()} {lines === 1 ? 'line' : 'lines'}, {formatBytes(new Blob([text]).size)}
              </Banner>
            ) : (
              <Banner kind="error">
                <b>
                  Line {parse.error?.line}, column {parse.error?.col}:
                </b>{' '}
                {parse.error?.message}
                {parse.error?.hint && <div className="muted">{parse.error.hint}</div>}
              </Banner>
            )}
          </div>
          {parse?.warnings.map((w) => (
            <Banner key={w} kind="warn">{w}</Banner>
          ))}
          {unsafe > 0 && (
            <Banner kind="warn">
              {unsafe} number{unsafe > 1 ? 's are' : ' is'} too large or precise for JavaScript. They are kept exactly here, but JSON.parse in a browser or Node would round them.
            </Banner>
          )}

          <Tabs<View>
            label="Mode"
            value={view}
            onChange={setView}
            tabs={[
              { id: 'format', label: 'Format' },
              { id: 'tree', label: 'Tree' },
              { id: 'convert', label: 'Convert' },
              { id: 'diff', label: 'Diff' },
            ]}
          />

          {(view === 'format' || view === 'convert') && (
            <div className="row">
              {view === 'convert' && (
                <SegmentedControl label="Convert to" value={to} options={FORMATS} onChange={setTo} />
              )}
              <SegmentedControl label="Style" value={mode} options={[{ id: 'beautify', label: 'Beautify' }, { id: 'minify', label: 'Minify' }]} onChange={setMode} />
              <SegmentedControl label="Indent" value={indent} options={[{ id: '2', label: '2' }, { id: '4', label: '4' }, { id: 'tab', label: 'Tab' }]} onChange={setIndent} />
              <label className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={sort} onChange={(e) => setSort(e.target.checked)} /> Sort keys
              </label>
              {format === 'yaml' && (
                <SegmentedControl label="YAML version" value={yamlVersion} options={[{ id: '1.2', label: 'YAML 1.2' }, { id: '1.1', label: 'YAML 1.1' }]} onChange={setYamlVersion} />
              )}
            </div>
          )}

          {(view === 'format' || view === 'convert') && (
            <>
              {output && !output.ok && parse?.ok && <Banner kind="error">{output.error?.message}</Banner>}
              {output?.warnings.map((w) => (
                <Banner key={w} kind="info">{w}</Banner>
              ))}
              <Field label="Output">
                {(id) => <textarea id={id} className={`textarea ${s.output}`} readOnly value={output?.output ?? ''} wrap="off" spellCheck={false} />}
              </Field>
              <div className="row">
                <CopyButton text={output?.output ?? ''} label="Copy output" />
                <button type="button" className="btn sm" disabled={!output?.output} onClick={() => downloadText(output?.output ?? '', `output.${EXT[outFormat]}`, MIME[outFormat])}>
                  Download
                </button>
                <button type="button" className="btn sm" disabled={!output?.output} onClick={() => { setText(output?.output ?? ''); setFormatChoice(outFormat); if (view === 'convert') setView('format'); }}>
                  Use output as input
                </button>
              </div>
            </>
          )}

          {view === 'tree' && (parse?.ok && parse.node ? <TreeView root={parse.node} /> : <p className="muted">Fix the errors above to browse the tree.</p>)}

          {view === 'diff' && <DiffView left={text} right={other} setRight={setOther} format={format} opts={opts} />}
        </div>
      </div>
    </div>
  );
}

/* ---------- Tree ---------- */

const PAGE = 100;

function TreeView({ root }: { root: JNode }) {
  const [query, setQuery] = useState('');
  const hits = useMemo(() => (query.trim() ? searchTree(root, query.trim().toLowerCase()) : []), [root, query]);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <Field label="Search keys and values">
        {(id) => <input id={id} className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find in the document" />}
      </Field>
      {query.trim() && (
        <div className={s.diffBox} style={{ maxHeight: 160 }} role="region" aria-label="Search results" aria-live="polite">
          {hits.length === 0 && <div className="muted" style={{ padding: 8 }}>No matches.</div>}
          {hits.map((h) => (
            <div key={h.path} className="row" style={{ padding: '2px 8px', justifyContent: 'space-between' }}>
              <code className="mono">{h.path}</code>
              <CopyButton text={h.path} label="Copy path" />
            </div>
          ))}
          {hits.length >= 200 && <div className="faint" style={{ padding: 8 }}>Showing the first 200 matches.</div>}
        </div>
      )}
      <div className={s.tree} role="tree" aria-label="Document tree">
        <TreeNode node={root} name={null} path="$" depth={0} />
      </div>
    </div>
  );
}

function searchTree(root: JNode, q: string): { path: string }[] {
  const out: { path: string }[] = [];
  const walk = (n: JNode, path: string) => {
    if (out.length >= 200) return;
    if (n.t === 'obj') {
      for (const [k, v] of n.entries) {
        const p = childPath(path, k);
        if (k.toLowerCase().includes(q)) out.push({ path: p });
        walk(v, p);
      }
    } else if (n.t === 'arr') n.items.forEach((v, i) => walk(v, childPath(path, i)));
    else if (n.t === 'str' && n.v.toLowerCase().includes(q)) out.push({ path });
    else if (n.t === 'num' && n.raw.includes(q)) out.push({ path });
    else if ((n.t === 'bool' || n.t === 'null') && String(n.t === 'bool' ? n.v : 'null').includes(q)) out.push({ path });
  };
  walk(root, '$');
  return out;
}

function leafText(n: JNode): string {
  return n.t === 'str' ? JSON.stringify(n.v) : n.t === 'num' ? n.raw : n.t === 'bool' ? String(n.v) : 'null';
}

const TreeNode = memo(function TreeNode({ node, name, path, depth }: { node: JNode; name: string | number | null; path: string; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const [shown, setShown] = useState(PAGE);
  const label = name === null ? null : <span className={s.key}>{typeof name === 'number' ? name : JSON.stringify(name)}: </span>;
  const copy = (text: string, what: string) => (
    <button type="button" className={s.mini} onClick={() => void navigator.clipboard?.writeText(text)} aria-label={`Copy ${what} of ${path}`}>
      {what}
    </button>
  );

  if (node.t !== 'obj' && node.t !== 'arr') {
    const cls = node.t === 'str' ? s.str : node.t === 'num' ? (isUnsafeNumber(node.raw) ? `${s.num} ${s.unsafe}` : s.num) : s.lit;
    return (
      <div role="treeitem" aria-selected={false} style={{ marginLeft: 16 }}>
        {label}
        <span className={cls}>{leafText(node)}</span> {copy(path, 'path')} {copy(node.t === 'str' ? node.v : leafText(node), 'value')}
      </div>
    );
  }

  const count = node.t === 'arr' ? node.items.length : node.entries.length;
  const children: [string | number, JNode][] = !open
    ? []
    : node.t === 'arr'
      ? node.items.slice(0, shown).map((c, i): [number, JNode] => [i, c])
      : node.entries.slice(0, shown);
  return (
    <div role="treeitem" aria-expanded={open} aria-selected={false}>
      <button type="button" className={s.toggle} onClick={() => setOpen(!open)} aria-label={`${open ? 'Collapse' : 'Expand'} ${path}`}>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
        {label}
        <span className="muted">{node.t === 'arr' ? `[${count}]` : `{${count}}`}</span>
      </button>{' '}
      {copy(path, 'path')} {copy(JSON.stringify(toPlain(node)), 'value')}
      {open && (
        <div className={s.node} role="group">
          {children.map(([k, v]) => (
            <TreeNode key={String(k)} node={v} name={k} path={childPath(path, k)} depth={depth + 1} />
          ))}
          {count > shown && (
            <button type="button" className="btn sm" onClick={() => setShown(shown + PAGE)}>
              Show {Math.min(PAGE, count - shown)} more of {count - shown} remaining
            </button>
          )}
        </div>
      )}
    </div>
  );
});

/** Copying a subtree as JSON is rare, so a precise but simple conversion is enough. */
function toPlain(n: JNode): unknown {
  if (n.t === 'obj') return Object.fromEntries(n.entries.map(([k, v]) => [k, toPlain(v)]));
  if (n.t === 'arr') return n.items.map(toPlain);
  if (n.t === 'num') return Number(n.raw);
  if (n.t === 'null') return null;
  return n.v;
}

/* ---------- Diff ---------- */

function DiffView({ left, right, setRight, format, opts }: { left: string; right: string; setRight: (v: string) => void; format: Format; opts: Parameters<typeof formatText>[2] }) {
  const [kind, setKind] = useState<'semantic' | 'text'>('semantic');
  const result = useMemo((): { error?: string; changes?: SemanticChange[]; parts?: LinePart[] } | null => {
    if (!left.trim() || !right.trim()) return null;
    const a = parseAny(left, format, opts);
    const b = parseAny(right, format, opts);
    if (!a.ok || !b.ok || !a.node || !b.node) return { error: !a.ok ? `Left input: ${a.error?.message} (line ${a.error?.line})` : `Right input: ${b.error?.message} (line ${b.error?.line})` };
    const fa = formatText(left, format, { ...opts, mode: 'beautify' }).output ?? left;
    const fb = formatText(right, format, { ...opts, mode: 'beautify' }).output ?? right;
    return { changes: semanticDiff(a.node, b.node), parts: textDiff(fa, fb) };
  }, [left, right, format, opts]);

  return (
    <div className="stack">
      <Field label={`Compare against (${format.toUpperCase()})`} hint="The main input on the left is compared with this one.">
        {(id) => <textarea id={id} className={`textarea ${s.editor}`} style={{ minHeight: 160 }} value={right} onChange={(e) => setRight(e.target.value)} spellCheck={false} wrap="off" />}
      </Field>
      <SegmentedControl label="Diff type" value={kind} onChange={setKind} options={[{ id: 'semantic', label: 'Semantic' }, { id: 'text', label: 'Text' }]} />
      <div aria-live="polite">
        {!result && <p className="muted">Enter a second document to compare.</p>}
        {result?.error && <Banner kind="error">{result.error}</Banner>}
        {result?.changes && kind === 'semantic' && (
          <>
            <div className="grid-3">
              <StatTile value={result.changes.filter((c) => c.kind === 'added').length} label="Added" />
              <StatTile value={result.changes.filter((c) => c.kind === 'removed').length} label="Removed" />
              <StatTile value={result.changes.filter((c) => c.kind === 'changed' || c.kind === 'type').length} label="Changed" />
            </div>
            <div className={s.diffBox} style={{ marginTop: 8 }}>
              {result.changes.length === 0 && <div style={{ padding: 8 }}>The documents are equivalent (key order and formatting ignored).</div>}
              {result.changes.map((c) => (
                <div key={c.path + c.kind} className={s.chg}>
                  <b>{c.kind === 'type' ? 'type changed' : c.kind}</b>
                  <span className="mono">
                    {c.path}
                    {c.before !== undefined && <> <span className={s.del}>{c.before}</span></>}
                    {c.after !== undefined && <> <span className={s.add}>{c.after}</span></>}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        {result?.parts && kind === 'text' && (
          <div className={s.diffBox}>
            {result.parts.map((p, i) => (
              <div key={i} className={`${s.diffLine} ${p.kind === 'add' ? s.add : p.kind === 'del' ? s.del : ''}`}>
                {p.text.replace(/\n$/, '').split('\n').map((l, j) => (
                  <div key={j}>
                    <span aria-hidden>{p.kind === 'add' ? '+ ' : p.kind === 'del' ? '- ' : '  '}</span>
                    <span className="sr-only">{p.kind === 'add' ? 'added: ' : p.kind === 'del' ? 'removed: ' : ''}</span>
                    {l}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
