/**
 * YuNet face-detection pre/post-processing (P1.7).
 *
 * Decode math verified against OpenCV's FaceDetectorYNImpl (face_detect.cpp):
 *  - blob: BGR planar float, raw 0..255 (blobFromImage defaults: no scale,
 *    no mean, no swap — the model was trained on BGR);
 *  - input padded to a multiple of 32 (pad bottom/right with zeros);
 *  - outputs per stride s ∈ {8,16,32}: cls_s, obj_s [N,1], bbox_s [N,4],
 *    kps_s [N,10] with N = (padH/s)·(padW/s), row-major (r·cols + c);
 *  - score = √(clamp01(cls)·clamp01(obj));
 *  - cx=(c+b0)·s, cy=(r+b1)·s, w=e^{b2}·s, h=e^{b3}·s;
 *  - landmark n: ((k2n+c)·s, (k2n+1+r)·s); order: right eye, left eye, nose,
 *    right mouth corner, left mouth corner.
 *
 * The shipped artifact (2023mar) has a STATIC 320×320 input: callers resize
 * the source so its long side is 320 (top-left anchored, zero-padded) and
 * pass `scale` to map detections back to source pixels.
 */

import { Box } from '../core/geometry';

export const YUNET_INPUT_SIZE = 320;
export const YUNET_STRIDES = [8, 16, 32] as const;

export interface FaceDetection {
  /** Face box normalized to the SOURCE image, [x1, y1, x2, y2] in 0..1. */
  boxNorm: Box;
  /** 5 landmarks normalized to the source image: re, le, nose, rcm, lcm. */
  landmarks: [number, number][];
  /** √(cls·obj) — the model's calibrated face score in [0,1]. */
  score: number;
}

/** Per-stride raw output tensors, keyed like the ONNX graph outputs. */
export interface YuNetOutputs {
  cls: Record<number, Float32Array>;
  obj: Record<number, Float32Array>;
  bbox: Record<number, Float32Array>;
  kps: Record<number, Float32Array>;
}

/**
 * Builds the 320×320 BGR planar blob from RGBA pixels of a top-left anchored,
 * zero-padded resize (caller draws the source scaled by `scale` into the
 * canvas corner; remaining pixels stay black = zero padding, matching
 * OpenCV's copyMakeBorder BORDER_CONSTANT 0).
 */
export function buildYuNetBlob(rgba: Uint8ClampedArray, size: number = YUNET_INPUT_SIZE): Float32Array {
  const plane = size * size;
  const blob = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const p = i * 4;
    blob[i] = rgba[p + 2];              // B
    blob[plane + i] = rgba[p + 1];      // G
    blob[2 * plane + i] = rgba[p];      // R
  }
  return blob;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Decodes YuNet outputs into face detections in SOURCE-normalized coords.
 *
 * @param outputs Raw tensors per stride.
 * @param scale   sourcePx → inputPx factor used when drawing (input = src·scale).
 * @param srcW    Source image width in pixels.
 * @param srcH    Source image height in pixels.
 * @param scoreThreshold Minimum √(cls·obj); OpenCV default 0.6 — we default
 *   0.7: portrait presence must be sure before it drives cropping (N1).
 * @param nmsThreshold IoU above which a lower-scored box is suppressed.
 */
export function decodeYuNet(
  outputs: YuNetOutputs,
  scale: number,
  srcW: number,
  srcH: number,
  scoreThreshold = 0.7,
  nmsThreshold = 0.3,
  inputSize: number = YUNET_INPUT_SIZE
): FaceDetection[] {
  const raw: FaceDetection[] = [];

  for (const s of YUNET_STRIDES) {
    const cols = Math.floor(inputSize / s);
    const rows = Math.floor(inputSize / s);
    const cls = outputs.cls[s];
    const obj = outputs.obj[s];
    const bbox = outputs.bbox[s];
    const kps = outputs.kps[s];
    if (!cls || !obj || !bbox || !kps) continue;

    const n = Math.min(rows * cols, cls.length);
    for (let idx = 0; idx < n; idx++) {
      const score = Math.sqrt(clamp01(cls[idx]) * clamp01(obj[idx]));
      if (score < scoreThreshold) continue;

      const r = Math.floor(idx / cols);
      const c = idx % cols;
      const cx = (c + bbox[idx * 4]) * s;
      const cy = (r + bbox[idx * 4 + 1]) * s;
      const w = Math.exp(bbox[idx * 4 + 2]) * s;
      const h = Math.exp(bbox[idx * 4 + 3]) * s;

      // input px → source px → normalized. Guard against degenerate boxes.
      if (!(w > 1 && h > 1)) continue;
      const x1 = (cx - w / 2) / scale;
      const y1 = (cy - h / 2) / scale;
      const x2 = (cx + w / 2) / scale;
      const y2 = (cy + h / 2) / scale;

      const landmarks: [number, number][] = [];
      for (let k = 0; k < 5; k++) {
        landmarks.push([
          ((kps[idx * 10 + 2 * k] + c) * s) / scale / srcW,
          ((kps[idx * 10 + 2 * k + 1] + r) * s) / scale / srcH,
        ]);
      }

      raw.push({
        boxNorm: [
          clamp01(x1 / srcW),
          clamp01(y1 / srcH),
          clamp01(x2 / srcW),
          clamp01(y2 / srcH),
        ],
        landmarks,
        score,
      });
    }
  }

  // Standard greedy NMS (single class).
  raw.sort((a, b) => b.score - a.score);
  const kept: FaceDetection[] = [];
  for (const det of raw) {
    let suppressed = false;
    for (const k of kept) {
      if (iou(det.boxNorm, k.boxNorm) > nmsThreshold) {
        suppressed = true;
        break;
      }
    }
    if (!suppressed) kept.push(det);
  }
  return kept;
}

function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}
