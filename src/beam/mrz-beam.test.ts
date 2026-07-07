import { describe, expect, it } from 'vitest';
import { computeCheckDigit, parseMrz } from '../parsers/mrz';
import type { Lattice } from './lattice';
import { decodeMrzFromLattices } from './mrz-beam';

/* ------------------------------ goldens ---------------------------------- */

// ICAO 9303 TD3 specimen (already golden in the parser's own suite).
const TD3_L1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
const TD3_L2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';

/** TD1/TD2 goldens are built CONSTRUCTIVELY with the module's own check-digit
 *  math, then verified against the independent parser as a precondition —
 *  a hand-typed wrong golden would otherwise poison the whole suite. */
function buildTd1(): string[] {
  const docNo = 'D23145890';
  const l1 = `I<UTO${docNo}${computeCheckDigit(docNo)}${'<'.repeat(15)}`;
  const dob = '740812';
  const exp = '120415';
  const l2head = `${dob}${computeCheckDigit(dob)}F${exp}${computeCheckDigit(exp)}UTO${'<'.repeat(11)}`;
  const composite =
    l1.slice(5, 30) + l2head.slice(0, 7) + l2head.slice(8, 15) + l2head.slice(18, 29);
  const l2 = `${l2head}${computeCheckDigit(composite)}`;
  const l3 = 'ERIKSSON<<ANNA<MARIA<<<<<<<<<<';
  return [l1, l2, l3];
}

function buildTd2(): string[] {
  const l1 = `I<UTOERIKSSON<<ANNA<MARIA${'<'.repeat(11)}`;
  const docNo = 'D23145890';
  const dob = '740812';
  const exp = '120415';
  const head =
    `${docNo}${computeCheckDigit(docNo)}UTO` +
    `${dob}${computeCheckDigit(dob)}F${exp}${computeCheckDigit(exp)}${'<'.repeat(7)}`;
  const composite = head.slice(0, 10) + head.slice(13, 20) + head.slice(21, 35);
  const l2 = `${head}${computeCheckDigit(composite)}`;
  return [l1, l2];
}

/* ------------------------------ lattices ---------------------------------- */
// Real CTC output emits blank-dominated steps BETWEEN glyphs; without them,
// doubled characters (ANNA) and filler runs (<<<<) are unrepresentable. The
// synthetic builders model that honestly: char step, then separator step.

function sep(): Lattice[number] {
  return [['', 0.92]];
}

/** Per-line lattice with near-certain characters (CTC-realistic). */
function cleanLat(line: string): Lattice {
  const out: Lattice = [];
  for (const ch of line) {
    out.push([
      [ch, 0.96],
      ['', 0.04],
    ]);
    out.push(sep());
  }
  return out;
}

/** Injects OCR-style corruption: at `positions`, `wrong` becomes top-1 and
 *  the true char drops to runner-up. */
function corruptLat(line: string, corrupt: Record<number, string>): Lattice {
  const out: Lattice = [];
  [...line].forEach((ch, i) => {
    const wrong = corrupt[i];
    if (wrong === undefined || wrong === ch) {
      out.push([
        [ch, 0.96],
        ['', 0.04],
      ]);
    } else {
      out.push([
        [wrong, 0.55],
        [ch, 0.41],
        ['', 0.04],
      ]);
    }
    out.push(sep());
  });
  return out;
}

/* -------------------------------- suite ----------------------------------- */

describe('golden preconditions (falsify the goldens before trusting them)', () => {
  it('TD3 specimen is parser-valid', () => {
    expect(parseMrz(`${TD3_L1}\n${TD3_L2}`).status).toBe('valid');
  });
  it('constructed TD1 golden is parser-valid', () => {
    expect(parseMrz(buildTd1().join('\n')).status).toBe('valid');
  });
  it('constructed TD2 golden is parser-valid', () => {
    expect(parseMrz(buildTd2().join('\n')).status).toBe('valid');
  });
});

describe('decodeMrzFromLattices — clean decodes', () => {
  it('decodes a clean TD3 exactly, format-identified, parser-confirmed', () => {
    const res = decodeMrzFromLattices([cleanLat(TD3_L1), cleanLat(TD3_L2)]);
    expect(res).not.toBeNull();
    expect(res!.format).toBe('TD3');
    expect(res!.lines).toEqual([TD3_L1, TD3_L2]);
    expect(res!.parse.status).toBe('valid');
    expect(res!.parse.fields.documentNumber).toBe('L898902C3');
    expect(res!.parse.fields.surname).toBe('ERIKSSON');
  });

  it('decodes a clean TD1 (3 lines)', () => {
    const [l1, l2, l3] = buildTd1();
    const res = decodeMrzFromLattices([cleanLat(l1), cleanLat(l2), cleanLat(l3)]);
    expect(res).not.toBeNull();
    expect(res!.format).toBe('TD1');
    expect(res!.lines).toEqual([l1, l2, l3]);
  });

  it('decodes a clean TD2 (2 lines, TD3 attempted first and rejected by length gate)', () => {
    const [l1, l2] = buildTd2();
    const res = decodeMrzFromLattices([cleanLat(l1), cleanLat(l2)]);
    expect(res).not.toBeNull();
    expect(res!.format).toBe('TD2');
    expect(res!.lines).toEqual([l1, l2]);
  });
});

