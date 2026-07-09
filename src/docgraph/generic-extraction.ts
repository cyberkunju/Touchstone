/**
 * @file generic-extraction.ts
 *
 * Registry-FREE, geometry-based generic field extraction engine.
 *
 * Purpose
 * -------
 * This engine extracts EVERY plausible label -> value pair from ANY document
 * (forms, IDs, certificates, invoices, letters) using only geometry and a few
 * conservative text heuristics. It carries NO dictionary of known field names,
 * so it complements the known-field extractor by discovering fields for which
 * we have no predefined synonyms.
 *
 * Design principles
 * -----------------
 *  - **Deterministic.** Given the same OCR items, the output never varies.
 *  - **Conservative.** Values are taken verbatim from OCR text (whitespace
 *    cleaned only) and are NEVER fabricated.
 *  - **Geometry first.** Associations are scored from spatial relationships
 *    (same-row-right, directly-below) plus distance, with a strong preference
 *    for non-label-looking values.
 *
 * A note on label-vs-value ambiguity
 * ----------------------------------
 * A short value such as `SURAT, GUJARAT` is textually indistinguishable from a
 * label (it is a short alphabetic phrase, so {@link looksLikeLabel} returns
 * `true`). We do NOT try to resolve this purely from text. Instead we rely on
 * geometry: a value placed to the right of (or directly below) a label wins,
 * and any candidate value that itself looks like a label is penalized (-0.5)
 * whenever a non-label alternative exists for the same label.
 */

import { OcrItem } from './ocr-item';
import { FieldValueType } from '../core/types';
import { parseDate, parseAmount } from '../parsers/scalars';
import { getBoxCenter, getDistance } from '../core/geometry';

/* -------------------------------------------------------------------------- */
/*  Public types                                                              */
/* -------------------------------------------------------------------------- */

/** A single generic (registry-free) label -> value association. */
export interface GenericField {
  /** Slug of the label text, e.g. `place_of_birth`. */
  canonicalLabel: string;
  /** Cleaned label display text, e.g. `Place of Birth`. */
  label: string;
  /** Inferred value type: `date` | `amount` | `id_number` | `text`. */
  valueType: FieldValueType;
  /** The value text (whitespace-cleaned, NEVER fabricated). */
  value: string;
  /** The OCR item the value was taken from. */
  valueItem: OcrItem;
  /** The OCR item the label was taken from. */
  labelItem: OcrItem;
  /** Association confidence in [0, 1]. */
  score: number;
}

/* -------------------------------------------------------------------------- */
/*  Text helpers                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Slugifies a label: lower-cases the input, replaces every run of
 * non-alphanumeric characters with a single `_`, then trims leading/trailing
 * underscores.
 *
 * @example slugifyLabel("Place of Birth") === "place_of_birth"
 */
export function slugifyLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Collapses all internal whitespace to single spaces and trims. */
function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Counts ASCII Latin letters in a string. */
function latinLetterCount(s: string): number {
  const m = s.match(/[A-Za-z]/g);
  return m ? m.length : 0;
}

/**
 * Cleans a (possibly bilingual) label into display text.
 *
 * Many documents print bilingual labels such as `"उपनाम / Surname"` or
 * `"Date of Birth / जन्म तिथि"`. We keep the ASCII/Latin portion: split on
 * `'/'`, pick the segment with the most ASCII letters, strip a trailing `':'`,
 * and collapse whitespace. If no segment contains a Latin letter, the whole
 * (cleaned) text is returned. The original case of words is preserved.
 */
export function cleanLabelText(s: string): string {
  const segments = s.split('/');

  let chosen = s;
  let bestCount = -1;
  for (const seg of segments) {
    const count = latinLetterCount(seg);
    if (count > bestCount) {
      bestCount = count;
      chosen = seg;
    }
  }
  // If no segment had any Latin letters, fall back to the whole string.
  if (bestCount <= 0) {
    chosen = s;
  }

  let out = collapseWhitespace(chosen);
  out = out.replace(/:\s*$/, '');
  return collapseWhitespace(out);
}

/**
 * Infers the value type of a piece of text.
 *
 *  - `date`      when {@link parseDate} reports a valid calendar date.
 *  - `amount`    when {@link parseAmount} is valid AND the text carries a
 *                currency symbol or a decimal grouping (so bare alphanumerics
 *                like `V8673092` are not misread as money).
 *  - `id_number` when it matches `/^[A-Z0-9][A-Z0-9\-\/]{3,}$/i` and contains
 *                at least one digit.
 *  - `text`      otherwise.
 */
