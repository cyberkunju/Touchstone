import { describe, it, expect } from 'vitest';
import {
  computeLetterbox,
  postProcessYolo,
  normalizeYoloTensor,
  YOLO_CLASSES,
  Letterbox
} from './yolo';

/**
 * Helper to build an attribute-major YOLO tensor of logical shape
 * [4 + numClasses, numAnchors]. `attrs` is indexed [attr][anchor].
 */
function buildTensor(attrs: number[][], numAnchors: number): Float32Array {
  const rows = attrs.length;
  const data = new Float32Array(rows * numAnchors);
  for (let attr = 0; attr < rows; attr++) {
    for (let anchor = 0; anchor < numAnchors; anchor++) {
      data[attr * numAnchors + anchor] = attrs[attr][anchor];
    }
  }
  return data;
}

describe('computeLetterbox', () => {
  it('wide image fits with vertical padding', () => {
    const lb = computeLetterbox(1000, 500, 640);
    expect(lb.scale).toBeCloseTo(0.64, 10);
    expect(lb.padX).toBeCloseTo(0, 10);
    // scaledH = 500 * 0.64 = 320, padY = (640 - 320)/2 = 160
    expect(lb.padY).toBeCloseTo(160, 10);
    expect(lb.modelSize).toBe(640);
  });

  it('tall image fits with horizontal padding (symmetric to wide case)', () => {
    const lb = computeLetterbox(500, 1000, 640);
    expect(lb.scale).toBeCloseTo(0.64, 10);
    expect(lb.padY).toBeCloseTo(0, 10);
    // scaledW = 500 * 0.64 = 320, padX = (640 - 320)/2 = 160
    expect(lb.padX).toBeCloseTo(160, 10);
    expect(lb.modelSize).toBe(640);
  });

  it('square image has no padding and scale derived from side', () => {
    const lb = computeLetterbox(640, 640, 640);
    expect(lb.scale).toBeCloseTo(1, 10);
    expect(lb.padX).toBeCloseTo(0, 10);
    expect(lb.padY).toBeCloseTo(0, 10);
  });

  it('guards degenerate dimensions', () => {
    expect(computeLetterbox(0, 500, 640)).toEqual({ scale: 1, padX: 0, padY: 0, modelSize: 640 });
    expect(computeLetterbox(500, 0, 640)).toEqual({ scale: 1, padX: 0, padY: 0, modelSize: 640 });
    expect(computeLetterbox(-10, -10, 640)).toEqual({ scale: 1, padX: 0, padY: 0, modelSize: 640 });
  });
});

describe('postProcessYolo - decoding & filtering', () => {
  it('decodes a centered box, filters low-score anchors, maps to normalized coords', () => {
    const numClasses = 2;
    const numAnchors = 2;
    // attr rows: cx, cy, w, h, class0, class1
    // anchor 0: centered box (320,320,100,200), class1 high (0.9)
    // anchor 1: tiny box, class scores below threshold
    const tensor = buildTensor(
      [
        [320, 10],   // cx
        [320, 10],   // cy
        [100, 5],    // w
        [200, 5],    // h
        [0.1, 0.05], // class 0
        [0.9, 0.2]   // class 1
      ],
      numAnchors
    );

    const lb: Letterbox = { scale: 1, padX: 0, padY: 0, modelSize: 640 };
    const dets = postProcessYolo(tensor, numClasses, numAnchors, 0.5, 0.5, lb, 640, 640);

    expect(dets).toHaveLength(1);
    const d = dets[0];
    expect(d.classId).toBe(1);
    expect(d.className).toBe('photo');
    expect(YOLO_CLASSES[1]).toBe('photo');
    expect(d.score).toBeCloseTo(0.9, 5);

    // corners in model space: x1=270,y1=220,x2=370,y2=420 -> /640
    expect(d.box[0]).toBeCloseTo(270 / 640, 10);
    expect(d.box[1]).toBeCloseTo(220 / 640, 10);
    expect(d.box[2]).toBeCloseTo(370 / 640, 10);
    expect(d.box[3]).toBeCloseTo(420 / 640, 10);
  });

  it('maps model-space coords through a non-trivial letterbox back to original normalized space', () => {
    const numClasses = 1;
    const numAnchors = 1;
    // model box: cx=320, cy=320, w=128, h=64 -> corners x1=256,y1=288,x2=384,y2=352
    const tensor = buildTensor(
      [
        [320], // cx
        [320], // cy
        [128], // w
        [64],  // h
        [0.9]  // class 0
      ],
      numAnchors
    );

    // srcW=1000, srcH=500, modelSize=640 => scale=0.64, padX=0, padY=160
    const lb = computeLetterbox(1000, 500, 640);
    const dets = postProcessYolo(tensor, numClasses, numAnchors, 0.5, 0.5, lb, 1000, 500);

    expect(dets).toHaveLength(1);
    const d = dets[0];
    expect(d.classId).toBe(0);
    expect(d.className).toBe('document_page');

    // X: ((modelX - 0)/0.64)/1000 ; Y: ((modelY - 160)/0.64)/500
    expect(d.box[0]).toBeCloseTo(0.4, 6); // 256/0.64/1000
    expect(d.box[1]).toBeCloseTo(0.4, 6); // (288-160)/0.64/500
    expect(d.box[2]).toBeCloseTo(0.6, 6); // 384/0.64/1000
    expect(d.box[3]).toBeCloseTo(0.6, 6); // (352-160)/0.64/500
  });

  it('clamps normalized coordinates to [0,1]', () => {
    const numClasses = 1;
    const numAnchors = 1;
    // box extending beyond model bounds -> would map outside [0,1]
    const tensor = buildTensor(
      [
        [320],  // cx
        [320],  // cy
        [2000], // w (huge)
        [2000], // h (huge)
        [0.9]   // class 0
      ],
      numAnchors
    );

    const lb: Letterbox = { scale: 1, padX: 0, padY: 0, modelSize: 640 };
    const dets = postProcessYolo(tensor, numClasses, numAnchors, 0.5, 0.5, lb, 640, 640);

    expect(dets).toHaveLength(1);
    const d = dets[0];
    expect(d.box[0]).toBeGreaterThanOrEqual(0);
    expect(d.box[1]).toBeGreaterThanOrEqual(0);
    expect(d.box[2]).toBeLessThanOrEqual(1);
    expect(d.box[3]).toBeLessThanOrEqual(1);
    expect(d.box[0]).toBe(0);
    expect(d.box[2]).toBe(1);
  });
});

