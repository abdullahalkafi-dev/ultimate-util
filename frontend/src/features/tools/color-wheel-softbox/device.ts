/** Browser capability helpers. Every function is safe to call during server rendering. */

interface FsElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}
interface FsDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}
interface EyeDropperLike {
  open: () => Promise<{ sRGBHex: string }>;
}

export type FullscreenMode = 'native' | 'pseudo';

export function isFullscreenNow(): boolean {
  if (typeof document === 'undefined') return false;
  const d = document as FsDocument;
  return Boolean(d.fullscreenElement ?? d.webkitFullscreenElement);
}

/**
 * Must be called from a click or key handler. Falls back to "pseudo" (a fixed overlay)
 * when the Fullscreen API is missing (iPhone Safari) or the request is refused.
 */
export async function enterFullscreen(el: HTMLElement): Promise<FullscreenMode> {
  const target = el as FsElement;
  try {
    if (target.requestFullscreen) {
      await target.requestFullscreen({ navigationUI: 'hide' });
      return 'native';
    }
    if (target.webkitRequestFullscreen) {
      await target.webkitRequestFullscreen();
      return 'native';
    }
  } catch {
    // Refused (no user gesture, policy): use the overlay instead.
  }
  return 'pseudo';
}

export async function leaveFullscreen(): Promise<void> {
  if (!isFullscreenNow()) return;
  const d = document as FsDocument;
  try {
    if (d.exitFullscreen) await d.exitFullscreen();
    else await d.webkitExitFullscreen?.();
  } catch {
    // Already left.
  }
}

/** Returns a sentinel, or null when Wake Lock is unsupported or refused. */
export async function acquireWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return null;
    return await navigator.wakeLock.request('screen');
  } catch {
    return null;
  }
}

export function eyeDropperSupported(): boolean {
  return typeof window !== 'undefined' && 'EyeDropper' in window;
}

/** Hex string of the chosen pixel, or null if cancelled or unsupported. Never throws. */
export async function pickFromScreen(): Promise<string | null> {
  try {
    const Ctor = (window as unknown as { EyeDropper?: new () => EyeDropperLike }).EyeDropper;
    if (!Ctor) return null;
    const result = await new Ctor().open();
    return result.sRGBHex;
  } catch {
    return null;
  }
}
