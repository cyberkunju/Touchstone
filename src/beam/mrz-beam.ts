/**
 * The MRZ checksum-guided beam decoder (I2, P1.4) — the plan's heart.
 *
 * Inverts parse-then-validate: ICAO check digits become HARD CONSTRAINTS
 * inside the beam search, so the only decodable strings are ones whose data
 * and check digits agree. A physically legible MRZ with ambiguous glyphs
 * (0/O, 8/B, 1/I, 5/S, <-drops…) becomes deterministically recoverable —
 * with proof. When no constraint-satisfying path exists in the lattice, the
 * decoder returns null and the MRZ is NOT claimed (N1: a question, never a
 * guess).
 *
 * Documentation/07 §4. Field extraction is delegated to the existing tested
 * parser (src/parsers/mrz.ts), which acts as the independent acceptance
 * oracle: grammar and parser agreeing is a designed redundancy.
 */

import { computeCheckDigit, mrzCharValue, parseMrz, type MrzParseResult } from '../parsers/mrz';
import { beamDecode, type ConfusionPrior, type Grammar } from './beam-search';
import { greedyFromLattice, type Lattice } from './lattice';
import { specsForLineCount, type MrzCheckSpec, type MrzFormatSpec } from './grammars/mrz';

/**
 * A checksum-INVISIBLE near-tie on the winning path (Documentation/07 §4):
 * the runner-up character shares the chosen character's ICAO value class
 * (value ≡ chosen mod 10 — e.g. 0/A/K/U/<), so EVERY check digit passes for
 * both readings. Checksum passage is not proof at this position; affected
 * fields must not be promoted as authoritative (N1).
 */
export interface MrzInvisibleAmbiguity {
  field: MrzCheckSpec['field'];
  /** Global character position (line breaks excluded). */
  position: number;
  chosen: string;
  alternative: string;
  /** runner-up probability / chosen probability, in (0, 1]. 0 when the
   *  alternative was not in the lattice at all (low-posterior flags). */
  probRatio: number;
  /** Why this position is unproven: a same-class runner-up in the lattice
   *  ('near_tie'), the chosen char's own posterior is too weak to carry a
   *  checksum-invisible position on pixel evidence alone ('low_posterior'),
   *  or the WHOLE field's span rests on lattice mass that is not there
   *  ('weak_span' — the glyph-drop alignment-shift class). */
  kind: 'near_tie' | 'low_posterior' | 'weak_span';
}

/** Runner-up-to-winner probability ratio above which a same-class alternative
 *  counts as a genuine ambiguity. Below it, the lattice itself is decisive
 *  (≥2.3× preference) and the read stands on probability. */
const INVISIBLE_AMBIGUITY_RATIO = 0.43;

/** Minimum lattice posterior for a character at a checksum-INVISIBLE position
 *  (one where a same-value-class alternative like 0/A/K/U/< exists in the
 *  position's charset). Check digits cannot prove class-internal choices, so
 *  the read rests SOLELY on pixel evidence at that position — and destroyed
 *  glyphs (live-caught: 'U' blurred into '0', all five checks still passing)
 *  must fall to review, not silent confirmation. */
const MIN_INVISIBLE_POSTERIOR = 0.85;

/** Field-span posterior floor (the glyph-drop alignment-shift guard,
 *  live-caught by the v6-small universe burst): ICAO check-digit weights
 *  cycle 7-3-1 every 3 positions, so a read whose glyphs shifted by a
 *  multiple of 3 (one dropped char + filler re-expansion) can satisfy EVERY
 *  check digit while placing the wrong digits in a field's span. Such a
 *  decode is only reachable by drawing several characters from weak lattice
 *  mass — so any checked field whose GEOMETRIC-MEAN per-char posterior falls
 *  below this floor is demoted to review (ambiguity channel), never proven.
 *  0.45 calibrated against the synthetic-lattice geometry: one soft char in
 *  a crisp span geo-means ~0.86, three soft ~0.68; three-plus PHANTOM chars
 *  (p≈0.25, glyphs not in the image) geo-mean ≤0.39 — the reconstruction
 *  class this guard exists to demote. */
const MIN_FIELD_SPAN_POSTERIOR = 0.45;

