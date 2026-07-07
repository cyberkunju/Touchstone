/**
 * ICAO 9303 MRZ format specifications for constrained decoding (P1.3/P1.4).
 *
 * Positional charsets, check-digit positions with their covered spans, and
 * date spans — expressed in GLOBAL positions over the concatenated lines
 * (TD3: 88, TD2: 72, TD1: 90 chars). Field spans mirror the tested parser
 * in src/parsers/mrz.ts exactly (same 0-based slices); that parser remains
 * the acceptance oracle after decoding.
 */

import {
  DIGITS,
  MRZ_ALPHA_FILLER,
  MRZ_ANY,
  UPPER,
} from '../beam-search';

const SEX: ReadonlySet<string> = new Set(['M', 'F', 'X', '<']);
const DIGIT_FILLER: ReadonlySet<string> = new Set([...DIGITS, '<']);

/** A check digit at `digitPos` computed over the concatenation of `cover`
 *  spans (global, [start, end) half-open). `allowFiller` permits the ICAO
 *  practice of printing '<' for an empty optional-data check digit. */
export interface MrzCheckSpec {
  /** The logical field this check digit guards (parser vocabulary). */
  field: 'documentNumber' | 'dateOfBirth' | 'expiryDate' | 'optionalData' | 'composite';
  digitPos: number;
  cover: [number, number][];
  allowFiller?: boolean;
}

export interface MrzFormatSpec {
  name: 'TD1' | 'TD2' | 'TD3' | 'MRV_A' | 'MRV_B';
  lineLengths: number[];
  /** Positional charsets, one per global position (length = total chars). */
  charsets: ReadonlyArray<ReadonlySet<string>>;
  checks: MrzCheckSpec[];
  /** YYMMDD spans (global) that get month/day plausibility pruning. */
  dateSpans: [number, number][];
}

/** Builds `count` copies of a charset. */
function rep(set: ReadonlySet<string>, count: number): ReadonlySet<string>[] {
  return new Array<ReadonlySet<string>>(count).fill(set);
}

/** Placeholder for check-digit positions — transitions there are computed
 *  from the prefix, never from a static charset (see mrz-beam.ts). */
export const CHECK_POSITION: ReadonlySet<string> = new Set<string>();

/* ---------------------------------- TD3 ---------------------------------- */
/* Passports: 2 × 44. Line 2 global offset 44.                                */

export const TD3_SPEC: MrzFormatSpec = {
  name: 'TD3',
  lineLengths: [44, 44],
  charsets: [
    // L1: doc code (2) + issuing country (3) + names (39)
    ...rep(UPPER, 1),
    ...rep(MRZ_ALPHA_FILLER, 4),
    ...rep(MRZ_ALPHA_FILLER, 39),
    // L2: docNo(9) ck(1) nat(3) dob(6) ck(1) sex(1) expiry(6) ck(1)
    //     optional(14) ck(1) composite(1)
    ...rep(MRZ_ANY, 9),
    CHECK_POSITION,
    ...rep(MRZ_ALPHA_FILLER, 3),
    ...rep(DIGIT_FILLER, 6),
    CHECK_POSITION,
    SEX,
    ...rep(DIGIT_FILLER, 6),
    CHECK_POSITION,
    ...rep(MRZ_ANY, 14),
    CHECK_POSITION,
    CHECK_POSITION,
  ],
  checks: [
    { field: 'documentNumber', digitPos: 53, cover: [[44, 53]] },
    { field: 'dateOfBirth', digitPos: 63, cover: [[57, 63]] },
    { field: 'expiryDate', digitPos: 71, cover: [[65, 71]] },
    { field: 'optionalData', digitPos: 86, cover: [[72, 86]], allowFiller: true },
    // composite: l2[0..10) + l2[13..20) + l2[21..43)
    { field: 'composite', digitPos: 87, cover: [[44, 54], [57, 64], [65, 87]] },
  ],
  dateSpans: [
    [57, 63],
    [65, 71],
  ],
};

/* ---------------------------------- TD2 ---------------------------------- */
/* 2 × 36. Line 2 global offset 36.                                           */

export const TD2_SPEC: MrzFormatSpec = {
  name: 'TD2',
  lineLengths: [36, 36],
  charsets: [
    ...rep(UPPER, 1),
    ...rep(MRZ_ALPHA_FILLER, 4),
    ...rep(MRZ_ALPHA_FILLER, 31),
    ...rep(MRZ_ANY, 9),
    CHECK_POSITION,
    ...rep(MRZ_ALPHA_FILLER, 3),
    ...rep(DIGIT_FILLER, 6),
    CHECK_POSITION,
    SEX,
    ...rep(DIGIT_FILLER, 6),
    CHECK_POSITION,
    ...rep(MRZ_ANY, 7),
    CHECK_POSITION,
  ],
  checks: [
    { field: 'documentNumber', digitPos: 45, cover: [[36, 45]] },
    { field: 'dateOfBirth', digitPos: 55, cover: [[49, 55]] },
    { field: 'expiryDate', digitPos: 63, cover: [[57, 63]] },
    // composite: l2[0..10) + l2[13..20) + l2[21..35)
    { field: 'composite', digitPos: 71, cover: [[36, 46], [49, 56], [57, 71]] },
  ],
  dateSpans: [
    [49, 55],
    [57, 63],
  ],
};

