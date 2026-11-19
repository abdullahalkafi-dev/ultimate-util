import { describe, expect, it } from 'vitest';
import { applyAdjust, autoLevels, curveLut, defaultParams, isIdentity, toneLut } from './adjust';
import { applyRatio, centeredRect, clampRect, fitToPixelBudget, rectFromDrag, resizeDims } from './crop';
import { canRedo, canUndo, createHistory, current, jump, push, redo, undo } from './history';
import { addLayer, baseLayer, duplicateLayer, emptyDoc, hitTest, MAX_LAYERS, nudgeLayer, removeLayer, reorderLayer, updateLayer, type Doc, type ShapeLayer } from './layers';
import { parseProject, ProjectError, serializeProject, PROJECT_VERSION } from './project';
import { blur, fillRect, minBlock, minBlurRadius, pixelate, redact, type Pixels } from './redact';

const rect = (name: string, x: number, y: number, w: number, h: number): ShapeLayer => ({
  ...baseLayer(name, x, y), kind: 'shape', shape: 'rect', w, h, stroke: '#f00', fill: null, strokeWidth: 2,
});

function noise(w: number, h: number): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    const v = (i * 7919) % 251;
    data[i] = v; data[i + 1] = (v * 3) % 256; data[i + 2] = (v * 5) % 256; data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}

describe('layers', () => {
  it('adds, reorders, hides and removes without mutating', () => {
    const d0 = emptyDoc(100, 100);
    const a = rect('A', 0, 0, 10, 10), b = rect('B', 0, 0, 10, 10);
    const d1 = addLayer(addLayer(d0, a), b);
    expect(d0.layers).toHaveLength(0);
    expect(reorderLayer(d1, b.id, 0).layers.map((l) => l.name)).toEqual(['B', 'A']);
    expect(reorderLayer(d1, a.id, 99).layers.map((l) => l.name)).toEqual(['B', 'A']);
    expect(updateLayer(d1, a.id, { visible: false }).layers[0]?.visible).toBe(false);
    expect(removeLayer(d1, a.id).layers).toHaveLength(1);
    expect(duplicateLayer(d1, a.id).layers.map((l) => l.name)).toEqual(['A', 'A copy', 'B']);
  });
  it('caps the layer count', () => {
    let d: Doc = emptyDoc(10, 10);
    for (let i = 0; i < MAX_LAYERS; i++) d = addLayer(d, rect(`L${i}`, 0, 0, 1, 1));
    expect(() => addLayer(d, rect('x', 0, 0, 1, 1))).toThrow();
  });
  it('hit tests topmost visible unlocked layer and nudges', () => {
    const a = rect('A', 0, 0, 50, 50), b = rect('B', 10, 10, 50, 50);
    let d = addLayer(addLayer(emptyDoc(100, 100), a), b);
    expect(hitTest(d, 20, 20)?.name).toBe('B');
    d = updateLayer(d, b.id, { locked: true });
    expect(hitTest(d, 20, 20)?.name).toBe('A');
    expect(hitTest(d, 95, 95)).toBeUndefined();
    expect(nudgeLayer(d, a.id, 5, -3).layers[0]).toMatchObject({ x: 5, y: -3 });
    expect(nudgeLayer(d, b.id, 5, 5).layers[1]).toMatchObject({ x: 10, y: 10 });
  });
});

describe('history', () => {
  it('supports undo, redo, jump and discards the redo branch', () => {
    let h = createHistory(0);
    h = push(h, 1, 'one'); h = push(h, 2, 'two');
    expect(current(undo(h))).toBe(1);
    expect(canRedo(undo(h))).toBe(true);
    expect(current(redo(undo(h)))).toBe(2);
    expect(current(jump(h, 0))).toBe(0);
    const branch = push(undo(h), 9, 'nine');
    expect(canRedo(branch)).toBe(false);
    expect(branch.entries.map((e) => e.state)).toEqual([0, 1, 9]);
    expect(canUndo(createHistory(0))).toBe(false);
  });
  it('keeps at least 50 steps and counts dropped ones', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 80; i++) h = push(h, i, `s${i}`);
    expect(h.entries.length).toBe(50);
    expect(h.dropped).toBe(31);
    expect(current(h)).toBe(80);
  });
  it('coalesces rapid edits with the same key', () => {
    let h = createHistory(0);
    h = push(h, 1, 'a', { key: 'k', now: 1000 });
    h = push(h, 2, 'a', { key: 'k', now: 1200 });
    expect(h.entries).toHaveLength(2);
    h = push(h, 3, 'a', { key: 'k', now: 5000 });
    expect(h.entries).toHaveLength(3);
  });
});

