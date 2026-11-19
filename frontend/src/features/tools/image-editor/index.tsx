'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Banner, ConfirmDialog, DropZone, Field, ProgressBar, SegmentedControl, SliderField, Tabs, useToast } from '@/components/ui';
import { downloadBlob, downloadText, formatBytes, outputName, readFirstBytes, sniffType } from '@/lib/files';
import { autoLevels, defaultParams, FILTERS, type AdjustParams } from './adjust';
import { ASPECT_PRESETS, applyRatio, centeredRect, clampRect, exceedsCanvasLimit, fitToPixelBudget, previewScale, rectFromDrag, resizeDims, type Rect } from './crop';
import { CurvesEditor } from './CurvesEditor';
import { canRedo, canUndo, createHistory, current, jump, push, redo, undo, type History } from './history';
import {
  addLayer, baseLayer, BLENDS, duplicateLayer, emptyDoc, findLayer, hitTest, layerBounds, nudgeLayer, removeLayer, reorderLayer, totalImagePixels, updateLayer,
  type Blend, type Doc, type Layer, type PenLayer, type ShapeLayer, type StepLayer, type TextLayer,
} from './layers';
import { cropCanvas, docFromCanvas, flatten, flip, redactImageLayers, registerBitmap, resizeCanvas, rotate90, rotateFree, sampleCanvas } from './ops';
import { parseProject, ProjectError, serializeProject } from './project';
import { minBlock, minBlurRadius, type RedactKind } from './redact';
import { canvasToBlob, canvasToDataUrl, decodeToCanvas, loadDataUrl, makeCanvas, renderDoc, type Bitmaps } from './render';
import styles from './styles.module.css';

type Mode = 'basic' | 'advanced' | 'annotate';
type Tool = 'select' | 'crop' | 'text' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'pen' | 'highlight' | 'eraser' | 'redact' | 'step';
type BasicTab = 'crop' | 'rotate' | 'resize' | 'adjust' | 'filters';
type Format = 'png' | 'jpeg' | 'webp';

const TOOL_LABEL: Record<Tool, string> = {
  select: 'Move', crop: 'Crop', text: 'Text', rect: 'Box', ellipse: 'Oval', line: 'Line', arrow: 'Arrow',
  pen: 'Pen', highlight: 'Marker', eraser: 'Eraser', redact: 'Redact', step: 'Step',
};
const TOOLS: Record<Mode, Tool[]> = {
  basic: ['crop'],
  advanced: ['select', 'crop', 'text', 'rect', 'ellipse', 'line', 'arrow', 'pen', 'highlight', 'eraser', 'redact', 'step'],
  annotate: ['select', 'arrow', 'rect', 'step', 'text', 'highlight', 'redact'],
};
const FONTS = [
  { id: 'system-ui, sans-serif', label: 'System sans' },
  { id: 'Georgia, serif', label: 'Serif' },
  { id: 'ui-monospace, Menlo, Consolas, monospace', label: 'Monospace' },
];
const MIME: Record<Format, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
const EXT: Record<Format, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };
const SOFT_PIXELS = 25e6;
const MAX_PIXELS = 50e6;
const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp', 'image/svg+xml', '.uuproj'];

type Drag =
  | { kind: 'move'; id: string; sx: number; sy: number; ox: number; oy: number; base: Doc }
  | { kind: 'shape'; id: string; sx: number; sy: number; base: Doc }
  | { kind: 'pen'; id: string; sx: number; sy: number; base: Doc }
  | { kind: 'erase'; id: string; canvas: HTMLCanvasElement; lx: number; ly: number; base: Doc }
  | { kind: 'rect'; sx: number; sy: number; purpose: 'crop' | 'redact' };