export function inferValueType(text: string): FieldValueType {
  const t = text.trim();

  if (parseDate(t).valid) {
    return 'date';
  }

  const amount = parseAmount(t);
  const hasCurrencyOrDecimal = /[$₹€£]/.test(t) || /\d[.,]\d/.test(t);
  if (amount.valid && hasCurrencyOrDecimal) {
    return 'amount';
  }

  if (/^[A-Z0-9][A-Z0-9\-/]{3,}$/i.test(t) && /\d/.test(t)) {
    return 'id_number';
  }

  return 'text';
}

/**
 * Heuristic test for whether a piece of text reads like a *label* (as opposed
 * to a value).
 *
 * Let `t = cleanLabelText(text)`. Returns `true` when ALL of:
 *  - `t.length` is between 2 and 40 (inclusive),
 *  - `t` has at most 5 words,
 *  - `t` contains at least one letter, and
 *  - `t` is not purely a number/date/amount, i.e. `inferValueType(t) === 'text'`
 *    OR the original text ends with `':'`.
 *
 * Labels are typically short alphabetic phrases. A long value like
 * `"MINISTRY OF EXTERNAL AFFAIRS GOVT OF INDIA"` (6+ words) is NOT a label.
 */
export function looksLikeLabel(text: string): boolean {
  const t = cleanLabelText(text);
  const len = t.length;
  if (len < 2 || len > 40) {
    return false;
  }

  const wordCount = t.split(/\s+/).filter(Boolean).length;
  if (wordCount > 5) {
    return false;
  }

  if (!/[A-Za-z]/.test(t)) {
    return false;
  }

  const endsWithColon = /:\s*$/.test(text.trim());
  return inferValueType(t) === 'text' || endsWithColon;
}

/* -------------------------------------------------------------------------- */
/*  Geometry helpers                                                          */
/* -------------------------------------------------------------------------- */

/** Vertical overlap ratio of two items relative to the shorter height. */
function verticalOverlapRatio(a: OcrItem, b: OcrItem): number {
  const [, ay1, , ay2] = a.boxNorm;
  const [, by1, , by2] = b.boxNorm;
  const overlap = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
  const minHeight = Math.min(ay2 - ay1, by2 - by1);
  return minHeight > 0 ? overlap / minHeight : 0;
}

/** Horizontal overlap ratio of two items relative to the narrower width. */
function horizontalOverlapRatio(a: OcrItem, b: OcrItem): number {
  const [ax1, , ax2] = a.boxNorm;
  const [bx1, , bx2] = b.boxNorm;
  const overlap = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
  const minWidth = Math.min(ax2 - ax1, bx2 - bx1);
  return minWidth > 0 ? overlap / minWidth : 0;
}

/**
 * Position score of value `v` relative to label `l` — GRADED, not flat
 * (live-caught on the certificate/lab families: flat scores let same-row
 * neighbors STEAL values from their aligned label directly above).
 *
 *  - SAME-ROW-RIGHT: starts at 1.0 for adjacent items and decays with the
 *    horizontal GAP (`1.0 − min(gap×2, 0.4)`): a wide table row keeps a
 *    strong 0.6+, but a cross-column steal (the neighbor VALUE of a
 *    label-above grid) no longer outbids the stacked pair.
 *  - BELOW: `0.55 + 0.4 × horizontalOverlap` — a tightly stacked
 *    label-above-value pair (the certificate-grid archetype) reaches 0.95.
 *  - `null` when neither relationship holds.
 */
function positionScore(l: OcrItem, v: OcrItem): number | null {
  const lx2 = l.boxNorm[2];
  const ly2 = l.boxNorm[3];
  const vx1 = v.boxNorm[0];
  const vy1 = v.boxNorm[1];

  if (vx1 >= lx2 - 0.01 && verticalOverlapRatio(l, v) >= 0.3) {
    const gap = Math.max(0, vx1 - lx2);
    return 1.0 - Math.min(gap * 2, 0.4);
  }

  if (vy1 >= ly2 - 0.01 && horizontalOverlapRatio(l, v) >= 0.2 && vy1 - ly2 < 0.1) {
    // The stacked-pair BOOST applies only to value-shaped items: a
    // label-like item below a label is a label COLUMN (Place of Birth over
    // Place of Issue), which the flat legacy 0.6 keeps appropriately weak.
    return looksLikeLabel(v.text) ? 0.6 : 0.55 + 0.4 * horizontalOverlapRatio(l, v);
  }

  return null;
}

