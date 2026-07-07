/**
 * DATE grammar (I3): decodes lattices into calendar-valid date strings.
 *
 * Accepts every format `parseDate` accepts (numeric DMY/MDY/YMD with
 * separators, English month names). Ambiguity is NOT resolved here — the
 * decoded string is re-parsed by the caller, and `parseDate`'s ambiguity
 * flags flow into the solver as document-global locale decisions
 * (Documentation/07 §3, 08 §3).
 */

import type { DateLocale } from '../../parsers/scalars';
import { parseDate } from '../../parsers/scalars';
import type { Grammar } from '../beam-search';
import { oracleGrammar } from './oracle-grammar';

const DATE_CHAR = /[0-9A-Za-z .,/-]/;

/** Longest supported shape: "September 30, 2023" (18) + slack. */
const DATE_MAX_LEN = 24;

/**
 * @param locale Optional locale hint (from family format priors, I5) —
 *   narrows acceptance to that locale's interpretation.
 */
export function dateGrammar(locale?: DateLocale): Grammar<string> {
  return oracleGrammar(
    (ch) => DATE_CHAR.test(ch),
    DATE_MAX_LEN,
    (s) => parseDate(s, locale).valid,
    5 // shortest real date: "1/1/99"-ish; anything under 5 chars is noise
  );
}
