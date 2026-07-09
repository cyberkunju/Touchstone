/**
 * @file field-extraction.ts
 *
 * Deterministic, type-aware, label-aware field extraction engine.
 *
 * Given a flat list of {@link OcrItem}s and a document type, this module
 * associates document field LABELS (e.g. "Date of Birth") with their VALUES
 * (e.g. "14/05/1990") using geometry (same-row-right / close-below) combined
 * with value-type validation (date / amount / id_number / name / country).
 *
 * The engine is intentionally conservative: it never fabricates values, and
 * for strongly-typed fields (date / amount / id_number) it omits a field
 * entirely rather than attaching a wrong, badly-typed neighbour. This fixes a
 * real bug where a "Date of Birth" label was paired with nearby "Place of
 * Birth" label text instead of the actual date to its right.
 */

import { OcrItem } from './ocr-item';
import { FieldValueType } from '../core/types';
import { parseDate, parseAmount, normalizeId } from '../parsers/scalars';
import { getBoxCenter } from '../core/geometry';
import { bestWindowSimilarity } from './fuzzy';
import { assignOptimal } from '../consensus/hungarian';
import { beamDecode } from '../beam/beam-search';
import { dateGrammar } from '../beam/grammars/date';
import { sexGrammar } from '../beam/grammars/enum';

/* -------------------------------------------------------------------------- */
/*  Public types                                                              */
/* -------------------------------------------------------------------------- */

// Single source of truth for the doc-type union — duplicating it here let
// the two copies drift the moment commerce types landed (caught by tsc).
export type { ExtractionDocType } from './document-classify';
import type { ExtractionDocType } from './document-classify';

export interface FieldSpec {
  /** snake_case canonical label, e.g. 'date_of_birth'. */
  canonicalLabel: string;
  /** Human-friendly label, e.g. 'Date of Birth'. */
  displayLabel: string;
  /** Lowercase label phrases to match (longest-first matching). */
  synonyms: string[];
  /** Expected value type for this field. */
  valueType: FieldValueType;
  /** Whether the field is required for the document type. */
  required: boolean;
  /**
   * Optional value constraint. When set, a candidate value MUST match this
   * pattern (after trimming) or it is rejected outright — the candidate cannot
   * be this field's value. This makes constrained fields (e.g. `sex`,
   * `country_code`, `document_type`) immune to nearby OCR noise.
   */
  valuePattern?: RegExp;
}

/** Options controlling {@link extractFields} behavior. */
export interface ExtractOptions {
  /**
   * Locale hint used to disambiguate numeric, year-last dates (e.g.
   * `14/05/1990`). When set, any emitted `date`-typed field whose raw value
   * parses validly under this locale has its `value` replaced by the ISO form.
   */
  dateLocale?: 'dmy' | 'mdy' | 'ymd';
}

export interface ExtractedField {
  canonicalLabel: string;
  /** displayLabel of the matched spec. */
  label: string;
  valueType: FieldValueType;
  /** Recognized value text, whitespace-cleaned (NEVER fabricated). */
  value: string;
  valueItem: OcrItem;
  labelItem: OcrItem | null;
  required: boolean;
  /** Association confidence in [0,1]. */
  score: number;
}

/* -------------------------------------------------------------------------- */
/*  Registry                                                                  */
/* -------------------------------------------------------------------------- */

