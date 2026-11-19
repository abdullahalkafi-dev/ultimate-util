export type DeviceKind = 'phone' | 'tablet' | 'laptop' | 'browser';
export type FrameBackdrop = 'solid' | 'gradient' | 'transparent';
export type ScreenFit = 'cover' | 'contain';

export interface FrameSpec {
  id: DeviceKind;
  label: string;
  frameW: number;
  frameH: number;
  screenX: number;
  screenY: number;
  screenW: number;
  screenH: number;
  outerRadius: number;
  screenRadius: number;
}

/** Generic original frames (no manufacturer trademarks or logos). */
export const DEVICE_FRAMES: Record<DeviceKind, FrameSpec> = {
  phone: {
    id: 'phone',
    label: 'Phone (generic)',
    frameW: 420,
    frameH: 840,
    screenX: 22,
    screenY: 36,
    screenW: 376,
    screenH: 768,
    outerRadius: 42,
    screenRadius: 28,
  },
  tablet: {
    id: 'tablet',
    label: 'Tablet (generic)',
    frameW: 680,
    frameH: 920,
    screenX: 30,
    screenY: 36,
    screenW: 620,
    screenH: 848,
    outerRadius: 34,
    screenRadius: 18,
  },
  laptop: {
    id: 'laptop',
    label: 'Laptop (generic)',
    frameW: 1120,
    frameH: 700,
    screenX: 70,
    screenY: 36,
    screenW: 980,
    screenH: 600,
    outerRadius: 20,
    screenRadius: 8,
  },
  browser: {
    id: 'browser',
    label: 'Browser window',
    frameW: 1080,
    frameH: 680,
    screenX: 2,
    screenY: 42,
    screenW: 1076,
    screenH: 636,
    outerRadius: 14,
    screenRadius: 0,
  },
};

export interface MockupRenderOptions {
  device: DeviceKind;
  landscape: boolean;
  backdrop: FrameBackdrop;
  bgColor: string;
  bgColor2: string;
  fit: ScreenFit;
  shadow: boolean;
  scale: 1 | 2 | 3;
}

export function orientedFrame(spec: FrameSpec, landscape: boolean): FrameSpec {
  if (!landscape || spec.id === 'laptop' || spec.id === 'browser') return spec;
  return {
    ...spec,
    frameW: spec.frameH,
    frameH: spec.frameW,
    screenX: spec.screenY,
    screenY: spec.screenX,
    screenW: spec.screenH,
    screenH: spec.screenW,
  };
}

export function renderMockupCanvas(
  screenshot: CanvasImageSource | null,
  srcSize: { width: number; height: number } | null,
  opts: MockupRenderOptions,
): HTMLCanvasElement {
  const spec = orientedFrame(DEVICE_FRAMES[opts.device], opts.landscape);
  const pad = 72;
  const baseW = spec.frameW + pad * 2;
  const baseH = spec.frameH + pad * 2 + (spec.id === 'laptop' ? 28 : 0);

  const canvas = document.createElement('canvas');
  canvas.width = baseW * opts.scale;
  canvas.height = baseH * opts.scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.scale(opts.scale, opts.scale);

  if (opts.backdrop === 'solid') {
    ctx.fillStyle = opts.bgColor;
    ctx.fillRect(0, 0, baseW, baseH);
  } else if (opts.backdrop === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, baseW, baseH);
    grad.addColorStop(0, opts.bgColor);
    grad.addColorStop(1, opts.bgColor2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, baseW, baseH);
  }

  ctx.save();
  if (opts.shadow) {
    ctx.shadowColor = 'rgba(11, 15, 25, 0.28)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 20;
  }

  // Outer chassis
  ctx.fillStyle = spec.id === 'browser' ? '#e5e7eb' : '#111827';
  roundRect(ctx, pad, pad, spec.frameW, spec.frameH, spec.outerRadius);
  ctx.fill();
  ctx.restore();

  if (spec.id === 'browser') {
    ctx.fillStyle = '#f3f4f6';
    roundRect(ctx, pad + 2, pad + 2, spec.frameW - 4, 40, 12);
    ctx.fill();
    for (const [idx, col] of ['#ef4444', '#f59e0b', '#10b981'].entries()) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(pad + 20 + idx * 18, pad + 21, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (spec.id === 'laptop') {
    ctx.fillStyle = '#334155';
    roundRect(ctx, pad - 44, pad + spec.frameH - 6, spec.frameW + 88, 22, 10);
    ctx.fill();
  }

  // Screen clip area
  const sx = pad + spec.screenX;
  const sy = pad + spec.screenY;
  ctx.save();
  roundRect(ctx, sx, sy, spec.screenW, spec.screenH, spec.screenRadius);
  ctx.clip();

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(sx, sy, spec.screenW, spec.screenH);

  if (screenshot && srcSize && srcSize.width > 0 && srcSize.height > 0) {
    const scale =
      opts.fit === 'cover'
        ? Math.max(spec.screenW / srcSize.width, spec.screenH / srcSize.height)
        : Math.min(spec.screenW / srcSize.width, spec.screenH / srcSize.height);
    const dw = srcSize.width * scale;
    const dh = srcSize.height * scale;
    const dx = sx + (spec.screenW - dw) / 2;
    const dy = sy + (spec.screenH - dh) / 2;
    ctx.drawImage(screenshot, dx, dy, dw, dh);
  } else {
    ctx.fillStyle = '#eef0f5';
    ctx.fillRect(sx, sy, spec.screenW, spec.screenH);
    ctx.fillStyle = '#454d60';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Drop a screenshot to frame it', sx + spec.screenW / 2, sy + spec.screenH / 2);
  }
  ctx.restore();
  return canvas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}
