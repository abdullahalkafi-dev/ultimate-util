import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { checkDocxBytes } from './docxFile';
import { detectFidelityIssues } from './fidelity';
import { stripUnsafe } from './htmlToPdf';
import { findUnsupportedScripts } from './scripts';
import { scanZip, ZipError } from './zip';

const minimalDocx = () => zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8('<w:document/>') });

describe('scanZip', () => {
  it('lists entries and sizes', () => {
    const scan = scanZip(minimalDocx());
    expect(scan.entries).toContain('word/document.xml');
    expect(scan.totalUncompressed).toBeGreaterThan(0);
  });
  it('rejects a declared size bomb without inflating', () => {
    const zip = minimalDocx();
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    let eocd = zip.length - 22;
    while (view.getUint32(eocd, true) !== 0x06054b50) eocd--;
    const cd = view.getUint32(eocd + 16, true);
    view.setUint32(cd + 24, 0xf0000000, true);
    expect(() => scanZip(zip)).toThrowError(ZipError);
  });
  it('rejects garbage', () => {
    expect(() => scanZip(new Uint8Array(100))).toThrowError(/not a valid ZIP/);
  });
});

describe('checkDocxBytes', () => {
  it('accepts a docx layout', () => expect(checkDocxBytes(minimalDocx()).ok).toBe(true));
  it('rejects empty', () => expect(checkDocxBytes(new Uint8Array(0))).toMatchObject({ ok: false, message: 'This file is empty.' }));
  it('rejects a PDF renamed to docx and names it', () => {
    const r = checkDocxBytes(strToU8('%PDF-1.7 hello'), 'a.docx');
    expect(r).toMatchObject({ ok: false, detected: 'pdf' });
  });
  it('rejects OLE (legacy doc / encrypted)', () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]);
    expect(checkDocxBytes(ole, 'x.doc')).toMatchObject({ ok: false, detected: 'ole' });
    expect(checkDocxBytes(ole, 'x.docx')).toMatchObject({ ok: false, message: expect.stringContaining('password') });
  });
  it('rejects a plain zip without word parts', () => {
    expect(checkDocxBytes(zipSync({ 'a.txt': strToU8('x') })).ok).toBe(false);
  });
});

describe('findUnsupportedScripts', () => {
  it('flags Arabic and Bengali but not Latin/Cyrillic', () => {
    expect(findUnsupportedScripts('hello привет')).toEqual([]);
    expect(findUnsupportedScripts('مرحبا আমি')).toEqual(['Arabic', 'Bengali']);
  });
});

describe('detectFidelityIssues', () => {
  it('finds text boxes and tracked changes', () => {
    const ids = detectFidelityIssues({ 'word/document.xml': '<w:txbxContent></w:txbxContent><w:ins w:id="1">' }).map((i) => i.id);
    expect(ids).toEqual(['textbox', 'tracked']);
  });
  it('is quiet for plain documents', () => expect(detectFidelityIssues({ 'word/document.xml': '<w:p><w:r><w:t>hi</w:t></w:r></w:p>' })).toEqual([]));
});

describe('stripUnsafe', () => {
  it('removes scripts and remote images but keeps data images', () => {
    const out = stripUnsafe('<script>x()</script><img src="https://e.com/a.png"><img src="data:image/png;base64,AAA">');
    expect(out).not.toContain('script');
    expect(out).not.toContain('e.com');
    expect(out).toContain('data:image/png');
  });
});
