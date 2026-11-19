import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  lockedHeight,
  outputCount,
  outputPath,
  previewSize,
  resolveFormat,
  sizePlans,
  svgJobs,
} from './plan';

describe('bulk-resizer-converter plan', () => {
  it('computes size plans and does not enlarge when doNotEnlarge is true', () => {
    const sizes = previewSize(800, 600, { ...DEFAULT_SETTINGS, resizeMode: 'pixels', width: 1600, height: 0, doNotEnlarge: true });
    expect(sizes[0]).toEqual({ width: 800, height: 600, notEnlarged: true });

    const enlarged = previewSize(800, 600, { ...DEFAULT_SETTINGS, resizeMode: 'pixels', width: 1600, height: 0, doNotEnlarge: false });
    expect(enlarged[0]).toEqual({ width: 1600, height: 1200, notEnlarged: false });
  });

  it('produces exact 1:2:3 ratios for SVG 1x/2x/3x scales even with doNotEnlarge on', () => {
    const jobs = svgJobs(
      { ...DEFAULT_SETTINGS, resizeMode: 'pixels', width: 400, height: 200, fit: 'inside', svgScales: [1, 2, 3], doNotEnlarge: true },
      { width: 100, height: 50 },
    );
    expect(jobs).toHaveLength(3);
    expect(jobs.map((j) => [j.rasterW, j.rasterH])).toEqual([
      [400, 200],
      [800, 400],
      [1200, 600],
    ]);
  });

  it('resolves output formats and ZIP paths cleanly', () => {
    expect(resolveFormat('keep', 'gif')).toBe('png');
    expect(resolveFormat('keep', 'jpeg')).toBe('jpeg');
    expect(resolveFormat('avif', 'png')).toBe('avif');

    const flat = outputPath(
      { ...DEFAULT_SETTINGS, pattern: '{name}-{w}x{h}', zip: 'flat' },
      { baseName: 'hero', width: 800, height: 600, index: 1, label: '800w', format: 'webp' },
    );
    expect(flat).toBe('hero-800x600.webp');

    const folders = outputPath(
      { ...DEFAULT_SETTINGS, pattern: '{name}', zip: 'folders' },
      { baseName: 'logo', width: 512, height: 512, index: 1, scale: '2x', label: '512w', format: 'png' },
    );
    expect(folders).toBe('512w-2x/logo.png');
  });

  it('computes locked height, size plans and multi-size output counts', () => {
    expect(lockedHeight(800, 1600, 1000)).toBe(500);
    expect(sizePlans({ ...DEFAULT_SETTINGS, resizeMode: 'preset', presetId: 'ig-square' })[0]?.preset).toBe('ig-square');
    expect(outputCount(20, { ...DEFAULT_SETTINGS, sizes: [{ id: 1, width: 400, height: 0 }, { id: 2, width: 800, height: 0 }, { id: 3, width: 1600, height: 0 }] })).toBe(60);
  });
});
