/**
 * ENUM grammars (I3): tiny closed vocabularies. This is the grammar class
 * that extinguishes the observed `sex = "c/call"` failure — a field typed as
 * an enum can only ever decode to one of its values, or to a question.
 */

import type { Grammar } from '../beam-search';
import { enumGrammar } from '../beam-search';

/** ICAO sex markers (mirrors MrzFields['sex']). '<'/unknown maps upstream. */
export const SEX_VALUES = ['M', 'F', 'X'] as const;

export function sexGrammar(): Grammar<string> {
  return enumGrammar(SEX_VALUES);
}

/** Generic factory, re-exported so field schemas can define custom enums. */
export { enumGrammar };