export interface MrzBeamResult {
  format: MrzFormatSpec['name'];
  /** Decoded MRZ lines — every applicable check digit passes by construction. */
  lines: string[];
  /** Log-probability of the winning hypothesis (see beamDecode). */
  pathProb: number;
  /** The independent oracle's full parse of the decoded lines (status 'valid'). */
  parse: MrzParseResult;
  /** Checksum-invisible near-ties on the winning path. Fields listed here
   *  passed every check digit AND YET are not proven — callers must exclude
   *  them from authoritative promotion. Empty = fully attested decode. */
  ambiguities: MrzInvisibleAmbiguity[];
}

/** Line-break token: impossible in any MRZ charset, so it can only ever be
 *  consumed at a structural line boundary. Prevents the format-mining attack
 *  where a TD2 is assembled from a SUBSEQUENCE of TD3 characters by letting
 *  chars flow across the physical line boundary. */
const LINE_BREAK = '\n';

/**
 * Maximum tolerated log-probability gap between the constrained decode and
 * the lattice's own unconstrained ceiling (the greedy path). A checksum
 * CORRECTION costs little (ln p_true − ln p_top1 ≈ −0.3…−1.2 per fixed
 * char); wholesale invention costs a lot. −20 was recalibrated against the
 * rendered ground-truth corpus: the −12 synthetic-lattice value refused a
 * PROVABLE clean-scan truth at −13.9 (real OCR lattices carry several soft
 * positions per line). Format-mining is no longer this gate's job — the
 * excess-length prior blocks it structurally — so the gate only needs to
 * catch total fabrication from flat lattices, which sits far below −20.
 */
const MAX_LOGPROB_GAP = -20;

/** A format is only attempted when each physical line's unconstrained greedy
 *  read is not LONGER than the format's line by more than this many chars.
 *  A 42-glyph line must never decode as a 36-char TD2 (live-caught: TD2
 *  minted from a TD3 by dropping trailing glyphs — TD2/TD3 line-2 layouts
 *  are prefix-identical, so every check digit passed). Greedy reads SHORTER
 *  than the format are fine: CTC drops merged glyphs, and the checksummed
 *  grammar re-expands fillers safely. */
const MAX_GREEDY_EXCESS = 2;

/** Printed-contradiction guard (forge_009, the sharpest catch of the corpus):
 *  the beam admits ONLY the computed digit at a check position — which also
 *  silently "corrects" a fake document whose PRINTED check digit is cleanly
 *  a different digit (AI-generated fakes get some checksums right and others
 *  wrong; correction must fix blurry pixels, never overrule crisp print).
 *  When the lattice's top-1 at a check position is a DIFFERENT digit read
 *  with at least this posterior, and the computed digit's own evidence is
 *  weaker by ratio, the document itself is checksum-inconsistent → refuse. */
const PRINT_CONTRADICTION_POSTERIOR = 0.85;
const PRINT_CONTRADICTION_RATIO = 0.25; // computed digit's prob / printed top-1's prob

/**
 * Builds the checksum-embedded grammar for a format.
 *
 * State = decoded prefix INCLUDING line-break markers (deterministic — state
 * is a pure function of consumed text). Grammar positions and check spans are
 * computed over the prefix with breaks stripped. Transitions:
 *  - at a line boundary, ONLY the line-break token is legal (structure first);
 *  - data positions gate on the spec's positional charset;
 *  - date positions additionally prune impossible month/day digits;
 *  - CHECK positions admit EXACTLY the digit computed over the covered
 *    prefix spans (or '<' where ICAO allows an empty-field filler check).
 *    This is the "checksums drive the read" mechanism: wrong-data branches
 *    die at the next checkpoint instead of surviving to a failed validation.
 */
