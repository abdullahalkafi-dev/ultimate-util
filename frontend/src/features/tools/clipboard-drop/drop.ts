/** Pure helpers for Clipboard & Cross-Device Drop: limits, link safety, ordering, dedupe. */

export const LIMITS = {
  fileBytes: 10 * 1024 * 1024,
  totalBytes: 100 * 1024 * 1024,
  items: 100,
  textBytes: 50_000,
  /** Cipher ct is capped at 400,000 base64 chars by the API schema, so E2E items stay small. */
  encryptedPayloadBytes: 280_000,
} as const;

export const EXPIRY = { min: 1, max: 30, default: 7 } as const;

export const clampDays = (n: number): number =>
  Number.isFinite(n) ? Math.min(EXPIRY.max, Math.max(EXPIRY.min, Math.round(n))) : EXPIRY.default;

export const byteLength = (text: string): number => new TextEncoder().encode(text).length;
/** Decoded size of a base64 string. */
export const base64Bytes = (b64: string): number => Math.floor((b64.length * 3) / 4);
/** Base64 length of n raw bytes. */
export const base64Length = (n: number): number => Math.ceil(n / 3) * 4;

export type SendCheck =
  | { ok: true; asFile?: boolean }
  | { ok: false; reason: string };

export interface Usage {
  items: number;
  bytes: number;
}

/** Client-side mirror of the server quota checks, so the user is told before uploading. */
export function checkSend(input: { kind: 'text' | 'link' | 'file'; bytes: number; encrypted?: boolean }, usage: Usage): SendCheck {
  const { kind, bytes, encrypted } = input;
  if (bytes <= 0) return { ok: false, reason: 'Nothing to send.' };
  if (usage.items >= LIMITS.items) return { ok: false, reason: 'Your clipboard is full (100 items). Delete some items first.' };
  if (encrypted && bytes > LIMITS.encryptedPayloadBytes) {
    return { ok: false, reason: 'End-to-end encrypted items are limited to about 270 KB. Turn encryption off or send something smaller.' };
  }
  if (bytes > LIMITS.fileBytes) {
    return { ok: false, reason: `This item is larger than 10 MB (${(bytes / 1048576).toFixed(1)} MB). Compress it first.` };
  }
  if (usage.bytes + bytes > LIMITS.totalBytes) {
    return { ok: false, reason: 'Your clipboard storage is full (100 MB). Delete some items first.' };
  }
  if (kind !== 'file' && !encrypted && bytes > LIMITS.textBytes) return { ok: true, asFile: true };
  return { ok: true };
}

const BLOCKED_EXT = new Set(['exe', 'scr', 'bat', 'cmd', 'com', 'msi', 'js', 'vbs', 'jar', 'ps1', 'lnk', 'pif', 'hta']);
const DOC_EXT = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'jpg', 'jpeg', 'png', 'gif', 'zip', 'mp3', 'mp4']);

/** Rejects executables and double extensions like invoice.pdf.exe. */
export function checkFileName(name: string): { ok: true } | { ok: false; reason: string } {
  const parts = name.toLowerCase().split('.');
  if (parts.length < 2) return { ok: true };
  const ext = parts[parts.length - 1] ?? '';
  if (BLOCKED_EXT.has(ext)) {
    const prev = parts[parts.length - 2] ?? '';
    return { ok: false, reason: DOC_EXT.has(prev) ? `"${name}" has a double extension and looks like a disguised program.` : `Programs and scripts (.${ext}) cannot be sent. Put it in a .zip first.` };
  }
  return { ok: true };
}

export const isImageMime = (mime?: string): boolean => /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i.test(mime ?? '');

// ---- links ---------------------------------------------------------------
const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'cutt.ly', 'rebrand.ly', 'shorturl.at', 'tiny.cc', 'rb.gy']);

export function parseLink(text: string): URL | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

export const classifyText = (text: string): 'text' | 'link' => (parseLink(text) ? 'link' : 'text');

export interface LinkInfo {
  host: string;
  /** Plain-language warnings; empty when nothing looks off. */
  warnings: string[];
}

export function linkInfo(url: URL): LinkInfo {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const warnings: string[] = [];
  if (SHORTENERS.has(host)) warnings.push('This is a link shortener, so the real destination is hidden.');
  if (host.split('.').some((l) => l.startsWith('xn--')) || /[^\x00-\x7f]/.test(url.hostname)) {
    warnings.push('The domain uses special characters that can imitate another site (lookalike domain).');
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) warnings.push('This link points to a raw IP address instead of a domain name.');
  if (url.username || url.password) warnings.push('This link contains a username or password before the domain, a common trick to disguise the real site.');
  if (url.protocol === 'http:') warnings.push('This link is not encrypted (http).');
  return { host, warnings };
}

// ---- list behaviour ---------------------------------------------------------
export interface Orderable {
  id: string;
  pinned: boolean;
  createdAt: string;
}

/** Pinned first, then newest first. Dedupes by id (realtime + polling can deliver twice). */
export function orderDrops<T extends Orderable>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const i of items) seen.set(i.id, i);
  return [...seen.values()].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
}

/** True if the same text was already sent from this device within the last 10 s. */
export function isRecentDuplicate(
  items: { kind: string; text?: string; deviceName: string; createdAt: string }[],
  text: string,
  device: string,
  now = Date.now(),
): boolean {
  return items.some((i) => i.kind !== 'file' && i.text === text && i.deviceName === device && now - Date.parse(i.createdAt) < 10_000);
}

export function usageOf(items: { size: number }[]): Usage {
  return { items: items.length, bytes: items.reduce((n, i) => n + i.size, 0) };
}

/** "3 days left", "5 hours left", "expired". */
export function expiresIn(expiresAt: string, now = Date.now()): string {
  const ms = Date.parse(expiresAt) - now;
  if (!(ms > 0)) return 'expiring';
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min left`;
  if (h < 48) return `${Math.round(h)} h left`;
  return `${Math.round(h / 24)} days left`;
}

export function deviceLabel(ua: string): string {
  const os = /Windows/i.test(ua) ? 'Windows' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iOS' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} on ${os}`;
}
