import { describe, expect, it } from 'vitest';
import {
  YUNET_INPUT_SIZE,
  YUNET_STRIDES,
  buildYuNetBlob,
  decodeYuNet,
  type YuNetOutputs,
} from './yunet';

/** Empty per-stride tensors for a given input size. */
function emptyOutputs(size = YUNET_INPUT_SIZE): YuNetOutputs {
  const out: YuNetOutputs = { cls: {}, obj: {}, bbox: {}, kps: {} };
  for (const s of YUNET_STRIDES) {
    const n = (size / s) * (size / s);
    out.cls[s] = new Float32Array(n);
    out.obj[s] = new Float32Array(n);
    out.bbox[s] = new Float32Array(n * 4);
    out.kps[s] = new Float32Array(n * 10);
  }
  return out;
}

/** Plants a face at grid cell (r,c) of `stride` with given box params. */
function plant(
  o: YuNetOutputs,
  stride: number,
  r: number,
  c: number,
  { cls = 0.95, obj = 0.9, dx = 0.5, dy = 0.5, logW = Math.log(6), logH = Math.log(8) } = {},
  size = YUNET_INPUT_SIZE
) {
  const cols = size / stride;
  const idx = r * cols + c;
  o.cls[stride][idx] = cls;
  o.obj[stride][idx] = obj;
  o.bbox[stride][idx * 4] = dx;
  o.bbox[stride][idx * 4 + 1] = dy;
  o.bbox[stride][idx * 4 + 2] = logW;
  o.bbox[stride][idx * 4 + 3] = logH;
  // Landmarks: eyes above center, mouth below (grid-relative offsets).
  const lm = [dx - 1, dy - 1, dx + 1, dy - 1, dx, dy, dx - 0.8, dy + 1, dx + 0.8, dy + 1];
  for (let k = 0; k < 10; k++) o.kps[stride][idx * 10 + k] = lm[k];
  return idx;
}

describe('buildYuNetBlob', () => {
  it('produces BGR planar raw 0..255 (the OpenCV blobFromImage contract)', () => {
    const size = YUNET_INPUT_SIZE;
    const rgba = new Uint8ClampedArray(size * size * 4);
    rgba[0] = 10; rgba[1] = 20; rgba[2] = 30; rgba[3] = 255; // pixel 0: R=10 G=20 B=30
    const blob = buildYuNetBlob(rgba);
    const plane = size * size;
    expect(blob[0]).toBe(30);         // B plane first
    expect(blob[plane]).toBe(20);     // G
    expect(blob[2 * plane]).toBe(10); // R
    expect(blob.length).toBe(3 * plane);
  });
});

describe('decodeYuNet', () => {
  it('decodes box geometry exactly per the verified formulas', () => {
    const o = emptyOutputs();
    // stride 8, cell (10, 12): cx=(12+0.5)*8=100, cy=(10+0.5)*8=84, w=48, h=64
    plant(o, 8, 10, 12);
    // Source 640×640 drawn at scale 0.5 → input 320.
    const dets = decodeYuNet(o, 0.5, 640, 640, 0.7, 0.3);
    expect(dets).toHaveLength(1);
    const [x1, y1, x2, y2] = dets[0].boxNorm;
    expect(x1).toBeCloseTo((100 - 24) / 0.5 / 640, 5);
    expect(y1).toBeCloseTo((84 - 32) / 0.5 / 640, 5);
    expect(x2).toBeCloseTo((100 + 24) / 0.5 / 640, 5);
    expect(y2).toBeCloseTo((84 + 32) / 0.5 / 640, 5);
    expect(dets[0].score).toBeCloseTo(Math.sqrt(0.95 * 0.9), 5);
    // Landmark 0 (right eye): ((dx-1)+c)*s / scale / srcW
    expect(dets[0].landmarks[0][0]).toBeCloseTo(((12 - 0.5) * 8) / 0.5 / 640, 5);
  });

  it('applies the score threshold to √(cls·obj), not to either alone', () => {
    const o = emptyOutputs();
    plant(o, 16, 4, 4, { cls: 0.9, obj: 0.4 }); // √0.36 = 0.6 < 0.7
    expect(decodeYuNet(o, 1, 320, 320, 0.7, 0.3)).toHaveLength(0);
    const o2 = emptyOutputs();
    plant(o2, 16, 4, 4, { cls: 0.9, obj: 0.6 }); // √0.54 ≈ 0.735 ≥ 0.7
    expect(decodeYuNet(o2, 1, 320, 320, 0.7, 0.3)).toHaveLength(1);
  });

  it('clamps cls/obj to [0,1] like the reference implementation', () => {
    const o = emptyOutputs();
    plant(o, 32, 2, 2, { cls: 1.7, obj: 1.3 }); // clamped → score 1
    const dets = decodeYuNet(o, 1, 320, 320, 0.7, 0.3);
    expect(dets).toHaveLength(1);
    expect(dets[0].score).toBe(1);
  });

  it('suppresses overlapping duplicates across strides via NMS', () => {
    const o = emptyOutputs();
    plant(o, 8, 10, 10, { cls: 0.95, obj: 0.95, logW: Math.log(8), logH: Math.log(8) });
    // Same face detected at stride 16, cell (5,5) → same center, similar box.
    plant(o, 16, 5, 5, { cls: 0.8, obj: 0.8, logW: Math.log(4), logH: Math.log(4) });
    const dets = decodeYuNet(o, 1, 320, 320, 0.7, 0.3);
    expect(dets).toHaveLength(1);
    expect(dets[0].score).toBeCloseTo(0.95, 5); // higher-scored survivor
  });

  it('returns [] on empty tensors and never fabricates', () => {
    expect(decodeYuNet(emptyOutputs(), 1, 320, 320, 0.7, 0.3)).toEqual([]);
  });
});
