import { clamp, type RGB } from './convert';

export const KELVIN_MIN = 1000;
export const KELVIN_MAX = 10000;

/** Tanner Helland's approximation of black-body color, valid roughly 1000 to 40000 K. */
export function kelvinToRgb(kelvin: number): RGB {
  const t = clamp(kelvin, KELVIN_MIN, 40000) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255) };
}