function mrzGrammar(spec: MrzFormatSpec): Grammar<string> {
  const total = spec.charsets.length;
  const checkAt = new Map<number, (typeof spec.checks)[number]>();
  for (const c of spec.checks) checkAt.set(c.digitPos, c);

  // Interior line boundaries as "chars consumed" counts (e.g. TD3: {44}).
  const boundaries: number[] = [];
  let acc = 0;
  for (let i = 0; i < spec.lineLengths.length - 1; i++) {
    acc += spec.lineLengths[i];
    boundaries.push(acc);
  }
  const expectedBreaks = spec.lineLengths.length - 1;

  // Pre-index date spans by their month/day digit positions for O(1) pruning.
  const monthTens = new Set<number>();
  const monthOnes = new Map<number, number>();
  const dayTens = new Set<number>();
  for (const [s] of spec.dateSpans) {
    monthTens.add(s + 2);
    monthOnes.set(s + 3, s + 2);
    dayTens.add(s + 4);
  }

  /** chars consumed and breaks consumed, derivable from the prefix. */
  const stripped = (state: string) => state.replace(/\n/g, '');

  return {
    start: '',
    next(state, char) {
      const flat = stripped(state);
      const pos = flat.length;
      const breaksSoFar = state.length - flat.length;
      const breaksDue = boundaries.filter((b) => b <= pos).length;

      if (char === LINE_BREAK) {
        // Legal only exactly at a boundary that has not been consumed yet.
        return breaksDue > breaksSoFar && boundaries.includes(pos)
          ? state + LINE_BREAK
          : null;
      }
      // A due boundary must be consumed before any further character.
      if (breaksDue > breaksSoFar) return null;
      if (pos >= total) return null;

      const check = checkAt.get(pos);
      if (check) {
        let covered = '';
        for (const [a, b] of check.cover) covered += flat.slice(a, b);
        const expected = String(computeCheckDigit(covered));
        if (char === expected) return state + char;
        if (check.allowFiller && char === '<') {
          const dataEmpty = check.cover.every(([a, b]) => /^<*$/.test(flat.slice(a, b)));
          if (dataEmpty) return state + char;
        }
        return null;
      }

      if (!spec.charsets[pos].has(char)) return null;

      // Date plausibility pruning (digits only; '<' padding passes through).
      if (char >= '0' && char <= '9') {
        if (monthTens.has(pos) && char > '1') return null;
        const tensPos = monthOnes.get(pos);
        if (tensPos !== undefined) {
          const tens = flat[tensPos];
          if (tens === '1' && char > '2') return null; // months 13-19
          if (tens === '0' && char === '0') return null; // month 00
        }
        if (dayTens.has(pos) && char > '3') return null;
      }

      return state + char;
    },
    accept(state) {
      const flat = stripped(state);
      return flat.length === total && state.length - flat.length === expectedBreaks;
    },
  };
}

/** Joins per-line lattices with a certain LINE_BREAK step: the grammar can
 *  only consume it at a structural boundary, pinning each physical line to
 *  its expected character count. */
function joinLattices(lineLattices: Lattice[]): Lattice {
  const out: Lattice = [];
  lineLattices.forEach((lat, i) => {
    if (i > 0) out.push([[LINE_BREAK, 1]]);
    out.push(...lat);
  });
  return out;
}

/** The lattice's unconstrained ceiling: log-prob of the pointwise-max path.
 *  No decode of THIS lattice can score above it; the gap to it measures how
 *  much "forcing" the constraints applied. */
function latticeCeiling(joint: Lattice): number {
  let sum = 0;
  for (const step of joint) sum += Math.log(step[0][1]);
  return sum;
}

/**
 * Scans the winning path for checksum-invisible near-ties (the {0,A,K,U,<}
 * value-class blind spot of ICAO's mod-10 weighted checksum). Only data
 * positions inside check-covered spans matter: an undetectable swap there
 * yields a DIFFERENT field value with ALL check digits still passing.
 * (Check-digit positions themselves are immune — the grammar admits only the
 * computed digit; a paired data+check swap surfaces via its data position.)
 */