describe('crop math', () => {
  it('clamps rects into the image', () => {
    expect(clampRect({ x: -5, y: 90, w: 50, h: 50 }, 100, 100)).toEqual({ x: 0, y: 50, w: 50, h: 50 });
    expect(clampRect({ x: 0, y: 0, w: 500, h: 0 }, 100, 80)).toEqual({ x: 0, y: 0, w: 100, h: 1 });
  });
  it('builds centered ratio rects', () => {
    expect(centeredRect(1, 400, 300)).toEqual({ x: 50, y: 0, w: 300, h: 300 });
    expect(centeredRect(16 / 9, 1600, 1600)).toMatchObject({ w: 1600, h: 900, y: 350 });
    expect(centeredRect(null, 10, 5)).toEqual({ x: 0, y: 0, w: 10, h: 5 });
  });
  it('applies ratio and drag with lock', () => {
    expect(applyRatio({ x: 0, y: 0, w: 200, h: 50 }, 2, 300, 300)).toMatchObject({ w: 200, h: 100 });
    const r = rectFromDrag(10, 10, 110, 40, 1, 200, 200);
    expect(r.w).toBe(r.h);
    expect(rectFromDrag(50, 50, -20, 500, null, 100, 100)).toEqual({ x: 0, y: 50, w: 50, h: 50 });
  });
  it('resizes keeping aspect ratio', () => {
    expect(resizeDims(4000, 3000, { w: 1200 })).toEqual({ w: 1200, h: 900 });
    expect(resizeDims(4000, 3000, { h: 300 })).toEqual({ w: 400, h: 300 });
    expect(resizeDims(4000, 3000, { w: 100, h: 50 }, false)).toEqual({ w: 100, h: 50 });
    expect(resizeDims(10, 10, { w: NaN })).toEqual({ w: 10, h: 10 });
    expect(fitToPixelBudget(10000, 10000, 25e6)).toBeCloseTo(0.5, 2);
  });
});

describe('adjustments', () => {
  it('identity leaves pixels alone', () => {
    const p = defaultParams();
    expect(isIdentity(p)).toBe(true);
    const d = new Uint8ClampedArray([10, 20, 30, 255]);
    applyAdjust(d, p);
    expect(Array.from(d)).toEqual([10, 20, 30, 255]);
  });
  it('brightness and exposure lighten, contrast spreads', () => {
    expect(toneLut({ ...defaultParams(), brightness: 50 })[100]).toBeGreaterThan(100);
    expect(toneLut({ ...defaultParams(), exposure: 1 })[60]).toBe(120);
    const c = toneLut({ ...defaultParams(), contrast: 60 });
    expect(c[200]).toBeGreaterThan(200);
    expect(c[50]).toBeLessThan(50);
  });
  it('desaturates to grey at -100 and keeps alpha', () => {
    const d = new Uint8ClampedArray([200, 50, 50, 77]);
    applyAdjust(d, { ...defaultParams(), saturation: -100 });
    expect(d[0]).toBe(d[1]);
    expect(d[1]).toBe(d[2]);
    expect(d[3]).toBe(77);
  });
  it('filters blend by amount', () => {
    const full = new Uint8ClampedArray([200, 100, 50, 255]);
    applyAdjust(full, { ...defaultParams(), filter: 'invert', filterAmount: 100 });
    expect(Array.from(full)).toEqual([55, 155, 205, 255]);
    const none = new Uint8ClampedArray([200, 100, 50, 255]);
    applyAdjust(none, { ...defaultParams(), filter: 'invert', filterAmount: 0 });
    expect(Array.from(none)).toEqual([200, 100, 50, 255]);
  });
  it('levels clip black and white points', () => {
    const l = toneLut({ ...defaultParams(), levels: { black: 50, white: 200, gamma: 1 } });
    expect(l[50]).toBe(0);
    expect(l[200]).toBe(255);
  });
  it('curve LUT passes through points and is monotone', () => {
    const lut = curveLut([{ x: 0, y: 0 }, { x: 64, y: 100 }, { x: 192, y: 180 }, { x: 255, y: 255 }]);
    expect(lut[64]).toBe(100);
    expect(lut[192]).toBe(180);
    for (let i = 1; i < 256; i++) expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1] as number);
    expect(curveLut([{ x: 0, y: 0 }, { x: 255, y: 255 }])[128]).toBe(128);
  });
  it('auto levels finds the used range', () => {
    const d = new Uint8ClampedArray(400);
    for (let i = 0; i < 100; i++) { const v = 60 + (i % 100); d.set([v, v, v, 255], i * 4); }
    const r = autoLevels(d, 1);
    expect(r.black).toBeGreaterThanOrEqual(60);
    expect(r.white).toBeLessThanOrEqual(159);
  });
});

