/**
 * Grammar-constrained CTC beam search over probability lattices (I2/I3 core).
 *
 * Replaces "trust the greedy top-1, validate later" with "search the lattice
 * for the best string the grammar permits". Returns null when NO valid path
 * exists — the caller must then ask the user, never fall back to top-1 (N1).
 *
 * Documentation/07 §2. Frozen parameters (plan.md §17): beam width 50, k = 5.
 */

import type { Lattice, LatticeStep } from './lattice';

/**
 * A deterministic finite automaton over characters.
 *
 * DETERMINISM REQUIREMENT: `next` must be a pure function of (state, char).
 * The beam merges hypotheses by collapsed text alone, which is only sound
 * when identical text implies identical automaton state (true for any DFA).
 */
export interface Grammar<S = unknown> {
  /** Initial state. */
  readonly start: S;
  /** Transition. Returns null when `char` is not permitted in `state`. */
  next(state: S, char: string): S | null;
  /** Whether `state` is a legal END of input. */
  accept(state: S): boolean;
}

/**
 * Confusion-prior hook (I5). Until Phase 6 this is never supplied; the beam
 * then behaves as pure lattice probability. P6's implementation re-weights
 * candidates using per-installation checksum-verified confusion statistics.
 */
export interface ConfusionPrior {
  /** Multiplicative weight (>0) for hypothesizing `candidate` at this step. */
  weight(candidate: string, step: LatticeStep): number;
}

export interface BeamDecodeOptions {
  /** Beam width. Frozen default 50 (plan.md §17). */
  width?: number;
  /** I5 hook — absent means identity weighting. */
  prior?: ConfusionPrior;
}

export interface BeamDecodeResult {
  /** The best grammar-valid collapsed string. */
  text: string;
  /**
   * Natural-log probability of the winning hypothesis (sum over merged
   * alignment paths). Log-domain because linear probabilities underflow on
   * long lines; comparable across candidates of the same lattice.
   */
  pathProb: number;
  /** Per emitted character: the lattice probability at its emission step
   *  (dominant alignment). Feeds explainable confidence, not checksums. */
  perChar: number[];
  /** Per emitted character: the lattice step index of its (dominant)
   *  emission — lets callers inspect the step's alternatives (e.g. the
   *  checksum-invisible ambiguity guard) and future foveation targeting. */
  perCharStep: number[];
}

export const BEAM_WIDTH_DEFAULT = 50;

/** Internal hypothesis: CTC-collapsed prefix + automaton state. */
interface Hyp<S> {
  text: string;
  state: S;
  /** Raw (pre-collapse) char of the previous timestep: '' = blank/none. */
  lastRaw: string;
  /** Linear-domain score, rescaled every step to avoid underflow. May be
   *  prior-weighted — used ONLY to rank/prune hypotheses. */
  score: number;
  /** Same accumulation WITHOUT prior weighting — the evidence the lattice
   *  actually holds. Reported as pathProb so every downstream safety gate
   *  (plausibility gap, span floors) judges raw evidence: a prior may steer
   *  the search, it may never testify. */
  rawScore: number;
  perChar: number[];
  perCharStep: number[];
}

/**
 * Decodes the single best grammar-valid string from a lattice.
 *
 * CTC semantics per step, for each hypothesis and each lattice entry:
 *  - blank ('') keeps the text, resets lastRaw;
 *  - a char equal to lastRaw extends the SAME emission (collapse) without
 *    consuming a grammar transition;
 *  - any other char is a NEW emission and must be permitted by the grammar,
 *    otherwise that branch dies (this pruning is what makes constrained
 *    search both fast and provable).
 *
 * Hypotheses with identical (text, lastRaw) merge by score summation — same
 * collapsed prefix through a deterministic grammar is the same future.
 *
 * @returns Best accepted hypothesis, or null when the lattice contains no
 *   grammar-valid path (caller MUST surface a question — never guess).
 */
