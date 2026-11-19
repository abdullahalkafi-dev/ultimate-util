import {
  clamp,
  hslToRgb,
  mod360,
  oklchToRgb,
  rgbToHsl,
  rgbToOklch,
  type RGB,
} from '../_shared-color/convert';

/** Outer edge of the OKLCH wheel (chroma). Most sRGB colors sit below this. */
export const MAX_CHROMA = 0.32;

export type WheelMode = 'hsl' | 'oklch';

/** Position on the wheel is hue + (saturation | chroma); `light` is the separate slider. */
export type ColorState =
  | { mode: 'hsl'; h: number; s: number; l: number }
  | { mode: 'oklch'; h: number; c: number; l: number };

export interface Resolved {
  rgb: RGB;
  /** OKLCH chroma was reduced to fit sRGB. */
  clipped: boolean;
}

export function resolve(state: ColorState): Resolved {
  if (state.mode === 'hsl') return { rgb: hslToRgb(state), clipped: false };
  return oklchToRgb({ l: state.l, c: state.c, h: state.h });
}

/** Converts a color into the given wheel mode; keeps a known hue when the color is gray. */
export function stateFromRgb(rgb: RGB, mode: WheelMode, previousHue = 0): ColorState {
  if (mode === 'hsl') {
    const { h, s, l } = rgbToHsl(rgb);
    return { mode, h: s === 0 ? previousHue : h, s, l };
  }
  const { l, c, h } = rgbToOklch(rgb);
  return { mode, h: c === 0 ? previousHue : h, c, l };
}

/** Pointer offset from the wheel center (pixels) to a color state at the current lightness. */
export function pointToState(dx: number, dy: number, radius: number, state: ColorState): ColorState {
  const hue = mod360((Math.atan2(dy, dx) * 180) / Math.PI);
  const t = clamp(Math.hypot(dx, dy) / radius, 0, 1);
  return state.mode === 'hsl' ? { ...state, h: hue, s: t * 100 } : { ...state, h: hue, c: t * MAX_CHROMA };
}

/** Marker position as a pair of offsets in -1..1 of the wheel radius. */
export function stateToPoint(state: ColorState): { x: number; y: number } {
  const t = state.mode === 'hsl' ? state.s / 100 : state.c / MAX_CHROMA;
  const rad = (state.h * Math.PI) / 180;
  return { x: Math.cos(rad) * clamp(t, 0, 1), y: Math.sin(rad) * clamp(t, 0, 1) };
}

/** Keyboard nudge: arrows move hue and saturation/chroma, PageUp/PageDown move lightness. */
export function nudge(state: ColorState, key: string, big: boolean): ColorState | null {
  const step = big ? 10 : 1;
  const sat = state.mode === 'hsl' ? state.s : (state.c / MAX_CHROMA) * 100;
  const setSat = (v: number): ColorState => {
    const p = clamp(v, 0, 100);
    return state.mode === 'hsl' ? { ...state, s: p } : { ...state, c: (p / 100) * MAX_CHROMA };
  };
  const light = state.mode === 'hsl' ? state.l : state.l * 100;
  const setLight = (v: number): ColorState => {
    const p = clamp(v, 0, 100);
    return state.mode === 'hsl' ? { ...state, l: p } : { ...state, l: p / 100 };
  };
  switch (key) {
    case 'ArrowLeft': return { ...state, h: mod360(state.h - step) };
    case 'ArrowRight': return { ...state, h: mod360(state.h + step) };
    case 'ArrowUp': return setSat(sat + step);
    case 'ArrowDown': return setSat(sat - step);
    case 'PageUp': return setLight(light + step);
    case 'PageDown': return setLight(light - step);
    default: return null;
  }
}

/** Rough English hue name for aria-valuetext. */
export function hueName(h: number): string {
  const names = ['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'magenta', 'pink'];
  return names[Math.round(mod360(h) / 30) % 12] ?? 'red';
}