describe('decodeMrzFromLattices — the corruption sweep (every classic confusable)', () => {
  it('REFUSES a crisply-printed WRONG check digit (forge_009 class: internally inconsistent document)', () => {
    // An AI-forged passport printed expiry check digit '5' where the data
    // computes '9' — crisp print, high posterior. The beam must NOT "correct"
    // clean print into validity: that would attest a checksum-inconsistent
    // physical document. Correction is for noisy pixels only.
    const lat = cleanLat(TD3_L2);
    const pos = 27; // expiry check digit position in TD3 line 2
    const computed = TD3_L2[pos]; // the digit the data actually computes
    const wrongPrinted = computed === '5' ? '7' : '5';
    lat[2 * pos] = [
      [wrongPrinted, 0.9], // crisp wrong print
      [computed, 0.06],    // computed digit barely present in the lattice
      ['', 0.04],
    ];
    const res = decodeMrzFromLattices([cleanLat(TD3_L1), lat]);
    expect(res).toBeNull();
  });

  it('still CORRECTS a blurry check digit (low posterior = noisy pixels, not print)', () => {
    // Same position, but the wrong top-1 is weak (0.55) — classic OCR blur.
    // This is the case the beam exists for; the guard must not over-fire.
    const lat = cleanLat(TD3_L2);
    const pos = 27;
    const computed = TD3_L2[pos];
    const wrongPrinted = computed === '5' ? '7' : '5';
    lat[2 * pos] = [
      [wrongPrinted, 0.55],
      [computed, 0.41],
      ['', 0.04],
    ];
    const res = decodeMrzFromLattices([cleanLat(TD3_L1), lat]);
    expect(res).not.toBeNull();
    expect(res!.lines[1]).toBe(TD3_L2);
  });

  // [position in TD3_L2, wrong top-1] — each is a real-world confusion class
  // hitting a checksum-covered span (doc number, DOB, expiry, optional).
  const CASES: Array<{ name: string; pos: number; wrong: string }> = [
    { name: '8→B in document number', pos: 1, wrong: 'B' },
    { name: '9→g-like 4 in document number', pos: 2, wrong: '4' },
    { name: '0→O in document number', pos: 4, wrong: 'O' },
    { name: '2→Z in document number', pos: 6, wrong: 'Z' },
    { name: 'C→G in document number', pos: 7, wrong: 'G' },
    { name: 'check digit 3→8 on doc number', pos: 9, wrong: '8' },
    { name: '7→1 in DOB', pos: 13, wrong: '1' },
    { name: '4→A in DOB', pos: 14, wrong: 'A' },
    { name: '0→O in DOB', pos: 15, wrong: 'O' },
    { name: '8→B in DOB', pos: 16, wrong: 'B' },
    { name: '1→I in expiry', pos: 21, wrong: 'I' },
    { name: '2→Z in expiry', pos: 22, wrong: 'Z' },
    { name: '0→O in expiry', pos: 23, wrong: 'O' },
    { name: '5→S in expiry', pos: 26, wrong: 'S' },
    { name: '1→I in optional data', pos: 30, wrong: 'I' },
    { name: '8→B in optional data', pos: 31, wrong: 'B' },
    { name: '<→C in filler (checksum-visible: Δ=12)', pos: 38, wrong: 'C' },
    { name: '<→E in filler (checksum-visible: Δ=14)', pos: 40, wrong: 'E' },
  ];

  for (const c of CASES) {
    it(`recovers exactly: ${c.name}`, () => {
      const res = decodeMrzFromLattices([
        cleanLat(TD3_L1),
        corruptLat(TD3_L2, { [c.pos]: c.wrong }),
      ]);
      expect(res).not.toBeNull();
      expect(res!.lines[1]).toBe(TD3_L2); // exact recovery — nothing else passes
      expect(res!.parse.status).toBe('valid');
    });
  }

  it('recovers 5 simultaneous corruptions across doc number, DOB, expiry and filler', () => {
    const res = decodeMrzFromLattices([
      corruptLat(TD3_L1, { 7: 'K' /* I→K in name zone: charset-plausible */ }),
      corruptLat(TD3_L2, { 4: 'O', 13: '1', 16: 'B', 23: 'O', 40: 'C' }),
    ]);
    expect(res).not.toBeNull();
    expect(res!.lines[1]).toBe(TD3_L2);
    // L1 has no check digits: the name-zone corruption is only recoverable if
    // probability still favors truth via the checksum-free charset beam — it
    // does not here (wrong is top-1 and both are legal), so L1 differs at 7.
    // The decode must still be parser-valid, and every CHECKSUMMED field must
    // be exact:
    expect(res!.parse.status).toBe('valid');
    expect(res!.parse.fields.documentNumber).toBe('L898902C3');
    expect(res!.parse.fields.dateOfBirth).toBe('1974-08-12');
    expect(res!.parse.fields.expiryDate).toBe('2012-04-15');
  });

  it('documents the checksum-invisible class honestly: substitutions within value class {0,A,K,U,<} in NON-critical filler', () => {
    // ICAO check digits are weighted sums mod 10. Chars whose values differ
    // by a multiple of 10 — '<'(0)/'0'(0), 'A'(10), 'K'(20), 'U'(30) — are
    // mutually INVISIBLE to every check digit at every weight. No checksum
    // system can recover such a swap; the decoder keeps the max-probability
    // branch. Critical digit fields are charset-protected (K can't enter a
    // DOB), and cross-channel attestation (P5: MRZ↔VIZ) covers doc numbers.
    const res = decodeMrzFromLattices([
      cleanLat(TD3_L1),
      corruptLat(TD3_L2, { 38: 'K' }), // optional-data filler zone
    ]);
    expect(res).not.toBeNull();
    expect(res!.parse.status).toBe('valid'); // honestly valid — checksums DO pass
    expect(res!.lines[1][38]).toBe('K'); // physics: probability decides, 0.55 > 0.41
    // The critical, checksum-visible fields are untouched:
    expect(res!.parse.fields.documentNumber).toBe('L898902C3');
    expect(res!.parse.fields.dateOfBirth).toBe('1974-08-12');
    expect(res!.parse.fields.expiryDate).toBe('2012-04-15');
  });

  it('recovers TD1 corruption including the cross-line composite constraint', () => {
    const [l1, l2, l3] = buildTd1();
    // Corrupt the doc number on line 1 AND DOB on line 2 — the composite
    // (which spans both lines) plus per-field checks must force both back.
    const res = decodeMrzFromLattices([
      corruptLat(l1, { 5: 'O' /* D→O */, 8: 'I' /* 1→I */ }),
      corruptLat(l2, { 0: '1' /* 7→1 */, 4: 'I' /* 1→I */ }),
      cleanLat(l3),
    ]);
    expect(res).not.toBeNull();
    expect(res!.lines[0]).toBe(l1);
    expect(res!.lines[1]).toBe(l2);
  });
});

