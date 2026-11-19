import { describe, expect, it } from 'vitest';
import { buildAudioArgs, buildConvertArgs, buildGifArgs, buildTrimArgs } from './args';
import { clampRange, estimateOutputBytes, formatTimestamp, parseTimestamp } from './time';

describe('video-gif-maker time & range helpers', () => {
  it('parses and formats timestamps reliably', () => {
    expect(parseTimestamp('12.5')).toBeCloseTo(12.5);
    expect(parseTimestamp('01:05.250')).toBeCloseTo(65.25);
    expect(parseTimestamp('1:02:03')).toBeCloseTo(3723);
    expect(parseTimestamp('bad')).toBeNull();
    expect(parseTimestamp('-5')).toBeNull();

    expect(formatTimestamp(65.25)).toBe('01:05.250');
    expect(formatTimestamp(3723.5)).toBe('01:02:03.500');
  });

  it('clamps timeline ranges inside duration bounds', () => {
    expect(clampRange(-2, 99, 10)).toEqual({ start: 0, end: 10 });
    expect(clampRange(4, 2, 10)).toEqual({ start: 4, end: 4.1 });
    expect(clampRange(0, 5, 0)).toEqual({ start: 0, end: 0 });
  });

  it('estimates proportional trim size and flags heavy GIF configurations', () => {
    const trimBytes = estimateOutputBytes({
      mode: 'trim',
      durationSec: 5,
      sourceBytes: 20_000_000,
      sourceDurationSec: 20,
    });
    expect(trimBytes).toBe(5_000_000);

    const heavyGif = estimateOutputBytes({
      mode: 'gif',
      durationSec: 20,
      width: 720,
      fps: 24,
    });
    expect(heavyGif).toBeGreaterThan(10 * 1024 * 1024);

    const wavBytes = estimateOutputBytes({
      mode: 'audio',
      durationSec: 10,
      audioAction: 'extract-wav',
    });
    expect(wavBytes).toBe(1_764_000);
  });
});

describe('video-gif-maker FFmpeg command builders', () => {
  it('builds stream-copy and frame-accurate trim arguments', () => {
    expect(
      buildTrimArgs({ inputName: 'in.mp4', outputName: 'out.mp4', startSec: 1.5, endSec: 6, accurate: false }),
    ).toEqual(['-ss', '1.500', '-to', '6.000', '-i', 'in.mp4', '-c', 'copy', '-avoid_negative_ts', 'make_zero', 'out.mp4']);

    const reencode = buildTrimArgs({ inputName: 'in.mp4', outputName: 'out.mp4', startSec: 0, endSec: 4, accurate: true });
    expect(reencode).toContain('libx264');
    expect(reencode).toContain('ultrafast');
  });

  it('builds audio manipulation commands', () => {
    expect(buildAudioArgs({ inputName: 'in.mp4', outputName: 'muted.mp4', action: 'mute' })).toEqual([
      '-i', 'in.mp4', '-c:v', 'copy', '-an', 'muted.mp4',
    ]);
    expect(buildAudioArgs({ inputName: 'in.mp4', outputName: 'a.mp3', action: 'extract-mp3' })).toContain('libmp3lame');
    expect(buildAudioArgs({ inputName: 'in.mp4', outputName: 'v.mp4', action: 'volume', volumeDb: -6 })).toContain('volume=-6dB');
  });

  it('builds convert commands with aspect-preserving even scaling', () => {
    const mp4 = buildConvertArgs({
      inputName: 'in.mov',
      outputName: 'out.mp4',
      format: 'mp4',
      resolution: '720',
      crf: 24,
    });
    expect(mp4).toContain("scale=-2:'min(720,ih)'");
    expect(mp4).toContain('yuv420p');

    const webm = buildConvertArgs({
      inputName: 'in.mp4',
      outputName: 'out.webm',
      format: 'webm',
      resolution: 'original',
    });
    expect(webm).toContain('libvpx');
    expect(webm).toContain('libvorbis');
  });

  it('builds single-pass palettegen/paletteuse GIF filtergraph args', () => {
    const gif = buildGifArgs({
      inputName: 'in.mp4',
      outputName: 'clip.gif',
      startSec: 2,
      endSec: 5.5,
      fps: 12,
      width: 480,
      dither: 'bayer',
      loop: 0,
    });
    expect(gif[gif.indexOf('-filter_complex') + 1]).toContain('palettegen');
    expect(gif[gif.indexOf('-filter_complex') + 1]).toContain('paletteuse=dither=bayer');
    expect(gif).toContain('clip.gif');
  });
});
