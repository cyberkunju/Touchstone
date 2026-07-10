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
import { isPlausiblePhone, isValidEmail, parseDate, parseAmount } from '../parsers/scalars';
import { isDefiniteFieldLabel } from './field-extraction';

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
  // P8 gutter law: surfaces are independent documents.
  if (!sameRegion(l, v)) return null;
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

/** P8 gutter law: pairs never span page surfaces. */
function sameRegion(a: OcrItem, b: OcrItem): boolean {
  return a.regionId === undefined || b.regionId === undefined || a.regionId === b.regionId;
}

/* -------------------------------------------------------------------------- */
/*  Admission gate                                                            */
/* -------------------------------------------------------------------------- */

/** Chaos test for one OCR read: mixed/garbled text that no caption→value
 *  grammar should ever pair (stamp fragments, CJK/Cyrillic islands read
 *  through a Latin recognizer, punctuation debris). */
function looksChaotic(item: OcrItem): boolean {
  const text = item.text.trim();
  if (text.length === 0) return true;
  // Non-Latin scripts read on this page (recognizer emits them for stamps).
  if (/[\u3400-\u9FFF\u0400-\u04FF\u0E00-\u0E7F\uAC00-\uD7AF]/.test(text)) return true;
  // Character salad: less than 60% of chars are word-like.
  const wordy = (text.match(/[A-Za-z0-9\s.,:/#&@+'()-]/g) ?? []).length;
  if (wordy / text.length < 0.6) return true;
  // Stamp debris: tiny fragments ("75", "19S", "Jt") carry no form semantics.
  if (text.replace(/[^A-Za-z0-9]/g, '').length <= 3) return true;
  // Low-confidence fragments.
  return item.confidence < 0.55;
}

/**
 * STAMPS-PAGE ADMISSION GATE (live-caught: a visa/stamps spread produced 40
 * garbage caption→value pairs — "MICRATION" = "+ 8 JUN 2019"). A page is
 * admitted to generic caption→value pairing only when it looks like a FORM:
 * either it carries at least one explicit caption anchor (colon-terminated
 * label or a registered lexicon caption) or its reads are predominantly
 * coherent, LEVEL text. Two independent chaos signals refuse admission:
 *
 *  1. TEXT chaos — non-Latin islands, character salad, tiny fragments.
 *  2. TILT SCATTER — stamps rotate in RANDOM directions; printed forms are
 *     level or share one camera tilt. When many lines carry rotated quads
 *     with headings spread across many directions, no caption→value grammar
 *     applies (quad-native perception makes this measurable).
 *
 * Refusing generic extraction can only silence noise, never a confirmable
 * value — honesty over fabricated pairs.
 */
export function pageAdmitsGenericExtraction(
  items: OcrItem[],
  excludeNodeIds?: Set<string>,
): boolean {
  const excluded = excludeNodeIds ?? new Set<string>();
  const pool = items.filter(
    (it) => !excluded.has(it.nodeId) && it.text.trim() !== '' && !it.text.includes('<'),
  );
  if (pool.length === 0) return false;
  const captionAnchors = pool.filter(
    (it) => /:\s*\S*$/.test(it.text.trim()) || isDefiniteFieldLabel(it),
  ).length;

  // Signal 2: tilt scatter. Quantize each rotated line's heading into 15°
  // bins; forms concentrate in one bin (level or uniform camera tilt),
  // stamp spreads scatter. ≥3 distinct headings among ≥4 tilted lines on an
  // anchor-less page = stamps, refuse.
  const headings = new Set<number>();
  let tilted = 0;
  for (const it of pool) {
    if (!it.quadNorm) continue;
    const [tl, tr] = it.quadNorm;
    const angle = (Math.atan2(tr[1] - tl[1], tr[0] - tl[0]) * 180) / Math.PI;
    if (Math.abs(angle) < 2.5) continue;
    tilted += 1;
    headings.add(Math.round(angle / 15));
  }
  const chaotic = pool.filter(looksChaotic).length;
  // A real form announces itself with SEVERAL caption anchors; ONE stray
  // colon among 89 stamp fragments is noise and must not veto two chaos
  // signals (live-caught: anchors=1, tilted=32, chaotic=0.46 → admitted).
  const anchorsDecisive = captionAnchors >= 3 || captionAnchors / pool.length >= 0.08;
  const tiltScattered = tilted >= 4 && headings.size >= 3;
  const admitted = anchorsDecisive || (!tiltScattered && chaotic / pool.length <= 0.4);
  console.log(
    `[DIAG] generic admission: pool=${pool.length} anchors=${captionAnchors} tilted=${tilted} headings=${headings.size} chaotic=${(chaotic / pool.length).toFixed(2)} → ${admitted ? 'ADMIT' : 'REFUSE'}`,
  );
  return admitted;
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

  // Admission gate: stamp/chaos pages never enter caption→value pairing.
  if (!pageAdmitsGenericExtraction(items, excludeNodeIds)) return [];

  // 1. Filter out excluded and empty items. Items containing '<' are MRZ
  //    fragments (real values never contain '<') and are dropped.
  const pool = items.filter(
    (it) => !excluded.has(it.nodeId) && it.text.trim() !== '' && !it.text.includes('<')
  );

  const consumed = new Set<string>();
  const inlineFields: GenericField[] = [];

  // 2a. Self-labeled contact lines (label and value live in the same OCR
  // item, but cards commonly omit the colon: "Email a@b.com", "Phone +1…").
  // The scalar validators are the gate — a prefix alone proves nothing.
  let hasEmail = false;
  let hasPhone = false;
  for (const item of pool) {
    const text = collapseWhitespace(item.text);
    const email = text.match(/^e-?mail\s*:?\s*(\S+@\S+)$/i)?.[1] ?? null;
    if (email && isValidEmail(email)) {
      inlineFields.push({
        canonicalLabel: 'email',
        label: 'Email',
        valueType: 'email',
        value: email,
        valueItem: item,
        labelItem: item,
        score: 0.95,
      });
      consumed.add(item.nodeId);
      hasEmail = true;
      continue;
    }

    const phone = text.match(/^(?:phone|tel(?:ephone)?|mobile)\s*:?\s*(\+?[0-9][0-9().\s-]*[0-9])$/i)?.[1] ?? null;
    if (phone && isPlausiblePhone(phone)) {
      inlineFields.push({
        canonicalLabel: 'phone',
        label: 'Phone',
        valueType: 'phone',
        value: phone,
        valueItem: item,
        labelItem: item,
        score: 0.95,
      });
      consumed.add(item.nodeId);
      hasPhone = true;
    }
  }

  // Contact-cluster name law: when BOTH independent contact channels exist,
  // a topmost uppercase 2–4-word alphabetic line above them is the card's
  // identity heading. This is structural, not a name dictionary. The App's
  // generic-name law review-caps it, so it improves recall without gaining
  // confirmation authority.
  if (hasEmail && hasPhone) {
    const firstContactY = Math.min(
      ...pool.filter((it) => consumed.has(it.nodeId)).map((it) => it.boxNorm[1]),
    );
    const name = pool
      .filter((it) => !consumed.has(it.nodeId) && it.boxNorm[1] < firstContactY)
      .filter((it) => {
        const text = collapseWhitespace(it.text);
        const words = text.split(/\s+/);
        return (
          words.length >= 2 &&
          words.length <= 4 &&
          text.length <= 60 &&
          /^[A-Z][A-Z .'-]*$/.test(text) &&
          /[A-Z].*\s+[A-Z]/.test(text)
        );
      })
      .sort((a, b) => a.boxNorm[1] - b.boxNorm[1] || a.boxNorm[0] - b.boxNorm[0])[0];
    if (name) {
      inlineFields.push({
        canonicalLabel: 'full_name',
        label: 'Full Name',
        valueType: 'name',
        value: collapseWhitespace(name.text),
        valueItem: name,
        labelItem: name,
        score: 0.85,
      });
      consumed.add(name.nodeId);
    }
  }

  // 2b. Inline "Label: value" pairs (label and value live in the same item).
  for (const item of pool) {
    if (consumed.has(item.nodeId)) continue;
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
  // nodeId → the header-columns it belongs to. Disjointness is what makes a
  // TABLE ROW: two cells of the same physical row live in different columns.
  const memberColumns = new Map<string, Set<string>>();
  const headerCandidates: OcrItem[] = [];
  for (const l of labelCandidates) {
    const stacked = rest.filter((o) => o.nodeId !== l.nodeId && stacksBelow(l, o, 0.2));
    const nonLabel = stacked.filter((o) => !looksLikeLabel(o.text));
    if (nonLabel.length >= 2) headerCandidates.push(l);
  }
  // PEER LAW (live-caught: the page title 'RESIDENTIAL LEASE AGREEMENT'
  // qualified as a "header" over the whole form and its below-band became a
  // phantom table — LANDLORD=TENANT then rode the row exemption): a real
  // table has MULTIPLE column headers on ONE row. A header without a
  // y-aligned peer header is a banner or a form caption, never a column.
  for (const h of headerCandidates) {
    const hasPeer = headerCandidates.some(
      (o) => o.nodeId !== h.nodeId && verticalOverlapRatio(h, o) >= 0.5,
    );
    if (!hasPeer) continue;
    isColumnHeader.add(h.nodeId);
    for (const o of rest) {
      if (o.nodeId === h.nodeId || !stacksBelow(h, o, 0.45)) continue;
      let cols = memberColumns.get(o.nodeId);
      if (!cols) memberColumns.set(o.nodeId, (cols = new Set()));
      cols.add(h.nodeId);
    }
  }
  // ROW COMPLETION: an item y-aligned with members of ≥2 DISTINCT peer
  // columns is a cell of the same table row (Hemoglobin beside 13.7 and
  // g/dL) — attributed to its own pseudo-column so disjointness holds.
  for (const o of rest) {
    if (memberColumns.has(o.nodeId)) continue;
    const seenCols = new Set<string>();
    for (const [mid, cols] of memberColumns) {
      if (mid === o.nodeId) continue;
      const m = rest.find((r) => r.nodeId === mid);
      if (m && verticalOverlapRatio(o, m) >= 0.5) for (const c of cols) seenCols.add(c);
      if (seenCols.size >= 2) break;
    }
    if (seenCols.size >= 2) memberColumns.set(o.nodeId, new Set([`row:${o.nodeId}`]));
  }
  const disjointColumns = (a: string, b: string): boolean => {
    const ca = memberColumns.get(a);
    const cb = memberColumns.get(b);
    if (!ca || !cb) return false;
    for (const c of ca) if (cb.has(c)) return false;
    return true;
  };

  // 4. Score every (label, value) candidate by geometry.
  const pairs: ScoredPair[] = [];
  for (const l of labelCandidates) {
    // First gather geometrically valid value candidates for this label.
    const valid: Array<{ value: OcrItem; pos: number }> = [];
    for (const v of rest) {
      if (v.nodeId === l.nodeId || isDefiniteFieldLabel(v)) {
        continue;
      }
      let pos = positionScore(l, v);
      if (pos === null) {
        continue;
      }
      const isBelowPair = v.boxNorm[1] >= l.boxNorm[3] - 0.01;
      // TABLE ROW: same-row cells of two DISJOINT peer columns — the one
      // legitimate wide-gap row read (Hemoglobin → 13.7). Same-column
      // members (or one-column overlap) never qualify.
      const isTableRow = !isBelowPair && disjointColumns(l.nodeId, v.nodeId);
      if (isColumnHeader.has(l.nodeId) && isBelowPair) {
        pos = Math.min(pos, 0.3); // headers own columns, not values
      }
      // INTERPOSITION law (live-caught on leases: ANNA ERIKSSON=1,334.77
      // paired THROUGH the interposed MONTHLY RENT label): "below" means
      // DIRECTLY below — any third line sitting vertically between label
      // and value in the same x-band breaks the adjacency claim.
      if (isBelowPair) {
        const blocked = rest.some(
          (o) =>
            o.nodeId !== l.nodeId &&
            o.nodeId !== v.nodeId &&
            o.boxNorm[1] > l.boxNorm[3] - 0.005 &&
            o.boxNorm[3] < v.boxNorm[1] + 0.005 &&
            horizontalOverlapRatio(l, o) >= 0.5,
        );
        if (blocked) pos = Math.min(pos, 0.3);
      }
      if (isTableRow) {
        pos = 1.0; // the legitimate wide-gap row read — full strength
      } else if ((axis === 'row' && isBelowPair) || (axis === 'col' && !isBelowPair)) {
        pos *= 0.6; // off the document's axis
      }
      valid.push({ value: v, pos });
    }

    // Prefer non-label values strongly; only fall back to label-like values
    // when no non-label alternative exists for this label. ONLY structurally
    // healthy candidates (pos ≥ 0.5 — not interposition-blocked, not
    // header-capped, not axis-decayed to a remnant) may trigger the −0.5
    // demotion of label-like readings (live-caught on leases: a date capped
    // to 0.3 by the interposition law still demoted LANDLORD→ANNA, and the
    // name pairing died with it — a blocked candidate is not an alternative).
    const hasNonLabelValue = valid.some((c) => c.pos >= 0.5 && !looksLikeLabel(c.value.text));

    for (const { value: v, pos } of valid) {
      const vLooksLikeLabel = looksLikeLabel(v.text);
      // DIRECT-STACK OWNERSHIP (live-caught on lab_id01_worst): PATIENT NAME
      // had KENJI NAKAMURA directly beneath it, but a date in a distant
      // column overlapped the label's row and triggered the generic -0.5
      // label-like penalty. A value immediately below with strong horizontal
      // overlap belongs to this label's column; another column cannot demote
      // it merely by having a more typed-looking token.
      const stackedText = collapseWhitespace(v.text);
      const stackedWords = stackedText.split(/\s+/);
      const uppercaseIdentityPhrase =
        stackedWords.length >= 2 &&
        stackedWords.length <= 4 &&
        /^[A-Z][A-Z .'-]*$/.test(stackedText);
      const identityRoleLabel =
        /\b(?:name|holder|patient|tenant|landlord|employee|student|member|respondent|insured)\b/i
          .test(cleanLabelText(l.text));
      const directlyStacked =
        identityRoleLabel &&
        uppercaseIdentityPhrase &&
        stacksBelow(l, v, 0.06) &&
        horizontalOverlapRatio(l, v) >= 0.7;
      const labelBias = vLooksLikeLabel
        ? directlyStacked
          ? 0.15
          : hasNonLabelValue
          ? -0.5
          : 0.15
        : 0.15;

      const distance = v.boxNorm[1] >= l.boxNorm[3] - 0.01
        ? Math.max(0, v.boxNorm[1] - l.boxNorm[3])
        : Math.max(0, v.boxNorm[0] - l.boxNorm[2]);
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