export function beamDecode<S>(
  lattice: Lattice,
  grammar: Grammar<S>,
  opts: BeamDecodeOptions = {}
): BeamDecodeResult | null {
  const width = opts.width ?? BEAM_WIDTH_DEFAULT;
  const prior = opts.prior;

  let beams: Hyp<S>[] = [
    { text: '', state: grammar.start, lastRaw: '', score: 1, rawScore: 1, perChar: [], perCharStep: [] },
  ];
  // Underflow guard for the RAW evidence track (reported as pathProb). The
  // weighted score needs no scale bookkeeping — it only ranks, and rescaling
  // preserves order.
  let rawLogScale = 0;

  for (let stepIdx = 0; stepIdx < lattice.length; stepIdx++) {
    const step = lattice[stepIdx];
    const next = new Map<string, Hyp<S>>();

    const add = (h: Hyp<S>) => {
      const key = `${h.text}\u0000${h.lastRaw}`;
      const existing = next.get(key);
      if (existing) {
        // Merge alignments of the same prefix: sum scores, keep the
        // dominant path's per-char attribution.
        if (h.score > existing.score) {
          h.score += existing.score;
          h.rawScore += existing.rawScore;
          next.set(key, h);
        } else {
          existing.score += h.score;
          existing.rawScore += h.rawScore;
        }
      } else {
        next.set(key, h);
      }
    };

    for (const hyp of beams) {
      for (const [ch, rawP] of step) {
        const p = prior ? rawP * prior.weight(ch, step) : rawP;
        if (p <= 0) continue;

        if (ch === '') {
          add({ ...hyp, lastRaw: '', score: hyp.score * p, rawScore: hyp.rawScore * rawP });
        } else if (ch === hyp.lastRaw) {
          // Same raw char consecutively → same emission, no new grammar step.
          add({ ...hyp, score: hyp.score * p, rawScore: hyp.rawScore * rawP });
        } else {
          const nextState = grammar.next(hyp.state, ch);
          if (nextState === null) continue; // grammar prunes this branch
          add({
            text: hyp.text + ch,
            state: nextState,
            lastRaw: ch,
            score: hyp.score * p,
            rawScore: hyp.rawScore * rawP,
            perChar: [...hyp.perChar, rawP],
            perCharStep: [...hyp.perCharStep, stepIdx],
          });
        }
      }
    }

    if (next.size === 0) return null; // every branch violated the grammar

    // Prune to width, then rescale so the best score is 1 (underflow guard).
    beams = [...next.values()].sort((a, b) => b.score - a.score).slice(0, width);
    const top = beams[0].score;
    if (top > 0 && top < 1e-30) {
      for (const b of beams) b.score /= top;
    }
    // The raw track underflows independently (prior weights ≥ 1 make the
    // weighted score the larger of the two) — rescale it on its own trigger.
    const rawTop = Math.max(...beams.map((b) => b.rawScore));
    if (rawTop > 0 && rawTop < 1e-30) {
      for (const b of beams) b.rawScore /= rawTop;
      rawLogScale += Math.log(rawTop);
    }
  }

  // End of input: lastRaw no longer matters, so aggregate the blank/non-blank
  // variants of each collapsed text (standard CTC prefix-beam finalization).
  // Deterministic grammar ⇒ same text implies same state, so summing is sound.
  const byText = new Map<string, Hyp<S>>();
  for (const b of beams) {
    const existing = byText.get(b.text);
    if (existing) {
      if (b.score > existing.score) {
        b.score += existing.score;
        b.rawScore += existing.rawScore;
        byText.set(b.text, b);
      } else {
        existing.score += b.score;
        existing.rawScore += b.rawScore;
      }
    } else {
      byText.set(b.text, b);
    }
  }

  // Best ACCEPTED hypothesis wins; non-accepting states are invalid ends.
  let best: Hyp<S> | null = null;
  for (const b of byText.values()) {
    if (grammar.accept(b.state) && (best === null || b.score > best.score)) {
      best = b;
    }
  }
  if (best === null) return null;

  return {
    text: best.text,
    pathProb: Math.log(best.rawScore) + rawLogScale,
    perChar: best.perChar,
    perCharStep: best.perCharStep,
  };
}

/* ------------------------------------------------------------------------ */
/* Grammar combinators used across the grammar library (P1.3).               */
/* ------------------------------------------------------------------------ */

/** A grammar accepting strings where position i's char ∈ charsets[i], with
 *  exact length. The workhorse for MRZ lines and fixed-format IDs. */
export function positionalGrammar(charsets: ReadonlyArray<ReadonlySet<string>>): Grammar<number> {
  return {
    start: 0,
    next(state, char) {
      if (state >= charsets.length) return null;
      return charsets[state].has(char) ? state + 1 : null;
    },
    accept(state) {
      return state === charsets.length;
    },
  };
}

/** A grammar accepting exactly the given vocabulary of full strings.
 *  (Trie-walk; states are string prefixes — deterministic by construction.) */
export function enumGrammar(values: readonly string[]): Grammar<string> {
  const prefixes = new Set<string>(['']);
  const complete = new Set(values);
  for (const v of values) {
    for (let i = 1; i <= v.length; i++) prefixes.add(v.slice(0, i));
  }
  return {
    start: '',
    next(state, char) {
      const cand = state + char;
      return prefixes.has(cand) ? cand : null;
    },
    accept(state) {
      return complete.has(state);
    },
  };
}

/** Builds a charset from an inclusive char range, e.g. range('A','Z'). */
export function charRange(from: string, to: string): Set<string> {
  const out = new Set<string>();
  for (let c = from.charCodeAt(0); c <= to.charCodeAt(0); c++) {
    out.add(String.fromCharCode(c));
  }
  return out;
}

export const DIGITS: ReadonlySet<string> = charRange('0', '9');
export const UPPER: ReadonlySet<string> = charRange('A', 'Z');
export const MRZ_FILLER: ReadonlySet<string> = new Set(['<']);
export const MRZ_ANY: ReadonlySet<string> = new Set([...UPPER, ...DIGITS, '<']);
export const MRZ_ALPHA_FILLER: ReadonlySet<string> = new Set([...UPPER, '<']);
export const MRZ_DIGIT_FILLER: ReadonlySet<string> = new Set([...DIGITS, '<']);