describe('redaction', () => {
  it('solid fill replaces every pixel in the region only', () => {
    const img = noise(20, 20);
    const before = Uint8ClampedArray.from(img.data);
    fillRect(img, { x: 5, y: 5, w: 5, h: 5 });
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
      const i = (y * 20 + x) * 4;
      const inside = x >= 5 && x < 10 && y >= 5 && y < 10;
      if (inside) expect([img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]).toEqual([0, 0, 0, 255]);
      else expect(img.data[i]).toBe(before[i]);
    }
  });
  it('pixelate makes blocks uniform and changes the source', () => {
    const img = noise(64, 64);
    const before = Uint8ClampedArray.from(img.data);
    pixelate(img, { x: 0, y: 0, w: 32, h: 32 }, 8);
    expect(img.data[0]).toBe(img.data[4 * 7]);
    expect(img.data[0]).toBe(img.data[(7 * 64 + 7) * 4]);
    expect(Array.from(img.data.slice(0, 64))).not.toEqual(Array.from(before.slice(0, 64)));
    expect(img.data[(40 * 64 + 40) * 4]).toBe(before[(40 * 64 + 40) * 4]);
  });
  it('blur averages a sharp edge', () => {
    const img: Pixels = { data: new Uint8ClampedArray(32 * 4), width: 32, height: 1 };
    for (let x = 0; x < 32; x++) img.data.set([x < 16 ? 0 : 255, 0, 0, 255], x * 4);
    blur(img, { x: 0, y: 0, w: 32, h: 1 }, 6);
    expect(img.data[14 * 4]).toBeGreaterThan(0);
    expect(img.data[14 * 4]).toBeLessThan(255);
  });
  it('enforces minimum strengths', () => {
    expect(minBlock(4000, 3000)).toBe(50);
    expect(minBlock(200, 100)).toBe(8);
    expect(minBlurRadius(120, 100)).toBe(12);
    const img = noise(100, 100);
    expect(redact(img, { x: 0, y: 0, w: 50, h: 50 }, 'pixelate', 1)).toBe(8);
    expect(redact(img, { x: 0, y: 0, w: 50, h: 50 }, 'blur', 1)).toBe(12);
    expect(redact(img, { x: 0, y: 0, w: 50, h: 50 }, 'solid', 1)).toBe(0);
  });
  it('ignores regions outside the image', () => {
    const img = noise(10, 10);
    const before = Uint8ClampedArray.from(img.data);
    fillRect(img, { x: 50, y: 50, w: 5, h: 5 });
    expect(img.data).toEqual(before);
  });
});

describe('project files', () => {
  const doc = addLayer(emptyDoc(64, 32, null), { ...baseLayer('Photo'), kind: 'image', bitmapId: 'b1', w: 64, h: 32 });
  it('round-trips layers exactly', () => {
    const text = serializeProject(doc, { b1: 'data:image/png;base64,AAAA', unused: 'x' });
    const back = parseProject(text);
    expect(back.doc).toEqual(doc);
    expect(Object.keys(back.images)).toEqual(['b1']);
  });
  it('refuses newer versions, junk and missing pixels', () => {
    const text = JSON.parse(serializeProject(doc, { b1: 'data:' }));
    expect(() => parseProject(JSON.stringify({ ...text, version: PROJECT_VERSION + 1 }))).toThrow(/newer version/);
    expect(() => parseProject('nope')).toThrow(ProjectError);
    expect(() => parseProject('{"kind":"x"}')).toThrow(ProjectError);
    expect(() => parseProject(JSON.stringify({ ...text, images: {} }))).toThrow(/missing the pixels/);
  });
});
