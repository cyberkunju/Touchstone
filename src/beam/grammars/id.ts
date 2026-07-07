/**
 * ID grammar (I3): fixed-charset identifier fields (document numbers, file
 * numbers). Attestor fusion (checksums inside the beam) arrives with the
 * registry in P5; until then `pattern` provides structural acceptance.
 */

import type { Grammar } from '../beam-search';
import { DIGITS, UPPER } from '../beam-search';
import { oracleGrammar } from './oracle-grammar';

export function idGrammar(
  charset: ReadonlySet<string>,
  minLen: number,
  maxLen: number,
  pattern?: RegExp
): Grammar<string> {
  return oracleGrammar(
    (ch) => charset.has(ch),
    maxLen,
    (s) => s.length >= minLen && (!pattern || pattern.test(s)),
    minLen
  );
}

const ALNUM_UPPER: ReadonlySet<string> = new Set([...UPPER, ...DIGITS]);

/** Passport document numbers: 6–9 uppercase alphanumerics (ICAO practice). */
export function passportNumberGrammar(): Grammar<string> {
  return idGrammar(ALNUM_UPPER, 6, 9);
}
