/**
 * Small median-cut color quantizer used for lossy PNG. Pixels are replaced by their palette color, so a
 * following lossless PNG optimizer can store the image as an indexed (palette) PNG.
 * No dithering: it keeps flat graphics crisp but can band on smooth gradients.
 */
interface Entry {
  key: number;
  count: number;
  r: number;
  g: number;
  b: number;
  a: number; // channel sums over all pixels in this bucket
}

interface Box {
  entries: Entry[];
}

const keyOf = (r: number, g: number, b: number, a: number) => ((r >> 3) << 14) | ((g >> 3) << 9) | ((b >> 3) << 4) | (a >> 4);

function channelRange(box: Box) {
  const min = [255, 255, 255, 255];
  const max = [0, 0, 0, 0];
  for (const e of box.entries) {
    const v = [e.r / e.count, e.g / e.count, e.b / e.count, e.a / e.count];
    for (let c = 0; c < 4; c++) {
      if (v[c]! < min[c]!) min[c] = v[c]!;
      if (v[c]! > max[c]!) max[c] = v[c]!;
    }
  }
  let best = 0;
  let span = -1;
  for (let c = 0; c < 4; c++) {
    const s = max[c]! - min[c]!;
    if (s > span) {
      span = s;
      best = c;
    }
  }
  return { channel: best, span };
}

/** Returns a copy of `rgba` using at most `maxColors` distinct colors (2 to 256). */
export function quantizeRgba(rgba: Uint8ClampedArray, maxColors: number): Uint8ClampedArray {
  const limit = Math.min(256, Math.max(2, Math.round(maxColors)));
  const table = new Map<number, Entry>();
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!, a = rgba[i + 3]!;
    const key = keyOf(r, g, b, a);
    const e = table.get(key);
    if (e) {
      e.count++;
      e.r += r; e.g += g; e.b += b; e.a += a;
    } else {
      table.set(key, { key, count: 1, r, g, b, a });
    }
  }
  const boxes: Box[] = [{ entries: [...table.values()] }];
  while (boxes.length < limit) {
    // split the box with the widest spread that still has more than one entry
    let pick = -1;
    let pickSpan = 0;
    let pickChannel = 0;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]!;
      if (box.entries.length < 2) continue;
      const { channel, span } = channelRange(box);
      if (span > pickSpan) {
        pick = i;
        pickSpan = span;
        pickChannel = channel;
      }
    }
    if (pick === -1) break;
    const box = boxes[pick]!;
    const sum = (e: Entry) => [e.r, e.g, e.b, e.a][pickChannel]! / e.count;
    box.entries.sort((x, y) => sum(x) - sum(y));
    const total = box.entries.reduce((n, e) => n + e.count, 0);
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < box.entries.length - 1; i++) {
      acc += box.entries[i]!.count;
      cut = i + 1;
      if (acc >= total / 2) break;
    }
    boxes.splice(pick, 1, { entries: box.entries.slice(0, cut) }, { entries: box.entries.slice(cut) });
  }

  const lookup = new Map<number, [number, number, number, number]>();
  for (const box of boxes) {
    let n = 0, r = 0, g = 0, b = 0, a = 0;
    for (const e of box.entries) {
      n += e.count; r += e.r; g += e.g; b += e.b; a += e.a;
    }
    const color: [number, number, number, number] = [Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.round(a / n)];
    for (const e of box.entries) lookup.set(e.key, color);
  }

  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const c = lookup.get(keyOf(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, rgba[i + 3]!))!;
    out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = c[3];
  }
  return out;
}

export function countColors(rgba: Uint8ClampedArray): number {
  const seen = new Set<number>();
  for (let i = 0; i < rgba.length; i += 4) {
    seen.add(((rgba[i]! << 24) | (rgba[i + 1]! << 16) | (rgba[i + 2]! << 8) | rgba[i + 3]!) >>> 0);
  }
  return seen.size;
}