export const PASSPORT_FIELDS: FieldSpec[] = [
  {
    canonicalLabel: 'passport_number',
    displayLabel: 'Passport Number',
    synonyms: ['passport number', 'passport no', 'document number', 'document no', 'passeport'],
    valueType: 'id_number',
    required: true,
  },
  {
    canonicalLabel: 'document_type',
    displayLabel: 'Type',
    synonyms: ['document type', 'type'],
    valueType: 'text',
    required: false,
    // Only short type codes like 'P', 'ID', 'PA' — never a garbled header.
    valuePattern: /^[A-Z]{1,2}$/i,
  },
  {
    canonicalLabel: 'country_code',
    displayLabel: 'Country Code',
    // 'country code' ONLY — never bare 'code'.
    synonyms: ['country code'],
    valueType: 'text',
    required: false,
    // ICAO 9303 country codes are EXACTLY alpha-3: accepting 2 letters made
    // a clipped read ("UTO" → "TO" under rotation) unfalsifiable — the
    // truncation IS a valid-looking value (live-caught: 2 silents, deepened
    // TD1 corpus). Exact length or no pairing.
    valuePattern: /^[A-Z]{3}$/i,
  },
  {
    canonicalLabel: 'full_name',
    displayLabel: 'Full Name',
    synonyms: ['name', 'names', 'full name', 'holder'],
    valueType: 'name',
    required: true,
  },
  {
    canonicalLabel: 'surname',
    displayLabel: 'Surname',
    synonyms: ['surname', 'nom', 'last name'],
    valueType: 'name',
    required: false,
  },
  {
    canonicalLabel: 'given_names',
    displayLabel: 'Given Names',
    synonyms: ['given names', 'given name', 'first name', 'prenom', 'prénom'],
    valueType: 'name',
    required: false,
  },
  {
    canonicalLabel: 'nationality',
    displayLabel: 'Nationality',
    synonyms: ['nationality', 'nationalite', 'nationalité'],
    valueType: 'country',
    required: false,
  },
  {
    canonicalLabel: 'date_of_birth',
    displayLabel: 'Date of Birth',
    synonyms: ['date of birth', 'birth date', 'dob', 'date of bith'],
    valueType: 'date',
    required: true,
  },
  {
    canonicalLabel: 'sex',
    displayLabel: 'Sex',
    synonyms: ['sex', 'gender', 'sexe'],
    valueType: 'text',
    required: false,
    valuePattern: /^[MFX]$/i,
  },
  {
    canonicalLabel: 'place_of_birth',
    displayLabel: 'Place of Birth',
    synonyms: ['place of birth', 'birth place', 'lieu de naissance', 'place of bith'],
    valueType: 'text',
    required: false,
  },
  {
    canonicalLabel: 'date_of_expiry',
    displayLabel: 'Date of Expiry',
    synonyms: ['date of expiry', 'date of expiration', 'expiry', 'expiration', 'valid until'],
    valueType: 'date',
    required: false,
  },
  {
    canonicalLabel: 'date_of_issue',
    displayLabel: 'Date of Issue',
    synonyms: ['date of issue', 'date of issuance', 'issue date'],
    valueType: 'date',
    required: false,
  },
  {
    canonicalLabel: 'issuing_authority',
    displayLabel: 'Issuing Authority',
    synonyms: ['issuing authority', 'authority'],
    valueType: 'text',
    required: false,
  },
];

export const INVOICE_FIELDS: FieldSpec[] = [
  {
    canonicalLabel: 'invoice_number',
    displayLabel: 'Invoice Number',
    synonyms: ['invoice number', 'invoice no', 'invoice #', 'invoice'],
    // An invoice number is an IDENTIFIER, not free text (live-caught: typed
    // as 'text', the vendor's company name under the "INVOICE" title paired
    // and CONFIRMED as the number — 5 silent errors in the first docs gate).
    // id_number typing excludes dates and demands digits via the pattern.
    valueType: 'id_number',
    valuePattern: /\d[\s\S]*\d/,
    required: false,
  },
  {
    canonicalLabel: 'vendor',
    displayLabel: 'Vendor',
    synonyms: ['vendor', 'from', 'company', 'seller', 'fabricant', 'bill from'],
    valueType: 'text',
    required: false,
  },
  {
    canonicalLabel: 'bill_to',
    displayLabel: 'Bill To',
    synonyms: ['bill to', 'customer', 'client', 'sold to'],
    valueType: 'text',
    required: false,
  },
  {
    canonicalLabel: 'invoice_date',
    displayLabel: 'Date',
    synonyms: ['invoice date', 'date'],
    valueType: 'date',
    required: false,
  },
  {
    canonicalLabel: 'total',
    displayLabel: 'Total',
    synonyms: ['total due', 'amount due', 'grand total', 'balance due', 'total'],
    valueType: 'amount',
    required: false,
  },
  {
    canonicalLabel: 'subtotal',
    displayLabel: 'Subtotal',
    synonyms: ['subtotal', 'sub total'],
    valueType: 'amount',
    required: false,
  },
  {
    canonicalLabel: 'tax',
    displayLabel: 'Tax',
    synonyms: ['tax', 'vat', 'gst'],
    valueType: 'amount',
    required: false,
  },
];

