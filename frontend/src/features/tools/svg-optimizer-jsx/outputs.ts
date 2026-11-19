/** Compact URL-encoding for SVG in a data URI (smaller than encodeURIComponent, still valid). */
export function svgToUrlEncoded(svg: string): string {
  const body = svg
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .trim()
    .replace(/"/g, "'")
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/\{/g, '%7B')
    .replace(/\}/g, '%7D')
    .replace(/[\u0080-￿]/g, (c) => encodeURIComponent(c))
    .replace(/[\r\n\t]/g, '');
  return `data:image/svg+xml,${body}`;
}

export function svgToBase64Uri(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

/** The wrapper uses double quotes; svgToUrlEncoded already turned inner quotes into single quotes. */
export function cssBackground(svg: string): string {
  return `background-image: url("${svgToUrlEncoded(svg)}");\nbackground-repeat: no-repeat;\nbackground-position: center;\nbackground-size: contain;`;
}

/** Counts pixels whose RGBA channels differ by more than `tolerance` (0-255). Buffers must have equal length. */
export function diffPixels(a: Uint8ClampedArray, b: Uint8ClampedArray, tolerance = 8): { differing: number; total: number } {
  if (a.length !== b.length) throw new Error('Images must have the same size.');
  const total = a.length / 4;
  let differing = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (
      Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > tolerance ||
      Math.abs((a[i + 1] ?? 0) - (b[i + 1] ?? 0)) > tolerance ||
      Math.abs((a[i + 2] ?? 0) - (b[i + 2] ?? 0)) > tolerance ||
      Math.abs((a[i + 3] ?? 0) - (b[i + 3] ?? 0)) > tolerance
    ) {
      differing++;
    }
  }
  return { differing, total };
}

/** Diff verdict: tiny anti-aliasing noise passes, more than 0.1% of pixels warns. */
export const DIFF_WARN_RATIO = 0.001;
export function diffVerdict(d: { differing: number; total: number }): 'identical' | 'ok' | 'warn' {
  if (d.differing === 0) return 'identical';
  return d.differing / d.total > DIFF_WARN_RATIO ? 'warn' : 'ok';
}
