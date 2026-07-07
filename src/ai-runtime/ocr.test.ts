import { describe, it, expect } from 'vitest';
import {
  computeRecTargetWidth,
  normalizeRecognitionTensor,
  decodeCTCGreedy,
  normalizeDetectorTensor,
  postProcessDBNet,
  postProcessDBNetQuads,
  planDetBands,
  dedupeBoxes,
  OcrRecResult,
} from './ocr';
import { Box } from '../core/geometry';

/**
 * Reference: probability of the argmax class for one probability row.
 */
function refArgmaxProb(row: number[]): number {
  return Math.max(...row);
}

describe('computeRecTargetWidth', () => {
  it('preserves aspect ratio scaled to imgH (ceil)', () => {
    // ratio = 100/50 = 2 -> 48 * 2 = 96
    expect(computeRecTargetWidth(100, 50, 48, 320)).toBe(96);
  });

  it('uses ceil for non-integer widths', () => {
    // ratio = 33/48, 48 * (33/48) = 33 exactly -> 33
    expect(computeRecTargetWidth(33, 48, 48, 320)).toBe(33);
    // ratio = 10/3, 48 * 10/3 = 160 -> 160
    expect(computeRecTargetWidth(10, 3, 48, 320)).toBe(160);
    // non-integer: srcW=7 srcH=48 -> 48*7/48 = 7
    expect(computeRecTargetWidth(7, 48, 48, 320)).toBe(7);
    // produce fractional -> ceil: srcW=5, srcH=48, imgH=32 -> 32*5/48 = 3.333 -> 4
    expect(computeRecTargetWidth(5, 48, 32, 320)).toBe(4);
  });

  it('clamps to maxW', () => {
    // ratio huge -> clamp to 320
    expect(computeRecTargetWidth(10000, 10, 48, 320)).toBe(320);
  });

  it('returns at least 1 for tiny ratios', () => {
    // 48 * (1/10000) = ceil(0.0048) = 1
    expect(computeRecTargetWidth(1, 10000, 48, 320)).toBe(1);
  });

  it('handles degenerate dimensions by returning 1', () => {
    expect(computeRecTargetWidth(0, 50, 48, 320)).toBe(1);
    expect(computeRecTargetWidth(100, 0, 48, 320)).toBe(1);
    expect(computeRecTargetWidth(-5, 50, 48, 320)).toBe(1);
    expect(computeRecTargetWidth(100, -50, 48, 320)).toBe(1);
  });

  it('always returns an integer', () => {
    const w = computeRecTargetWidth(123, 45, 48, 320);
    expect(Number.isInteger(w)).toBe(true);
  });
});

describe('normalizeRecognitionTensor', () => {
  it('produces exact CHW values with [-1,1] normalization and zero padding', () => {
    const srcW = 2;
    const imgH = 1;
    const padW = 3;
    // px0 = (255, 0, 128), px1 = (0, 255, 64), alpha ignored
    const rgba = new Uint8ClampedArray([
      255, 0, 128, 255,
      0, 255, 64, 255,
    ]);

    const t = normalizeRecognitionTensor(rgba, srcW, imgH, padW);

    // length = 3 * imgH * padW
    expect(t.length).toBe(3 * imgH * padW);

    const plane = imgH * padW; // 3
    const norm = (p: number) => (p / 255 - 0.5) / 0.5;

    // R plane
    expect(t[0]).toBeCloseTo(norm(255), 6); // 1.0
    expect(t[1]).toBeCloseTo(norm(0), 6); // -1.0
    expect(t[2]).toBe(0); // padding

    // G plane
    expect(t[plane + 0]).toBeCloseTo(norm(0), 6); // -1.0
    expect(t[plane + 1]).toBeCloseTo(norm(255), 6); // 1.0
    expect(t[plane + 2]).toBe(0); // padding

    // B plane
    expect(t[2 * plane + 0]).toBeCloseTo(norm(128), 6);
    expect(t[2 * plane + 1]).toBeCloseTo(norm(64), 6);
    expect(t[2 * plane + 2]).toBe(0); // padding
  });

  it('produces all-zero padded columns when padW > srcW', () => {
    const srcW = 1;
    const imgH = 2;
    const padW = 4;
    const rgba = new Uint8ClampedArray([
      10, 20, 30, 255, // row0
      40, 50, 60, 255, // row1
    ]);
    const t = normalizeRecognitionTensor(rgba, srcW, imgH, padW);
    expect(t.length).toBe(3 * imgH * padW);

    const plane = imgH * padW; // 8
    // For each channel/row, columns 1..3 must be zero.
    for (let c = 0; c < 3; c++) {
      for (let y = 0; y < imgH; y++) {
        for (let x = 1; x < padW; x++) {
          expect(t[c * plane + y * padW + x]).toBe(0);
        }
      }
    }
  });
});