/** Bank statements — running-balance closure family (Tier 2). */
export const BANK_STATEMENT_FIELDS: FieldSpec[] = [
  {
    canonicalLabel: 'account_number',
    displayLabel: 'Account Number',
    synonyms: ['account number', 'account no', 'acct number'],
    valueType: 'id_number',
    valuePattern: /^\d[\d\s-]{6,}$/,
    required: false,
  },
  {
    canonicalLabel: 'account_holder',
    displayLabel: 'Account Holder',
    synonyms: ['account holder', 'account name', 'customer name'],
    valueType: 'name',
    required: false,
  },
  {
    canonicalLabel: 'opening_balance',
    displayLabel: 'Opening Balance',
    synonyms: ['opening balance', 'previous balance', 'balance forward'],
    valueType: 'amount',
    required: false,
  },
  {
    canonicalLabel: 'closing_balance',
    displayLabel: 'Closing Balance',
    synonyms: ['closing balance', 'ending balance', 'new balance'],
    valueType: 'amount',
    required: false,
  },
  {
    canonicalLabel: 'total_credits',
    displayLabel: 'Total Credits',
    synonyms: ['total credits', 'deposits total', 'total deposits'],
    valueType: 'amount',
    required: false,
  },
  {
    canonicalLabel: 'total_debits',
    displayLabel: 'Total Debits',
    synonyms: ['total debits', 'withdrawals total', 'total withdrawals'],
    valueType: 'amount',
    required: false,
  },
];

/** Payslips — gross − deductions = net closure family (Tier 2). */
export const PAYSLIP_FIELDS: FieldSpec[] = [
  {
    canonicalLabel: 'employee_id',
    displayLabel: 'Employee ID',
    synonyms: ['employee id', 'employee no', 'staff id', 'emp id'],
    valueType: 'id_number',
    required: false,
  },
  {
    canonicalLabel: 'employee_name',
    displayLabel: 'Employee Name',
    synonyms: ['employee name', 'employee', 'staff name'],
    valueType: 'name',
    required: false,
  },
  {
    canonicalLabel: 'gross_pay',
    displayLabel: 'Gross Pay',
    synonyms: ['gross pay', 'gross earnings', 'total earnings', 'gross'],
    valueType: 'amount',
    required: false,
  },
  {
    canonicalLabel: 'total_deductions',
    displayLabel: 'Total Deductions',
    synonyms: ['total deductions', 'deductions total', 'deductions'],
    valueType: 'amount',
    required: false,
  },
  {
    canonicalLabel: 'net_pay',
    displayLabel: 'Net Pay',
    synonyms: ['net pay', 'take home pay', 'net salary', 'net amount'],
    valueType: 'amount',
    required: false,
  },
];

/** Utility bills — line-item closure family (Tier 2). */
export const UTILITY_BILL_FIELDS: FieldSpec[] = [
  {
    canonicalLabel: 'account_number',
    displayLabel: 'Account Number',
    synonyms: ['account number', 'account no', 'customer number'],
    valueType: 'id_number',
    valuePattern: /^\d[\d\s-]{5,}$/,
    required: false,
  },
  {
    canonicalLabel: 'total_due',
    displayLabel: 'Total Due',
    synonyms: ['total due', 'amount due', 'total payable', 'balance due'],
    valueType: 'amount',
    required: false,
  },
  {
    canonicalLabel: 'due_date',
    displayLabel: 'Due Date',
    synonyms: ['due date', 'payment due', 'pay by'],
    valueType: 'date',
    required: false,
  },
  {
    canonicalLabel: 'current_charges',
    displayLabel: 'Current Charges',
    synonyms: ['current charges', 'new charges', 'charges this period'],
    valueType: 'amount',
    required: false,
  },
];