describe('decodeMrzFromLattices — the N1 guarantee (no wrong accepts, ever)', () => {
  it('returns null when the true character is absent from the lattice at a checksummed position', () => {
    // Char i occupies lattice index 2i (char step + separator step layout).
    // Position 4 (inside doc number) has ONLY wrong candidates: the checksum
    // can never close, so the decoder must refuse rather than approximate.
    const lat = cleanLat(TD3_L2);
    lat[2 * 4] = [
      ['O', 0.6],
      ['Q', 0.4],
    ];
    expect(decodeMrzFromLattices([cleanLat(TD3_L1), lat])).toBeNull();
  });

  it('returns null when the check digit itself is unreadable (truth absent)', () => {
    const lat = cleanLat(TD3_L2);
    lat[2 * 9] = [
      ['8', 0.6],
      ['1', 0.4],
    ]; // true digit is 3
    expect(decodeMrzFromLattices([cleanLat(TD3_L1), lat])).toBeNull();
  });

  it('returns null for structurally hopeless input (wrong line count)', () => {
    expect(decodeMrzFromLattices([cleanLat(TD3_L1)])).toBeNull();
    expect(decodeMrzFromLattices([])).toBeNull();
  });

  it('never returns a decode whose parser status is not fully valid (1k fuzz)', () => {
    // Deterministic fuzz: random corruption patterns; ANY non-null result
    // must be parser-valid — an accepted-but-invalid decode is the silent
    // error class this whole architecture exists to kill.
    let seed = 7;
    const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff;
    const CONFUSABLES = 'OB1IZSGA<K';
    for (let round = 0; round < 1000; round++) {
      const corrupt: Record<number, string> = {};
      const n = 1 + Math.floor(rand() * 6);
      for (let i = 0; i < n; i++) {
        corrupt[Math.floor(rand() * 44)] =
          CONFUSABLES[Math.floor(rand() * CONFUSABLES.length)];
      }
      const res = decodeMrzFromLattices([
        cleanLat(TD3_L1),
        corruptLat(TD3_L2, corrupt),
      ]);
      if (res !== null) {
        expect(res.parse.status).toBe('valid');
      }
    }
  });
});

