# 07 — Lattices, Beam Search & Grammars

The decoding layer that turns raw character probabilities into provable strings. This is the heart
of I2/I3/I5 and the direct fix for the project's worst observed failures.

---

## 1. The lattice (`src/beam/lattice.ts`)

```ts
type LatticeStep = [char: string, prob: number][];  // top-k=5, descending, '' = CTC blank
type Lattice = LatticeStep[];                       // T steps
```
- Produced by the service ([05 §4](05_PERCEPTION_SERVICE.md)) and by the browser fallback: the
  existing `decodeCTCGreedy` in `src/ai-runtime/ocr.ts` is refactored to emit top-k *before*
  argmax/collapse (greedy path kept as `top1`).
- Invariants (unit-tested): probs descending; Σ top-k ≤ 1 + ε; k = 5 (config, frozen).
- **Prior hook:** decoding consumes `P'(c|step) ∝ P(c|step) · prior(c_seen → c_true)` where the
  prior is the identity matrix until Phase 6 activates the confusion prior (I5). The hook exists
  from day one so P6 is a data change, not a code change.

## 2. Generic beam search (`src/beam/beam-search.ts`)

```ts
function beamDecode(lattice: Lattice, automaton: Grammar, opts: {
  width: number;          // frozen: 50
  prior?: ConfusionPrior; // I5 hook
  maxViolations?: 0;      // hard grammars admit zero violations
}): { text: string; pathProb: number; perChar: number[] } | null
```
- Standard CTC-aware beam: tracks (blank-collapsed prefix, automaton state, logprob); merges
  duplicate prefixes; prunes to width; rejects transitions the automaton forbids.
- Returns `null` when no valid path exists in the lattice — **the caller must then ask, never
  fall back to top1** (N1).
- Complexity honesty: T ≤ ~150, k = 5, width = 50 → worst case well under a millisecond per field
  in TS. MRZ joint decode (2–3 lines, T ≈ 90 each) stays under ~10 ms.

## 3. Grammar automata (`src/beam/grammars/`)

Plain-TS finite-state definitions; each exports `Grammar` = `{ start, next(state, char) → state|null, accept(state) → bool, tags(state) }`.

| Grammar | Definition |
|---|---|
| `DATE(localeSet)` | DMY/MDY/YMD orderings; separators `/ - . space`; month names/abbrevs (multi-lang table); output normalized ISO + the ordering used. Calendar-valid only (Feb 30 is not a path). Ambiguity (01/02/2003) → *both* parses emitted as candidates; the solver resolves document-globally (one locale decision per doc/family). |
| `AMOUNT(localeSet)` | Digit groups with `, .` thousand/decimal hypotheses; optional currency symbol/ISO code; sign. Emits normalized decimal + currency + locale hypothesis. |
| `ENUM(values)` | Exact small vocabularies: sex {M, F, X, <}, checkbox {checked, unchecked}, boolean words. This alone extinguishes the `sex="c/call"` class. |
| `ID(pattern, attestor?)` | Regex-shaped character-class automaton (e.g., passport number `[A-Z0-9]{6,9}`), optionally fused with an attestor so the checksum runs *inside* the beam (invalid-checksum paths pruned early). |
| `MRZ_TD1/TD2/TD3` | Per-line: position-aware charsets (alpha zones, digit zones, filler zones), `<` filler semantics; joint (below). |
| `EMAIL`, `PHONE` | RFC-lite mailbox shape; E.164-tolerant phone shape. Used for typed re-decode, not discovery. |
| `NAME(charset)` | Uppercase Latin + separators for MRZ names; general names stay unconstrained (no fake precision). |

## 4. The MRZ beam decoder (`src/beam/mrz-beam.ts`) — I2

**Input:** the OCR lines geometrically identified as the MRZ zone (existing `detectMrzZone` logic,
retained), each with its lattice. **Output:** a fully validated MRZ parse or `null`.

Algorithm:
1. Determine format candidate(s) by line count/length tolerance: TD3 (2×44), TD1 (3×30), TD2 (2×36).
2. Joint beam over the concatenated lines with the per-position charset automaton
   (`A–Z`, `0–9`, `<` by field map).
3. **Hard constraints — ICAO 9303 check digits (weights 7-3-1, `<`=0, A=10…Z=35):**
   document number ✓, DOB ✓, expiry ✓, optional-data ✓ (TD1/TD3 where present), **composite ✓**.
   Beams are checkpointed at each check-digit position: prefixes failing a reachable checksum are
   pruned immediately (this is what makes the search fast *and* the result provable).
4. Semantic hard constraints: DOB/expiry are calendar-valid dates; sex ∈ {M, F, <}; document code
   starts with a valid ICAO letter class.
5. Result: highest-probability path satisfying **all** constraints ⇒ fields extracted with
   per-field char provenance; else `null` ⇒ MRZ is *not claimed* (status stays needs_review with
   the zone shown as evidence).
6. Every accepted decode emits (printed_char, ocr_top1_char) pairs to the LWT store — free
   ground-truth for the confusion prior (I5).

**Test suite (P1.4, permanent):** golden MRZs (TD1/TD2/TD3, real-format synthetic identities) ×
systematic corruption of every classic confusable pair (`0↔O`, `8↔B`, `1↔I`, `5↔S`, `2↔Z`,
`6↔G`, `4↔A`, `<`-drop, `<`↔`K`/`C`) injected into lattices at varying confidence margins; the
decoder must recover exactly or return `null` — an incorrect *accepted* decode is a failing test
of the highest severity (it would be a silent error).

## 5. Field-level re-decode protocol (I3)

Where a field's type is known (label match, template binding, attestor hit, native type):
1. Take the value ROI's lattice(s).
2. `beamDecode(lattice, grammarForType, { prior })`.
3. Valid path → candidate with `grammar_valid` mark (a *hard-constraint pass*, still needs
   attestation to confirm — grammar validity alone is necessary, not sufficient).
4. `null` → candidate set from top-k retained but flagged; field can never auto-confirm.

## 6. Relationship to the old parsers

`src/parsers/mrz.ts` (string-based parser + auto-correct) is retained as the **final fallback**
(e.g., text pasted digitally, or fallback mode without lattices) and as a cross-check in tests.
`src/parsers/scalars.ts` date/amount validators remain as *verifiers* consumed by attestors; the
grammars above are *decoders*. Verifier and decoder agreeing is the intended redundancy.