/** True when `below` stacks under `top` in the pair window (the geometry of
 *  a value belonging to a label above it). */
function stacksBelow(top: OcrItem, below: OcrItem, depth = 0.12): boolean {
  const gap = below.boxNorm[1] - top.boxNorm[3];
  return gap >= -0.01 && gap < depth && horizontalOverlapRatio(top, below) >= 0.5;
}

/** Clamps a number into [0, 1]. */
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Reading-order comparator: top-to-bottom (y) then left-to-right (x). */
function readingOrder(a: OcrItem, b: OcrItem): number {
  const ay = a.boxNorm[1];
  const by = b.boxNorm[1];
  if (ay !== by) {
    return ay - by;
  }
  return a.boxNorm[0] - b.boxNorm[0];
}

/* -------------------------------------------------------------------------- */
/*  Engine                                                                    */
/* -------------------------------------------------------------------------- */

interface ScoredPair {
  label: OcrItem;
  value: OcrItem;
  total: number;
}

/**
 * Extracts every plausible generic label -> value field from a set of OCR
 * items using geometry and conservative text heuristics.
 *
 * @param items          all OCR items on the page (normalized coordinates).
 * @param excludeNodeIds node ids already claimed by other extractors (known
 *                       fields, MRZ, tables, ...). These are ignored entirely.
 * @returns generic fields, ordered by label reading order and de-duplicated by
 *          canonical label (highest score wins).
 */