/* ---------------------------------- MRV ---------------------------------- */
/* Visas per ICAO 9303-7: MRV-A 2×44, MRV-B 2×36. Line-2 layout matches the
 * passport head through the expiry check; the tail is UNCHECKED optional
 * data — NO optional-data check digit, NO composite check digit. The
 * document-code first character 'V' is the format discriminator, encoded as
 * a hard charset so the beam can never mint a visa from a passport.        */

/** Doc-code first char for visas — the format discriminator (9303-7). */
const VISA_V: ReadonlySet<string> = new Set(['V']);

export const MRV_A_SPEC: MrzFormatSpec = {
  name: 'MRV_A',
  lineLengths: [44, 44],
  charsets: [
    VISA_V,
    ...rep(MRZ_ALPHA_FILLER, 4),
    ...rep(MRZ_ALPHA_FILLER, 39),
    ...rep(MRZ_ANY, 9),
    CHECK_POSITION,
    ...rep(MRZ_ALPHA_FILLER, 3),
    ...rep(DIGIT_FILLER, 6),
    CHECK_POSITION,
    SEX,
    ...rep(DIGIT_FILLER, 6),
    CHECK_POSITION,
    ...rep(MRZ_ANY, 16),
  ],
  checks: [
    { field: 'documentNumber', digitPos: 53, cover: [[44, 53]] },
    { field: 'dateOfBirth', digitPos: 63, cover: [[57, 63]] },
    { field: 'expiryDate', digitPos: 71, cover: [[65, 71]] },
  ],
  dateSpans: [
    [57, 63],
    [65, 71],
  ],
};

export const MRV_B_SPEC: MrzFormatSpec = {
  name: 'MRV_B',
  lineLengths: [36, 36],
  charsets: [
    VISA_V,
    ...rep(MRZ_ALPHA_FILLER, 4),
    ...rep(MRZ_ALPHA_FILLER, 31),
    ...rep(MRZ_ANY, 9),
    CHECK_POSITION,
    ...rep(MRZ_ALPHA_FILLER, 3),
    ...rep(DIGIT_FILLER, 6),
    CHECK_POSITION,
    SEX,
    ...rep(DIGIT_FILLER, 6),
    CHECK_POSITION,
    ...rep(MRZ_ANY, 8),
  ],
  checks: [
    { field: 'documentNumber', digitPos: 45, cover: [[36, 45]] },
    { field: 'dateOfBirth', digitPos: 55, cover: [[49, 55]] },
    { field: 'expiryDate', digitPos: 63, cover: [[57, 63]] },
  ],
  dateSpans: [
    [49, 55],
    [57, 63],
  ],
};

/* ---------------------------------- TD1 ---------------------------------- */
/* 3 × 30. Line offsets 0 / 30 / 60.                                          */

export const TD1_SPEC: MrzFormatSpec = {
  name: 'TD1',
  lineLengths: [30, 30, 30],
  charsets: [
    // L1: doc code(2) country(3) docNo(9) ck(1) optional1(15)
    ...rep(UPPER, 1),
    ...rep(MRZ_ALPHA_FILLER, 4),
    ...rep(MRZ_ANY, 9),
    CHECK_POSITION,
    ...rep(MRZ_ANY, 15),
    // L2: dob(6) ck(1) sex(1) expiry(6) ck(1) nat(3) optional2(11) composite(1)
    ...rep(DIGIT_FILLER, 6),
    CHECK_POSITION,
    SEX,
    ...rep(DIGIT_FILLER, 6),
    CHECK_POSITION,
    ...rep(MRZ_ALPHA_FILLER, 3),
    ...rep(MRZ_ANY, 11),
    CHECK_POSITION,
    // L3: names(30)
    ...rep(MRZ_ALPHA_FILLER, 30),
  ],
  checks: [
    { field: 'documentNumber', digitPos: 14, cover: [[5, 14]] },
    { field: 'dateOfBirth', digitPos: 36, cover: [[30, 36]] },
    { field: 'expiryDate', digitPos: 44, cover: [[38, 44]] },
    // composite: l1[5..30) + l2[0..7) + l2[8..15) + l2[18..29)
    { field: 'composite', digitPos: 59, cover: [[5, 30], [30, 37], [38, 45], [48, 59]] },
  ],
  dateSpans: [
    [30, 36],
    [38, 44],
  ],
};

/** Format candidates by detected line count, in priority order. Passports
 *  stay first (dominant class); a true TD3/TD2 exits before MRV is tried,
 *  and a visa can never satisfy TD3/TD2 (their composite check digit is a
 *  '<' or optional char on visas) — it falls through to the MRV specs whose
 *  leading VISA_V charset passports can never satisfy. */
export function specsForLineCount(lines: number): MrzFormatSpec[] {
  if (lines === 2) return [TD3_SPEC, MRV_A_SPEC, TD2_SPEC, MRV_B_SPEC];
  if (lines === 3) return [TD1_SPEC];
  return [];
}