export function getFieldSpecs(docType: ExtractionDocType): FieldSpec[] {
  switch (docType) {
    case 'passport':
    case 'id_card':
      return PASSPORT_FIELDS;
    case 'invoice':
    case 'receipt':
      return INVOICE_FIELDS;
    case 'bank_statement':
      return BANK_STATEMENT_FIELDS;
    case 'payslip':
      return PAYSLIP_FIELDS;
    case 'utility_bill':
      return UTILITY_BILL_FIELDS;
    case 'generic':
    default:
      return [];
  }
}

/* -------------------------------------------------------------------------- */
/*  Label normalization & matching                                            */
/* -------------------------------------------------------------------------- */

/**
 * Normalizes label-ish text: lowercases, replaces runs of non-alphanumeric
 * characters (other than spaces and '/') with a single space, pads slashes
 * with spaces, collapses whitespace and trims.
 *
 * Example: "No./No.Passeport" -> "no / no passeport".
 */
export function normalizeLabelText(s: string): string {
  return s
    .toLowerCase()
    // Replace any run of characters that are not alphanumeric, space, or '/'
    // with a single space.
    .replace(/[^a-z0-9/ ]+/g, ' ')
    // Ensure slashes are treated as standalone, space-separated tokens.
    .replace(/\//g, ' / ')
    // Collapse repeated whitespace.
    .replace(/\s+/g, ' ')
    .trim();
}

/** Escapes a string for safe use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns true when `synonym` appears in `normText` as a whole-word phrase,
 * i.e. bounded by string start/end or non-alphanumeric characters (which
 * includes spaces, '/' and ':').
 */
function synonymMatches(normText: string, synonym: string): boolean {
  const re = new RegExp('(^|[^a-z0-9])' + escapeRegExp(synonym) + '([^a-z0-9]|$)');
  return re.test(normText);
}

/**
 * Determines whether `item`'s text IS a field label for one of `specs`.
 *
 * Matching is tolerant of OCR noise. Exact whole-phrase containment is
 * preferred (and the LONGEST matching synonym wins, i.e. most specific). When
 * no exact match exists, longer synonyms (>= 5 chars) are matched by edit-
 * distance similarity (>= 0.78) against word-windows of the text, so garbled
 * labels like "Date ofBith" -> date_of_birth and "Natinaliy" -> nationality
 * are still recognized. The closest spec overall wins, so "Place of Birth"
 * (exact) is never mistaken for date_of_birth (fuzzy).
 */
export function isLabelItem(item: OcrItem, specs: FieldSpec[]): FieldSpec | null {
  return isLabelItemScored(item, specs)?.spec ?? null;
}

/**
 * Scored variant of {@link isLabelItem}: also returns the match score so
 * callers can rank competing label candidates. Exact whole-phrase matches
 * score > 1 (1 + synonymLength/1000); fuzzy matches score < 1 (their edit
 * similarity). A document TITLE like "PASSPORT" only ever fuzzy-matches a
 * synonym ('passeport' ≈ 0.89) while the true caption "PASSPORT NO" matches
 * exactly — the score gap is what keeps titles from stealing label slots.
 */
export function isLabelItemScored(
  item: OcrItem,
  specs: FieldSpec[]
): { spec: FieldSpec; score: number } | null {
  const normText = normalizeLabelText(item.text);
  if (normText === '') return null;

  const FUZZY_MIN_LEN = 5;
  const FUZZY_THRESHOLD = 0.78;

  let best: FieldSpec | null = null;
  let bestScore = 0;

  for (const spec of specs) {
    for (const synonym of spec.synonyms) {
      let score = 0;
      if (synonymMatches(normText, synonym)) {
        // Exact containment: always beats fuzzy; longer synonym = more specific.
        score = 1 + synonym.length / 1000;
      } else if (synonym.length >= FUZZY_MIN_LEN) {
        const sim = bestWindowSimilarity(normText, synonym);
        if (sim >= FUZZY_THRESHOLD) {
          score = sim; // < 1, so exact matches always win
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = spec;
      }
    }
  }

  return best !== null && bestScore > 0 ? { spec: best, score: bestScore } : null;
}

/**
 * Extracts an inline value from a merged "Label: value" OCR line.
 *
 * Many documents (especially invoices) render a label and its value on one
 * line, e.g. "Invoice Number: INV-99201" or "Date: 2026-06-05". When OCR keeps
 * that as a single item, the value lives inside the label item's own text.
 * This returns the trailing value when the text before the first ':' matches
 * one of `spec`'s synonyms; otherwise null.
 */
export function extractInlineValue(rawText: string, spec: FieldSpec): string | null {
  const sepIdx = rawText.indexOf(':');
  if (sepIdx === -1) return null;
  const before = rawText.slice(0, sepIdx);
  const after = rawText.slice(sepIdx + 1).trim();
  if (after.length === 0) return null;
  const normBefore = normalizeLabelText(before);
  const matches = spec.synonyms.some((syn) => synonymMatches(normBefore, syn));
  return matches ? after : null;
}

/* -------------------------------------------------------------------------- */
/*  Value-type scoring                                                        */
/* -------------------------------------------------------------------------- */

/**
 * True when `text` is ONE structurally well-formed currency token:
 * optional sign/symbol, digits with CORRECT thousands grouping (every comma
 * group exactly 3 digits), at most one decimal point, optional 3-letter code.
 * A malformed token means the OCR read lost or gained characters — the
 * printed value is unprovable from this text and must not score as an amount.
 */
export function isWellFormedAmountToken(text: string): boolean {
  let t = text.trim();
  // Strip currency decorations (symbol/code/sign/parens) from the edges.
  t = t.replace(/^[($€£¥₹+\-\s]+|[)\s]+$/g, '');
  t = t.replace(/^[A-Z]{3}\s+/i, '').replace(/\s+[A-Z]{3}$/i, '');
  if (t.length === 0) return false;
  // No internal whitespace may remain: "6 3,707.56" is two tokens, not one.
  if (/\s/.test(t)) return false;
  // European style with comma decimals ("1.234,56") — normalize view only.
  const euro = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t) || /^\d+,\d{1,2}$/.test(t);
  if (euro) return true;
  // US/plain style: optional exact-3-digit comma groups, one optional decimal.
  return /^\d{1,3}(,\d{3})*(\.\d{1,4})?$/.test(t) || /^\d+(\.\d{1,4})?$/.test(t);
}

/** Returns a 0..1 score for how well `text` fits `valueType`. */
export function valueTypeScore(valueType: FieldValueType, text: string): number {
  const trimmed = text.trim();

  switch (valueType) {
    case 'date':
      return parseDate(trimmed).valid ? 1 : 0;

    case 'amount':
    case 'currency': {
      // Type exclusion (live-caught): under blur, a statement-period line
      // merges into the balance below it — "01/02/2026 - 02/03/2026 5,887.15"
      // parses as a big number and was CONFIRMED as opening_balance. Text
      // containing a calendar date is a mixed line, never a bare amount.
      if (/\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}/.test(trimmed)) return 0;
      // STRUCTURAL WELL-FORMEDNESS (live-caught, 10 silents): an amount must
      // be ONE well-formed currency token. Refused shapes:
      //  - "6 3,707.56"  — a neighboring digit merged in (internal space
      //    between digit groups that isn't thousands punctuation);
      //  - "1,05.11"     — comma group of ≠3 digits: a dropped digit turned
      //    the read into structurally-invalid grouping — the printed value
      //    was something else, proof is gone;
      //  - "4.511.28"    — multiple decimal points (locale mixups resolve in
      //    normalizeFieldValue, but two dots + two decimals is corruption).
      if (!isWellFormedAmountToken(trimmed)) return 0;
      return parseAmount(trimmed).valid ? 1 : 0;
    }

    case 'id_number': {
      // Type exclusion: a calendar-valid date is a DATE, never a document
      // number — normalizeId strips separators, so "24/03/1982" would
      // otherwise score as a perfect 8-digit id. On degraded scans where the
      // real number went unread, the nearest date then gets CONFIRMED into
      // the id field: a silent error (caught live by the corpus gate).
      if (parseDate(trimmed).valid) return 0;
      const n = normalizeId(trimmed).normalized;
      if (n.length >= 4 && /[0-9]/.test(n) && /^[A-Z0-9]+$/.test(n)) {
        return 1;
      }
      return n.length >= 3 ? 0.4 : 0;
    }

    case 'name': {
      const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
      const digits = (trimmed.match(/[0-9]/g) ?? []).length;
      const mostlyDigits = trimmed.length > 0 && digits * 2 > trimmed.length;
      if (letters > 0 && trimmed.length >= 2 && !mostlyDigits) {
        return 1;
      }
      return 0.2;
    }

    case 'country':
      return /[A-Za-z]/.test(trimmed) ? 0.8 : 0;

    default:
      return trimmed.length > 0 ? 0.6 : 0;
  }
}

