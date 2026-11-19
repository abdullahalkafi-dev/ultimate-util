export type AudioAction = 'mute' | 'extract-mp3' | 'extract-wav' | 'extract-aac' | 'normalize' | 'volume';
export type ConvertFormat = 'mp4' | 'webm';
export type ConvertResolution = 'original' | '1080' | '720' | '480';
export type GifDither = 'bayer' | 'floyd_steinberg' | 'none';

export function buildTrimArgs(opts: {
  inputName: string;
  outputName: string;
  startSec: number;
  endSec: number;
  accurate: boolean;
}): string[] {
  const args = ['-ss', opts.startSec.toFixed(3), '-to', opts.endSec.toFixed(3), '-i', opts.inputName];
  if (opts.accurate) {
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-c:a', 'aac');
  } else {
    args.push('-c', 'copy', '-avoid_negative_ts', 'make_zero');
  }
  args.push(opts.outputName);
  return args;
}

export function buildAudioArgs(opts: {
  inputName: string;
  outputName: string;
  action: AudioAction;
  volumeDb?: number;
}): string[] {
  switch (opts.action) {
    case 'mute':
      return ['-i', opts.inputName, '-c:v', 'copy', '-an', opts.outputName];
    case 'extract-mp3':
      return ['-i', opts.inputName, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', opts.outputName];
    case 'extract-wav':
      return ['-i', opts.inputName, '-vn', '-c:a', 'pcm_s16le', opts.outputName];
    case 'extract-aac':
      return ['-i', opts.inputName, '-vn', '-c:a', 'aac', '-b:a', '192k', opts.outputName];
    case 'normalize':
      return ['-i', opts.inputName, '-c:v', 'copy', '-af', 'loudnorm', opts.outputName];
    case 'volume': {
      const db = opts.volumeDb ?? 0;
      return ['-i', opts.inputName, '-c:v', 'copy', '-af', `volume=${db}dB`, opts.outputName];
    }
  }
}

export function buildConvertArgs(opts: {
  inputName: string;
  outputName: string;
  format: ConvertFormat;
  resolution: ConvertResolution;
  crf?: number;
}): string[] {
  const args = ['-i', opts.inputName];
  if (opts.resolution !== 'original') {
    // Keep aspect ratio and force even dimensions for YUV420p encoders
    args.push('-vf', `scale=-2:'min(${opts.resolution},ih)'`);
  }
  if (opts.format === 'webm') {
    const crf = opts.crf ?? 32;
    args.push('-c:v', 'libvpx', '-crf', String(crf), '-b:v', '1M', '-c:a', 'libvorbis');
  } else {
    const crf = opts.crf ?? 23;
    args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-c:a', 'aac');
  }
  args.push(opts.outputName);
  return args;
}

export function buildGifArgs(opts: {
  inputName: string;
  outputName: string;
  startSec: number;
  endSec: number;
  fps: number;
  width: number;
  dither: GifDither;
  loop: number;
}): string[] {
  const fps = Math.max(1, Math.min(30, Math.round(opts.fps)));
  const width = Math.max(120, Math.min(1280, Math.round(opts.width)));
  const paletteUse =
    opts.dither === 'none' ? 'paletteuse=dither=none' : `paletteuse=dither=${opts.dither}`;
  const filterGraph = `[0:v]fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]${paletteUse}`;
  return [
    '-ss',
    opts.startSec.toFixed(3),
    '-to',
    opts.endSec.toFixed(3),
    '-i',
    opts.inputName,
    '-filter_complex',
    filterGraph,
    '-loop',
    String(Math.max(0, Math.round(opts.loop))),
    opts.outputName,
  ];
}
