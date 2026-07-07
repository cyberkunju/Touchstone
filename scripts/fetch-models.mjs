/**
 * Downloads the real PP-OCRv5 model artifacts into public/models so the app can
 * serve them from its own origin (fully offline at runtime). Run once after
 * cloning: `npm run setup:models`.
 *
 * Source: https://huggingface.co/bluecopa/paddleocr-v5-onnx (Apache-2.0).
 */
import { mkdir, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'models');
const HF_BASE = 'https://huggingface.co/bluecopa/paddleocr-v5-onnx/resolve/main';
// OpenCV Zoo HF mirror serves the real LFS binary (raw.githubusercontent
// would return an LFS pointer file). 2023mar = static 320×320 input.
const YUNET_URL =
  'https://huggingface.co/opencv/opencv_zoo/resolve/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx';

const FILES = [
  'PP-OCRv5_server_det_infer.onnx',
  'PP-OCRv5_server_rec_infer.onnx',
  'ppocrv5_dict.txt',
];

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function download(name, urlOverride) {
  const out = join(OUT_DIR, name);
  if (await exists(out)) {
    console.log(`✓ ${name} already present, skipping.`);
    return;
  }
  const url = urlOverride ?? `${HF_BASE}/${name}`;
  console.log(`↓ Downloading ${name} ...`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${name}: ${res.status} ${res.statusText}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(out));
  const { size } = await stat(out);
  console.log(`✓ ${name} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

await mkdir(OUT_DIR, { recursive: true });
for (const f of FILES) {
  await download(f);
}
await download('face_detection_yunet_2023mar.onnx', YUNET_URL);
console.log('All model artifacts ready in public/models.');