function findInvisibleAmbiguities(
  spec: MrzFormatSpec,
  decoded: string, // flat, breaks stripped
  perChar: number[],
  perCharStep: number[],
  joint: Lattice
): MrzInvisibleAmbiguity[] {
  const out: MrzInvisibleAmbiguity[] = [];
  const checkPositions = new Set(spec.checks.map((c) => c.digitPos));

  for (const check of spec.checks) {
    if (check.field === 'composite') continue; // covered via component fields

    // Field-span floor (glyph-drop alignment-shift guard): the geometric
    // mean of the DATA positions' posteriors. A field whose characters were
    // collectively drawn from near-absent lattice mass is an alignment
    // artifact, not a reading — check digits cannot help because 3-shifted
    // alignments are weight-invariant (7-3-1 cycle).
    let logSum = 0;
    let n = 0;
    for (const [a, b] of check.cover) {
      for (let pos = a; pos < b; pos++) {
        if (checkPositions.has(pos)) continue;
        logSum += Math.log(Math.max(perChar[pos], 1e-9));
        n++;
      }
    }
    if (n > 0 && Math.exp(logSum / n) < MIN_FIELD_SPAN_POSTERIOR) {
      out.push({
        field: check.field,
        position: check.cover[0][0],
        chosen: decoded.slice(check.cover[0][0], Math.min(check.cover[0][1], check.cover[0][0] + 12)),
        alternative: '',
        probRatio: Math.exp(logSum / n),
        kind: 'weak_span',
      });
      continue; // whole field demoted — per-position flags are redundant
    }
    for (const [a, b] of check.cover) {
      for (let pos = a; pos < b; pos++) {
        if (checkPositions.has(pos)) continue;
        const chosen = decoded[pos];
        const step = joint[perCharStep[pos]];
        const chosenProb = perChar[pos];

        // (1) Near-tie: a same-class alternative present in the lattice.
        let nearTie = false;
        for (const [alt, altProb] of step) {
          if (alt === chosen || alt === '') continue;
          if (!spec.charsets[pos].has(alt)) continue; // couldn't legally occur
          if ((mrzCharValue(alt) - mrzCharValue(chosen)) % 10 !== 0) continue;
          const ratio = altProb / chosenProb;
          if (ratio >= INVISIBLE_AMBIGUITY_RATIO) {
            out.push({
              field: check.field,
              position: pos,
              chosen,
              alternative: alt,
              probRatio: ratio,
              kind: 'near_tie',
            });
            nearTie = true;
          }
        }
        if (nearTie) continue;

        // (2) Low posterior at a class-ambiguous position: the destroyed-glyph
        // case. When ANY same-class alternative exists in the position's
        // CHARSET (even if absent from the top-k lattice — destruction removes
        // the truth from the lattice), a weak chosen posterior means the
        // checksum-passing read rests on pixels that are not actually there.
        if (chosenProb < MIN_INVISIBLE_POSTERIOR) {
          let classAlt: string | null = null;
          for (const alt of spec.charsets[pos]) {
            if (alt === chosen) continue;
            if ((mrzCharValue(alt) - mrzCharValue(chosen)) % 10 === 0) {
              classAlt = alt;
              break;
            }
          }
          if (classAlt !== null) {
            out.push({
              field: check.field,
              position: pos,
              chosen,
              alternative: classAlt,
              probRatio: 0,
              kind: 'low_posterior',
            });
          }
        }
      }
    }
  }
  return out;
}

/**
 * Decodes an MRZ zone from its per-line lattices (top-to-bottom order).
 *
 * Tries each format compatible with the line count (2 lines → TD3 then TD2;
 * 3 → TD1) and returns the first constraint-satisfying decode, cross-checked
 * by the independent parser. Returns null when nothing provable exists.
 */
