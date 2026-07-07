/**
 * CTC probability lattice — the raw material of all constrained decoding.
 *
 * A Lattice preserves the recognizer's per-timestep probability distribution
 * (top-k) BEFORE argmax/CTC-collapse throws it away. The checksum-guided MRZ
 * decoder (I2), grammar re-decoding (I3) and confusion priors (I5) all operate
 * exclusively on this structure. Contract: Documentation/06 §3 — `lattice` is
 * REQUIRED on every vision-route OCR line.
 */

/** One timestep: top-k [char, probability] pairs, probability descending.
 *  The CTC blank token is represented as the empty string ''. */
export type LatticeStep = [char: string, prob: number][];

/** Full lattice for one text-line crop: `timeSteps` entries. */
export type Lattice = LatticeStep[];

/** Frozen per plan.md §17. k=5 retains ~all usable probability mass while
 *  keeping beam branching factors trivial. */
export const LATTICE_K = 5;

/**
 * Extracts the top-k lattice from a post-softmax CTC output.
 *
 * @param probs Row-major [timeSteps, numClasses] PROBABILITIES (the PP-OCR
 *   rec ONNX applies softmax internally — same input as `decodeCTCGreedy`).
 * @param timeSteps Rows.
 * @param numClasses Columns (class 0 = blank, class c>=1 maps to vocab[c-1]).
 * @param vocab Character vocabulary.
 * @param k Top-k per step (default LATTICE_K).
 * @returns Lattice of length `timeSteps`. Classes whose index has no vocab
 *   mapping (c-1 >= vocab.length) are excluded — mirroring the greedy
 *   decoder, which never emits them.
 */
export function extractLattice(
  probs: Float32Array,
  timeSteps: number,
  numClasses: number,
  vocab: string[],
  k: number = LATTICE_K
): Lattice {
  const lattice: Lattice = new Array(timeSteps);

  // note: fixed-size insertion beats sorting 6k+ classes per step — O(T*C*k), k=5
  const topIdx = new Int32Array(k);
  const topProb = new Float64Array(k);

  for (let t = 0; t < timeSteps; t++) {
    const base = t * numClasses;
    let filled = 0;

    for (let c = 0; c < numClasses; c++) {
      // Unmappable class: the greedy decoder skips these entirely; a lattice
      // entry that no decoder could ever emit would be dead weight.
      if (c !== 0 && c - 1 >= vocab.length) continue;

      const p = probs[base + c];
      if (filled === k && p <= topProb[filled - 1]) continue;

      // Insertion position (descending order).
      let pos = filled < k ? filled : k - 1;
      while (pos > 0 && topProb[pos - 1] < p) {
        if (pos < k) {
          topProb[pos] = topProb[pos - 1];
          topIdx[pos] = topIdx[pos - 1];
        }
        pos--;
      }
      topProb[pos] = p;
      topIdx[pos] = c;
      if (filled < k) filled++;
    }

    const step: LatticeStep = new Array(filled);
    for (let i = 0; i < filled; i++) {
      const c = topIdx[i];
      step[i] = [c === 0 ? '' : vocab[c - 1], topProb[i]];
    }
    lattice[t] = step;
  }

  return lattice;
}

/**
 * Extracts a lattice PROJECTED onto a restricted alphabet — the constrained
 * decoder's antidote to vocabulary crowding (live-caught: under blur the
 * 6.6k-class rec head scatters mass over CJK/fullwidth classes; the true
 * MRZ char drops below rank k and the checksum beam starves). Projection:
 *  - a class char is NFKC-folded and uppercased (Ｐ→P, ｘ→X, x→X): case and
 *    width variants of the SAME glyph pool their probability mass. This is
 *    evidence-preserving — the fold never crosses glyph identities (O vs 0
 *    stays two distinct chars; arbitrating those is the checksum's job).
 *  - classes that fold outside `alphabet` are dropped (they cannot legally
 *    occur, so for THIS decode they are noise by construction).
 *  - the CTC blank is always kept.
 * Probabilities are NOT renormalized: a position whose legal mass is weak
 * stays visibly weak (the invisible-ambiguity posterior guard needs honest
 * pixel evidence, not flattered ratios).
 */
export function extractProjectedLattice(
  probs: Float32Array,
  timeSteps: number,
  numClasses: number,
  vocab: string[],
  alphabet: ReadonlySet<string>,
  k: number = LATTICE_K
): Lattice {
  // Precompute class → alphabet slot (-1 drop, 0 blank, i+1 = alpha[i]).
  const alpha = [...alphabet];
  const slotOf = new Map<string, number>();
  alpha.forEach((ch, i) => slotOf.set(ch, i + 1));
  const classSlot = new Int32Array(numClasses).fill(-1);
  classSlot[0] = 0; // CTC blank
  for (let c = 1; c < numClasses; c++) {
    if (c - 1 >= vocab.length) continue;
    const folded = vocab[c - 1].normalize('NFKC').toUpperCase();
    const slot = slotOf.get(folded);
    if (slot !== undefined) classSlot[c] = slot;
  }

  const lattice: Lattice = new Array(timeSteps);
  const sums = new Float64Array(alpha.length + 1);

  for (let t = 0; t < timeSteps; t++) {
    sums.fill(0);
    const base = t * numClasses;
    for (let c = 0; c < numClasses; c++) {
      const slot = classSlot[c];
      if (slot >= 0) sums[slot] += probs[base + c];
    }

    // Top-k over the tiny projected distribution.
    const order: number[] = [];
    for (let s = 0; s < sums.length; s++) {
      if (sums[s] > 0) order.push(s);
    }
    order.sort((a, b) => sums[b] - sums[a]);
    const take = Math.min(k, order.length);
    const step: LatticeStep = new Array(take);
    for (let i = 0; i < take; i++) {
      const s = order[i];
      step[i] = [s === 0 ? '' : alpha[s - 1], sums[s]];
    }
    lattice[t] = step;
  }

  return lattice;
}

/**
 * Reconstructs the greedy CTC decode from a lattice (top-1 path, blank/dup
 * collapse). Exists as a cross-check against `decodeCTCGreedy` — the two MUST
 * agree whenever the lattice was extracted from the same tensor; a divergence
 * is a bug in one of them. Also serves fallback-mode decoding of received
 * lattices.
 */
export function greedyFromLattice(lattice: Lattice): { text: string; confidence: number } {
  let text = '';
  let prevChar: string | null = null;
  let probSum = 0;
  let emitted = 0;

  for (const step of lattice) {
    if (step.length === 0) {
      prevChar = null;
      continue;
    }
    const [ch, p] = step[0];
    if (ch !== '' && ch !== prevChar) {
      text += ch;
      probSum += p;
      emitted++;
    }
    prevChar = ch;
  }

  return { text, confidence: emitted > 0 ? probSum / emitted : 0 };
}

/**
 * Validates lattice structural invariants. Used by tests and by the brain's
 * bundle validator (a vision-route line without a valid lattice is rejected —
 * Documentation/06 §3).
 */
export function isValidLattice(lattice: Lattice, k: number = LATTICE_K): boolean {
  for (const step of lattice) {
    if (step.length === 0 || step.length > k) return false;
    let prev = Infinity;
    let mass = 0;
    for (const [ch, p] of step) {
      if (typeof ch !== 'string') return false;
      if (!(p >= 0) || p > 1.0001) return false;
      if (p > prev) return false; // must be descending
      prev = p;
      mass += p;
    }
    if (mass > 1.0001) return false; // top-k mass can never exceed total mass
  }
  return true;
}