describe('decodeCTCGreedy', () => {
  const vocab = ['A', 'B', 'C']; // numClasses includes blank at index 0

  it('collapses duplicates, drops blanks and maps idx-1 -> char', () => {
    const numClasses = 4;
    // argmax path: [0 blank, 1 (A), 1 (A dup), 0 blank, 3 (C)] — probability rows
    const rows = [
      [0.90, 0.04, 0.03, 0.03], // argmax 0 -> blank
      [0.10, 0.80, 0.05, 0.05], // argmax 1 -> A (prob 0.80)
      [0.15, 0.70, 0.10, 0.05], // argmax 1 -> A (collapsed)
      [0.85, 0.05, 0.05, 0.05], // argmax 0 -> blank
      [0.05, 0.05, 0.10, 0.80], // argmax 3 -> C (prob 0.80)
    ];
    const probs = new Float32Array(rows.flat());
    const res: OcrRecResult = decodeCTCGreedy(probs, rows.length, numClasses, vocab);

    expect(res.text).toBe('AC');

    // Confidence: mean of the argmax probabilities of emitted rows (row1, row4).
    const expected = (refArgmaxProb(rows[1]) + refArgmaxProb(rows[4])) / 2;
    expect(res.confidence).toBeCloseTo(expected, 6);
    expect(res.confidence).toBeGreaterThan(0);
    expect(res.confidence).toBeLessThanOrEqual(1);
  });

  it('returns empty text and 0 confidence when all blank', () => {
    const numClasses = 4;
    const rows = [
      [0.97, 0.01, 0.01, 0.01],
      [0.90, 0.05, 0.03, 0.02],
      [0.92, 0.03, 0.03, 0.02],
    ];
    const probs = new Float32Array(rows.flat());
    const res = decodeCTCGreedy(probs, rows.length, numClasses, vocab);
    expect(res.text).toBe('');
    expect(res.confidence).toBe(0);
  });

  it('yields low (<0.3) confidence when the winning probability is small', () => {
    const numClasses = 4;
    // argmax is class 1 but only marginally ahead -> low confidence
    const rows = [[0.25, 0.26, 0.25, 0.24]];
    const probs = new Float32Array(rows.flat());
    const res = decodeCTCGreedy(probs, rows.length, numClasses, vocab);
    expect(res.text).toBe('A');
    expect(res.confidence).toBeCloseTo(0.26, 6);
    expect(res.confidence).toBeLessThan(0.3);
  });

  it('gives near-1 confidence when a class dominates', () => {
    const numClasses = 4;
    const rows = [[0.002, 0.997, 0.0005, 0.0005]];
    const probs = new Float32Array(rows.flat());
    const res = decodeCTCGreedy(probs, rows.length, numClasses, vocab);
    expect(res.text).toBe('A');
    expect(res.confidence).toBeGreaterThan(0.99);
    expect(res.confidence).toBeLessThanOrEqual(1);
  });

  it('skips out-of-range indices without emitting or counting them', () => {
    const numClasses = 5; // valid char indices 1..3 (vocab length 3); index 4 invalid
    const rows = [
      [0.05, 0.85, 0.05, 0.03, 0.02], // argmax 1 -> A
      [0.05, 0.05, 0.03, 0.02, 0.85], // argmax 4 -> idx-1=3 out of range -> skipped
    ];
    const probs = new Float32Array(rows.flat());
    const res = decodeCTCGreedy(probs, rows.length, numClasses, vocab);
    expect(res.text).toBe('A');
    // Only the valid emitted row contributes to confidence.
    expect(res.confidence).toBeCloseTo(refArgmaxProb(rows[0]), 6);
  });
});

