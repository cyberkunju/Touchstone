/**
 * EMAIL grammar (I3): typed re-decode for email fields (never used for
 * discovery). Acceptance oracle: the existing tested `isValidEmail`.
 */

import { isValidEmail } from '../../parsers/scalars';
import type { Grammar } from '../beam-search';
import { oracleGrammar } from './oracle-grammar';

const EMAIL_CHAR = /[A-Za-z0-9@._%+-]/;

export function emailGrammar(): Grammar<string> {
  return oracleGrammar((ch) => EMAIL_CHAR.test(ch), 64, isValidEmail, 5);
}
