'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { InferenceSession } from 'onnxruntime-web';
import {
  Banner, DropZone, EmptyState, ErrorBanner, Field, Icon, ProgressBar, SegmentedControl, SliderField, StatTile, Tabs, useToast,
} from '@/components/ui';
import { downloadBlob, formatBytes, outputName, readFirstBytes, sniffType, zipFiles } from '@/lib/files';
import { classicalMask, decontaminate, DEFAULT_CLASSICAL, type ClassicalOptions, type RGB } from './classical';
import { applyMask, flattenOnColor, hexToRgb, maskToRgba } from './composite';
import { finishMask, maskCoverage, replayStrokes, type Stroke } from './mask';
import {
  contrastMask, isOnnxHeader, modelInputSize, NORMALIZATIONS, outputToMask, toNchw, upscaleMask,
} from './model';
import styles from './styles.module.css';

type EngineMode = 'classical' | 'onnx';
type ViewMode = 'result' | 'compare' | 'mask';
type BgMode = 'transparent' | 'solid' | 'blur' | 'gradient' | 'image';
type BrushMode = 'none' | 'keep' | 'erase' | 'pick';
type ExportFormat = 'png' | 'webp' | 'jpeg' | 'mask';
type NormKey = 'imagenet' | 'unit' | 'signed';

interface SourceItem {
  id: string;
  name: string;
  size: number;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  baseMask: Uint8Array;
  bgColor: RGB;
  strokes: Stroke[];
  redoStrokes: Stroke[];
}

interface CustomModelInfo {
  name: string;
  bytes: Uint8Array;
}

const ACCEPT_IMAGES = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];
const MAX_WORK_DIM = 1600;
const SOFT_FILE_BYTES = 30 * 1024 * 1024;
const DEFAULT_ONNX_PATH = '/models/background-removal.onnx';
const SWATCHES = ['#ffffff', '#0f172a', '#f1f5f9', '#2446f0', '#16a34a', '#e11d48'];

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