describe('normalizeDetectorTensor', () => {
  it('produces exact ImageNet-normalized CHW values and correct length', () => {
    const w = 1;
    const h = 1;
    const rgba = new Uint8ClampedArray([255, 0, 128, 255]);
    const t = normalizeDetectorTensor(rgba, w, h);

    expect(t.length).toBe(3 * w * h);

    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];
    expect(t[0]).toBeCloseTo((255 / 255 - mean[0]) / std[0], 6);
    expect(t[1]).toBeCloseTo((0 / 255 - mean[1]) / std[1], 6);
    expect(t[2]).toBeCloseTo((128 / 255 - mean[2]) / std[2], 6);
  });

  it('lays out channels in planar RGB order for a 2x1 image', () => {
    const w = 2;
    const h = 1;
    const rgba = new Uint8ClampedArray([
      100, 110, 120, 255,
      200, 210, 220, 255,
    ]);
    const t = normalizeDetectorTensor(rgba, w, h);
    expect(t.length).toBe(6);
    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];
    // R plane indices 0,1
    expect(t[0]).toBeCloseTo((100 / 255 - mean[0]) / std[0], 6);
    expect(t[1]).toBeCloseTo((200 / 255 - mean[0]) / std[0], 6);
    // G plane indices 2,3
    expect(t[2]).toBeCloseTo((110 / 255 - mean[1]) / std[1], 6);
    expect(t[3]).toBeCloseTo((210 / 255 - mean[1]) / std[1], 6);
    // B plane indices 4,5
    expect(t[4]).toBeCloseTo((120 / 255 - mean[2]) / std[2], 6);
    expect(t[5]).toBeCloseTo((220 / 255 - mean[2]) / std[2], 6);
  });
});

describe('postProcessDBNet', () => {
  const MAP = 10;

  function makeMap(fill = 0): Float32Array {
    return new Float32Array(MAP * MAP).fill(fill);
  }

  function setBlock(
    map: Float32Array,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    prob: number
  ) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        map[y * MAP + x] = prob;
      }
    }
  }

  it('returns exactly one box for a single solid high-prob block, expanded by unclip', () => {
    const map = makeMap();
    // 5x5 block: cols 2..6, rows 2..6 -> boxW = boxH = 4
    setBlock(map, 2, 2, 6, 6, 0.9);

    const boxes = postProcessDBNet(map, MAP, MAP);
    expect(boxes.length).toBe(1);

    // Unclip distance = area*ratio/perimeter = (4*4*1.5)/(2*(4+4)) = 24/16 = 1.5
    // expanded px: [0.5, 0.5, 7.5, 7.5] -> normalized /10
    const [xMin, yMin, xMax, yMax]: Box = boxes[0];
    expect(xMin).toBeCloseTo(0.05, 6);
    expect(yMin).toBeCloseTo(0.05, 6);
    expect(xMax).toBeCloseTo(0.75, 6);
    expect(yMax).toBeCloseTo(0.75, 6);
  });

  it('clamps the expanded box to map bounds', () => {
    const map = makeMap();
    // Block touching the top-left corner; unclip would go negative -> clamp to 0.
    setBlock(map, 0, 0, 4, 4, 0.95);
    const boxes = postProcessDBNet(map, MAP, MAP);
    expect(boxes.length).toBe(1);
    expect(boxes[0][0]).toBe(0); // xMin clamped
    expect(boxes[0][1]).toBe(0); // yMin clamped
  });

  it('drops components smaller than minSize', () => {
    const map = makeMap();
    // 2x2 block -> boxW = boxH = 1 < minSize(3)
    setBlock(map, 4, 4, 5, 5, 0.95);
    const boxes = postProcessDBNet(map, MAP, MAP);
    expect(boxes.length).toBe(0);
  });

  it('drops components whose mean probability is below boxThreshold', () => {
    const map = makeMap();
    // Large enough block but low prob (above binaryThreshold 0.3, below boxThreshold 0.6)
    setBlock(map, 2, 2, 6, 6, 0.4);
    const boxes = postProcessDBNet(map, MAP, MAP);
    expect(boxes.length).toBe(0);
  });

  it('keeps only valid blocks when valid, tiny and low-prob blocks coexist', () => {
    const map = makeMap();
    setBlock(map, 1, 1, 4, 4, 0.9); // valid (4x4)
    setBlock(map, 8, 0, 9, 1, 0.95); // tiny (1x1) -> dropped
    setBlock(map, 0, 7, 4, 9, 0.4); // low prob -> dropped
    const boxes = postProcessDBNet(map, MAP, MAP);
    expect(boxes.length).toBe(1);
  });

  it('sorts boxes top-to-bottom then left-to-right', () => {
    const map = makeMap();
    setBlock(map, 0, 6, 3, 9, 0.9); // lower, left  (yMin high)
    setBlock(map, 6, 0, 9, 3, 0.9); // upper, right (yMin low)
    setBlock(map, 0, 0, 3, 3, 0.9); // upper, left  (yMin low, xMin low)

    const boxes = postProcessDBNet(map, MAP, MAP);
    expect(boxes.length).toBe(3);
    // Sorted by yMin then xMin: upper-left, upper-right, then lower-left.
    expect(boxes[0][1]).toBeLessThanOrEqual(boxes[1][1]);
    expect(boxes[1][1]).toBeLessThanOrEqual(boxes[2][1]);
    // First two share the smallest yMin band; first has smaller xMin.
    expect(boxes[0][0]).toBeLessThan(boxes[1][0]);
    // Last box is the lower one.
    expect(boxes[2][1]).toBeGreaterThan(boxes[0][1]);
  });

  it('honors custom options', () => {
    const map = makeMap();
    setBlock(map, 2, 2, 6, 6, 0.4);
    // Lower boxThreshold so the 0.4 block now passes.
    const boxes = postProcessDBNet(map, MAP, MAP, { boxThreshold: 0.3 });
    expect(boxes.length).toBe(1);
  });
});

