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

// PP-OCRv6 recognition tiers (P3.6 candidates; official PaddlePaddle HF).
// The dict is embedded in inference.yml — extracted to one-char-per-line txt
// below (the loader appends the space char, matching the models' C=18710 =
// blank + 18708 + space, verified by ONNX output probe; small and medium
// share the SAME dictionary, verified byte-equal).
const V6_BASE = 'https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec_onnx/resolve/main';
const V6_MEDIUM_BASE = 'https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_onnx/resolve/main';

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

// v6 rec tiers + extracted dict.
await download('PP-OCRv6_small_rec_infer.onnx', `${V6_BASE}/inference.onnx`);
await download('PP-OCRv6_medium_rec_infer.onnx', `${V6_MEDIUM_BASE}/inference.onnx`);
{
  const dictOut = join(OUT_DIR, 'ppocrv6_dict.txt');
  if (!(await exists(dictOut))) {
    console.log('↓ Downloading + extracting ppocrv6_dict.txt from inference.yml ...');
    const res = await fetch(`${V6_BASE}/inference.yml`);
    if (!res.ok) throw new Error(`v6 yml fetch failed: ${res.status}`);
    const yml = await res.text();
    const chars = [];
    let inDict = false;
    for (const raw of yml.split(/\r?\n/)) {
      if (raw.includes('character_dict')) { inDict = true; continue; }
      if (!inDict) continue;
      // ASCII-space stripping ONLY: JS trim() eats Unicode whitespace and
      // silently deleted the U+3000 ideographic-space ENTRY (`- 　`),
      // shifting every class after index 1748 (live-caught off-by-one).
      const s = raw.replace(/[\r\n]+$/, '');
      const t = s.replace(/^ +/, '');
      if (t.startsWith('- ')) {
        let val = t.slice(2);
        if (val.startsWith("'") && val.endsWith("'") && val.length >= 2) {
          val = val.slice(1, -1).replaceAll("''", "'");
        } else if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
          val = val.slice(1, -1);
        }
        chars.push(val);
      } else if (t.length > 0 && !s.startsWith(' ')) {
        break;
      }
    }
    if (chars.length < 18000) throw new Error(`v6 dict extraction suspicious: ${chars.length} chars`);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(dictOut, chars.join('\n'), 'utf8');
    console.log(`✓ ppocrv6_dict.txt (${chars.length} chars extracted)`);
  } else {
    console.log('✓ ppocrv6_dict.txt already present, skipping.');
  }
}
console.log('All model artifacts ready in public/models.');
