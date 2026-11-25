// Copies WebAssembly and worker files from node_modules into public/vendor so tools load them
// from our own origin (no third-party CDN, works offline after the first visit).
// Output is git-ignored. Runs automatically before `dev` and `build`.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'vendor');

function packageDir(name, from = root) {
  const req = createRequire(path.join(from, 'package.json'));
  let dir = path.dirname(req.resolve(name));
  // walk up to the folder that contains package.json for this package name
  while (!existsSync(path.join(dir, 'package.json')) || !path.join(dir, 'package.json').includes(name.split('/').pop())) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

function packageRoot(name, from = root) {
  const req = createRequire(path.join(from, 'package.json'));
  const entry = req.resolve(name);
  const marker = `node_modules${path.sep}${name.split('/').join(path.sep)}`;
  const index = entry.lastIndexOf(marker);
  return index === -1 ? packageDir(name, from) : entry.slice(0, index + marker.length);
}

const jobs = [];
const add = (label, fn) => jobs.push({ label, fn });

function copy(from, to, filter) {
  mkdirSync(to, { recursive: true });
  const names = readdirSync(from).filter((n) => (filter ? filter(n) : true));
  for (const n of names) cpSync(path.join(from, n), path.join(to, n), { recursive: true });
  return names.length;
}

add('pdfjs worker', () => {
  const dir = packageRoot('pdfjs-dist');
  return copy(path.join(dir, 'legacy', 'build'), path.join(out, 'pdfjs'), (n) => n === 'pdf.worker.min.mjs');
});

add('tesseract worker, core and english data', () => {
  const tess = packageRoot('tesseract.js');
  let n = copy(path.join(tess, 'dist'), path.join(out, 'tesseract'), (f) => f === 'worker.min.js');
  const core = packageRoot('tesseract.js-core', tess);
  n += copy(core, path.join(out, 'tesseract', 'core'), (f) => /^tesseract-core(?:-(?:relaxed)?simd)?-lstm\.wasm\.js$/.test(f));
  const data = packageRoot('@tesseract.js-data/eng');
  n += copy(path.join(data, '4.0.0_best_int'), path.join(out, 'tesseract', 'lang'), (f) => f === 'eng.traineddata.gz');
  return n;
});

add('ffmpeg single-thread core', () => {
  const dir = packageRoot('@ffmpeg/core');
  return copy(path.join(dir, 'dist', 'esm'), path.join(out, 'ffmpeg'), (f) => f.startsWith('ffmpeg-core'));
});

// The ffmpeg worker is served unbundled: webpack rewrites its dynamic import() and the core then fails to load.
add('ffmpeg worker', () => {
  const dir = packageRoot('@ffmpeg/ffmpeg');
  return copy(path.join(dir, 'dist', 'esm'), path.join(out, 'ffmpeg', 'worker'), (f) => ['worker.js', 'const.js', 'errors.js'].includes(f));
});

add('onnx runtime', () => {
  const dir = packageRoot('onnxruntime-web');
  return copy(path.join(dir, 'dist'), path.join(out, 'ort'), (f) => /^ort-wasm-simd-threaded\.(mjs|wasm)$/.test(f));
});

add('qpdf', () => {
  const dir = packageRoot('@neslinesli93/qpdf-wasm');
  return copy(path.join(dir, 'dist'), path.join(out, 'qpdf'), (f) => f === 'qpdf.wasm');
});

add('zxing reader', () => {
  const dir = packageRoot('zxing-wasm');
  const reader = path.join(dir, 'dist', 'reader');
  return existsSync(reader) ? copy(reader, path.join(out, 'zxing'), (f) => f.endsWith('.wasm')) : 0;
});

rmSync(out, { recursive: true, force: true });
let failed = 0;
for (const job of jobs) {
  try {
    console.log(`copy-assets: ${job.label}: ${job.fn()} files`);
  } catch (err) {
    failed++;
    console.warn(`copy-assets: ${job.label} skipped (${err instanceof Error ? err.message : err})`);
  }
}
if (failed === jobs.length) process.exit(1);