export function extractGenericFields(
  items: OcrItem[],
  excludeNodeIds?: Set<string>
): GenericField[] {
  const excluded = excludeNodeIds ?? new Set<string>();

  // 1. Filter out excluded and empty items. Items containing '<' are MRZ
  //    fragments (real values never contain '<') and are dropped.
  const pool = items.filter(
    (it) => !excluded.has(it.nodeId) && it.text.trim() !== '' && !it.text.includes('<')
  );

  const consumed = new Set<string>();
  const inlineFields: GenericField[] = [];

  // 2. Inline "Label: value" pairs (label and value live in the same item).
  for (const item of pool) {
    const colonIdx = item.text.indexOf(':');
    if (colonIdx < 0) {
      continue;
    }
    const before = item.text.slice(0, colonIdx);
    const after = item.text.slice(colonIdx + 1).trim();
    if (after === '' || !looksLikeLabel(before)) {
      continue;
    }

    const label = cleanLabelText(before);
    inlineFields.push({
      canonicalLabel: slugifyLabel(label),
      label,
      valueType: inferValueType(after),
      value: collapseWhitespace(after),
      valueItem: item,
      labelItem: item,
      score: 0.9,
    });
    consumed.add(item.nodeId);
  }

  // 3. Remaining items become label / value candidates.
  const rest = pool.filter((it) => !consumed.has(it.nodeId));
  const labelCandidates = rest.filter((it) => looksLikeLabel(it.text));

  // STRUCTURAL PRE-PASSES (live-caught on certificates/labs — the grid and
  // table archetypes are invisible to pairwise geometry alone):
  //
  //  DOCUMENT-AXIS law: label→value orientation is a DOCUMENT property
  //  (exactly like date order — the forge_193 shape). Count unambiguous
  //  row-evidence (label with an ADJACENT non-label right neighbor) vs
  //  column-evidence (label with a non-label stacked tightly beneath); the
  //  dominant axis wins and OFF-axis pairings decay ×0.6.
  //
  //  HEADER law: a label with ≥2 non-label items stacked beneath is a table
  //  COLUMN HEADER (Result over 13.7/83.4/…) — headers own columns, not
  //  values: their below-pairing is capped hard. Items stacked under any
  //  header are TABLE MEMBERS; a same-row pairing between members of two
  //  columns is a TABLE ROW (Hemoglobin → 13.7) — the one legitimate
  //  wide-gap row read — and is exempt from both decays.
  let rowEvidence = 0;
  let colEvidence = 0;
  for (const l of labelCandidates) {
    const right = rest.find(
      (v) =>
        v.nodeId !== l.nodeId &&
        v.boxNorm[0] >= l.boxNorm[2] - 0.01 &&
        v.boxNorm[0] - l.boxNorm[2] < 0.04 &&
        verticalOverlapRatio(l, v) >= 0.5,
    );
    if (right && !looksLikeLabel(right.text)) rowEvidence++;
    const below = rest.find(
      (v) => v.nodeId !== l.nodeId && stacksBelow(l, v, 0.1) && horizontalOverlapRatio(l, v) >= 0.7,
    );
    if (below && !looksLikeLabel(below.text)) colEvidence++;
  }
  const axis: 'row' | 'col' | null =
    rowEvidence > colEvidence ? 'row' : colEvidence > rowEvidence ? 'col' : null;

  const isColumnHeader = new Set<string>();
  const isTableMember = new Set<string>();
  for (const l of labelCandidates) {
    const stacked = rest.filter((o) => o.nodeId !== l.nodeId && stacksBelow(l, o, 0.2));
    const nonLabel = stacked.filter((o) => !looksLikeLabel(o.text));
    if (nonLabel.length >= 2 || stacked.length >= 3) {
      isColumnHeader.add(l.nodeId);
      // Column members: everything stacked under this header, deep window
      // (tables run the page; the tight window is for form pairs).
      for (const o of rest) {
        if (o.nodeId !== l.nodeId && stacksBelow(l, o, 0.45)) isTableMember.add(o.nodeId);
      }
    }
  }

  // 4. Score every (label, value) candidate by geometry.
  const pairs: ScoredPair[] = [];
  for (const l of labelCandidates) {
    // First gather geometrically valid value candidates for this label.
    const valid: Array<{ value: OcrItem; pos: number }> = [];
    for (const v of rest) {
      if (v.nodeId === l.nodeId) {
        continue;
      }
      let pos = positionScore(l, v);
      if (pos === null) {
        continue;
      }
      const isBelowPair = v.boxNorm[1] >= l.boxNorm[3] - 0.01;
      const isTableRow =
        !isBelowPair && isTableMember.has(l.nodeId) && isTableMember.has(v.nodeId);
      if (isColumnHeader.has(l.nodeId) && isBelowPair) {
        pos = Math.min(pos, 0.3); // headers own columns, not values
      }
      if (isTableRow) {
        pos = 1.0; // the legitimate wide-gap row read — full strength
      } else if ((axis === 'row' && isBelowPair) || (axis === 'col' && !isBelowPair)) {
        pos *= 0.6; // off the document's axis
      }
      valid.push({ value: v, pos });
    }

    // Prefer non-label values strongly; only fall back to label-like values
    // when no non-label alternative exists for this label.
    const hasNonLabelValue = valid.some((c) => !looksLikeLabel(c.value.text));

    for (const { value: v, pos } of valid) {
      const vLooksLikeLabel = looksLikeLabel(v.text);
      const labelBias = vLooksLikeLabel
        ? hasNonLabelValue
          ? -0.5
          : 0.15
        : 0.15;

      const distance = getDistance(getBoxCenter(l.boxNorm), getBoxCenter(v.boxNorm));
      const total =
        pos * 0.5 - Math.min(distance, 0.5) * 0.7 + 0.05 * v.confidence + labelBias;

      if (total > 0.2) {
        pairs.push({ label: l, value: v, total });
      }
    }
  }

  // 5. Greedy resolution: highest total first, each label/value used once.
  pairs.sort((a, b) => {
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    const lo = readingOrder(a.label, b.label);
    if (lo !== 0) {
      return lo;
    }
    return readingOrder(a.value, b.value);
  });

  const usedLabels = new Set<string>();
  const usedValues = new Set<string>();
  const geometryFields: GenericField[] = [];

  for (const pair of pairs) {
    if (usedLabels.has(pair.label.nodeId) || usedValues.has(pair.value.nodeId)) {
      continue;
    }
    usedLabels.add(pair.label.nodeId);
    usedValues.add(pair.value.nodeId);

    const label = cleanLabelText(pair.label.text);
    geometryFields.push({
      canonicalLabel: slugifyLabel(label),
      label,
      valueType: inferValueType(pair.value.text),
      value: collapseWhitespace(pair.value.text),
      valueItem: pair.value,
      labelItem: pair.label,
      score: clamp01(pair.total),
    });
  }

  // 6. Combine, de-duplicate by canonical label (keep highest score), order by
  //    label reading order.
  const all = [...inlineFields, ...geometryFields];

  const byCanonical = new Map<string, GenericField>();
  for (const field of all) {
    const existing = byCanonical.get(field.canonicalLabel);
    if (!existing || field.score > existing.score) {
      byCanonical.set(field.canonicalLabel, field);
    }
  }

  return [...byCanonical.values()].sort((a, b) => readingOrder(a.labelItem, b.labelItem));
}