async function decodeImageToWorkRgba(file: File): Promise<{ width: number; height: number; rgba: Uint8ClampedArray }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Could not decode "${file.name}".`));
    });
    const scale = Math.min(1, MAX_WORK_DIM / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = makeCanvas(width, height);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is unavailable.');
    ctx.drawImage(img, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    return { width, height, rgba: new Uint8ClampedArray(data) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function createSampleFile(): Promise<File> {
  const c = makeCanvas(640, 480);
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 640, 480);
  grad.addColorStop(0, '#eef2ff');
  grad.addColorStop(1, '#dbeafe');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 640, 480);

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.roundRect(215, 220, 210, 215, 48);
  ctx.fill();

  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(320, 155, 72, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(265, 275, 110, 74, 16);
  ctx.fill();

  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SAMPLE', 320, 320);

  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Failed to generate sample image.');
  return new File([blob], 'sample-subject.png', { type: 'image/png' });
}

async function renderBlurredBackdrop(
  sourceRgba: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
): Promise<Uint8ClampedArray> {
  const src = makeCanvas(w, h);
  src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(sourceRgba), w, h), 0, 0);
  const out = makeCanvas(w, h);
  const octx = out.getContext('2d')!;
  octx.filter = `blur(${Math.max(1, radius)}px)`;
  octx.drawImage(src, 0, 0);
  octx.filter = 'none';
  return new Uint8ClampedArray(octx.getImageData(0, 0, w, h).data);
}

function renderGradientBackdrop(w: number, h: number, hexA: string, hexB: string): Uint8ClampedArray {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, hexA);
  grad.addColorStop(1, hexB);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  return new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data);
}

function compositeOverBackdrop(fg: Uint8ClampedArray, backdrop: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(fg.length);
  for (let i = 0; i < fg.length; i += 4) {
    const a = (fg[i + 3] ?? 0) / 255;
    const inv = 1 - a;
    out[i] = Math.round((fg[i] ?? 0) * a + (backdrop[i] ?? 0) * inv);
    out[i + 1] = Math.round((fg[i + 1] ?? 0) * a + (backdrop[i + 1] ?? 0) * inv);
    out[i + 2] = Math.round((fg[i + 2] ?? 0) * a + (backdrop[i + 2] ?? 0) * inv);
    out[i + 3] = 255;
  }
  return out;
}

export default function BackgroundRemoverTool() {
  const toast = useToast();
  const [items, setItems] = useState<SourceItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [engine, setEngine] = useState<EngineMode>('classical');
  const [viewMode, setViewMode] = useState<ViewMode>('result');
  const [comparePct, setComparePct] = useState(50);

  const [classicalOpts, setClassicalOpts] = useState<ClassicalOptions>({ ...DEFAULT_CLASSICAL });
  const [useCustomBg, setUseCustomBg] = useState(false);

  const [edgeShift, setEdgeShift] = useState(0);
  const [featherPx, setFeatherPx] = useState(1);
  const [decontamStrength, setDecontamStrength] = useState(0.5);

  const [brushMode, setBrushMode] = useState<BrushMode>('none');
  const [brushRadius, setBrushRadius] = useState(22);
  const [brushHardness, setBrushHardness] = useState(0.75);

  const [bgMode, setBgMode] = useState<BgMode>('transparent');
  const [solidHex, setSolidHex] = useState('#ffffff');
  const [gradStart, setGradStart] = useState('#2446f0');
  const [gradEnd, setGradEnd] = useState('#ec4899');
  const [blurAmount, setBlurAmount] = useState(14);
  const [customBgPhoto, setCustomBgPhoto] = useState<{ name: string; rgba: Uint8ClampedArray; width: number; height: number } | null>(null);

  const [exportFormat, setExportFormat] = useState<ExportFormat>('png');
  const [exportQuality, setExportQuality] = useState(90);

  const [customModel, setCustomModel] = useState<CustomModelInfo | null>(null);
  const [modelStatus, setModelStatus] = useState<'idle' | 'checking' | 'missing' | 'ready' | 'running'>('idle');
  const [normKey, setNormKey] = useState<NormKey>('imagenet');
  const [onnxContrast, setOnnxContrast] = useState(0.35);
  const [onnxProvider, setOnnxProvider] = useState<'webgpu' | 'wasm' | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const sessionRef = useRef<InferenceSession | null>(null);
  const sessionKeyRef = useRef<string | null>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const beforeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const bgFileInputRef = useRef<HTMLInputElement | null>(null);
  const modelInputRef = useRef<HTMLInputElement | null>(null);

  const activeItem = useMemo(
    () => items.find((it) => it.id === activeId) ?? items[0] ?? null,
    [items, activeId],
  );

  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        void sessionRef.current.release();
        sessionRef.current = null;
      }
    };
  }, []);

  const ensureOnnxSession = useCallback(async (): Promise<InferenceSession> => {
    const key = customModel ? `custom:${customModel.name}:${customModel.bytes.byteLength}` : `url:${DEFAULT_ONNX_PATH}`;
    if (sessionRef.current && sessionKeyRef.current === key) return sessionRef.current;

    setModelStatus('checking');
    const ort = await import('onnxruntime-web');
    ort.env.wasm.wasmPaths = '/vendor/ort/';
    ort.env.wasm.numThreads = 1;

    let bytes: Uint8Array;
    if (customModel) {
      bytes = customModel.bytes;
    } else {
      const res = await fetch(DEFAULT_ONNX_PATH);
      if (!res.ok) {
        setModelStatus('missing');
        throw new Error('No ONNX weights found at /models/background-removal.onnx. Use Fast Cutout or load a local .onnx file.');
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (!isOnnxHeader(buf)) {
        setModelStatus('missing');
        throw new Error('Self-hosted ONNX file header looks invalid.');
      }
      bytes = buf;
    }

    if (sessionRef.current) {
      await sessionRef.current.release();
      sessionRef.current = null;
    }

    let created: InferenceSession;
    try {
      const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
      if (hasWebGpu) {
        try {
          created = await ort.InferenceSession.create(bytes, { executionProviders: ['webgpu'] });
          setOnnxProvider('webgpu');
        } catch {
          created = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
          setOnnxProvider('wasm');
        }
      } else {
        created = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
        setOnnxProvider('wasm');
      }
    } catch (e) {
      setModelStatus('missing');
      throw new Error(e instanceof Error ? e.message : 'Failed to initialize ONNX inference session.');
    }

    sessionRef.current = created;
    sessionKeyRef.current = key;
    setModelStatus('ready');
    return created;
  }, [customModel]);

  const computeMaskForItem = useCallback(
    async (
      rgba: Uint8ClampedArray,
      width: number,
      height: number,
      mode: EngineMode,
      opts: ClassicalOptions,
      usePinnedBg: boolean,
      pinnedBg?: RGB,
    ): Promise<{ mask: Uint8Array; bg: RGB }> => {
      if (mode === 'classical') {
        return classicalMask(rgba, width, height, {
          ...opts,
          bg: usePinnedBg ? pinnedBg : undefined,
        });
      }
      const session = await ensureOnnxSession();
      setModelStatus('running');
      const ort = await import('onnxruntime-web');
      const inputName = session.inputNames[0];
      if (!inputName) throw new Error('ONNX model exposes no input tensor.');
      const meta = session.inputMetadata[0];
      const rawShape = meta && meta.isTensor ? meta.shape : [];
      const targetSize = modelInputSize(rawShape, 320);

      const srcCanvas = makeCanvas(width, height);
      srcCanvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
      const dstCanvas = makeCanvas(targetSize.w, targetSize.h);
      const dctx = dstCanvas.getContext('2d')!;
      dctx.drawImage(srcCanvas, 0, 0, targetSize.w, targetSize.h);
      const resizedRgba = new Uint8ClampedArray(dctx.getImageData(0, 0, targetSize.w, targetSize.h).data);

      const norm = NORMALIZATIONS[normKey] ?? NORMALIZATIONS.imagenet!;
      const tensorData = toNchw(resizedRgba, targetSize.w, targetSize.h, norm);
      const inputTensor = new ort.Tensor('float32', tensorData, [1, 3, targetSize.h, targetSize.w]);
      const outputs = await session.run({ [inputName]: inputTensor });
      inputTensor.dispose();

      const outputNameKey = session.outputNames[0];
      const firstOut = outputNameKey ? outputs[outputNameKey] : Object.values(outputs)[0];
      if (!firstOut) throw new Error('ONNX model returned no output tensor.');
      const rawData = await firstOut.getData();
      const floatOut = rawData instanceof Float32Array ? rawData : Float32Array.from(rawData as ArrayLike<number>);
      firstOut.dispose();

      const lowMask = outputToMask(floatOut.subarray(0, targetSize.w * targetSize.h));
      const fullMask = upscaleMask(lowMask, targetSize.w, targetSize.h, width, height);
      const sharpened = contrastMask(fullMask, onnxContrast);
      setModelStatus('ready');
      const fallbackClass = classicalMask(rgba, width, height, opts);
      return { mask: sharpened, bg: fallbackClass.bg };
    },
    [ensureOnnxSession, normKey, onnxContrast],
  );

  const composeItemRgba = useCallback(
    async (item: SourceItem): Promise<{ resultRgba: Uint8ClampedArray; finishedMask: Uint8Array }> => {
      const stroked = replayStrokes(item.baseMask, item.width, item.height, item.strokes);
      const finishedMask = finishMask(stroked, item.width, item.height, { shift: edgeShift, feather: featherPx });
      const decontamRgba = decontaminate(item.rgba, finishedMask, item.bgColor, decontamStrength);
      const fgRgba = applyMask(decontamRgba, finishedMask);

      if (bgMode === 'transparent') {
        return { resultRgba: fgRgba, finishedMask };
      }
      if (bgMode === 'solid') {
        return { resultRgba: flattenOnColor(fgRgba, hexToRgb(solidHex)), finishedMask };
      }
      if (bgMode === 'blur') {
        const blurred = await renderBlurredBackdrop(item.rgba, item.width, item.height, blurAmount);
        return { resultRgba: compositeOverBackdrop(fgRgba, blurred), finishedMask };
      }
      if (bgMode === 'gradient') {
        const grad = renderGradientBackdrop(item.width, item.height, gradStart, gradEnd);
        return { resultRgba: compositeOverBackdrop(fgRgba, grad), finishedMask };
      }
      if (bgMode === 'image' && customBgPhoto) {
        const bgCanvas = makeCanvas(customBgPhoto.width, customBgPhoto.height);
        bgCanvas.getContext('2d')!.putImageData(
          new ImageData(new Uint8ClampedArray(customBgPhoto.rgba), customBgPhoto.width, customBgPhoto.height),
          0,
          0,
        );
        const fitCanvas = makeCanvas(item.width, item.height);
        const fctx = fitCanvas.getContext('2d')!;
        const scale = Math.max(item.width / customBgPhoto.width, item.height / customBgPhoto.height);
        const dw = customBgPhoto.width * scale;
        const dh = customBgPhoto.height * scale;
        fctx.drawImage(bgCanvas, (item.width - dw) / 2, (item.height - dh) / 2, dw, dh);
        const bgPixels = new Uint8ClampedArray(fctx.getImageData(0, 0, item.width, item.height).data);
        return { resultRgba: compositeOverBackdrop(fgRgba, bgPixels), finishedMask };
      }
      return { resultRgba: fgRgba, finishedMask };
    },
    [bgMode, blurAmount, customBgPhoto, decontamStrength, edgeShift, featherPx, gradEnd, gradStart, solidHex],
  );

  const rerunActiveBaseMask = useCallback(
    async (targetEngine: EngineMode, nextClassical: ClassicalOptions, pinned: boolean) => {
      if (!activeItem) return;
      setError(null);
      try {
        const { mask, bg } = await computeMaskForItem(
          activeItem.rgba,
          activeItem.width,
          activeItem.height,
          targetEngine,
          nextClassical,
          pinned,
          activeItem.bgColor,
        );
        setItems((prev) =>
          prev.map((it) => (it.id === activeItem.id ? { ...it, baseMask: mask, bgColor: bg } : it)),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Mask calculation failed.');
        if (targetEngine === 'onnx') {
          setEngine('classical');
        }
      }
    },
    [activeItem, computeMaskForItem],
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      setWarning(null);
      const loaded: SourceItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        setProgress(((i + 1) / files.length) * 100);
        try {
          const head = await readFirstBytes(file, 32);
          const sniffed = sniffType(head);
          if (sniffed && sniffed !== 'unknown' && !['png', 'jpeg', 'webp'].includes(sniffed)) {
            throw new Error(`Unsupported file signature (${sniffed}) in "${file.name}".`);
          }
          if (file.size > SOFT_FILE_BYTES) {
            setWarning(`Large image "${file.name}" (${formatBytes(file.size)}) scaled up to ${MAX_WORK_DIM}px max side for responsive editing.`);
          }
          const decoded = await decodeImageToWorkRgba(file);
          const { mask, bg } = await computeMaskForItem(
            decoded.rgba,
            decoded.width,
            decoded.height,
            engine,
            classicalOpts,
            false,
          );
          loaded.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            size: file.size,
            width: decoded.width,
            height: decoded.height,
            rgba: decoded.rgba,
            baseMask: mask,
            bgColor: bg,
            strokes: [],
            redoStrokes: [],
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : `Failed to process "${file.name}".`);
        }
      }
      setProgress(null);
      if (loaded.length > 0) {
        setItems((prev) => [...prev, ...loaded]);
        setActiveId((prev) => prev ?? loaded[0]?.id ?? null);
      }
    },
    [classicalOpts, computeMaskForItem, engine],
  );

  useEffect(() => {
    let cancelled = false;
    async function paint() {
      if (!activeItem) return;
      const before = beforeCanvasRef.current;
      if (before) {
        if (before.width !== activeItem.width || before.height !== activeItem.height) {
          before.width = activeItem.width;
          before.height = activeItem.height;
        }
        before.getContext('2d')?.putImageData(
          new ImageData(new Uint8ClampedArray(activeItem.rgba), activeItem.width, activeItem.height),
          0,
          0,
        );
      }

      const canvas = resultCanvasRef.current;
      if (!canvas) return;
      const { resultRgba, finishedMask } = await composeItemRgba(activeItem);
      if (cancelled) return;
      if (canvas.width !== activeItem.width || canvas.height !== activeItem.height) {
        canvas.width = activeItem.width;
        canvas.height = activeItem.height;
      }
      const displayPixels = viewMode === 'mask' ? maskToRgba(finishedMask) : resultRgba;
      canvas.getContext('2d')?.putImageData(
        new ImageData(new Uint8ClampedArray(displayPixels), activeItem.width, activeItem.height),
        0,
        0,
      );
    }
    void paint();
    return () => {
      cancelled = true;
    };
  }, [activeItem, composeItemRgba, viewMode]);

  const toCanvasPoint = (e: RPointerEvent<HTMLCanvasElement>): [number, number] | null => {
    const c = resultCanvasRef.current;
    if (!c || !activeItem) return null;
    const rect = c.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.max(0, Math.min(activeItem.width - 1, ((e.clientX - rect.left) / rect.width) * activeItem.width));
    const y = Math.max(0, Math.min(activeItem.height - 1, ((e.clientY - rect.top) / rect.height) * activeItem.height));
    return [x, y];
  };

  const handleCanvasPointerDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!activeItem || brushMode === 'none' || viewMode === 'compare') return;
    const pt = toCanvasPoint(e);
    if (!pt) return;
    if (brushMode === 'pick') {
      const ix = (Math.floor(pt[1]) * activeItem.width + Math.floor(pt[0])) * 4;
      const pickedBg: RGB = {
        r: activeItem.rgba[ix] ?? 0,
        g: activeItem.rgba[ix + 1] ?? 0,
        b: activeItem.rgba[ix + 2] ?? 0,
      };
      setUseCustomBg(true);
      const computed = classicalMask(activeItem.rgba, activeItem.width, activeItem.height, {
        ...classicalOpts,
        bg: pickedBg,
      });
      setItems((prev) =>
        prev.map((it) => (it.id === activeItem.id ? { ...it, baseMask: computed.mask, bgColor: pickedBg } : it)),
      );
      setBrushMode('none');
      toast('Backdrop color sampled from image.');
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    activeStrokeRef.current = {
      mode: brushMode,
      radius: brushRadius,
      hardness: brushHardness,
      points: [pt],
    };
  };

  const handleCanvasPointerMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (!activeStrokeRef.current) return;
    const pt = toCanvasPoint(e);
    if (!pt) return;
    activeStrokeRef.current.points.push(pt);
  };

  const handleCanvasPointerUp = () => {
    const finished = activeStrokeRef.current;
    if (!finished || !activeItem) return;
    activeStrokeRef.current = null;
    setItems((prev) =>
      prev.map((it) =>
        it.id === activeItem.id
          ? { ...it, strokes: [...it.strokes, finished], redoStrokes: [] }
          : it,
      ),
    );
  };

  const handleUndo = () => {
    if (!activeItem || activeItem.strokes.length === 0) return;
    const last = activeItem.strokes[activeItem.strokes.length - 1]!;
    setItems((prev) =>
      prev.map((it) =>
        it.id === activeItem.id
          ? { ...it, strokes: it.strokes.slice(0, -1), redoStrokes: [...it.redoStrokes, last] }
          : it,
      ),
    );
  };

  const handleRedo = () => {
    if (!activeItem || activeItem.redoStrokes.length === 0) return;
    const last = activeItem.redoStrokes[activeItem.redoStrokes.length - 1]!;
    setItems((prev) =>
      prev.map((it) =>
        it.id === activeItem.id
          ? { ...it, strokes: [...it.strokes, last], redoStrokes: it.redoStrokes.slice(0, -1) }
          : it,
      ),
    );
  };

  const exportItemToBlob = async (item: SourceItem): Promise<{ blob: Blob; filename: string }> => {
    const { resultRgba, finishedMask } = await composeItemRgba(item);
    const outCanvas = makeCanvas(item.width, item.height);
    const ctx = outCanvas.getContext('2d')!;
    let pixels = resultRgba;
    if (exportFormat === 'mask') {
      pixels = maskToRgba(finishedMask);
    } else if (exportFormat === 'jpeg' && bgMode === 'transparent') {
      pixels = flattenOnColor(resultRgba, { r: 255, g: 255, b: 255 });
    }
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), item.width, item.height), 0, 0);
    const mime = exportFormat === 'mask' ? 'image/png' : `image/${exportFormat}`;
    const ext = exportFormat === 'mask' ? 'png' : exportFormat === 'jpeg' ? 'jpg' : exportFormat;
    const blob = await new Promise<Blob | null>((r) => outCanvas.toBlob(r, mime, exportQuality / 100));
    if (!blob) throw new Error(`Could not encode "${item.name}".`);
    const suffix = exportFormat === 'mask' ? 'mask' : 'cutout';
    return { blob, filename: outputName(item.name, suffix, ext) };
  };

  const handleDownloadActive = async () => {
    if (!activeItem) return;
    try {
      const { blob, filename } = await exportItemToBlob(activeItem);
      downloadBlob(blob, filename);
      toast(`Saved ${filename}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
    }
  };

  const handleDownloadAllZip = async () => {
    if (items.length === 0) return;
    setError(null);
    const entries: { name: string; data: Uint8Array }[] = [];
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        setProgress(((i + 1) / items.length) * 100);
        const { blob, filename } = await exportItemToBlob(item);
        entries.push({ name: filename, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      const zipped = await zipFiles(entries);
      downloadBlob(zipped, 'cutouts.zip');
      toast(`Exported ${entries.length} files in cutouts.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch ZIP export failed.');
    } finally {
      setProgress(null);
    }
  };

  const handleCopyClipboard = async () => {
    if (!activeItem) return;
    try {
      const { resultRgba } = await composeItemRgba(activeItem);
      const c = makeCanvas(activeItem.width, activeItem.height);
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(resultRgba), activeItem.width, activeItem.height), 0, 0);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
      if (!blob || typeof ClipboardItem === 'undefined') {
        throw new Error('Clipboard image writing is unavailable in this browser.');
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Cutout PNG copied to clipboard.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not copy PNG.');
    }
  };

  const handleOnnxFilePick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      if (!isOnnxHeader(buf)) {
        setError(`"${file.name}" does not appear to be a binary ONNX protobuf file.`);
        return;
      }
      sessionKeyRef.current = null;
      if (sessionRef.current) {
        await sessionRef.current.release();
        sessionRef.current = null;
      }
      setCustomModel({ name: file.name, bytes: buf });
      setEngine('onnx');
      toast(`Loaded local ONNX model "${file.name}". Click Run ONNX to apply.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read .onnx model file.');
    }
  };

  const handleBgImagePick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const decoded = await decodeImageToWorkRgba(file);
      setCustomBgPhoto({ name: file.name, ...decoded });
      setBgMode('image');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to decode background image.');
    }
  };

  const coveragePct = useMemo(() => {
    if (!activeItem) return 0;
    const stroked = replayStrokes(activeItem.baseMask, activeItem.width, activeItem.height, activeItem.strokes);
    return Math.round(maskCoverage(stroked) * 100);
  }, [activeItem]);

  return (
    <div className="stack">
      <div className="row wrap">
        <div className="grow">
          <DropZone
            accept={ACCEPT_IMAGES}
            multiple
            title="Drop PNG, JPG, WebP or AVIF images"
            hint="Processed entirely in your browser — nothing leaves this device"
            onFiles={(files) => void handleFiles(files)}
          />
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => void createSampleFile().then((f) => handleFiles([f]))}
        >
          Try an example
        </button>
      </div>

      {progress !== null && <ProgressBar value={progress} label="Processing images…" />}
      {error && <ErrorBanner onDismiss={() => setError(null)}>{error}</ErrorBanner>}
      {warning && <Banner kind="warn">{warning}</Banner>}

      {items.length > 0 && (
        <div className={styles.queue} role="listbox" aria-label="Image queue">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              className={styles.queueItem}
              aria-pressed={activeItem?.id === it.id}
              onClick={() => setActiveId(it.id)}
            >
              <span>{it.name}</span>
              <span className="muted tabular">{it.width}×{it.height}</span>
            </button>
          ))}
          {items.length > 1 && (
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                setItems([]);
                setActiveId(null);
              }}
            >
              Clear queue
            </button>
          )}
        </div>
      )}

      {!activeItem ? (
        <EmptyState icon="wand" title="No image loaded yet">
          Drop an image above or click Try an example to run an instant cutout locally.
        </EmptyState>
      ) : (
        <div className={styles.workspace}>
          <div className={`panel stack ${styles.stagePanel}`}>
            <div className="row wrap">
              <SegmentedControl
                label="Preview mode"
                value={viewMode}
                onChange={setViewMode}
                options={[
                  { id: 'result', label: 'Cutout' },
                  { id: 'compare', label: 'Before / After' },
                  { id: 'mask', label: 'Mask' },
                ]}
              />
              <div className="row" style={{ marginLeft: 'auto' }}>
                <button
                  type="button"
                  className="btn sm"
                  aria-pressed={brushMode === 'keep'}
                  onClick={() => {
                    setViewMode('result');
                    setBrushMode((m) => (m === 'keep' ? 'none' : 'keep'));
                  }}
                >
                  Keep (+)
                </button>
                <button
                  type="button"
                  className="btn sm"
                  aria-pressed={brushMode === 'erase'}
                  onClick={() => {
                    setViewMode('result');
                    setBrushMode((m) => (m === 'erase' ? 'none' : 'erase'));
                  }}
                >
                  Erase (-)
                </button>
                <button
                  type="button"
                  className="btn sm"
                  aria-pressed={brushMode === 'pick'}
                  onClick={() => {
                    setViewMode('result');
                    setBrushMode((m) => (m === 'pick' ? 'none' : 'pick'));
                  }}
                >
                  Sample BG
                </button>
                <button
                  type="button"
                  className="btn sm"
                  disabled={activeItem.strokes.length === 0}
                  onClick={handleUndo}
                >
                  Undo
                </button>
                <button
                  type="button"
                  className="btn sm"
                  disabled={activeItem.redoStrokes.length === 0}
                  onClick={handleRedo}
                >
                  Redo
                </button>
              </div>
            </div>

            {viewMode === 'compare' && (
              <SliderField
                label="Split position"
                min={0}
                max={100}
                value={comparePct}
                onChange={setComparePct}
                unit="%"
              />
            )}

            <div className={`${styles.stageBox} ${bgMode === 'transparent' ? styles.checkerBg : ''}`}>
              {viewMode === 'compare' ? (
                <div className={styles.compareWrap}>
                  <canvas ref={beforeCanvasRef} className={styles.compareBase} aria-label="Original image" />
                  <div
                    className={styles.compareOverlay}
                    style={{ clipPath: `inset(0 ${100 - comparePct}% 0 0)` }}
                  >
                    <canvas ref={resultCanvasRef} aria-label="Cutout result" />
                  </div>
                  <div className={styles.compareHandle} style={{ left: `${comparePct}%` }} />
                </div>
              ) : (
                <>
                  <canvas ref={beforeCanvasRef} className="sr-only" aria-hidden="true" />
                  <canvas
                    ref={resultCanvasRef}
                    className={`${styles.canvasInteractive} ${brushMode !== 'none' ? styles.brushCursor : ''}`}
                    onPointerDown={handleCanvasPointerDown}
                    onPointerMove={handleCanvasPointerMove}
                    onPointerUp={handleCanvasPointerUp}
                    onPointerCancel={handleCanvasPointerUp}
                  />
                </>
              )}
            </div>

            <div className="grid-3">
              <StatTile label="Dimensions" value={`${activeItem.width}×${activeItem.height}`} />
              <StatTile label="Foreground area" value={`${coveragePct}%`} />
              <StatTile label="Brush edits" value={String(activeItem.strokes.length)} />
            </div>
          </div>

          <aside className={`panel stack ${styles.sidePanel}`}>
            <Tabs
              label="Removal engine"
              value={engine}
              onChange={(next) => {
                setEngine(next);
                if (next === 'classical') {
                  void rerunActiveBaseMask('classical', classicalOpts, useCustomBg);
                }
              }}
              tabs={[
                { id: 'classical', label: 'Fast Cutout' },
                { id: 'onnx', label: 'ONNX AI' },
              ]}
            />

            {engine === 'classical' ? (
              <div className="stack">
                <SegmentedControl
                  label="Flood mode"
                  value={classicalOpts.mode}
                  onChange={(mode) => {
                    const next = { ...classicalOpts, mode };
                    setClassicalOpts(next);
                    void rerunActiveBaseMask('classical', next, useCustomBg);
                  }}
                  options={[
                    { id: 'contiguous', label: 'Edge flood' },
                    { id: 'global', label: 'Global chroma' },
                  ]}
                />
                <SliderField
                  label="Color tolerance"
                  min={5}
                  max={160}
                  value={classicalOpts.tolerance}
                  onChange={(tolerance) => {
                    const next = { ...classicalOpts, tolerance };
                    setClassicalOpts(next);
                    void rerunActiveBaseMask('classical', next, useCustomBg);
                  }}
                />
                <SliderField
                  label="Transition softness"
                  min={0}
                  max={100}
                  value={Math.round(classicalOpts.softness * 100)}
                  unit="%"
                  onChange={(pct) => {
                    const next = { ...classicalOpts, softness: pct / 100 };
                    setClassicalOpts(next);
                    void rerunActiveBaseMask('classical', next, useCustomBg);
                  }}
                />
              </div>
            ) : (
              <div className="stack">
                <Banner kind={modelStatus === 'ready' ? 'info' : 'warn'}>
                  {customModel
                    ? `Local model: ${customModel.name}${onnxProvider ? ` (${onnxProvider})` : ''}`
                    : 'No model weights bundled (license policy). Host a model at /models/background-removal.onnx or pick a local .onnx segmentation model below.'}
                </Banner>
                <input
                  ref={modelInputRef}
                  type="file"
                  accept=".onnx"
                  className="sr-only"
                  onChange={(e) => void handleOnnxFilePick(e.target.files?.[0])}
                />
                <div className="row wrap">
                  <button type="button" className="btn sm" onClick={() => modelInputRef.current?.click()}>
                    Load local .onnx file
                  </button>
                  <button
                    type="button"
                    className="btn sm primary"
                    onClick={() => void rerunActiveBaseMask('onnx', classicalOpts, useCustomBg)}
                  >
                    Run ONNX
                  </button>
                </div>
                <Field label="Input normalization">
                  {(id) => (
                    <select
                      id={id}
                      className="select"
                      value={normKey}
                      onChange={(e) => setNormKey(e.target.value as NormKey)}
                    >
                      <option value="imagenet">ImageNet mean/std (U2-Net / ISNet)</option>
                      <option value="unit">Unit [0, 1] (MODNet style)</option>
                      <option value="signed">Signed [-1, 1]</option>
                    </select>
                  )}
                </Field>
                <SliderField
                  label="Mask contrast"
                  min={0}
                  max={100}
                  value={Math.round(onnxContrast * 100)}
                  onChange={(v) => setOnnxContrast(v / 100)}
                  unit="%"
                />
              </div>
            )}

            <hr className="divider" />

            <div className="stack">
              <div className="panel-title">Edge &amp; brush</div>
              <SliderField label="Edge shift" min={-5} max={5} value={edgeShift} onChange={setEdgeShift} unit="px" />
              <SliderField label="Feather" min={0} max={12} value={featherPx} onChange={setFeatherPx} unit="px" />
              <SliderField
                label="Decontaminate halo"
                min={0}
                max={100}
                value={Math.round(decontamStrength * 100)}
                onChange={(v) => setDecontamStrength(v / 100)}
                unit="%"
              />
              {brushMode === 'keep' || brushMode === 'erase' ? (
                <>
                  <SliderField label="Brush size" min={4} max={80} value={brushRadius} onChange={setBrushRadius} unit="px" />
                  <SliderField
                    label="Brush hardness"
                    min={10}
                    max={100}
                    value={Math.round(brushHardness * 100)}
                    onChange={(v) => setBrushHardness(v / 100)}
                    unit="%"
                  />
                </>
              ) : null}
            </div>

            <hr className="divider" />

            <div className="stack">
              <div className="panel-title">Backdrop</div>
              <Field label="Replacement">
                {(id) => (
                  <select
                    id={id}
                    className="select"
                    value={bgMode}
                    onChange={(e) => setBgMode(e.target.value as BgMode)}
                  >
                    <option value="transparent">Transparent</option>
                    <option value="solid">Solid color</option>
                    <option value="blur">Blurred original</option>
                    <option value="gradient">Gradient</option>
                    <option value="image">Custom image</option>
                  </select>
                )}
              </Field>

              {bgMode === 'solid' && (
                <div className={styles.swatchRow}>
                  {SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      className={styles.swatchBtn}
                      style={{ background: hex }}
                      aria-label={`Set solid color ${hex}`}
                      aria-pressed={solidHex === hex}
                      onClick={() => setSolidHex(hex)}
                    />
                  ))}
                  <input
                    type="color"
                    aria-label="Custom backdrop color"
                    value={solidHex}
                    onChange={(e) => setSolidHex(e.target.value)}
                  />
                </div>
              )}

              {bgMode === 'blur' && (
                <SliderField label="Blur radius" min={2} max={36} value={blurAmount} onChange={setBlurAmount} unit="px" />
              )}

              {bgMode === 'gradient' && (
                <div className="row">
                  <Field label="Start">
                    {(id) => <input id={id} type="color" value={gradStart} onChange={(e) => setGradStart(e.target.value)} />}
                  </Field>
                  <Field label="End">
                    {(id) => <input id={id} type="color" value={gradEnd} onChange={(e) => setGradEnd(e.target.value)} />}
                  </Field>
                </div>
              )}

              {bgMode === 'image' && (
                <>
                  <input
                    ref={bgFileInputRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => void handleBgImagePick(e.target.files?.[0])}
                  />
                  <button type="button" className="btn sm" onClick={() => bgFileInputRef.current?.click()}>
                    {customBgPhoto ? `Loaded: ${customBgPhoto.name}` : 'Pick backdrop image'}
                  </button>
                </>
              )}
            </div>

            <hr className="divider" />

            <div className="stack">
              <div className="panel-title">Export</div>
              <Field label="Format">
                {(id) => (
                  <select
                    id={id}
                    className="select"
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                  >
                    <option value="png">PNG (alpha)</option>
                    <option value="webp">WebP</option>
                    <option value="jpeg">JPG</option>
                    <option value="mask">Mask PNG</option>
                  </select>
                )}
              </Field>
              {(exportFormat === 'webp' || exportFormat === 'jpeg') && (
                <SliderField label="Quality" min={20} max={100} value={exportQuality} onChange={setExportQuality} unit="%" />
              )}
              <div className="row wrap">
                <button type="button" className="btn primary grow" onClick={() => void handleDownloadActive()}>
                  <Icon name="download" /> Download
                </button>
                <button type="button" className="btn" onClick={() => void handleCopyClipboard()}>
                  Copy PNG
                </button>
              </div>
              {items.length > 1 && (
                <button type="button" className="btn" onClick={() => void handleDownloadAllZip()}>
                  Export all {items.length} as ZIP
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
