import { describe, expect, it } from 'vitest';
import {
  LATTICE_K,
  extractLattice,
  extractProjectedLattice,
  greedyFromLattice,
  isValidLattice,
  type Lattice,
} from './lattice';
import { decodeCTCGreedy } from '../ai-runtime/ocr';

/** Builds a row-major [T, C] prob matrix from per-step class→prob maps.
 *  Unlisted classes share the residual mass equally (rows sum to ~1). */
function probsFrom(rows: Record<number, number>[], numClasses: number): Float32Array {
  const out = new Float32Array(rows.length * numClasses);
  rows.forEach((row, t) => {
    let listed = 0;
    for (const p of Object.values(row)) listed += p;
    const residual = Math.max(0, 1 - listed) / Math.max(1, numClasses - Object.keys(row).length);
    for (let c = 0; c < numClasses; c++) {
      out[t * numClasses + c] = row[c] ?? residual;
    }
  });
  return out;
}

const VOCAB = ['A', 'B', 'C', 'D', 'E', '0', '1', '8', '<'];
const C = VOCAB.length + 1; // + blank at index 0

describe('extractLattice', () => {
  it('keeps top-k entries in descending probability order with blank as empty string', () => {
    // Step: A=0.7, blank=0.2, B=0.05, rest tiny.
    const probs = probsFrom([{ 1: 0.7, 0: 0.2, 2: 0.05 }], C);
    const lattice = extractLattice(probs, 1, C, VOCAB);

    expect(lattice).toHaveLength(1);
    expect(lattice[0][0]).toEqual(['A', expect.closeTo(0.7, 5)]);
    expect(lattice[0][1]).toEqual(['', expect.closeTo(0.2, 5)]);
    expect(lattice[0][2]).toEqual(['B', expect.closeTo(0.05, 5)]);
    expect(lattice[0].length).toBe(LATTICE_K);
    expect(isValidLattice(lattice)).toBe(true);
  });

  it('preserves confusable-pair alternatives (the property I2/I3 depend on)', () => {
    // '8' vs 'B' ambiguity: greedy sees 8, the lattice must retain B.
    const probs = probsFrom([{ 8: 0.51, 2: 0.46 }], C); // class 8 -> '8'? careful: idx 8 -> VOCAB[7]='8'; idx 2 -> VOCAB[1]='B'
    const lattice = extractLattice(probs, 1, C, VOCAB);
    const chars = lattice[0].map(([ch]) => ch);
    expect(chars[0]).toBe('8');
    expect(chars).toContain('B');
  });

  it('excludes classes with no vocab mapping, mirroring the greedy decoder', () => {
    const shortVocab = ['A', 'B']; // classes 1..2 mappable; classes >=3 unmappable
    const numClasses = 6;
    const probs = probsFrom([{ 5: 0.8, 1: 0.15, 0: 0.05 }], numClasses); // top class unmappable
    const lattice = extractLattice(probs, 1, numClasses, shortVocab);
    const chars = lattice[0].map(([ch]) => ch);
    expect(chars).not.toContain(undefined as unknown as string);
    expect(chars[0]).toBe('A'); // unmappable 0.8 skipped entirely
    expect(chars).toContain('');
    expect(isValidLattice(lattice)).toBe(true);
  });

  it('handles fewer available classes than k without padding garbage', () => {
    const tinyVocab = ['X'];
    const numClasses = 2; // blank + X
    const probs = probsFrom([{ 0: 0.6, 1: 0.4 }], numClasses);
    const lattice = extractLattice(probs, 1, numClasses, tinyVocab);
    expect(lattice[0]).toHaveLength(2);
    expect(isValidLattice(lattice)).toBe(true);
  });
});