describe('checksum-invisible ambiguity guard (the blind-spot fix)', () => {
  it('flags a near-tie within the invisible value class on a checksummed field', () => {
    // Doc number position 0: 'L' chosen, but 'V' (value 31 vs 21 — Δ=10) is a
    // near-tie. Every check digit passes for BOTH readings; the guard must
    // report that this field is not checksum-proven.
    const lat = cleanLat(TD3_L2);
    lat[2 * 0] = [
      ['L', 0.5],
      ['V', 0.42], // same class: mrzValue(L)=21, mrzValue(V)=31
      ['', 0.08],
    ];
    const res = decodeMrzFromLattices([cleanLat(TD3_L1), lat]);
    expect(res).not.toBeNull();
    expect(res!.parse.status).toBe('valid'); // checksums genuinely pass
    const fields = res!.ambiguities.map((a) => a.field);
    expect(fields).toContain('documentNumber');
    const amb = res!.ambiguities.find((a) => a.field === 'documentNumber')!;
    expect(amb.chosen).toBe('L');
    expect(amb.alternative).toBe('V');
    expect(amb.probRatio).toBeGreaterThan(0.43);
  });

  it('flags 0↔< near-ties in date fields (the only invisible pair that can enter dates)', () => {
    // DOB position 15 holds '0'; '<' shares value 0 and is charset-legal in
    // the date span (unknown-date padding) — a near-tie there is unprovable.
    const lat = cleanLat(TD3_L2);
    lat[2 * 15] = [
      ['0', 0.5],
      ['<', 0.45],
      ['', 0.05],
    ];
    const res = decodeMrzFromLattices([cleanLat(TD3_L1), lat]);
    expect(res).not.toBeNull();
    expect(res!.ambiguities.some((a) => a.field === 'dateOfBirth')).toBe(true);
  });

  it('does NOT flag when the lattice is decisive (clean decode ⇒ zero ambiguities)', () => {
    const res = decodeMrzFromLattices([cleanLat(TD3_L1), cleanLat(TD3_L2)]);
    expect(res).not.toBeNull();
    expect(res!.ambiguities).toEqual([]);
  });

  it('does NOT flag corrections in digit-only spans — residue is unique there, so the checksum IS proof', () => {
    // DOB position 13 ('7' of '740812') corrupted to top-1 'T'. The date span
    // charset admits only digits, and no other digit shares 7's mod-10 value —
    // the check digit plus charset make the correction provably unique, so
    // even a weak posterior carries no ambiguity.
    const res = decodeMrzFromLattices([
      cleanLat(TD3_L1),
      corruptLat(TD3_L2, { 13: 'T' }),
    ]);
    expect(res).not.toBeNull();
    expect(res!.lines[1]).toBe(TD3_L2);
    expect(res!.ambiguities).toEqual([]);
  });

  it('flags LOW-POSTERIOR corrections in alnum spans — within-class choice rests on pixels alone', () => {
    // 0 vs O at doc-number position 4: values 9 vs 24 → cross-class, so the
    // checksum kills the 'O' branch and the decode is still exact. BUT the
    // surviving '9' holds only 0.41 posterior in an alnum charset where J/T
    // share its value class — the checksum cannot rule those out, so the
    // field is decoded yet marked unproven (the destroyed-glyph guard).
    const res = decodeMrzFromLattices([
      cleanLat(TD3_L1),
      corruptLat(TD3_L2, { 4: 'O' }),
    ]);
    expect(res).not.toBeNull();
    expect(res!.lines[1]).toBe(TD3_L2);
    const amb = res!.ambiguities.filter((a) => a.field === 'documentNumber');
    expect(amb.length).toBeGreaterThan(0);
    expect(amb.every((a) => a.kind === 'low_posterior')).toBe(true);
  });
});

describe('performance sanity', () => {
  it('decodes a corrupted TD3 well inside the interactive budget', () => {
    const t0 = performance.now();
    decodeMrzFromLattices([
      cleanLat(TD3_L1),
      corruptLat(TD3_L2, { 4: 'O', 13: '1', 23: 'O' }),
    ]);
    const ms = performance.now() - t0;
    // note: budget in 13_PERFORMANCE is decode+solve ≤ 200ms; generous CI bound
    expect(ms).toBeLessThan(1500);
  });
});
