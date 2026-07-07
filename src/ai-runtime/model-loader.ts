import { deleteOPFSFile, existsOPFSFile, readOPFSFile, writeOPFSFile } from '../storage/opfs';
import { CharDictSpec, parseCharDictionary } from './model-registry';

const OPFS_DIR = 'models';

export interface DownloadProgress {
  loaded: number;
  total: number;
  progress: number; // 0 to 100
}

/**
 * Ensures an artifact (ONNX model, dictionary, ...) is cached in OPFS,
 * downloading it with real-time progress if absent. Works for any file type;
 * the caller supplies the exact file name (including extension).
 *
 * @param fileName Cache file name, e.g. 'PP-OCRv5_server_rec_infer.onnx'.
 * @param url Absolute download URL.
 * @param onProgress Optional progress callback.
 * @returns The file contents as an ArrayBuffer.
 */
/**
 * Sanity-check a fetched/cached artifact so a poisoned cache heals itself.
 *
 * Live-caught: requesting a model file that did not exist yet made the dev
 * server's SPA fallback answer 200 with index.html — which was then cached
 * into OPFS forever and fed to ORT ("protobuf parsing failed"). ONNX files
 * are protobufs (never '<'); dictionaries are non-HTML text. A doctype/HTML
 * prefix in either is unambiguously poison, not a model.
 */
function looksValidArtifact(fileName: string, data: ArrayBuffer): boolean {
  if (data.byteLength < 128) return false;
  const head = new Uint8Array(data, 0, Math.min(64, data.byteLength));
  let text = '';
  for (const b of head) text += String.fromCharCode(b);
  const trimmed = text.trimStart();
  if (trimmed.startsWith('<!') || trimmed.toLowerCase().startsWith('<html')) return false;
  if (fileName.endsWith('.onnx') && trimmed.startsWith('<')) return false;
  return true;
}

export async function ensureFileCached(
  fileName: string,
  url: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<ArrayBuffer> {
  // 1. Serve from OPFS cache when present — unless the entry is poison, in
  //    which case it is evicted and re-downloaded (self-healing cache).
  if (await existsOPFSFile(OPFS_DIR, fileName)) {
    console.log(`[Model Loader] Loading ${fileName} from OPFS cache...`);
    const file = await readOPFSFile(OPFS_DIR, fileName);
    const cached = await file.arrayBuffer();
    if (looksValidArtifact(fileName, cached)) return cached;
    console.warn(`[Model Loader] Cached ${fileName} is not a valid artifact (poisoned cache) — evicting.`);
    await deleteOPFSFile(OPFS_DIR, fileName);
  }

  // 2. Download with progress tracking.
  console.log(`[Model Loader] ${fileName} not cached. Downloading from ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${fileName}: ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get('content-length');
  const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body reader is not available');
  }

  let loadedBytes = 0;
  const chunks: Uint8Array[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.length;
    if (onProgress && totalBytes > 0) {
      onProgress({
        loaded: loadedBytes,
        total: totalBytes,
        progress: Math.round((loadedBytes / totalBytes) * 100),
      });
    }
  }

  const combined = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  const data = combined.buffer;

  // A download that is secretly the SPA fallback page must never be cached
  // or handed to ORT — fail loudly instead (the model URL is wrong/missing).
  if (!looksValidArtifact(fileName, data)) {
    throw new Error(
      `Downloaded ${fileName} from ${url} is not a valid artifact (got HTML/garbage — check the URL).`,
    );
  }

  // 3. Persist to OPFS for future loads.
  console.log(`[Model Loader] Caching ${fileName} to OPFS...`);
  await writeOPFSFile(OPFS_DIR, fileName, new Blob([data]));
  console.log(`[Model Loader] ${fileName} cached.`);

  return data;
}

/** Checks whether an artifact is cached in OPFS. */
export async function isFileCached(fileName: string): Promise<boolean> {
  return existsOPFSFile(OPFS_DIR, fileName);
}

/**
 * Ensures the PP-OCR character dictionary is cached, then parses it into the
 * CTC recognition vocabulary (dictionary characters + trailing space).
 *
 * @param spec The dictionary artifact specification.
 * @param onProgress Optional download progress callback.
 * @returns The recognition vocabulary array.
 */
export async function loadCharDictionary(
  spec: CharDictSpec,
  onProgress?: (p: DownloadProgress) => void,
): Promise<string[]> {
  const buffer = await ensureFileCached(spec.fileName, spec.url, onProgress);
  const text = new TextDecoder('utf-8').decode(buffer);
  return parseCharDictionary(text);
}