describe('extractProjectedLattice (vocabulary-crowding antidote)', () => {
  const ALPHABET: ReadonlySet<string> = new Set([
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<',
  ]);

  it('recovers a legal char crowded below top-k by illegal classes', () => {
    // Vocab: 6 illegal CJK-ish classes dominate; truth 'E' holds modest mass.
    // Plain top-5 would fill with illegal chars and blank — 'E' drowns.
    const vocab = ['一', '二', '三', '四', '五', '六', 'E', 'B'];
    const numClasses = vocab.length + 1;
    const probs = probsFrom(
      [{ 1: 0.2, 2: 0.18, 3: 0.16, 4: 0.14, 5: 0.12, 6: 0.1, 7: 0.06, 0: 0.03 }],
      numClasses,
    );
    const plain = extractLattice(probs, 1, numClasses, vocab);
    expect(plain[0].map(([ch]) => ch)).not.toContain('E');

    const proj = extractProjectedLattice(probs, 1, numClasses, vocab, ALPHABET);
    const chars = proj[0].map(([ch]) => ch);
    expect(chars).toContain('E');
    expect(chars).not.toContain('一');
  });

  it('pools case and width variants of the SAME glyph (x + X + ｘ), never across glyphs', () => {
    const vocab = ['x', 'X', 'ｘ', 'O', '0'];
    const numClasses = vocab.length + 1;
    // x=0.3, X=0.25, ｘ=0.05 → X pools 0.6; O=0.2, 0=0.1 stay separate.
    const probs = probsFrom([{ 1: 0.3, 2: 0.25, 3: 0.05, 4: 0.2, 5: 0.1, 0: 0.1 }], numClasses);
    const proj = extractProjectedLattice(probs, 1, numClasses, vocab, ALPHABET);
    const map = new Map(proj[0]);
    expect(map.get('X')).toBeCloseTo(0.6, 5);
    expect(map.get('O')).toBeCloseTo(0.2, 5);
    expect(map.get('0')).toBeCloseTo(0.1, 5);
  });

  it('keeps the CTC blank and does NOT renormalize weak legal mass', () => {
    // Almost everything is illegal: legal 'A' has only 0.1, blank 0.05. The
    // projected step must expose that weakness (0.1 stays 0.1), not flatter
    // it to ~1.0 — the low-posterior ambiguity guard depends on honesty.
    const vocab = ['一', 'A'];
    const numClasses = vocab.length + 1;
    const probs = probsFrom([{ 1: 0.85, 2: 0.1, 0: 0.05 }], numClasses);
    const proj = extractProjectedLattice(probs, 1, numClasses, vocab, ALPHABET);
    const map = new Map(proj[0]);
    expect(map.get('A')).toBeCloseTo(0.1, 5);
    expect(map.get('')).toBeCloseTo(0.05, 5);
    expect(proj[0].length).toBe(2); // nothing else legal — no padding garbage
  });

  it('projected greedy equals plain greedy when all classes are already legal', () => {
    const rows: Record<number, number>[] = [
      { 1: 0.9 },
      { 0: 0.95 },
      { 2: 0.8 },
      { 0: 0.9 },
      { 8: 0.7, 2: 0.25 },
    ];
    const probs = probsFrom(rows, C);
    const plain = greedyFromLattice(extractLattice(probs, rows.length, C, VOCAB));
    const proj = greedyFromLattice(
      extractProjectedLattice(probs, rows.length, C, VOCAB, ALPHABET),
    );
    expect(proj.text).toBe(plain.text);
  });
});

describe('greedyFromLattice ↔ decodeCTCGreedy agreement (cross-check invariant)', () => {
  it('agrees on text and confidence for a realistic multi-step sequence', () => {
    // "AB8" with CTC blanks and a duplicate: A A blank B blank 8 8
    const rows: Record<number, number>[] = [
      { 1: 0.9 },            // A
      { 1: 0.85 },           // A (dup — collapses)
      { 0: 0.95 },           // blank
      { 2: 0.8 },            // B
      { 0: 0.9 },            // blank
      { 8: 0.7, 2: 0.25 },   // 8 (with B as runner-up)
      { 8: 0.75 },           // 8 (dup — collapses)
    ];
    const probs = probsFrom(rows, C);

    const greedy = decodeCTCGreedy(probs, rows.length, C, VOCAB);
    const viaLattice = greedyFromLattice(extractLattice(probs, rows.length, C, VOCAB));

    expect(greedy.text).toBe('AB8');
    expect(viaLattice.text).toBe(greedy.text);
    expect(viaLattice.confidence).toBeCloseTo(greedy.confidence, 6);
  });

  it('agrees on randomized tensors (100 fuzz rounds)', () => {
    // note: seeded LCG — deterministic fuzz, no flaky CI
    let seed = 42;
    const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff;

    for (let round = 0; round < 100; round++) {
      const T = 1 + Math.floor(rand() * 12);
      const probs = new Float32Array(T * C);
      for (let t = 0; t < T; t++) {
        let sum = 0;
        const row = new Array(C).fill(0).map(() => {
          const v = rand();
          sum += v;
          return v;
        });
        for (let c = 0; c < C; c++) probs[t * C + c] = row[c] / sum;
      }

      const greedy = decodeCTCGreedy(probs, T, C, VOCAB);
      const viaLattice = greedyFromLattice(extractLattice(probs, T, C, VOCAB));

      expect(viaLattice.text).toBe(greedy.text);
      expect(viaLattice.confidence).toBeCloseTo(greedy.confidence, 5);
    }
  });

  it('agrees on the all-blank (empty emission) case', () => {
    const probs = probsFrom([{ 0: 0.99 }, { 0: 0.98 }], C);
    const greedy = decodeCTCGreedy(probs, 2, C, VOCAB);
    const viaLattice = greedyFromLattice(extractLattice(probs, 2, C, VOCAB));
    expect(greedy.text).toBe('');
    expect(viaLattice.text).toBe('');
    expect(viaLattice.confidence).toBe(0);
    expect(greedy.confidence).toBe(0);
  });
});

describe('isValidLattice', () => {
  it('rejects ascending probabilities, overweight steps, and empty steps', () => {
    const ascending: Lattice = [[['A', 0.1], ['B', 0.5]]];
    const overweight: Lattice = [[['A', 0.9], ['B', 0.9]]];
    const empty: Lattice = [[]];
    expect(isValidLattice(ascending)).toBe(false);
    expect(isValidLattice(overweight)).toBe(false);
    expect(isValidLattice(empty)).toBe(false);
  });
});
