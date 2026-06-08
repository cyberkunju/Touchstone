/**
 * Copies the onnxruntime-web wasm runtime files into public/ort so the app
 * serves them from its own origin (no CDN, local-only). Runs automatically
 * after `npm install` (postinstall) and via `npm run setup:ort`.
 */
import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'node_modules', 'onnxruntime-web', 'dist');
const OUT = join(__dirname, '..', 'public', 'ort');

await mkdir(OUT, { recursive: true });

let entries;
try {
  entries = await readdir(SRC);
} catch {
  console.warn('onnxruntime-web not installed yet; skipping ORT wasm copy.');
  process.exit(0);
}

const wanted = entries.filter(
  (f) => /^ort-wasm-.*\.(wasm|mjs)$/.test(f),
);

for (const f of wanted) {
  await copyFile(join(SRC, f), join(OUT, f));
}
console.log(`Copied ${wanted.length} onnxruntime-web runtime file(s) to public/ort.`);