describe('postProcessYolo - NMS', () => {
  const lb: Letterbox = { scale: 1, padX: 0, padY: 0, modelSize: 640 };

  it('suppresses overlapping boxes of the same class', () => {
    const numClasses = 2;
    const numAnchors = 2;
    // both anchors class 1, heavily overlapping boxes
    // anchor0: (320,320,200,200) corners 220..420
    // anchor1: (330,330,200,200) corners 230..430
    const tensor = buildTensor(
      [
        [320, 330], // cx
        [320, 330], // cy
        [200, 200], // w
        [200, 200], // h
        [0.1, 0.1], // class 0
        [0.9, 0.8]  // class 1
      ],
      numAnchors
    );

    const dets = postProcessYolo(tensor, numClasses, numAnchors, 0.5, 0.5, lb, 640, 640);
    expect(dets).toHaveLength(1);
    expect(dets[0].score).toBeCloseTo(0.9, 5); // higher-score box kept
    expect(dets[0].classId).toBe(1);
  });

  it('keeps overlapping boxes of different classes', () => {
    const numClasses = 2;
    const numAnchors = 2;
    // anchor0 class1, anchor1 class0, heavily overlapping
    const tensor = buildTensor(
      [
        [320, 330], // cx
        [320, 330], // cy
        [200, 200], // w
        [200, 200], // h
        [0.1, 0.85], // class 0  (anchor1 wins class0)
        [0.9, 0.1]   // class 1  (anchor0 wins class1)
      ],
      numAnchors
    );

    const dets = postProcessYolo(tensor, numClasses, numAnchors, 0.5, 0.5, lb, 640, 640);
    expect(dets).toHaveLength(2);
    const classIds = dets.map((d) => d.classId).sort();
    expect(classIds).toEqual([0, 1]);
  });
});

describe('normalizeYoloTensor', () => {
  it('produces CHW planar RGB normalized to [0,1] with correct length', () => {
    const size = 2; // 4 pixels
    // pixels (RGBA):
    // p0 = (255,0,0,255), p1 = (0,255,0,255)
    // p2 = (0,0,255,255), p3 = (255,255,255,0)
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 0
    ]);

    const out = normalizeYoloTensor(rgba, size);
    expect(out).toHaveLength(3 * size * size); // 12

    const pc = size * size; // 4
    // R plane = pixel/255 for R channel of each pixel
    expect(out[0]).toBeCloseTo(1, 10);     // p0 R
    expect(out[1]).toBeCloseTo(0, 10);     // p1 R
    expect(out[2]).toBeCloseTo(0, 10);     // p2 R
    expect(out[3]).toBeCloseTo(1, 10);     // p3 R
    // G plane
    expect(out[pc + 0]).toBeCloseTo(0, 10); // p0 G
    expect(out[pc + 1]).toBeCloseTo(1, 10); // p1 G
    expect(out[pc + 2]).toBeCloseTo(0, 10); // p2 G
    expect(out[pc + 3]).toBeCloseTo(1, 10); // p3 G
    // B plane
    expect(out[2 * pc + 0]).toBeCloseTo(0, 10); // p0 B
    expect(out[2 * pc + 1]).toBeCloseTo(0, 10); // p1 B
    expect(out[2 * pc + 2]).toBeCloseTo(1, 10); // p2 B
    expect(out[2 * pc + 3]).toBeCloseTo(1, 10); // p3 B
  });

  it('normalizes an arbitrary mid-range pixel exactly', () => {
    const size = 1;
    const rgba = new Uint8ClampedArray([128, 64, 32, 255]);
    const out = normalizeYoloTensor(rgba, size);
    expect(out).toHaveLength(3);
    expect(out[0]).toBeCloseTo(128 / 255, 5);
    expect(out[1]).toBeCloseTo(64 / 255, 5);
    expect(out[2]).toBeCloseTo(32 / 255, 5);
  });
});
