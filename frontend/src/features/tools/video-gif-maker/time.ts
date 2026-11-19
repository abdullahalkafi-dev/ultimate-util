export function parseTimestamp(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  const parts = s.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  let total = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? '';
    const isLast = i === parts.length - 1;
    const valid = isLast ? /^\d{1,2}(?:\.\d+)?$/.test(part) : /^\d+$/.test(part);
    if (!valid) return null;
    const val = Number(part);
    if (!Number.isFinite(val) || val < 0) return null;
    if (!isLast && i > 0 && val >= 60) return null;
    if (isLast && parts.length > 1 && val >= 60) return null;
    total = total * 60 + val;
  }
  return total;
}

export function formatTimestamp(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
  const totalMs = Math.round(safe * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const sec = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const min = totalMin % 60;
  const hr = Math.floor(totalMin / 60);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');
  if (hr > 0) return `${pad2(hr)}:${pad2(min)}:${pad2(sec)}.${pad3(ms)}`;
  return `${pad2(min)}:${pad2(sec)}.${pad3(ms)}`;
}

export function clampRange(startSec: number, endSec: number, durationSec: number): { start: number; end: number } {
  const maxDur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  if (maxDur === 0) return { start: 0, end: 0 };
  const s = Math.max(0, Math.min(maxDur, Number.isFinite(startSec) ? startSec : 0));
  const rawEnd = Number.isFinite(endSec) ? endSec : maxDur;
  const minGap = Math.min(0.1, maxDur);
  const e = Math.max(Math.min(maxDur, s + minGap), Math.min(maxDur, rawEnd));
  const clampedStart = e <= s && s > minGap ? Math.max(0, e - minGap) : s;
  return { start: Number(clampedStart.toFixed(3)), end: Number(e.toFixed(3)) };
}

export type ToolOperationMode = 'trim' | 'audio' | 'convert' | 'gif';

export function estimateOutputBytes(opts: {
  mode: ToolOperationMode;
  durationSec: number;
  sourceBytes?: number;
  sourceDurationSec?: number;
  width?: number;
  fps?: number;
  bitrateKbps?: number;
  crf?: number;
  audioAction?: string;
}): number {
  const dur = Math.max(0.1, opts.durationSec);
  if (opts.mode === 'gif') {
    const w = opts.width ?? 480;
    const h = Math.round((w * 9) / 16);
    const fps = opts.fps ?? 12;
    // Palette-quantized LZW GIF typically averages ~0.18-0.25 bytes/pixel/frame across natural video
    return Math.round(w * h * fps * dur * 0.22);
  }
  if (opts.mode === 'audio') {
    if (opts.audioAction === 'extract-wav') return Math.round(dur * 176_400);
    if (opts.audioAction === 'extract-mp3' || opts.audioAction === 'extract-aac') return Math.round((192_000 / 8) * dur);
    if (opts.sourceBytes && opts.sourceDurationSec && opts.sourceDurationSec > 0) {
      return Math.round(opts.sourceBytes * 0.9);
    }
    return Math.round(dur * 250_000);
  }
  if (opts.mode === 'trim' && opts.sourceBytes && opts.sourceDurationSec && opts.sourceDurationSec > 0) {
    return Math.max(1024, Math.round((opts.sourceBytes * dur) / opts.sourceDurationSec));
  }
  const crf = opts.crf ?? 23;
  const widthFactor = Math.min(2.5, Math.max(0.35, (opts.width ?? 720) / 720));
  const crfFactor = Math.pow(2, (23 - crf) / 6);
  const estKbps = opts.bitrateKbps ?? Math.round(1400 * widthFactor * crfFactor);
  return Math.round(((estKbps * 1000) / 8) * dur);
}
