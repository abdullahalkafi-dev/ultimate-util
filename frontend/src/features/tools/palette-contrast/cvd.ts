import { clamp, type RGB } from '../_shared-color/convert';

export type Vision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

export const VISIONS: { id: Vision; label: string; note: string }[] = [
  { id: 'normal', label: 'Normal vision', note: 'Unchanged.' },
  { id: 'protanopia', label: 'Protanopia', note: 'No red cones. Reds look dark and blend with greens.' },
  { id: 'deuteranopia', label: 'Deuteranopia', note: 'No green cones. Reds and greens look alike.' },
  { id: 'tritanopia', label: 'Tritanopia', note: 'No blue cones. Blues and yellows are confused.' },
  { id: 'achromatopsia', label: 'Achromatopsia', note: 'No color vision. Only lightness remains.' },
];

// Machado, Oliveira and Fernandes (2009), severity 1.0, applied to linear sRGB.
const MATRICES: Record<Exclude<Vision, 'normal' | 'achromatopsia'>, number[]> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055);

/** Approximate simulation. It is not a substitute for testing with people. */
export function simulate(rgb: RGB, vision: Vision): RGB {
  if (vision === 'normal') return rgb;
  const r = toLinear(rgb.r), g = toLinear(rgb.g), b = toLinear(rgb.b);
  if (vision === 'achromatopsia') {
    const y = fromLinear(0.2126 * r + 0.7152 * g + 0.0722 * b);
    return { r: y, g: y, b: y };
  }
  const m = MATRICES[vision];
  const out = (row: number) =>
    clamp(fromLinear((m[row * 3] ?? 0) * r + (m[row * 3 + 1] ?? 0) * g + (m[row * 3 + 2] ?? 0) * b), 0, 255);
  return { r: out(0), g: out(1), b: out(2) };
}
