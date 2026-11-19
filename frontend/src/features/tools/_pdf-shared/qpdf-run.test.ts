import { createRequire } from 'node:module';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { classifyQpdfFailure, decryptArgs, encryptArgs, runQpdf, type QpdfFactory } from './qpdf-run';

const require = createRequire(import.meta.url);
const dist = require.resolve('@neslinesli93/qpdf-wasm').replace(/qpdf\.js$/, '');
const factory: QpdfFactory = () => require('@neslinesli93/qpdf-wasm')({ locateFile: () => `${dist}qpdf.wasm` });

async function samplePdf() {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]).drawText('hello');
  return new Uint8Array(await doc.save());
}

describe('qpdf wasm', () => {
  it('encrypts and decrypts only with the right password', async () => {
    const src = await samplePdf();
    const enc = await runQpdf(factory, src, encryptArgs('user1', 'owner1', { print: true, copy: false, modify: false }));
    expect(enc.output).not.toBeNull();
    const encrypted = enc.output as Uint8Array;
    expect(new TextDecoder('latin1').decode(encrypted)).toContain('/Encrypt');
    const bad = await runQpdf(factory, encrypted, decryptArgs('nope'));
    expect(bad.output).toBeNull();
    expect(classifyQpdfFailure(bad.log)).toBe('wrong-password');
    const good = await runQpdf(factory, encrypted, decryptArgs('user1'));
    expect(good.output).not.toBeNull();
    const loaded = await PDFDocument.load(good.output as Uint8Array);
    expect(loaded.getPageCount()).toBe(1);
  }, 30000);

  it('reports AES-256 for the encrypted output', async () => {
    const src = await samplePdf();
    const enc = await runQpdf(factory, src, encryptArgs('a', 'b', { print: true, copy: true, modify: true }));
    const info = await runQpdf(factory, enc.output as Uint8Array, ['--password=a', '--show-encryption', 'IN']);
    // R = 6 with AESv3 is the AES-256 scheme.
    expect(info.log).toContain('R = 6');
    expect(info.log).toContain('file encryption method: AESv3');
  }, 30000);
});
