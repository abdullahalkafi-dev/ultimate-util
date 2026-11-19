let ctx: CanvasRenderingContext2D | null | undefined;

const PROBE = 'mmmmmmmmmmlliWQ@#語ع';

function width(font: string): number {
  if (ctx === undefined) ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return 0;
  ctx.font = font;
  return ctx.measureText(PROBE).width;
}

/**
 * True when a family with this name is installed on the device. Compares text width against
 * two generic fallbacks: an installed font differs from at least one of them.
 */
export function isFontInstalled(family: string): boolean {
  if (typeof document === 'undefined') return false;
  const quoted = `"${family.replace(/"/g, '')}"`;
  return (['monospace', 'serif', 'sans-serif'] as const).some((generic) => width(`72px ${quoted}, ${generic}`) !== width(`72px ${generic}`));
}
