/** Editing model: an immutable document made of a layer stack (bottom first). No DOM access. */
import type { AdjustParams } from './adjust';

export type Blend = 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
export const BLENDS: Blend[] = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];

interface Base {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
  blend: Blend;
  x: number;
  y: number;
}
export interface ImageLayer extends Base { kind: 'image'; bitmapId: string; w: number; h: number }
export interface TextLayer extends Base {
  kind: 'text'; text: string; fontSize: number; color: string; fontFamily: string;
  bold: boolean; italic: boolean; align: 'left' | 'center' | 'right'; rtl: boolean;
}
export interface ShapeLayer extends Base {
  kind: 'shape'; shape: 'rect' | 'ellipse' | 'line' | 'arrow';
  /** Size; for line and arrow the segment runs from (0,0) to (w,h) and w/h may be negative. */
  w: number; h: number; stroke: string; fill: string | null; strokeWidth: number;
}
export interface PenLayer extends Base { kind: 'pen'; points: number[]; color: string; size: number; highlight: boolean }
export interface StepLayer extends Base { kind: 'step'; n: number; color: string; radius: number }
export interface AdjustLayer extends Base { kind: 'adjust'; params: AdjustParams }
export type Layer = ImageLayer | TextLayer | ShapeLayer | PenLayer | StepLayer | AdjustLayer;

export interface Doc {
  width: number;
  height: number;
  /** Fill under all layers; null = transparent. */
  background: string | null;
  layers: Layer[];
}

export const MAX_LAYERS = 50;

let counter = 0;
export function newId(prefix = 'l'): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

export function baseLayer(name: string, x = 0, y = 0): Omit<ImageLayer, 'kind' | 'bitmapId' | 'w' | 'h'> {
  return { id: newId(), name, visible: true, locked: false, opacity: 1, blend: 'source-over', x, y };
}

export function emptyDoc(width: number, height: number, background: string | null = '#ffffff'): Doc {
  return { width, height, background, layers: [] };
}

export function findLayer(doc: Doc, id: string | null): Layer | undefined {
  return id ? doc.layers.find((l) => l.id === id) : undefined;
}

export function addLayer(doc: Doc, layer: Layer, index?: number): Doc {
  if (doc.layers.length >= MAX_LAYERS) throw new Error(`A document can hold at most ${MAX_LAYERS} layers.`);
  const layers = doc.layers.slice();
  layers.splice(index ?? layers.length, 0, layer);
  return { ...doc, layers };
}

export function removeLayer(doc: Doc, id: string): Doc {
  return { ...doc, layers: doc.layers.filter((l) => l.id !== id) };
}

export function updateLayer(doc: Doc, id: string, patch: Record<string, unknown>): Doc {
  return { ...doc, layers: doc.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) };
}

/** Moves a layer to a new index (0 = bottom). Out of range indexes are clamped. */
export function reorderLayer(doc: Doc, id: string, toIndex: number): Doc {
  const from = doc.layers.findIndex((l) => l.id === id);
  if (from < 0) return doc;
  const target = Math.max(0, Math.min(doc.layers.length - 1, toIndex));
  if (target === from) return doc;
  const layers = doc.layers.slice();
  const [moved] = layers.splice(from, 1);
  if (!moved) return doc;
  layers.splice(target, 0, moved);
  return { ...doc, layers };
}

export function duplicateLayer(doc: Doc, id: string): Doc {
  const i = doc.layers.findIndex((l) => l.id === id);
  const src = doc.layers[i];
  if (!src) return doc;
  const copy = { ...src, id: newId(), name: `${src.name} copy`, x: src.x + 10, y: src.y + 10 } as Layer;
  return addLayer(doc, copy, i + 1);
}

export function nudgeLayer(doc: Doc, id: string, dx: number, dy: number): Doc {
  const l = findLayer(doc, id);
  if (!l || l.locked) return doc;
  return updateLayer(doc, id, { x: l.x + dx, y: l.y + dy });
}

export interface Bounds { x: number; y: number; w: number; h: number }

/** Approximate bounds in document pixels (text width is estimated, good enough for hit testing). */
export function layerBounds(l: Layer, doc: Doc): Bounds {
  switch (l.kind) {
    case 'image': return { x: l.x, y: l.y, w: l.w, h: l.h };
    case 'text': {
      const lines = l.text.split('\n');
      const longest = Math.max(1, ...lines.map((s) => [...s].length));
      const w = longest * l.fontSize * 0.6;
      const h = lines.length * l.fontSize * 1.25;
      const x = l.align === 'center' ? l.x - w / 2 : l.align === 'right' ? l.x - w : l.x;
      return { x, y: l.y, w, h };
    }
    case 'shape': {
      const pad = l.strokeWidth / 2 + (l.shape === 'arrow' ? l.strokeWidth * 3 : 0);
      const x = Math.min(l.x, l.x + l.w) - pad;
      const y = Math.min(l.y, l.y + l.h) - pad;
      return { x, y, w: Math.abs(l.w) + pad * 2, h: Math.abs(l.h) + pad * 2 };
    }
    case 'pen': {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < l.points.length; i += 2) {
        const px = l.x + (l.points[i] ?? 0), py = l.y + (l.points[i + 1] ?? 0);
        minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      }
      if (!Number.isFinite(minX)) return { x: l.x, y: l.y, w: 0, h: 0 };
      return { x: minX - l.size / 2, y: minY - l.size / 2, w: maxX - minX + l.size, h: maxY - minY + l.size };
    }
    case 'step': return { x: l.x - l.radius, y: l.y - l.radius, w: l.radius * 2, h: l.radius * 2 };
    case 'adjust': return { x: 0, y: 0, w: doc.width, h: doc.height };
  }
}

/** Topmost visible, unlocked, non-adjustment layer under the point. */
export function hitTest(doc: Doc, px: number, py: number): Layer | undefined {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    if (!l || !l.visible || l.locked || l.kind === 'adjust') continue;
    const b = layerBounds(l, doc);
    const slop = 4;
    if (px >= b.x - slop && px <= b.x + b.w + slop && py >= b.y - slop && py <= b.y + b.h + slop) return l;
  }
  return undefined;
}

/** Total pixel budget across image layers; used for the memory warning. */
export function totalImagePixels(doc: Doc): number {
  return doc.layers.reduce((n, l) => (l.kind === 'image' ? n + l.w * l.h : n), 0);
}