describe('postProcessDBNetQuads (rotated line detection)', () => {
  const W = 64;
  const H = 64;
  const makeBig = () => new Float32Array(W * H);
  const set = (map: Float32Array, x: number, y: number, p = 0.95) => {
    if (x >= 0 && x < W && y >= 0 && y < H) map[y * W + x] = p;
  };

  /** Paint a slanted thick line from (x0,y0) along direction (dx,dy). */
  const paintSlanted = (
    map: Float32Array,
    x0: number,
    y0: number,
    len: number,
    thick: number,
    angleDeg: number,
  ) => {
    const a = (angleDeg * Math.PI) / 180;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    for (let l = 0; l < len; l++) {
      for (let t = -Math.floor(thick / 2); t <= Math.floor(thick / 2); t++) {
        set(map, Math.round(x0 + l * ux - t * uy), Math.round(y0 + l * uy + t * ux));
      }
    }
  };

  it('axis-aligned component ≈ the bbox path (quad degenerates to the box)', () => {
    const map = makeBig();
    for (let y = 20; y < 26; y++) for (let x = 8; x < 40; x++) set(map, x, y);
    const quads = postProcessDBNetQuads(map, W, H);
    expect(quads.length).toBe(1);
    const q = quads[0];
    // TL→TR edge horizontal (angle ~0): |Δy| across the top edge tiny.
    const [tl, tr] = q.quadNorm;
    expect(Math.abs(tr[1] - tl[1])).toBeLessThan(0.02);
    // boxNorm encloses the painted region.
    expect(q.boxNorm[0]).toBeLessThanOrEqual(8 / W);
    expect(q.boxNorm[2]).toBeGreaterThanOrEqual(40 / W);
  });

  it('recovers the rotation angle of a slanted line (±2°)', () => {
    const map = makeBig();
    paintSlanted(map, 6, 12, 48, 5, 15);
    const quads = postProcessDBNetQuads(map, W, H);
    expect(quads.length).toBe(1);
    const [tl, tr] = quads[0].quadNorm;
    const angle =
      (Math.atan2((tr[1] - tl[1]) * H, (tr[0] - tl[0]) * W) * 180) / Math.PI;
    expect(Math.abs(angle - 15)).toBeLessThan(2);
  });

  it('orders corners TL,TR,BR,BL with the long axis as width', () => {
    const map = makeBig();
    paintSlanted(map, 6, 30, 40, 5, -10);
    const [q] = postProcessDBNetQuads(map, W, H);
    const [tl, tr, br, bl] = q.quadNorm;
    // Width (TL→TR) must exceed height (TL→BL): text axis is the long side.
    const wLen = Math.hypot((tr[0] - tl[0]) * W, (tr[1] - tl[1]) * H);
    const hLen = Math.hypot((bl[0] - tl[0]) * W, (bl[1] - tl[1]) * H);
    expect(wLen).toBeGreaterThan(hLen);
    // Reading order: TR right of TL; BL below TL; BR completes parallelogram.
    expect(tr[0]).toBeGreaterThan(tl[0]);
    expect(bl[1]).toBeGreaterThan(tl[1]);
    expect(br[0]).toBeCloseTo(tr[0] + bl[0] - tl[0], 5);
    expect(br[1]).toBeCloseTo(tr[1] + bl[1] - tl[1], 5);
  });

  it('applies the same filtering laws as the bbox path', () => {
    const map = makeBig();
    // low prob → dropped
    for (let y = 4; y < 12; y++) for (let x = 4; x < 20; x++) set(map, x, y, 0.4);
    expect(postProcessDBNetQuads(map, W, H).length).toBe(0);
  });
});

