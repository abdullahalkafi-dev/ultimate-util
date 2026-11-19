import type { FFmpeg, LogEvent, ProgressEvent } from '@ffmpeg/ffmpeg';

let instance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function ensureFfmpeg(): Promise<FFmpeg> {
  if (instance && instance.loaded) return instance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const ff = new FFmpeg();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    await ff.load({
      coreURL: `${origin}/vendor/ffmpeg/ffmpeg-core.js`,
      wasmURL: `${origin}/vendor/ffmpeg/ffmpeg-core.wasm`,
    });
    instance = ff;
    return ff;
  })().catch((err) => {
    instance = null;
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}

export function terminateFfmpeg(): void {
  if (instance) {
    try {
      instance.terminate();
    } catch {
      // Ignore worker already terminated
    }
  }
  instance = null;
  loadPromise = null;
}

export async function runFfmpegJob(opts: {
  inputName: string;
  inputBytes: Uint8Array;
  outputName: string;
  args: string[];
  onProgress?: (pct: number) => void;
  onLog?: (line: string) => void;
}): Promise<Uint8Array> {
  const ff = await ensureFfmpeg();
  const handleLog = ({ message }: LogEvent) => opts.onLog?.(message);
  const handleProgress = ({ progress }: ProgressEvent) => {
    if (Number.isFinite(progress)) {
      opts.onProgress?.(Math.min(100, Math.max(0, progress * 100)));
    }
  };

  ff.on('log', handleLog);
  ff.on('progress', handleProgress);
  try {
    await ff.writeFile(opts.inputName, opts.inputBytes);
    const code = await ff.exec(opts.args);
    if (code !== 0) {
      throw new Error(`FFmpeg exited with code ${code}. Check the command log for details.`);
    }
    const out = await ff.readFile(opts.outputName);
    if (typeof out === 'string') {
      return new TextEncoder().encode(out);
    }
    return new Uint8Array(out);
  } finally {
    ff.off('log', handleLog);
    ff.off('progress', handleProgress);
    try {
      await ff.deleteFile(opts.inputName);
    } catch {
      // Ignore cleanup failures after termination
    }
    try {
      await ff.deleteFile(opts.outputName);
    } catch {
      // Ignore cleanup failures after termination
    }
  }
}