export function decodeMrzFromLattices(
  lineLattices: Lattice[],
  opts: { prior?: ConfusionPrior; trace?: (msg: string) => void } = {}
): MrzBeamResult | null {
  const trace = opts.trace ?? (() => {});
  if (lineLattices.length === 0) return null;
  const joint = joinLattices(lineLattices);
  const ceiling = latticeCeiling(joint);
  const greedyLens = lineLattices.map((lat) => greedyFromLattice(lat).text.length);

  for (const spec of specsForLineCount(lineLattices.length)) {
    // Cheap infeasibility gate: a lattice with fewer steps than required
    // characters cannot align (CTC emits ≤ 1 char per step).
    const required = spec.charsets.length;
    const steps = joint.length - (lineLattices.length - 1);
    if (steps < required) {
      trace(`${spec.name}: infeasible (${steps} steps < ${required} chars)`);
      continue;
    }

    // Excess-length prior: a physical line whose unconstrained greedy read is
    // LONGER than the format's line cannot be that format — decoding it
    // anyway means silently deleting real glyphs (the TD2-from-TD3 prefix
    // mint). Shorter greedy reads are allowed: CTC merges glyphs under blur
    // and the grammar re-expands fillers under checksum protection.
    const excess = greedyLens.findIndex((len, i) => len > spec.lineLengths[i] + MAX_GREEDY_EXCESS);
    if (excess !== -1) {
      trace(
        `${spec.name}: length prior (line ${excess} greedy=${greedyLens[excess]} > ${spec.lineLengths[excess]}+${MAX_GREEDY_EXCESS})`
      );
      continue;
    }

    const res = beamDecode(joint, mrzGrammar(spec), { prior: opts.prior });
    if (!res) {
      trace(`${spec.name}: no constraint-satisfying path in lattice`);
      continue;
    }

    // Plausibility gate: a decode that had to fight the lattice this hard is
    // not a reading, it's an invention — refuse it (N1).
    if (res.pathProb - ceiling < MAX_LOGPROB_GAP) {
      trace(
        `${spec.name}: plausibility gate (gap ${(res.pathProb - ceiling).toFixed(1)} < ${MAX_LOGPROB_GAP})`
      );
      continue;
    }

    // Split the flat decode back into physical lines (break tokens mark them).
    const lines = res.text.split(LINE_BREAK);

    // Guard the checksum blind spot: same-value-class near-ties passed every
    // check digit without being proven by them. perChar/perCharStep include
    // the emitted line-break tokens — re-index to flat character positions.
    const flat = res.text.replace(/\n/g, '');
    const flatPerChar: number[] = [];
    const flatPerCharStep: number[] = [];
    [...res.text].forEach((ch, i) => {
      if (ch !== LINE_BREAK) {
        flatPerChar.push(res.perChar[i]);
        flatPerCharStep.push(res.perCharStep[i]);
      }
    });
    const ambiguities = findInvisibleAmbiguities(spec, flat, flatPerChar, flatPerCharStep, joint);

    // Printed-contradiction guard: at every check-digit position, compare the
    // decoded (= computed) digit against the lattice's top-1 at that step. A
    // crisp, high-posterior DIFFERENT digit means the document PRINTS a check
    // digit that contradicts its own data — an internally inconsistent
    // document (AI fakes routinely get some checksums right, others wrong).
    // The beam must correct noisy pixels, never overrule clean print (N1).
    let printedContradiction: string | null = null;
    for (const check of spec.checks) {
      const pos = check.digitPos;
      const chosen = flat[pos];
      const step = joint[flatPerCharStep[pos]];
      if (!step || step.length === 0) continue;
      const [topCh, topProb] = step[0];
      if (
        topCh !== chosen &&
        topCh >= '0' && topCh <= '9' &&
        topProb >= PRINT_CONTRADICTION_POSTERIOR &&
        flatPerChar[pos] / topProb < PRINT_CONTRADICTION_RATIO
      ) {
        printedContradiction = `${check.field}@${pos}: printed '${topCh}' (p=${topProb.toFixed(2)}) but data computes '${chosen}'`;
        break;
      }
    }
    if (printedContradiction) {
      trace(`${spec.name}: printed check digit contradicts computed (${printedContradiction}) — document inconsistent, refused`);
      continue;
    }

    // Independent oracle: the tested parser must agree the result is fully
    // valid. Disagreement means a spec/parser bug — surfaced loudly, and the
    // MRZ is not claimed (N1 over convenience).
    const parse = parseMrz(lines.join('\n'));
    if (parse.status !== 'valid') {
      console.warn(
        `[mrz-beam] grammar/parser disagreement for ${spec.name} — decode discarded`,
        { lines, status: parse.status }
      );
      continue;
    }

    return { format: spec.name, lines, pathProb: res.pathProb, parse, ambiguities };
  }

  return null;
}

/** Verification note (spec ↔ parser agreement): the check-digit spans above
 *  are asserted equal to the parser's slices by the corruption test suite —
 *  every golden decode must yield parse.status === 'valid'. A drift in either
 *  side fails those tests immediately. */