export default function ImageEditor() {
  const toast = useToast();
  const bitmaps = useRef<Bitmaps>(new Map());
  const [hist, setHist] = useState<History<Doc> | null>(null);
  const [transient, setTransient] = useState<Doc | null>(null);
  const [name, setName] = useState('image');
  const [mode, setMode] = useState<Mode>('basic');
  const [tool, setTool] = useState<Tool>('crop');
  const [basicTab, setBasicTab] = useState<BasicTab>('crop');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [color, setColor] = useState('#e11d48');
  const [strokeWidth, setStrokeWidth] = useState(6);
  const [fillShapes, setFillShapes] = useState(false);
  const [fontSize, setFontSize] = useState(48);
  const [eraserSize, setEraserSize] = useState(40);
  const [redactKind, setRedactKind] = useState<RedactKind>('solid');
  const [redactStrength, setRedactStrength] = useState(0);
  const [stepN, setStepN] = useState(1);
  const [ratioId, setRatioId] = useState('free');
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [rotation, setRotation] = useState(0);
  const [resizeW, setResizeW] = useState('');
  const [resizeH, setResizeH] = useState('');
  const [lockRatio, setLockRatio] = useState(true);
  const [fmt, setFmt] = useState<Format>('png');
  const [quality, setQuality] = useState(90);
  const [exportScale, setExportScale] = useState(100);
  const [jpgBg, setJpgBg] = useState('#ffffff');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [narrow, setNarrow] = useState(false);
  const [blank, setBlank] = useState({ w: 1280, h: 720, bg: '#ffffff' });
  const [confirmFlatten, setConfirmFlatten] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<(() => void) | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const savedDoc = useRef<Doc | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const projInput = useRef<HTMLInputElement>(null);

  const base = hist ? current(hist) : null;
  const doc = transient ?? base;
  const ratio = ASPECT_PRESETS.find((r) => r.id === ratioId)?.ratio ?? null;
  const dirty = !!base && base !== savedDoc.current;

  const commit = useCallback((next: Doc, label: string, key?: string) => {
    setHist((h) => (h ? push(h, next, label, { key, now: Date.now() }) : h));
    setTransient(null);
    setAnnounce(label);
  }, []);

  const guarded = useCallback((fn: () => void) => {
    if (hist && base !== savedDoc.current && hist.index > 0) setPendingReplace(() => fn);
    else fn();
  }, [hist, base]);

  // ---- loading -----------------------------------------------------------------------------
  const start = useCallback((d: Doc, label: string, filename?: string) => {
    setHist(createHistory(d, label, undefined, Date.now()));
    savedDoc.current = d;
    setTransient(null);
    setSelectedId(null);
    setCropRect(null);
    setLastExport(null);
    setError(null);
    setZoom('fit');
    if (filename) setName(filename);
  }, []);

  const loadCanvasAsDoc = useCallback((c: HTMLCanvasElement, filename: string, note?: string) => {
    let canvas = c;
    const px = c.width * c.height;
    if (px > MAX_PIXELS || exceedsCanvasLimit(c.width, c.height)) {
      const s = Math.min(fitToPixelBudget(c.width, c.height, MAX_PIXELS), 16000 / Math.max(c.width, c.height));
      canvas = makeCanvas(Math.floor(c.width * s), Math.floor(c.height * s));
      canvas.getContext('2d')?.drawImage(c, 0, 0, canvas.width, canvas.height);
      toast(`This image was larger than ${MAX_PIXELS / 1e6} megapixels and was downscaled to ${canvas.width} x ${canvas.height} to fit the browser's canvas limits.`, 'info');
    } else if (px > SOFT_PIXELS) {
      toast('Large image: editing may be slow. Consider resizing it first.', 'info');
    }
    if (note) toast(note, 'info');
    start(docFromCanvas(canvas, bitmaps.current, 'Photo'), 'Open image', filename);
  }, [start, toast]);

  const openProject = useCallback(async (file: File) => {
    try {
      const p = parseProject(await file.text());
      const map: Bitmaps = new Map();
      for (const [id, url] of Object.entries(p.images)) map.set(id, await loadDataUrl(url));
      bitmaps.current = map;
      start(p.doc, 'Open project', file.name.replace(/\.uuproj$/i, ''));
      setMode('advanced');
      setTool('select');
      toast('Project opened.', 'success');
    } catch (e) {
      setError(e instanceof ProjectError ? e.message : 'The project file could not be opened. It may be damaged.');
    }
  }, [start, toast]);

  const openFile = useCallback(async (file: File) => {
    setError(null);
    try {
      if (/\.uuproj$/i.test(file.name)) return void (await openProject(file));
      if (file.size === 0) return void setError(`${file.name} is empty (0 bytes).`);
      const type = sniffType(await readFirstBytes(file));
      if (type === 'heic') return void setError('HEIC photos are not decoded here. Convert it to JPG or PNG first with the Bulk Resizer & Converter, then open the result.');
      if (!['png', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'].includes(type)) {
        return void setError(`${file.name} does not look like an image (detected: ${type === 'unknown' ? 'unknown type' : type}). Use PNG, JPG, WebP, AVIF, GIF, BMP or SVG.`);
      }
      setBusy('Opening image');
      const c = await decodeToCanvas(file, type === 'svg');
      loadCanvasAsDoc(c, file.name.replace(/\.[^.]+$/, '') || 'image', type === 'gif' ? 'Animated GIFs open as their first frame.' : undefined);
    } catch (e) {
      setError(e instanceof RangeError || (e instanceof Error && /memory/i.test(e.message)) ? 'Not enough memory to open this image. Try a smaller one.' : 'This image could not be decoded. The file may be corrupt.');
    } finally {
      setBusy(null);
    }
  }, [loadCanvasAsDoc, openProject]);

  const onFiles = useCallback((files: File[]) => {
    const first = files[0];
    if (!first) return;
    guarded(() => void openFile(first));
    if (files.length > 1) toast(`Opened ${first.name}. This editor works on one image at a time; for batches use the Bulk Resizer & Converter.`, 'info');
  }, [guarded, openFile, toast]);

  // paste anywhere
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith('image/'));
      if (f && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) onFiles([f]);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onFiles]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => setNarrow(mq.matches);
    apply();
    if (mq.matches) { setMode('annotate'); setTool('arrow'); }
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Drop bitmaps no history entry references any more.
  useEffect(() => {
    if (!hist) return;
    const used = new Set<string>();
    for (const e of hist.entries) for (const l of e.state.layers) if (l.kind === 'image') used.add(l.bitmapId);
    if (transient) for (const l of transient.layers) if (l.kind === 'image') used.add(l.bitmapId);
    for (const id of bitmaps.current.keys()) if (!used.has(id)) bitmaps.current.delete(id);
  }, [hist, transient]);

  // ---- rendering ---------------------------------------------------------------------------
  const pscale = doc ? previewScale(doc.width, doc.height) : 1;
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !doc) return;
    c.width = Math.max(1, Math.round(doc.width * pscale));
    c.height = Math.max(1, Math.round(doc.height * pscale));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    try {
      renderDoc(ctx, doc, bitmaps.current, pscale);
    } catch {
      setError('Not enough memory to draw this document. Your project is intact; reduce the image size or remove layers.');
    }
  }, [doc, pscale]);

  // Ctrl+wheel zoom
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => {
        const cur = z === 'fit' ? (stageRef.current && doc ? stageRef.current.clientWidth / doc.width : 1) : z;
        return Math.max(0.05, Math.min(8, cur * (e.deltaY < 0 ? 1.1 : 0.9)));
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // ---- keyboard ----------------------------------------------------------------------------
  const doUndo = useCallback(() => setHist((h) => (h ? undo(h) : h)), []);
  const doRedo = useCallback(() => setHist((h) => (h ? redo(h) : h)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (!hist) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
      if (mod) return;
      const allowed = TOOLS[mode];
      const k = e.key.toLowerCase();
      if (k === 'v' && allowed.includes('select')) setTool('select');
      else if (k === 't' && allowed.includes('text')) setTool('text');
      else if (k === 'c' && allowed.includes('crop')) setTool('crop');
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && mode !== 'basic') {
        e.preventDefault();
        const l = findLayer(current(hist), selectedId);
        if (l) { commit(removeLayer(current(hist), selectedId), `Delete ${l.name}`); setSelectedId(null); }
      } else if (e.key.startsWith('Arrow') && selectedId && mode !== 'basic') {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const l = findLayer(current(hist), selectedId);
        commit(nudgeLayer(current(hist), selectedId, dx, dy), `Move ${l?.name ?? 'layer'}`, `nudge-${selectedId}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hist, mode, selectedId, commit, doUndo, doRedo]);

  // ---- mode and tool -----------------------------------------------------------------------
  const switchMode = (m: Mode) => {
    setMode(m);
    setTool(TOOLS[m][0] as Tool);
    setDragRect(null);
    if (m !== 'basic') setCropRect(null);
  };

  // ---- pointer tools -----------------------------------------------------------------------
  const pt = (e: RPointerEvent): { x: number; y: number } => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r || !doc) return { x: 0, y: 0 };
    return { x: ((e.clientX - r.left) / r.width) * doc.width, y: ((e.clientY - r.top) / r.height) * doc.height };
  };

  const tryAdd = (d: Doc, layer: Layer): Doc | null => {
    try { return addLayer(d, layer); } catch (e) { toast(e instanceof Error ? e.message : 'Cannot add layer.', 'error'); return null; }
  };

  const onDown = (e: RPointerEvent) => {
    if (!base || !doc || e.button > 0) return;
    if (mode === 'basic' && basicTab !== 'crop') return;
    const p = pt(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const common = { visible: true, locked: false, opacity: 1, blend: 'source-over' as Blend };
    switch (tool) {
      case 'select': {
        const hit = hitTest(base, p.x, p.y);
        setSelectedId(hit?.id ?? null);
        if (hit) drag.current = { kind: 'move', id: hit.id, sx: p.x, sy: p.y, ox: hit.x, oy: hit.y, base };
        break;
      }
      case 'text': {
        const layer: TextLayer = {
          ...baseLayer('Text', p.x, p.y), ...common, kind: 'text', text: 'Text', fontSize, color, fontFamily: FONTS[0]!.id,
          bold: false, italic: false, align: 'left', rtl: false,
        };
        const next = tryAdd(base, layer);
        if (next) { commit(next, 'Add text'); setSelectedId(layer.id); setTool('select'); }
        break;
      }
      case 'step': {
        const layer: StepLayer = { ...baseLayer(`Step ${stepN}`, p.x, p.y), ...common, kind: 'step', n: stepN, color, radius: Math.max(14, Math.round(Math.max(base.width, base.height) / 60)) };
        const next = tryAdd(base, layer);
        if (next) { commit(next, `Add step ${stepN}`); setStepN(stepN + 1); setSelectedId(layer.id); }
        break;
      }
      case 'rect': case 'ellipse': case 'line': case 'arrow': {
        const layer: ShapeLayer = {
          ...baseLayer(TOOL_LABEL[tool], p.x, p.y), ...common, kind: 'shape', shape: tool === 'rect' ? 'rect' : tool === 'ellipse' ? 'ellipse' : tool,
          w: 0, h: 0, stroke: color, fill: fillShapes && (tool === 'rect' || tool === 'ellipse') ? color : null, strokeWidth,
        };
        const next = tryAdd(base, layer);
        if (next) { drag.current = { kind: 'shape', id: layer.id, sx: p.x, sy: p.y, base }; setTransient(next); }
        break;
      }
      case 'pen': case 'highlight': {
        const hl = tool === 'highlight';
        const layer: PenLayer = {
          ...baseLayer(hl ? 'Marker' : 'Pen', p.x, p.y), ...common, kind: 'pen', points: [0, 0], color,
          size: hl ? strokeWidth * 4 : strokeWidth, highlight: hl, opacity: hl ? 0.6 : 1,
        };
        const next = tryAdd(base, layer);
        if (next) { drag.current = { kind: 'pen', id: layer.id, sx: p.x, sy: p.y, base }; setTransient(next); }
        break;
      }
      case 'eraser': {
        const target = findLayer(base, selectedId)?.kind === 'image' ? findLayer(base, selectedId) : [...base.layers].reverse().find((l) => l.kind === 'image' && l.visible && !l.locked);
        if (!target || target.kind !== 'image') { toast('The eraser works on image layers. Select or add an image layer first.', 'info'); break; }
        const src = bitmaps.current.get(target.bitmapId);
        if (!src) break;
        const copy = makeCanvas(src.width, src.height);
        copy.getContext('2d')?.drawImage(src, 0, 0);
        const id = registerBitmap(bitmaps.current, copy);
        drag.current = { kind: 'erase', id: target.id, canvas: copy, lx: p.x - target.x, ly: p.y - target.y, base };
        eraseAt(copy, p.x - target.x, p.y - target.y, p.x - target.x, p.y - target.y, eraserSize);
        setTransient(updateLayer(base, target.id, { bitmapId: id }));
        break;
      }
      case 'crop': case 'redact':
        drag.current = { kind: 'rect', sx: p.x, sy: p.y, purpose: tool };
        setDragRect({ x: p.x, y: p.y, w: 0, h: 0 });
        break;
    }
  };

  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || !doc) return;
    const p = pt(e);
    if (d.kind === 'move') {
      setTransient(updateLayer(d.base, d.id, { x: Math.round(d.ox + p.x - d.sx), y: Math.round(d.oy + p.y - d.sy) }));
    } else if (d.kind === 'shape') {
      let w = p.x - d.sx, h = p.y - d.sy;
      const l = findLayer(d.base, d.id);
      if (e.shiftKey && (tool === 'rect' || tool === 'ellipse')) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
      setTransient(l ? updateLayerWithNew(d.base, d.id, { w, h }) : d.base);
    } else if (d.kind === 'pen') {
      setTransient((t) => {
        const l = findLayer(t ?? d.base, d.id);
        if (!l || l.kind !== 'pen') return t;
        return updateLayerWithNew(t ?? d.base, d.id, { points: [...l.points, p.x - d.sx, p.y - d.sy] });
      });
    } else if (d.kind === 'erase') {
      const l = findLayer(d.base, d.id);
      if (!l) return;
      const nx = p.x - l.x, ny = p.y - l.y;
      eraseAt(d.canvas, d.lx, d.ly, nx, ny, eraserSize);
      d.lx = nx; d.ly = ny;
      setTransient((t) => (t ? { ...t } : t));
    } else {
      const r = rectFromDrag(d.sx, d.sy, p.x, p.y, d.purpose === 'crop' ? ratio : null, doc.width, doc.height);
      setDragRect(r);
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !base) return;
    if (d.kind === 'move') {
      if (transient && transient !== d.base) commit(transient, `Move ${findLayer(d.base, d.id)?.name ?? 'layer'}`);
      else setTransient(null);
    } else if (d.kind === 'shape' || d.kind === 'pen') {
      const l = transient ? findLayer(transient, d.id) : undefined;
      const tiny = l?.kind === 'shape' && Math.abs(l.w) < 3 && Math.abs(l.h) < 3;
      if (transient && !tiny) { commit(transient, `Add ${l?.name ?? 'layer'}`); setSelectedId(d.id); } else setTransient(null);
    } else if (d.kind === 'erase') {
      if (transient) commit(transient, 'Erase'); else setTransient(null);
    } else if (dragRect && dragRect.w >= 2 && dragRect.h >= 2) {
      if (d.purpose === 'crop') setCropRect(clampRect(dragRect, base.width, base.height));
      else applyRedaction(dragRect);
      setDragRect(null);
    } else {
      setDragRect(null);
    }
  };

  function updateLayerWithNew(d: Doc, id: string, patch: Record<string, unknown>): Doc { return updateLayer(d, id, patch); }

  function eraseAt(c: HTMLCanvasElement, x1: number, y1: number, x2: number, y2: number, size: number) {
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineWidth = size;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 + 0.01, y2);
    ctx.stroke();
    ctx.restore();
  }

  function applyRedaction(r: Rect) {
    if (!base) return;
    try {
      const next = redactImageLayers(base, bitmaps.current, r, redactKind, redactStrength, color);
      if (!next) { toast('There is no image layer under that area to redact. Open a photo first.', 'info'); return; }
      commit(next, `Redact (${redactKind})`);
      const above = base.layers.some((l) => l.kind !== 'image' && l.kind !== 'adjust' && l.visible);
      toast(above ? 'Redacted. Text and shapes above the photo were not changed. Cannot be undone after you export or save.' : 'Redacted. Cannot be undone after you export or save.', 'success');
    } catch {
      setError('Not enough memory to redact this region. Your document is unchanged.');
    }
  }

  // ---- layer / adjustments -----------------------------------------------------------------
  const selected = doc ? findLayer(doc, selectedId) : undefined;

  const patchLayer = (id: string, patch: Record<string, unknown>, label?: string) => {
    if (!base) return;
    const l = findLayer(base, id);
    commit(updateLayer(base, id, patch), label ?? `Edit ${l?.name ?? 'layer'}`, `prop-${id}-${Object.keys(patch).join(',')}`);
  };

  const patchAdjust = (id: string, patch: Partial<AdjustParams>) => {
    if (!base) return;
    const l = findLayer(base, id);
    if (!l || l.kind !== 'adjust') return;
    commit(updateLayer(base, id, { params: { ...l.params, ...patch } }), `Adjust ${l.name}`, `adj-${id}`);
  };

  /** Basic mode keeps exactly one adjustment layer, created on first use. */
  const basicAdjustLayer = (): { id: string; params: AdjustParams } | null => {
    if (!base) return null;
    const l = base.layers.find((x) => x.kind === 'adjust' && x.name === 'Adjustments');
    return l && l.kind === 'adjust' ? { id: l.id, params: l.params } : null;
  };
  const setBasicAdjust = (patch: Partial<AdjustParams>) => {
    if (!base) return;
    const existing = basicAdjustLayer();
    if (existing) return patchAdjust(existing.id, patch);
    const layer: Layer = { ...baseLayer('Adjustments'), kind: 'adjust', params: { ...defaultParams(), ...patch } };
    const next = tryAdd(base, layer);
    if (next) commit(next, 'Adjust', `adj-${layer.id}`);
  };

  const addAdjustmentLayer = () => {
    if (!base) return;
    const layer: Layer = { ...baseLayer('Adjustment'), kind: 'adjust', params: defaultParams() };
    const next = tryAdd(base, layer);
    if (next) { commit(next, 'Add adjustment layer'); setSelectedId(layer.id); }
  };

  const autoLevelsFor = (id: string) => {
    if (!base) return;
    const idx = base.layers.findIndex((l) => l.id === id);
    const below: Doc = { ...base, layers: base.layers.slice(0, idx) };
    const s = previewScale(base.width, base.height, 1024);
    const c = flatten(below, bitmaps.current, s);
    const data = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
    if (!data) return;
    const { black, white } = autoLevels(data);
    const l = findLayer(base, id);
    if (l?.kind === 'adjust') patchAdjust(id, { levels: { ...l.params.levels, black, white } });
  };

  // ---- geometry ----------------------------------------------------------------------------
  const geometry = (label: string, fn: (src: HTMLCanvasElement) => HTMLCanvasElement) => {
    if (!base) return;
    setBusy(label);
    // Let the busy state paint before the synchronous work starts.
    setTimeout(() => {
      try {
        const out = fn(flatten(base, bitmaps.current));
        if (exceedsCanvasLimit(out.width, out.height)) throw new RangeError('size');
        commit(docFromCanvas(out, bitmaps.current, 'Photo'), label);
        setSelectedId(null);
        setCropRect(null);
        setRotation(0);
      } catch (e) {
        setError(e instanceof RangeError && e.message === 'size'
          ? `That result is larger than the browser canvas limit (${16384}px per side).`
          : 'Not enough memory for this operation. Your image is unchanged; try a smaller size.');
      } finally {
        setBusy(null);
      }
    }, 20);
  };

  useEffect(() => {
    if (base) { setResizeW(String(base.width)); setResizeH(String(base.height)); }
  }, [base?.width, base?.height]);  

  useEffect(() => {
    if (!base) return;
    if (cropRect) setCropRect(clampRect(cropRect, base.width, base.height));
  }, [base?.width, base?.height]);  

  const flattenDoc = () => {
    if (!base) return;
    commit(docFromCanvas(flatten(base, bitmaps.current), bitmaps.current, 'Flattened'), 'Flatten');
    setSelectedId(null);
  };

  // ---- export / project --------------------------------------------------------------------
  const buildExport = async (): Promise<Blob> => {
    if (!base) throw new Error('No image');
    const s = exportScale / 100;
    const w = Math.round(base.width * s), h = Math.round(base.height * s);
    if (exceedsCanvasLimit(w, h)) throw new RangeError('size');
    let c = flatten(base, bitmaps.current, s);
    if (fmt === 'jpeg') {
      const flat = makeCanvas(c.width, c.height);
      const ctx = flat.getContext('2d');
      if (ctx) { ctx.fillStyle = jpgBg; ctx.fillRect(0, 0, flat.width, flat.height); ctx.drawImage(c, 0, 0); }
      c = flat;
    }
    return canvasToBlob(c, MIME[fmt], fmt === 'png' ? undefined : quality / 100);
  };

  const exportErr = (e: unknown) =>
    setError(e instanceof RangeError && e.message === 'size' ? 'The export size is larger than the browser canvas limit. Lower the export scale.' : e instanceof Error && e.message.includes('encode') ? e.message : 'Not enough memory to export at this size. Lower the export scale or flatten and resize the image.');

  const doExport = async () => {
    setBusy('Exporting');
    try {
      const blob = await buildExport();
      if (fmt === 'webp' && blob.type !== 'image/webp') toast('This browser cannot encode WebP; the file was saved as PNG instead.', 'info');
      const ext = blob.type === MIME[fmt] ? EXT[fmt] : 'png';
      downloadBlob(blob, outputName(`${name}.x`, 'edited', ext));
      setLastExport(`${formatBytes(blob.size)} ${ext.toUpperCase()}`);
      savedDoc.current = base;
      toast('Exported. Redactions are baked into the exported pixels and cannot be undone in that file.', 'success');
    } catch (e) { exportErr(e); } finally { setBusy(null); }
  };

  const doCopy = async () => {
    setBusy('Copying');
    try {
      const s = exportScale / 100;
      const c = flatten(base!, bitmaps.current, s);
      const blob = await canvasToBlob(c, 'image/png');
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast('Copied the image to the clipboard.', 'success');
        savedDoc.current = base;
      } catch {
        downloadBlob(blob, outputName(`${name}.x`, 'edited', 'png'));
        toast('The clipboard was not available, so the PNG was downloaded instead.', 'info');
      }
    } catch (e) { exportErr(e); } finally { setBusy(null); }
  };

  const saveProject = () => {
    if (!base) return;
    const images: Record<string, string> = {};
    for (const l of base.layers) if (l.kind === 'image') { const c = bitmaps.current.get(l.bitmapId); if (c) images[l.bitmapId] = canvasToDataUrl(c); }
    downloadText(serializeProject(base, images), `${name}.uuproj`, 'application/json');
    savedDoc.current = base;
    toast('Project saved. It keeps layers as they are now; undo history is not stored.', 'success');
  };

  const addImageLayer = async (file: File) => {
    if (!base) return;
    try {
      const type = sniffType(await readFirstBytes(file));
      if (!['png', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'].includes(type)) return void setError(`${file.name} is not a supported image.`);
      const c = await decodeToCanvas(file, type === 'svg');
      const layer: Layer = { ...baseLayer(file.name.replace(/\.[^.]+$/, '')), kind: 'image', bitmapId: registerBitmap(bitmaps.current, c), w: c.width, h: c.height };
      const next = tryAdd(base, layer);
      if (next) { commit(next, 'Add image layer'); setSelectedId(layer.id); }
    } catch { setError('That image could not be added as a layer.'); }
  };

  const newBlank = () => {
    const w = Math.max(1, Math.min(8000, Math.round(blank.w))), h = Math.max(1, Math.min(8000, Math.round(blank.h)));
    start(emptyDoc(w, h, blank.bg), 'New canvas', 'untitled');
    setMode('advanced');
    setTool('rect');
  };

  // ---- derived UI --------------------------------------------------------------------------
  const stageStyle = useMemo(() => {
    if (!doc) return {};
    return zoom === 'fit' ? { maxWidth: '100%', width: doc.width } : { width: doc.width * zoom };
  }, [doc, zoom]);
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const box = (r: Rect) => doc ? { left: pct(r.x, doc.width), top: pct(r.y, doc.height), width: pct(r.w, doc.width), height: pct(r.h, doc.height) } : {};
  const selBounds = doc && selected && mode !== 'basic' ? layerBounds(selected, doc) : null;
  const totalPx = doc ? totalImagePixels(doc) : 0;

  // ---- empty state -------------------------------------------------------------------------
  if (!hist || !doc || !base) {
    return (
      <div className="stack" style={{ gap: 16 }}>
        {error && <Banner kind="error" onDismiss={() => setError(null)}>{error}</Banner>}
        {busy && <ProgressBar label={`${busy}…`} />}
        <p className="muted" style={{ margin: 0 }}>
          Crop, rotate, resize and filter in Basic; add layers, curves, text, shapes and redaction in Advanced; or mark up a screenshot in Annotate. Everything stays in your browser.
        </p>
        <DropZone onFiles={onFiles} accept={ACCEPT} paste title="Drop an image or a .uuproj project" hint="PNG, JPG, WebP, AVIF, GIF, BMP, SVG. You can also paste a screenshot (Ctrl+V)." />
        <div className="split">
          <div className="panel stack">
            <h2 className="panel-title">New blank canvas</h2>
            <div className="grid-3">
              <Field label="Width (px)">{(id) => <input id={id} className="input" type="number" min={1} max={8000} value={blank.w} onChange={(e) => setBlank({ ...blank, w: Number(e.target.value) })} />}</Field>
              <Field label="Height (px)">{(id) => <input id={id} className="input" type="number" min={1} max={8000} value={blank.h} onChange={(e) => setBlank({ ...blank, h: Number(e.target.value) })} />}</Field>
              <Field label="Background">{(id) => <input id={id} className={styles.swatch} type="color" value={blank.bg} onChange={(e) => setBlank({ ...blank, bg: e.target.value })} />}</Field>
            </div>
            <div className="row">
              <button type="button" className="btn primary" onClick={newBlank}>Create canvas</button>
              <button type="button" className="btn" onClick={() => loadCanvasAsDoc(sampleCanvas(), 'sample')}>Try an example</button>
            </div>
          </div>
          <div className="panel stack">
            <h2 className="panel-title">Open a project</h2>
            <p className="muted" style={{ margin: 0 }}>Continue a saved <span className="mono">.uuproj</span> with all layers, text and positions restored.</p>
            <input ref={projInput} type="file" accept=".uuproj,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void openProject(f); e.target.value = ''; }} />
            <button type="button" className="btn" onClick={() => projInput.current?.click()}>Open project…</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- panels ------------------------------------------------------------------------------
  const basicParams = basicAdjustLayer()?.params ?? defaultParams();
  const showCrop = mode === 'basic' ? basicTab === 'crop' : tool === 'crop';
  const crop = cropRect ?? { x: 0, y: 0, w: base.width, h: base.height };
  const setCropField = (k: keyof Rect, v: number) => {
    if (!Number.isFinite(v)) return;
    const next = { ...crop, [k]: v };
    setCropRect(ratio && (k === 'w' || k === 'h') ? applyRatio(k === 'h' ? { ...next, w: Math.round(next.h * ratio) } : next, ratio, base.width, base.height) : clampRect(next, base.width, base.height));
  };

  const cropPanel = (
    <div className="panel stack">
      <h2 className="panel-title">Crop</h2>
      <Field label="Aspect ratio">
        {(id) => (
          <select id={id} className="select" value={ratioId} onChange={(e) => {
            setRatioId(e.target.value);
            const r = ASPECT_PRESETS.find((p) => p.id === e.target.value)?.ratio ?? null;
            setCropRect(r ? centeredRect(r, base.width, base.height) : cropRect);
          }}>
            {ASPECT_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        )}
      </Field>
      <div className="grid-2">
        {(['x', 'y', 'w', 'h'] as const).map((k) => (
          <Field key={k} label={{ x: 'Left (px)', y: 'Top (px)', w: 'Width (px)', h: 'Height (px)' }[k]}>
            {(id) => <input id={id} className="input tabular" type="number" min={0} value={crop[k]} onChange={(e) => setCropField(k, Number(e.target.value))} />}
          </Field>
        ))}
      </div>
      <p className="hint" style={{ margin: 0 }}>Drag on the image to draw the crop area, or type exact numbers.</p>
      <div className="row">
        <button type="button" className="btn primary" disabled={!cropRect || !!busy} onClick={() => geometry('Crop', (src) => cropCanvas(src, clampRect(crop, src.width, src.height)))}>Apply crop</button>
        <button type="button" className="btn" disabled={!cropRect} onClick={() => setCropRect(null)}>Clear</button>
      </div>
      {mode !== 'basic' && <p className="hint" style={{ margin: 0 }}>Cropping flattens all layers into one image.</p>}
    </div>
  );

  const rotatePanel = (
    <div className="panel stack">
      <h2 className="panel-title">Rotate and flip</h2>
      <div className="row">
        <button type="button" className="btn" disabled={!!busy} onClick={() => geometry('Rotate left', (s) => rotate90(s, false))}>Rotate 90° left</button>
        <button type="button" className="btn" disabled={!!busy} onClick={() => geometry('Rotate right', (s) => rotate90(s, true))}>Rotate 90° right</button>
        <button type="button" className="btn" disabled={!!busy} onClick={() => geometry('Flip horizontal', (s) => flip(s, true))}>Flip horizontal</button>
        <button type="button" className="btn" disabled={!!busy} onClick={() => geometry('Flip vertical', (s) => flip(s, false))}>Flip vertical</button>
      </div>
      <SliderField label="Free rotation" value={rotation} onChange={setRotation} min={-180} max={180} unit="°" />
      <button type="button" className="btn primary" disabled={rotation === 0 || !!busy} onClick={() => geometry(`Rotate ${rotation}°`, (s) => rotateFree(s, rotation))}>Apply rotation</button>
      <p className="hint" style={{ margin: 0 }}>Free rotation enlarges the canvas; the corners become transparent.</p>
    </div>
  );

  const onResizeInput = (which: 'w' | 'h', v: string) => {
    const n = Number(v);
    if (which === 'w') setResizeW(v); else setResizeH(v);
    if (lockRatio && n > 0) {
      const d = resizeDims(base.width, base.height, which === 'w' ? { w: n } : { h: n });
      if (which === 'w') setResizeH(String(d.h)); else setResizeW(String(d.w));
    }
  };
  const resizePanel = (
    <div className="panel stack">
      <h2 className="panel-title">Resize</h2>
      <div className="grid-2">
        <Field label="Width (px)">{(id) => <input id={id} className="input tabular" type="number" min={1} value={resizeW} onChange={(e) => onResizeInput('w', e.target.value)} />}</Field>
        <Field label="Height (px)">{(id) => <input id={id} className="input tabular" type="number" min={1} value={resizeH} onChange={(e) => onResizeInput('h', e.target.value)} />}</Field>
      </div>
      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={lockRatio} onChange={(e) => setLockRatio(e.target.checked)} /> Keep aspect ratio
      </label>
      <div className="row">
        {[25, 50, 75].map((p) => (
          <button key={p} type="button" className="btn sm" onClick={() => { setResizeW(String(Math.round(base.width * p / 100))); setResizeH(String(Math.round(base.height * p / 100))); }}>{p}%</button>
        ))}
      </div>
      <button type="button" className="btn primary" disabled={!!busy} onClick={() => {
        const w = Math.round(Number(resizeW)), h = Math.round(Number(resizeH));
        if (!(w >= 1 && h >= 1)) return setError('Enter a width and height of at least 1 pixel.');
        geometry(`Resize to ${w} x ${h}`, (s) => resizeCanvas(s, w, h));
      }}>Apply resize</button>
      <p className="hint" style={{ margin: 0 }}>Currently {base.width} x {base.height} px ({((base.width * base.height) / 1e6).toFixed(1)} MP).</p>
    </div>
  );

  const adjustSliders = (p: AdjustParams, on: (patch: Partial<AdjustParams>) => void, withTone: boolean) => (
    <div className="stack">
      <SliderField label="Brightness" value={p.brightness} onChange={(v) => on({ brightness: v })} min={-100} max={100} />
      <SliderField label="Contrast" value={p.contrast} onChange={(v) => on({ contrast: v })} min={-100} max={100} />
      <SliderField label="Saturation" value={p.saturation} onChange={(v) => on({ saturation: v })} min={-100} max={100} />
      <SliderField label="Warmth" value={p.warmth} onChange={(v) => on({ warmth: v })} min={-100} max={100} />
      {withTone && (
        <>
          <SliderField label="Exposure (stops)" value={p.exposure} onChange={(v) => on({ exposure: v })} min={-3} max={3} step={0.1} />
          <SliderField label="Levels: black point" value={p.levels.black} onChange={(v) => on({ levels: { ...p.levels, black: Math.min(v, p.levels.white - 1) } })} min={0} max={254} />
          <SliderField label="Levels: white point" value={p.levels.white} onChange={(v) => on({ levels: { ...p.levels, white: Math.max(v, p.levels.black + 1) } })} min={1} max={255} />
          <SliderField label="Levels: midtones (gamma)" value={p.levels.gamma} onChange={(v) => on({ levels: { ...p.levels, gamma: v } })} min={0.2} max={3} step={0.05} />
          <div className="stack" style={{ gap: 6 }}>
            <span className="muted">Curves</span>
            <CurvesEditor points={p.curve} onChange={(c) => on({ curve: c })} />
          </div>
        </>
      )}
    </div>
  );

  const filterGrid = (p: AdjustParams, on: (patch: Partial<AdjustParams>) => void) => (
    <div className="stack">
      <div className={styles.filters} role="group" aria-label="Filters">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="btn sm" aria-pressed={p.filter === f.id} onClick={() => on({ filter: f.id })}>{f.label}</button>
        ))}
      </div>
      <SliderField label="Filter intensity" value={p.filterAmount} onChange={(v) => on({ filterAmount: v })} min={0} max={100} unit="%" />
    </div>
  );

  const basicPanel = (
    <div className="stack">
      <Tabs<BasicTab>
        label="Basic edits"
        value={basicTab}
        onChange={(t) => { setBasicTab(t); if (t === 'crop') setTool('crop'); }}
        tabs={[{ id: 'crop', label: 'Crop' }, { id: 'rotate', label: 'Rotate' }, { id: 'resize', label: 'Resize' }, { id: 'adjust', label: 'Adjust' }, { id: 'filters', label: 'Filters' }]}
      />
      {basicTab === 'crop' && cropPanel}
      {basicTab === 'rotate' && rotatePanel}
      {basicTab === 'resize' && resizePanel}
      {basicTab === 'adjust' && (
        <div className="panel stack">
          <h2 className="panel-title">Adjust</h2>
          {adjustSliders(basicParams, setBasicAdjust, false)}
          <button type="button" className="btn sm" disabled={!basicAdjustLayer()} onClick={() => { const l = basicAdjustLayer(); if (l) commit(removeLayer(base, l.id), 'Reset adjustments'); }}>Reset adjustments</button>
        </div>
      )}
      {basicTab === 'filters' && (
        <div className="panel stack">
          <h2 className="panel-title">Filters</h2>
          {filterGrid(basicParams, setBasicAdjust)}
        </div>
      )}
    </div>
  );

  const toolOptions = (
    <div className="panel stack">
      <h2 className="panel-title">Tool options</h2>
      <div className="row">
        <Field label="Color">{(id) => <input id={id} className={styles.swatch} type="color" value={color} onChange={(e) => setColor(e.target.value)} />}</Field>
        {['rect', 'ellipse'].includes(tool) && (
          <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={fillShapes} onChange={(e) => setFillShapes(e.target.checked)} /> Filled</label>
        )}
      </div>
      {['rect', 'ellipse', 'line', 'arrow', 'pen', 'highlight'].includes(tool) && <SliderField label="Stroke width" value={strokeWidth} onChange={setStrokeWidth} min={1} max={60} unit="px" />}
      {tool === 'text' && <SliderField label="Font size" value={fontSize} onChange={setFontSize} min={8} max={400} unit="px" />}
      {tool === 'eraser' && <SliderField label="Eraser size" value={eraserSize} onChange={setEraserSize} min={4} max={300} unit="px" />}
      {tool === 'step' && <Field label="Next number">{(id) => <input id={id} className="input" type="number" min={1} value={stepN} onChange={(e) => setStepN(Math.max(1, Number(e.target.value) || 1))} />}</Field>}
      {tool === 'redact' && (
        <>
          <SegmentedControl<RedactKind> label="Redaction method" value={redactKind} onChange={setRedactKind} options={[{ id: 'solid', label: 'Solid fill' }, { id: 'pixelate', label: 'Pixelate' }, { id: 'blur', label: 'Blur' }]} />
          {redactKind !== 'solid' && (
            <SliderField
              label={redactKind === 'pixelate' ? 'Block size' : 'Blur radius'}
              value={Math.max(redactStrength, redactKind === 'pixelate' ? minBlock(base.width, base.height) : minBlurRadius(base.width, base.height))}
              onChange={setRedactStrength}
              min={redactKind === 'pixelate' ? minBlock(base.width, base.height) : minBlurRadius(base.width, base.height)}
              max={120}
              unit="px"
            />
          )}
          <Banner kind="warn">
            {redactKind === 'solid'
              ? 'Solid fill replaces the pixels completely. Use it for passwords, numbers and faces. Drag over the area to apply.'
              : 'Blur and pixelate reduce detail but are not guaranteed secure; some can be partly reversed. Use a solid fill for anything sensitive.'}{' '}
            Redaction replaces the pixels on the photo layer and cannot be undone after you export or save.
          </Banner>
        </>
      )}
    </div>
  );

  const propsPanel = selected && (
    <div className="panel stack">
      <h2 className="panel-title">Properties: {selected.name}</h2>
      <Field label="Layer name">{(id) => <input id={id} className="input" value={selected.name} onChange={(e) => patchLayer(selected.id, { name: e.target.value })} />}</Field>
      {selected.kind !== 'adjust' && (
        <div className="grid-2">
          <Field label="X (px)">{(id) => <input id={id} className="input tabular" type="number" value={Math.round(selected.x)} onChange={(e) => patchLayer(selected.id, { x: Number(e.target.value) || 0 })} />}</Field>
          <Field label="Y (px)">{(id) => <input id={id} className="input tabular" type="number" value={Math.round(selected.y)} onChange={(e) => patchLayer(selected.id, { y: Number(e.target.value) || 0 })} />}</Field>
        </div>
      )}
      <SliderField label="Opacity" value={Math.round(selected.opacity * 100)} onChange={(v) => patchLayer(selected.id, { opacity: v / 100 })} min={0} max={100} unit="%" />
      <Field label="Blend mode">
        {(id) => <select id={id} className="select" value={selected.blend} onChange={(e) => patchLayer(selected.id, { blend: e.target.value })}>{BLENDS.map((b) => <option key={b} value={b}>{b === 'source-over' ? 'Normal' : b}</option>)}</select>}
      </Field>
      {selected.kind === 'text' && (
        <>
          <Field label="Text">{(id) => <textarea id={id} className="textarea" rows={3} dir={selected.rtl ? 'rtl' : 'ltr'} value={selected.text} onChange={(e) => patchLayer(selected.id, { text: e.target.value })} />}</Field>
          <div className="grid-2">
            <Field label="Font">{(id) => <select id={id} className="select" value={selected.fontFamily} onChange={(e) => patchLayer(selected.id, { fontFamily: e.target.value })}>{FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>}</Field>
            <Field label="Alignment">{(id) => <select id={id} className="select" value={selected.align} onChange={(e) => patchLayer(selected.id, { align: e.target.value })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select>}</Field>
          </div>
          <SliderField label="Font size" value={selected.fontSize} onChange={(v) => patchLayer(selected.id, { fontSize: v })} min={8} max={400} unit="px" />
          <div className="row">
            <Field label="Color">{(id) => <input id={id} className={styles.swatch} type="color" value={selected.color} onChange={(e) => patchLayer(selected.id, { color: e.target.value })} />}</Field>
            <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={selected.bold} onChange={(e) => patchLayer(selected.id, { bold: e.target.checked })} /> Bold</label>
            <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={selected.italic} onChange={(e) => patchLayer(selected.id, { italic: e.target.checked })} /> Italic</label>
            <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={selected.rtl} onChange={(e) => patchLayer(selected.id, { rtl: e.target.checked })} /> Right to left</label>
          </div>
          <p className="hint" style={{ margin: 0 }}>Uses system fonts. If a glyph is missing on your device it will show as a box.</p>
        </>
      )}
      {selected.kind === 'shape' && (
        <div className="row">
          <Field label="Stroke">{(id) => <input id={id} className={styles.swatch} type="color" value={selected.stroke} onChange={(e) => patchLayer(selected.id, { stroke: e.target.value })} />}</Field>
          {(selected.shape === 'rect' || selected.shape === 'ellipse') && (
            <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={!!selected.fill} onChange={(e) => patchLayer(selected.id, { fill: e.target.checked ? selected.stroke : null })} /> Filled</label>
          )}
          <SliderField label="Stroke width" value={selected.strokeWidth} onChange={(v) => patchLayer(selected.id, { strokeWidth: v })} min={0} max={60} unit="px" />
        </div>
      )}
      {selected.kind === 'step' && <Field label="Number">{(id) => <input id={id} className="input" type="number" min={1} value={selected.n} onChange={(e) => patchLayer(selected.id, { n: Math.max(1, Number(e.target.value) || 1) })} />}</Field>}
      {selected.kind === 'adjust' && (
        <>
          {adjustSliders(selected.params, (p) => patchAdjust(selected.id, p), true)}
          {filterGrid(selected.params, (p) => patchAdjust(selected.id, p))}
          <button type="button" className="btn sm" onClick={() => autoLevelsFor(selected.id)}>Auto levels</button>
        </>
      )}
    </div>
  );

  const layersPanel = (
    <div className="panel stack">
      <h2 className="panel-title">Layers ({base.layers.length})</h2>
      <ul className={styles.list} aria-label="Layers, top first">
        {[...base.layers].reverse().map((l) => {
          const idx = base.layers.findIndex((x) => x.id === l.id);
          return (
            <li key={l.id} className={styles.layerRow} data-active={l.id === selectedId}>
              <button type="button" className="btn ghost sm" aria-pressed={l.visible} aria-label={`${l.visible ? 'Hide' : 'Show'} ${l.name}`} onClick={() => commit(updateLayer(base, l.id, { visible: !l.visible }), `${l.visible ? 'Hide' : 'Show'} ${l.name}`)}>{l.visible ? 'On' : 'Off'}</button>
              <button type="button" className={styles.layerName} aria-current={l.id === selectedId} onClick={() => { setSelectedId(l.id); if (tool !== 'select' && mode === 'advanced') setTool('select'); }}>{l.name} <span className="faint">({l.kind})</span></button>
              <button type="button" className="btn ghost sm" aria-pressed={l.locked} aria-label={`${l.locked ? 'Unlock' : 'Lock'} ${l.name}`} onClick={() => commit(updateLayer(base, l.id, { locked: !l.locked }), `${l.locked ? 'Unlock' : 'Lock'} ${l.name}`)}>{l.locked ? 'Locked' : 'Lock'}</button>
              <button type="button" className="btn ghost sm" aria-label={`Move ${l.name} up`} disabled={idx === base.layers.length - 1} onClick={() => commit(reorderLayer(base, l.id, idx + 1), `Move ${l.name} up`)}>Up</button>
              <button type="button" className="btn ghost sm" aria-label={`Move ${l.name} down`} disabled={idx === 0} onClick={() => commit(reorderLayer(base, l.id, idx - 1), `Move ${l.name} down`)}>Down</button>
            </li>
          );
        })}
        {base.layers.length === 0 && <li className="hint">No layers yet. Pick a tool and draw, or add an image.</li>}
      </ul>
      <div className="row">
        <button type="button" className="btn sm" onClick={() => addInput.current?.click()}>Add image</button>
        <button type="button" className="btn sm" onClick={addAdjustmentLayer}>Add adjustment</button>
        <button type="button" className="btn sm" disabled={!selected} onClick={() => selected && commit(duplicateLayer(base, selected.id), `Duplicate ${selected.name}`)}>Duplicate</button>
        <button type="button" className="btn sm danger" disabled={!selected} onClick={() => { if (selected) { commit(removeLayer(base, selected.id), `Delete ${selected.name}`); setSelectedId(null); } }}>Delete</button>
        <button type="button" className="btn sm" disabled={base.layers.length < 2} onClick={() => setConfirmFlatten(true)}>Flatten</button>
      </div>
      <input ref={addInput} type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addImageLayer(f); e.target.value = ''; }} />
      {totalPx > 150e6 && <Banner kind="warn">These layers hold {(totalPx / 1e6).toFixed(0)} megapixels in total. Remove or flatten layers to avoid running out of memory.</Banner>}
    </div>
  );

  const historyPanel = (
    <div className="panel stack">
      <h2 className="panel-title">History</h2>
      <ul className={styles.list} aria-label="History, oldest first">
        {hist.entries.map((e, i) => (
          <li key={i}>
            <button type="button" className={styles.histRow} aria-current={i === hist.index} data-future={i > hist.index} onClick={() => setHist(jump(hist, i))}>{i + 1}. {e.label}</button>
          </li>
        ))}
      </ul>
      {hist.dropped > 0 && <p className="hint" style={{ margin: 0 }}>The oldest {hist.dropped} steps were dropped to save memory (the last {hist.limit} are kept).</p>}
    </div>
  );

  const exportPanel = (
    <div className="panel stack">
      <h2 className="panel-title">Export</h2>
      <SegmentedControl<Format> label="Format" value={fmt} onChange={setFmt} options={[{ id: 'png', label: 'PNG' }, { id: 'jpeg', label: 'JPG' }, { id: 'webp', label: 'WebP' }]} />
      {fmt !== 'png' && <SliderField label="Quality" value={quality} onChange={setQuality} min={10} max={100} unit="%" />}
      <SliderField label="Scale" value={exportScale} onChange={setExportScale} min={10} max={200} unit="%" />
      <p className="hint" style={{ margin: 0 }}>Output {Math.round(base.width * exportScale / 100)} x {Math.round(base.height * exportScale / 100)} px. Layers are flattened. Metadata (EXIF, GPS) is not carried over.</p>
      {fmt === 'jpeg' && <Field label="Fill transparent areas with">{(id) => <input id={id} className={styles.swatch} type="color" value={jpgBg} onChange={(e) => setJpgBg(e.target.value)} />}</Field>}
      <div className="row">
        <button type="button" className="btn primary" disabled={!!busy} onClick={() => void doExport()}>Download</button>
        <button type="button" className="btn" disabled={!!busy} onClick={() => void doCopy()}>Copy PNG</button>
        {mode !== 'basic' && <button type="button" className="btn" onClick={saveProject}>Save project</button>}
      </div>
      {lastExport && <p className="hint" role="status" style={{ margin: 0 }}>Last export: {lastExport}</p>}
    </div>
  );

  // ---- layout ------------------------------------------------------------------------------
  const toolButtons = (
    <div className={mode === 'annotate' ? styles.toolsRow : styles.tools} role="toolbar" aria-label="Tools">
      {TOOLS[mode].map((t) => (
        <button key={t} type="button" className={styles.tool} aria-pressed={tool === t} onClick={() => setTool(t)}>{TOOL_LABEL[t]}</button>
      ))}
    </div>
  );

  const side = (
    <div className={styles.side}>
      {mode === 'basic' && basicPanel}
      {mode === 'advanced' && (
        <>
          {showCrop && cropPanel}
          {tool !== 'crop' && tool !== 'select' && toolOptions}
          {layersPanel}
          {propsPanel}
          {historyPanel}
        </>
      )}
      {mode === 'annotate' && (
        <>
          {tool !== 'select' && toolOptions}
          {propsPanel}
        </>
      )}
      {exportPanel}
    </div>
  );

  const layout = mode === 'advanced' ? '' : styles.noTools;

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <SegmentedControl<Mode> label="Editor mode" value={mode} onChange={switchMode} options={[{ id: 'basic', label: 'Basic' }, { id: 'advanced', label: 'Advanced' }, { id: 'annotate', label: 'Annotate' }]} />
        <div className="row">
          <button type="button" className="btn sm" onClick={doUndo} disabled={!canUndo(hist)} aria-label="Undo">Undo</button>
          <button type="button" className="btn sm" onClick={doRedo} disabled={!canRedo(hist)} aria-label="Redo">Redo</button>
          <button type="button" className="btn sm" onClick={() => setZoom('fit')} aria-pressed={zoom === 'fit'}>Fit</button>
          <button type="button" className="btn sm" onClick={() => setZoom(1)}>100%</button>
          <button type="button" className="btn sm icon" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.05, (z === 'fit' ? (stageRef.current ? stageRef.current.clientWidth / base.width : 1) : z) / 1.25))}>-</button>
          <button type="button" className="btn sm icon" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(8, (z === 'fit' ? (stageRef.current ? stageRef.current.clientWidth / base.width : 1) : z) * 1.25))}>+</button>
          <button type="button" className="btn sm" onClick={() => guarded(() => { setHist(null); bitmaps.current = new Map(); })}>Close image</button>
        </div>
      </div>

      {error && <Banner kind="error" onDismiss={() => setError(null)}>{error}</Banner>}
      {busy && <ProgressBar label={`${busy}…`} />}
      {mode === 'advanced' && narrow && <Banner kind="warn">Advanced editing needs a pointer and a wide screen. On phones, Basic and Annotate work best; Advanced has a reduced toolbar here.</Banner>}
      {mode === 'advanced' && <Banner kind="info">Drawing tools are pointer-based. Keyboard alternatives: select a layer in the Layers panel, then use arrow keys to nudge it (Shift for 10 px) and the Properties fields for exact values. Basic mode is fully keyboard operable.</Banner>}
      {mode === 'annotate' && toolButtons}

      <div className={`${styles.workspace} ${layout}`}>
        {mode === 'advanced' && toolButtons}
        <div className={styles.canvasWrap} ref={wrapRef}>
          <div
            ref={stageRef}
            className={`${styles.stage} ${tool === 'select' ? styles.selectCursor : ''}`}
            style={stageStyle}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <canvas ref={canvasRef} role="img" aria-label={`Editing canvas, ${base.width} by ${base.height} pixels, ${base.layers.length} layers`} style={{ width: '100%', height: 'auto' }} />
            {showCrop && cropRect && !dragRect && <div className={styles.overlay} style={box(cropRect)} />}
            {dragRect && <div className={styles.overlay} style={box(dragRect)} />}
            {selBounds && !drag.current && <div className={styles.selBox} style={box(selBounds)} />}
          </div>
        </div>
        {side}
      </div>

      <p className="hint" style={{ margin: 0 }} aria-live="polite">{announce}</p>
      <details>
        <summary className="muted">Keyboard shortcuts and limits</summary>
        <ul className="muted">
          <li>V move, T text, C crop. Ctrl or Cmd + Z undo, Shift + Z or Y redo. Delete removes the selected layer. Arrow keys nudge (Shift for 10 px).</li>
          <li>Ctrl + mouse wheel zooms. Shift while dragging a box or oval keeps it square.</li>
          <li>The preview is drawn at up to 2048 px on the long side for speed; exports are rendered at full resolution. Images over 50 megapixels are downscaled on open.</li>
          <li>Pixelate and blur are not guaranteed secure. Use solid fill for sensitive data.</li>
        </ul>
      </details>

      <ConfirmDialog
        open={confirmFlatten}
        title="Flatten all layers?"
        message="Layers, adjustments and the background are merged into a single image. This discards the underlying layers, which also removes any unredacted pixels under your redactions. You can still undo until you export or save."
        confirmLabel="Flatten"
        onConfirm={() => { setConfirmFlatten(false); flattenDoc(); }}
        onCancel={() => setConfirmFlatten(false)}
      />
      <ConfirmDialog
        open={!!pendingReplace}
        title="Discard unsaved edits?"
        message="You have edits that were not exported or saved. Opening something else will discard them."
        confirmLabel="Discard and continue"
        onConfirm={() => { const fn = pendingReplace; setPendingReplace(null); fn?.(); }}
        onCancel={() => setPendingReplace(null)}
      />
    </div>
  );
}