describe('planDetBands (tall-page banding law)', () => {
  it('wide and square pages stay single-pass (the certified path)', () => {
    expect(planDetBands(1400, 980, 1.25, 0.12)).toEqual([{ sy: 0, sh: 980 }]);
    expect(planDetBands(1000, 1000, 1.25, 0.12)).toEqual([{ sy: 0, sh: 1000 }]);
    expect(planDetBands(1400, 1700, 1.25, 0.12)).toEqual([{ sy: 0, sh: 1700 }]); // 1.21 < 1.25
  });

  it('tall pages split into overlapping full-width square bands covering everything', () => {
    const bands = planDetBands(1400, 2200, 1.25, 0.12);
    expect(bands.length).toBeGreaterThanOrEqual(2);
    // Full coverage: first starts at 0, last reaches the bottom.
    expect(bands[0].sy).toBe(0);
    const last = bands[bands.length - 1];
    expect(last.sy + last.sh).toBe(2200);
    // Adjacent bands overlap by ≥ the overlap fraction of a band.
    for (let i = 1; i < bands.length; i++) {
      const overlap = bands[i - 1].sy + bands[i - 1].sh - bands[i].sy;
      expect(overlap).toBeGreaterThanOrEqual(Math.floor(1400 * 0.12) - 1);
    }
    // Bands are square-ish: height bounded by page width.
    for (const b of bands) expect(b.sh).toBeLessThanOrEqual(1400);
  });

  it('degenerate dimensions stay single-pass', () => {
    expect(planDetBands(0, 100, 1.25, 0.12)).toEqual([{ sy: 0, sh: 100 }]);
  });
});

describe('dedupeBoxes (band-overlap reconciliation)', () => {
  it('collapses high-IoU duplicates to the larger box', () => {
    const a: Box = [0.1, 0.10, 0.5, 0.16]; // fuller detection
    const b: Box = [0.1, 0.105, 0.5, 0.158]; // partial re-detect in overlap
    const out = dedupeBoxes([b, a]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(a);
  });

  it('keeps genuinely distinct boxes and restores reading order', () => {
    const rows: Box[] = [
      [0.1, 0.30, 0.5, 0.34],
      [0.1, 0.10, 0.5, 0.14],
      [0.55, 0.10, 0.9, 0.14],
    ];
    const out = dedupeBoxes(rows);
    expect(out).toHaveLength(3);
    expect(out[0][1]).toBeLessThanOrEqual(out[1][1]);
    expect(out[1][0]).toBeLessThanOrEqual(out[2][0] + 1);
  });

  it('near-touching lines on adjacent rows are NOT merged (IoU below threshold)', () => {
    const l1: Box = [0.1, 0.100, 0.5, 0.130];
    const l2: Box = [0.1, 0.132, 0.5, 0.162]; // next text row, no real overlap
    expect(dedupeBoxes([l1, l2])).toHaveLength(2);
  });
});
