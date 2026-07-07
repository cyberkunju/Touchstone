/**
 * Oracle grammar: the shared shape of the typed-field grammars (P1.3).
 *
 * State is the accumulated prefix string — deterministic by construction, so
 * beam merging by text is sound. `next` gates characters cheaply (charset +
 * length); `accept` delegates to an existing, tested VERIFIER from
 * src/parsers (parseDate, parseAmount, isValidEmail…). Decoder and verifier
 * agreeing is the intended redundancy (Documentation/07 §6) — the grammar
 * layer never re-implements validation logic.
 */

import type { Grammar } from '../beam-search';

export function oracleGrammar(
  gate: (ch: string) => boolean,
  maxLen: number,
  acceptOracle: (s: string) => boolean,
  minLen = 1
): Grammar<string> {
  return {
    start: '',
    next(state, char) {
      if (state.length >= maxLen) return null;
      return gate(char) ? state + char : null;
    },
    accept(state) {
      return state.length >= minLen && acceptOracle(state);
    },
  };
}
