import { describe, expect, it } from 'vitest';
import {
  beamDecode,
  enumGrammar,
  positionalGrammar,
  charRange,
  DIGITS,
  UPPER,
  type ConfusionPrior,
  type Grammar,
} from './beam-search';
import type { Lattice, LatticeStep } from './lattice';

/** Shorthand: build a lattice from per-step [char, prob] pair lists. */
function lat(...steps: [string, number][][]): Lattice {
  return steps as Lattice;
}

describe('beamDecode — the constrained-decoding core', () => {
  it('recovers a valid value when greedy top-1 is grammar-invalid (the sex-field killer)', () => {
    // Greedy reads 'P' (0.55) but the field grammar only allows M/F/X.
    // 'F' is sitting right there at 0.44 — the beam must find it.
    const sexGrammar = enumGrammar(['M', 'F', 'X']);
    const lattice = lat([
      ['P', 0.55],
      ['F', 0.44],
      ['', 0.01],
    ]);
    const res = beamDecode(lattice, sexGrammar);
    expect(res).not.toBeNull();
    expect(res!.text).toBe('F');
  });

  it('returns null when the lattice contains no valid path — never guesses', () => {
    const sexGrammar = enumGrammar(['M', 'F', 'X']);
    const lattice = lat(
      [
        ['7', 0.9],
        ['1', 0.1],
      ],
    );
    expect(beamDecode(lattice, sexGrammar)).toBeNull();
  });

  it('returns null when a valid prefix never reaches an accepting state', () => {
    const grammar = enumGrammar(['AB']);
    // Only 'A' is decodable; 'B' never appears → prefix 'A' is not accepted.
    const lattice = lat([['A', 0.9], ['', 0.1]], [['', 0.95], ['C', 0.05]]);
    expect(beamDecode(lattice, grammar)).toBeNull();
  });

  it('applies CTC collapse: blanks and consecutive duplicates', () => {
    const grammar = positionalGrammar([new Set(['A']), new Set(['B'])]);
    // Raw: A A blank B B  → collapsed "AB"
    const lattice = lat(
      [['A', 0.9], ['', 0.1]],
      [['A', 0.8], ['', 0.2]],
      [['', 0.95], ['A', 0.05]],
      [['B', 0.85], ['', 0.15]],
      [['B', 0.7], ['', 0.3]],
    );
    const res = beamDecode(lattice, grammar);
    expect(res).not.toBeNull();
    expect(res!.text).toBe('AB');
    expect(res!.perChar).toHaveLength(2);
  });

  it('distinguishes repeated characters separated by an explicit blank (AA case)', () => {
    const grammar = positionalGrammar([new Set(['A']), new Set(['A'])]);
    // Raw: A blank A → "AA" is reachable; without the blank it would collapse.
    const lattice = lat(
      [['A', 0.9], ['', 0.1]],
      [['', 0.9], ['A', 0.1]],
      [['A', 0.9], ['', 0.1]],
    );
    const res = beamDecode(lattice, grammar);
    expect(res).not.toBeNull();
    expect(res!.text).toBe('AA');
  });

  it('decodes a fixed-format positional string through heavy ambiguity', () => {
    // Format: LETTER DIGIT DIGIT. Every step is ambiguous; the only fully
    // valid assignment is "B07".
    const grammar = positionalGrammar([UPPER, DIGITS, DIGITS]);
    const lattice = lat(
      [
        ['8', 0.5],
        ['B', 0.45],
        ['', 0.05],
      ],
      [
        ['O', 0.55],
        ['0', 0.4],
        ['', 0.05],
      ],
      [
        ['7', 0.6],
        ['T', 0.35],
        ['', 0.05],
      ],
    );
    const res = beamDecode(lattice, grammar);
    expect(res).not.toBeNull();
    expect(res!.text).toBe('B07');
    expect(res!.perChar).toEqual([
      expect.closeTo(0.45, 5),
      expect.closeTo(0.4, 5),
      expect.closeTo(0.6, 5),
    ]);
  });

  it('honors the confusion-prior hook (I5): a prior can flip a near-tie', () => {
    const grammar = positionalGrammar([charRange('A', 'Z')]);
    const lattice = lat([
      ['O', 0.5],
      ['Q', 0.48],
      ['', 0.02],
    ]);
    // Without prior: O wins.
    expect(beamDecode(lattice, grammar)!.text).toBe('O');
    // Prior says: when this scanner shows O-vs-Q ambiguity it is usually Q.
    const prior: ConfusionPrior = {
      weight: (candidate: string) => (candidate === 'Q' ? 1.2 : 1.0),
    };
    expect(beamDecode(lattice, grammar, { prior })!.text).toBe('Q');
  });

  it('merges duplicate prefixes instead of wasting beam slots', () => {
    // Both raw paths [A, blank] and [blank, A] produce "A" — with merging,
    // "A" accumulates both alignments' mass and must beat the single-path "B"
    // even though each individual A-alignment is weaker.
    const grammar = positionalGrammar([new Set(['A', 'B'])]);
    const lattice = lat(
      [
        ['A', 0.40],
        ['B', 0.45],
        ['', 0.15],
      ],
      [
        ['', 0.5],
        ['A', 0.4],
        ['B', 0.1],
      ],
    );
    const res = beamDecode(lattice, grammar);
    expect(res).not.toBeNull();
    // Mass("A") ≈ 0.40*0.5 + 0.40*0.40(dup-collapse) + 0.15*0.4 = 0.42
    // Mass("B") ≈ 0.45*0.5 + 0.45*0.1(dup)           = 0.27
    expect(res!.text).toBe('A');
  });

  it('survives long sequences without numeric underflow', () => {
    // 200 steps of p=0.01 on the only valid char — linear-domain score would
    // be 1e-400 (underflow to 0); the rescaling + log accumulation must cope.
    const steps: LatticeStep[] = [];
    for (let i = 0; i < 200; i++) steps.push([['A', 0.01], ['', 0.99]]);
    // Grammar: 1..200 A's (accept any count ≥ 1).
    const grammar: Grammar<number> = {
      start: 0,
      next: (s, ch) => (ch === 'A' ? s + 1 : null),
      accept: (s) => s >= 1,
    };
    const res = beamDecode(steps, grammar);
    expect(res).not.toBeNull();
    expect(Number.isFinite(res!.pathProb)).toBe(true);
    expect(res!.pathProb).toBeLessThan(0);
  });

  it('respects beam width without losing an easy winner', () => {
    // note: consecutive identical raw chars collapse under CTC, so the
    // unambiguous 3-char winner must vary per step: C→G→O.
    const grammar = positionalGrammar([UPPER, UPPER, UPPER]);
    const res = beamDecode(
      lat(
        [
          ['C', 0.6],
          ['B', 0.2],
          ['O', 0.1],
          ['D', 0.06],
          ['', 0.04],
        ],
        [
          ['G', 0.6],
          ['B', 0.2],
          ['O', 0.1],
          ['D', 0.06],
          ['', 0.04],
        ],
        [
          ['O', 0.6],
          ['B', 0.2],
          ['C', 0.1],
          ['D', 0.06],
          ['', 0.04],
        ],
      ),
      grammar,
      { width: 3 },
    );
    expect(res).not.toBeNull();
    expect(res!.text).toBe('CGO');
  });
});

describe('grammar combinators', () => {
  it('enumGrammar accepts exactly its vocabulary', () => {
    const g = enumGrammar(['MRZ', 'MR']);
    let s: string | null = g.start;
    for (const ch of 'MRZ') s = s === null ? null : g.next(s, ch);
    expect(s).not.toBeNull();
    expect(g.accept(s!)).toBe(true);
    expect(g.accept('MR')).toBe(true);
    expect(g.accept('M')).toBe(false);
    expect(g.next('MRZ', 'X')).toBeNull();
  });

  it('positionalGrammar rejects overlong and underlong input', () => {
    const g = positionalGrammar([DIGITS, DIGITS]);
    expect(g.accept(1)).toBe(false);
    expect(g.next(2, '5')).toBeNull();
    expect(g.accept(2)).toBe(true);
  });
});
