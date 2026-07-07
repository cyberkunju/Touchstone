/**
 * AMOUNT grammar (I3): decodes lattices into parseable monetary amounts.
 * Locale conventions (1,200.00 vs 1.200,00) are handled by `parseAmount`'s
 * normalization; the solver settles document-global decimal style (08 §3).
 */

import { parseAmount } from '../../parsers/scalars';
import type { Grammar } from '../beam-search';
import { oracleGrammar } from './oracle-grammar';

const AMOUNT_CHAR = /[0-9.,\s()$€£₹A-Za-z-]/;
const AMOUNT_MAX_LEN = 20;

export function amountGrammar(): Grammar<string> {
  return oracleGrammar((ch) => AMOUNT_CHAR.test(ch), AMOUNT_MAX_LEN, (s) => parseAmount(s).valid);
}
