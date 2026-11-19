import { clamp, parseColor, rgbToHex, type RGB } from '../_shared-color/convert';
import { KELVIN_MAX, KELVIN_MIN, kelvinToRgb } from '../_shared-color/kelvin';

export type Shape = 'flat' | 'vignette' | 'ring' | 'panel';
export type LightMode = 'color' | 'warm';

export const SHAPES: Shape[] = ['flat', 'vignette', 'ring', 'panel'];

export interface SoftboxSettings {
  mode: LightMode;
  /** Base color as hex (used in "color" mode). */
  color: string;
  kelvin: number;
  /** 5..100 percent. */
  brightness: number;
  shape: Shape;
  /** Edge softness, 10..100 percent. Never below 10 to avoid hard edges. */
  softness: number;
  /** Size of the lit area for non-flat shapes, 20..100 percent. */
  size: number;
  /** In color mode, multiply the color by the Kelvin tint. */
  applyWarmth: boolean;
}

export const DEFAULT_SETTINGS: SoftboxSettings = {
  mode: 'warm',
  color: '#ff9a3c',
  kelvin: 4500,
  brightness: 80,
  shape: 'vignette',
  softness: 60,
  size: 60,
  applyWarmth: false,
};

export const BRIGHTNESS_MIN = 5;

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Validates data from localStorage or the cloud; anything invalid falls back to defaults. */
export function sanitizeSettings(raw: unknown): SoftboxSettings {
  const d = DEFAULT_SETTINGS;
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const parsed = typeof o.color === 'string' ? parseColor(o.color) : null;
  return {
    mode: o.mode === 'color' || o.mode === 'warm' ? o.mode : d.mode,
    color: parsed?.ok ? rgbToHex(parsed.rgb) : d.color,
    kelvin: Math.round(clamp(num(o.kelvin, d.kelvin), KELVIN_MIN, KELVIN_MAX)),
    brightness: Math.round(clamp(num(o.brightness, d.brightness), BRIGHTNESS_MIN, 100)),
    shape: SHAPES.includes(o.shape as Shape) ? (o.shape as Shape) : d.shape,
    softness: Math.round(clamp(num(o.softness, d.softness), 10, 100)),
    size: Math.round(clamp(num(o.size, d.size), 20, 100)),
    applyWarmth: typeof o.applyWarmth === 'boolean' ? o.applyWarmth : d.applyWarmth,
  };
}

/** The opaque light color after warmth and brightness (alpha is always ignored). */
export function lightColor(s: SoftboxSettings): RGB {
  let base: RGB = { r: 255, g: 255, b: 255 };
  if (s.mode === 'color') {
    const p = parseColor(s.color);
    if (p.ok) base = p.rgb;
  }
  if (s.mode === 'warm' || s.applyWarmth) {
    const tint = kelvinToRgb(s.kelvin);
    base = { r: (base.r * tint.r) / 255, g: (base.g * tint.g) / 255, b: (base.b * tint.b) / 255 };
  }
  const k = clamp(s.brightness, BRIGHTNESS_MIN, 100) / 100;
  return { r: base.r * k, g: base.g * k, b: base.b * k };
}

const css = (c: RGB) => `rgb(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)})`;
const scale = (c: RGB, k: number): RGB => ({ r: c.r * k, g: c.g * k, b: c.b * k });
const fix = (n: number) => Math.round(n * 10) / 10;

export interface StageStyle {
  background: string;
  /** Only the "panel" shape draws an element on top of the dark background. */
  panel?: { inset: string; borderRadius: string; background: string; boxShadow: string };
}

/** Pure CSS gradients for each shape, so fullscreen never does per-pixel JS. */
export function stageStyle(s: SoftboxSettings): StageStyle {
  const col = css(lightColor(s));
  const soft = clamp(s.softness, 10, 100);
  const size = clamp(s.size, 20, 100);
  const dark = css(scale(lightColor(s), 0.12));

  if (s.shape === 'flat') return { background: col };

  if (s.shape === 'vignette') {
    const inner = Math.min(size - soft / 2, 90);
    const innerStop = Math.max(0, inner);
    const outer = Math.min(100, innerStop + soft);
    return {
      background: `radial-gradient(ellipse farthest-corner at 50% 50%, ${col} 0%, ${col} ${fix(innerStop)}%, ${dark} ${fix(outer)}%)`,
    };
  }

  if (s.shape === 'ring') {
    const feather = soft / 5;
    const outer = clamp(size, 30, 100) - feather;
    const inner = Math.max(feather, outer - 25);
    return {
      background: `radial-gradient(circle closest-side at 50% 50%, ${dark} 0%, ${dark} ${fix(inner - feather)}%, ${col} ${fix(inner)}%, ${col} ${fix(outer)}%, ${dark} ${fix(outer + feather)}%)`,
    };
  }

  const inset = fix((100 - size) / 2);
  const blur = Math.round(soft * 1.2);
  return {
    background: '#0b0b0b',
    panel: {
      inset: `${inset}%`,
      borderRadius: '6%',
      background: col,
      boxShadow: `0 0 ${blur}px ${Math.round(blur / 3)}px ${col}`,
    },
  };
}

export function stepBrightness(value: number, delta: number): number {
  return Math.round(clamp(value + delta, BRIGHTNESS_MIN, 100));
}

export function stepKelvin(value: number, delta: number): number {
  return Math.round(clamp(value + delta, KELVIN_MIN, KELVIN_MAX));
}

export interface Preset {
  id: string;
  name: string;
  settings: SoftboxSettings;
}

/** Reads presets from untrusted storage, dropping malformed entries. */
export function parsePresets(raw: unknown): Preset[] {
  if (!Array.isArray(raw)) return [];
  const out: Preset[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.name !== 'string') continue;
    out.push({ id: o.id, name: o.name.slice(0, 60), settings: sanitizeSettings(o.settings) });
  }
  return out.slice(0, 50);
}

/** Data stored with a cloud preset (kind "softbox"). */
export function presetCloudData(s: SoftboxSettings): Record<string, unknown> {
  return { kelvin: s.kelvin, brightness: s.brightness, shape: s.shape, color: s.color, mode: s.mode, softness: s.softness, size: s.size };
}
