/// <reference lib="webworker" />
import type { QpdfInstance } from '@neslinesli93/qpdf-wasm';
import { runQpdf, type QpdfFactory } from './qpdf-run';

export interface QpdfRequest {
  input: Uint8Array;
  args: string[];
}

const create: QpdfFactory = async () => {
  const mod = (await import('@neslinesli93/qpdf-wasm')).default as unknown as (o: object) => Promise<QpdfInstance>;
  return mod({ locateFile: () => '/vendor/qpdf/qpdf.wasm' });
};

self.onmessage = async (e: MessageEvent<QpdfRequest>) => {
  try {
    const result = await runQpdf(create, e.data.input, e.data.args);
    const transfer = result.output ? [result.output.buffer as ArrayBuffer] : [];
    self.postMessage({ ok: true, result }, transfer);
  } catch (err) {
    self.postMessage({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
};
