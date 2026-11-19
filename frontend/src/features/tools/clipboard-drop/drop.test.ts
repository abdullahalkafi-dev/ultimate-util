import { describe, expect, it } from 'vitest';
import {
  base64Bytes, base64Length, checkFileName, checkSend, classifyText, clampDays, deviceLabel, expiresIn, isRecentDuplicate,
  linkInfo, orderDrops, parseLink, usageOf,
} from './drop';

const empty = { items: 0, bytes: 0 };

describe('size and quota checks', () => {
  it('blocks files over 10 MB with a clear reason', () => {
    const r = checkSend({ kind: 'file', bytes: 11 * 1024 * 1024 }, empty);
    expect(r.ok).toBe(false);
  });
  it('blocks when items or total storage are full', () => {
    expect(checkSend({ kind: 'text', bytes: 10 }, { items: 100, bytes: 0 }).ok).toBe(false);
    expect(checkSend({ kind: 'file', bytes: 5_000_000 }, { items: 5, bytes: 102_000_000 }).ok).toBe(false);
  });
  it('offers long text as a file', () => {
    expect(checkSend({ kind: 'text', bytes: 60_000 }, empty)).toEqual({ ok: true, asFile: true });
    expect(checkSend({ kind: 'text', bytes: 100 }, empty)).toEqual({ ok: true });
  });
  it('limits encrypted payloads', () => {
    expect(checkSend({ kind: 'file', bytes: 300_000, encrypted: true }, empty).ok).toBe(false);
  });
  it('base64 size math round trips', () => {
    expect(base64Bytes('AAAA')).toBe(3);
    expect(base64Length(3)).toBe(4);
    expect(base64Length(10)).toBe(16);
  });
  it('clamps expiry days', () => {
    expect(clampDays(0)).toBe(1);
    expect(clampDays(99)).toBe(30);
    expect(clampDays(NaN)).toBe(7);
  });
});

describe('file names', () => {
  it('rejects executables and double extensions', () => {
    expect(checkFileName('invoice.pdf.exe').ok).toBe(false);
    expect(checkFileName('setup.exe').ok).toBe(false);
    expect(checkFileName('photo.png').ok).toBe(true);
    expect(checkFileName('README').ok).toBe(true);
  });
});

describe('links', () => {
  it('classifies', () => {
    expect(classifyText('https://example.com/a')).toBe('link');
    expect(classifyText('see https://example.com')).toBe('text');
    expect(classifyText('javascript:alert(1)')).toBe('text');
  });
  it('warns about shorteners, punycode, IPs and credentials', () => {
    expect(linkInfo(parseLink('https://bit.ly/abc')!).warnings.length).toBe(1);
    expect(linkInfo(parseLink('https://xn--pple-43d.com')!).warnings.some((w) => w.includes('lookalike'))).toBe(true);
    expect(linkInfo(parseLink('https://192.168.0.1/x')!).warnings.length).toBe(1);
    expect(linkInfo(parseLink('https://google.com@evil.com')!).warnings.length).toBe(1);
    expect(linkInfo(parseLink('https://www.example.com')!)).toEqual({ host: 'example.com', warnings: [] });
  });
});

describe('list behaviour', () => {
  it('orders pinned first then newest and dedupes ids', () => {
    const out = orderDrops([
      { id: 'a', pinned: false, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'b', pinned: false, createdAt: '2026-01-02T00:00:00Z' },
      { id: 'c', pinned: true, createdAt: '2025-01-01T00:00:00Z' },
      { id: 'a', pinned: false, createdAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(out.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
  it('detects duplicate sends within 10 s from the same device', () => {
    const now = Date.parse('2026-01-01T00:00:10Z');
    const items = [{ kind: 'text', text: 'hi', deviceName: 'A', createdAt: '2026-01-01T00:00:05Z' }];
    expect(isRecentDuplicate(items, 'hi', 'A', now)).toBe(true);
    expect(isRecentDuplicate(items, 'hi', 'B', now)).toBe(false);
    expect(isRecentDuplicate(items, 'hi', 'A', now + 60_000)).toBe(false);
  });
  it('usage and expiry text', () => {
    expect(usageOf([{ size: 5 }, { size: 7 }])).toEqual({ items: 2, bytes: 12 });
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(expiresIn('2026-01-04T00:00:00Z', now)).toBe('3 days left');
    expect(expiresIn('2026-01-01T05:00:00Z', now)).toBe('5 h left');
    expect(expiresIn('2025-12-31T00:00:00Z', now)).toBe('expiring');
  });
  it('device label', () => {
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537')).toBe('Chrome on Windows');
  });
});
