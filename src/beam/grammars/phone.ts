/**
 * PHONE grammar (I3): typed re-decode for phone fields. Acceptance oracle:
 * the existing tested `isPlausiblePhone`.
 */

import { isPlausiblePhone } from '../../parsers/scalars';
import type { Grammar } from '../beam-search';
import { oracleGrammar } from './oracle-grammar';

const PHONE_CHAR = /[0-9+()\s-]/;

export function phoneGrammar(): Grammar<string> {
  return oracleGrammar((ch) => PHONE_CHAR.test(ch), 20, isPlausiblePhone, 7);
}