/* -------------------------------------------------------------------------- */
/*  Geometry helpers                                                          */
/* -------------------------------------------------------------------------- */

type Relation = 'same_row_right' | 'below' | 'none';

interface RelationResult {
  relation: Relation;
  positionScore: number;
  distance: number;
}

function euclidean(a: readonly [number, number], b: readonly [number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

function rangeOverlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

/** Computes the geometric relation of value box `c` to label box `l`. */
function relate(l: OcrItem, c: OcrItem): RelationResult {
  const [lx1, ly1, lx2, ly2] = l.boxNorm;
  const [cx1, cy1, cx2, cy2] = c.boxNorm;

  const heightL = ly2 - ly1;
  const heightC = cy2 - cy1;
  const widthL = lx2 - lx1;
  const widthC = cx2 - cx1;

  const overlapY = rangeOverlap(ly1, ly2, cy1, cy2);
  const verticalOverlapRatio = Math.min(heightL, heightC) > 0 ? overlapY / Math.min(heightL, heightC) : 0;

  const distance = euclidean(getBoxCenter(l.boxNorm) as [number, number], getBoxCenter(c.boxNorm) as [number, number]);

  // SAME-ROW-RIGHT: value starts at/after the label's right edge and shares a row.
  if (cx1 >= lx2 - 0.01 && verticalOverlapRatio >= 0.3) {
    return { relation: 'same_row_right', positionScore: 1.0, distance };
  }

  // BELOW: value sits just under the label with horizontal overlap. The gap is
  // adaptive to the label's height so tightly-stacked forms (row pitch ~0.01)
  // pair a label only with its IMMEDIATE next row, while looser layouts still
  // pair header→value. Prevents a label reaching many rows down a column.
  const overlapX = rangeOverlap(lx1, lx2, cx1, cx2);
  const horizontalOverlapRatio = Math.min(widthL, widthC) > 0 ? overlapX / Math.min(widthL, widthC) : 0;
  const maxBelowGap = Math.max(0.03, 2.5 * heightL);
  if (cy1 >= ly2 - 0.01 && horizontalOverlapRatio >= 0.2 && cy1 - ly2 < maxBelowGap) {
    return { relation: 'below', positionScore: 0.6, distance };
  }

  return { relation: 'none', positionScore: 0, distance };
}

/* -------------------------------------------------------------------------- */
/*  Extraction                                                                */
/* -------------------------------------------------------------------------- */

function cleanWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Typed lattice re-decode (I3): when a candidate's greedy text fails a
 * field's constraint but its CTC lattice contains a constraint-satisfying
 * path, decode THAT instead of rejecting the pairing. This is what turns the
 * observed `sex = "c/call"` class of garbage into correct values — or into
 * honest omissions when the lattice holds nothing valid.
 *
 * Scope (bounded by design): `sex` (enum grammar) and `date` fields — the two
 * empirically failing classes. Wider grammar coverage lands with the full
 * solver in P5.
 *
 * @returns Re-decoded text, or null when no valid path exists / not in scope.
 */
export function grammarRedecode(
  spec: FieldSpec,
  candidate: OcrItem,
  dateLocale?: 'dmy' | 'mdy' | 'ymd'
): string | null {
  if (!candidate.lattice) return null;
  if (spec.canonicalLabel === 'sex') {
    const res = beamDecode(candidate.lattice, sexGrammar());
    return res ? res.text : null;
  }
  if (spec.valueType === 'date') {
    const res = beamDecode(candidate.lattice, dateGrammar(dateLocale));
    return res ? res.text : null;
  }
  return null;
}

interface ScoredPair {
  spec: FieldSpec;
  labelItem: OcrItem;
  valueItem: OcrItem;
  total: number;
}

/**
 * Associates labels with values for a document type.
 *
 * See module docs and the algorithm in the design for details. Returns the
 * emitted fields in label reading order (top-to-bottom, then left-to-right).
 */
export function extractFields(
  items: OcrItem[],
  docType: ExtractionDocType,
  options?: ExtractOptions
): ExtractedField[] {
  const specs = getFieldSpecs(docType);
  if (specs.length === 0) return [];

  // Step 2: identify label items and pick the best representative per spec.
  // MATCH QUALITY DOMINATES the choice (live-caught bug: the page title
  // "PASSPORT" fuzzy-matches 'passeport' at 0.89 and its SHORTER text used to
  // beat the exact caption "PASSPORT NO" — the title then pairs with nothing
  // and the field silently vanishes). Exact synonym containment (score > 1)
  // must always outrank a fuzzy title; only ties fall back to shorter text.
  const labelByCanonical = new Map<string, OcrItem>();
  const labelScoreByCanonical = new Map<string, number>();
  const labelItemNodeIds = new Set<string>();

  for (const item of items) {
    const scored = isLabelItemScored(item, specs);
    if (!scored) continue;
    const spec = scored.spec;
    labelItemNodeIds.add(item.nodeId);

    const existing = labelByCanonical.get(spec.canonicalLabel);
    if (!existing) {
      labelByCanonical.set(spec.canonicalLabel, item);
      labelScoreByCanonical.set(spec.canonicalLabel, scored.score);
      continue;
    }

    // Rank: match score DESC, then least extra text, then smaller area.
    const score = (it: OcrItem): number => normalizeLabelText(it.text).length;
    const area = (it: OcrItem): number => {
      const [x1, y1, x2, y2] = it.boxNorm;
      return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    };
    const existingMatch = labelScoreByCanonical.get(spec.canonicalLabel) ?? 0;
    const existingScore = score(existing);
    const candidateScore = score(item);
    if (
      scored.score > existingMatch ||
      (scored.score === existingMatch &&
        (candidateScore < existingScore ||
          (candidateScore === existingScore && area(item) < area(existing))))
    ) {
      labelByCanonical.set(spec.canonicalLabel, item);
      labelScoreByCanonical.set(spec.canonicalLabel, scored.score);
    }
  }

  // Step 3: value candidates are non-label items with non-empty text. Items
  // containing '<' are MRZ fragments (values never contain '<') and excluded.
  const valueCandidates = items.filter(
    (it) => !labelItemNodeIds.has(it.nodeId) && it.text.trim().length > 0 && !it.text.includes('<')
  );

  // Step 4: score every (spec, candidate) pair that has a usable relation.
  const pairs: ScoredPair[] = [];
  const strongTypes = new Set<FieldValueType>(['date', 'amount', 'currency', 'id_number']);

  // Step 4a: inline "Label: value" lines. Scan ALL label items (not just the
  // chosen representative) so a merged line like "Invoice Number: INV-99201"
  // contributes its value even when a shorter bare label also exists.
  for (const item of items) {
    const spec = isLabelItem(item, specs);
    if (!spec) continue;
    const inline = extractInlineValue(item.text, spec);
    if (!inline) continue;
    // Value constraint: a constrained field rejects non-matching values.
    if (spec.valuePattern && !spec.valuePattern.test(inline.trim())) continue;
    const typeScore = valueTypeScore(spec.valueType, inline);
    if (strongTypes.has(spec.valueType) && typeScore < 0.5) continue;
    const total = 0.4 + typeScore * 0.6 + 0.2 * item.confidence + 0.1;
    if (total > 0.25) {
      pairs.push({ spec, labelItem: item, valueItem: { ...item, text: inline }, total });
    }
  }

  for (const spec of specs) {
    const labelItem = labelByCanonical.get(spec.canonicalLabel);
    if (!labelItem) continue;

    for (const candidate of valueCandidates) {
      const { relation, positionScore, distance } = relate(labelItem, candidate);
      if (relation === 'none') continue;

      // Typed lattice re-decode (I3): when the greedy text violates the
      // field's constraints, the lattice may still contain a valid reading —
      // use it. When even the lattice holds nothing valid, the pairing dies
      // honestly (no fabrication; omission over garbage).
      let effective = candidate;
      if (spec.valuePattern && !spec.valuePattern.test(candidate.text.trim())) {
        const redecoded = grammarRedecode(spec, candidate, options?.dateLocale);
        if (redecoded === null || !spec.valuePattern.test(redecoded.trim())) continue;
        effective = { ...candidate, text: redecoded };
      }

      let typeScore = valueTypeScore(spec.valueType, effective.text);

      // Strongly-typed fields must have a well-typed value or be omitted —
      // but give the lattice one chance to produce a well-typed reading.
      if (strongTypes.has(spec.valueType) && typeScore < 0.5) {
        const redecoded =
          effective === candidate ? grammarRedecode(spec, candidate, options?.dateLocale) : null;
        if (redecoded === null) continue;
        const rescuedScore = valueTypeScore(spec.valueType, redecoded);
        if (rescuedScore < 0.5) continue;
        effective = { ...candidate, text: redecoded };
        typeScore = rescuedScore;
      }

      // PROXIMITY-DOMINANT scoring: each value should attach to its NEAREST
      // label, so a label never steals a neighbouring field's value in a
      // stacked layout. Type is only a tiebreak (after a strong-type filter).
      const proximity = 1 - Math.min(distance / 0.3, 1);
      const total =
        positionScore * 0.25 + proximity * 0.5 + typeScore * 0.2 + candidate.confidence * 0.05;

      if (total > 0.3) {
        pairs.push({ spec, labelItem, valueItem: effective, total });
      }
    }
  }

  // Step 5: GLOBALLY OPTIMAL resolution (I1-lite). Greedy highest-first has a
  // classic pathology: one label steals its neighbour's value on a marginal
  // score edge, cascading a second field into garbage. The Hungarian solve
  // maximizes total pairing quality instead — the whole-document best answer.
  const specIndex = new Map<string, number>();
  const valueIndex = new Map<string, number>();
  const bestPairAt = new Map<string, ScoredPair>();
  for (const pair of pairs) {
    if (!specIndex.has(pair.spec.canonicalLabel)) specIndex.set(pair.spec.canonicalLabel, specIndex.size);
    if (!valueIndex.has(pair.valueItem.nodeId)) valueIndex.set(pair.valueItem.nodeId, valueIndex.size);
    const key = `${specIndex.get(pair.spec.canonicalLabel)}|${valueIndex.get(pair.valueItem.nodeId)}`;
    const existing = bestPairAt.get(key);
    if (!existing || pair.total > existing.total) bestPairAt.set(key, pair);
  }
  const profit = new Map<number, Map<number, number>>();
  for (const [key, pair] of bestPairAt) {
    const [r, c] = key.split('|').map(Number);
    if (!profit.has(r)) profit.set(r, new Map());
    profit.get(r)!.set(c, pair.total);
  }

  const emitted: ExtractedField[] = [];
  for (const [r, c] of assignOptimal(specIndex.size, valueIndex.size, profit)) {
    const pair = bestPairAt.get(`${r}|${c}`)!;

    const rawValue = cleanWhitespace(pair.valueItem.text);

    // Date-locale disambiguation: when a locale hint is provided, normalize a
    // valid date value to its ISO form. If the parse is invalid, keep raw.
    let value = rawValue;
    if (options?.dateLocale && pair.spec.valueType === 'date') {
      const parsed = parseDate(rawValue, options.dateLocale);
      if (parsed.valid && parsed.iso) {
        value = parsed.iso;
      }
    }

    emitted.push({
      canonicalLabel: pair.spec.canonicalLabel,
      label: pair.spec.displayLabel,
      valueType: pair.spec.valueType,
      value,
      valueItem: pair.valueItem,
      labelItem: pair.labelItem,
      required: pair.spec.required,
      score: clamp01(pair.total),
    });
  }

  // Step 7: order by label reading order (top-to-bottom, then left-to-right).
  emitted.sort((a, b) => {
    const la = a.labelItem;
    const lb = b.labelItem;
    if (!la || !lb) return 0;
    if (la.boxNorm[1] !== lb.boxNorm[1]) return la.boxNorm[1] - lb.boxNorm[1];
    return la.boxNorm[0] - lb.boxNorm[0];
  });

  return emitted;
}
