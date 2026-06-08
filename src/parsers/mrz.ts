/**
 * ICAO 9303 Machine-Readable Zone (MRZ) parser.
 *
 * This module is a deterministic, dependency-free parser for the three
 * standard Machine-Readable Travel Document (MRTD) layouts defined by
 * ICAO Doc 9303:
 *
 *  - TD1: 3 lines x 30 characters (ID cards).
 *  - TD2: 2 lines x 36 characters (older passports / ID booklets).
 *  - TD3: 2 lines x 44 characters (modern passports).
 *
 * Design goals:
 *  - Correctness first: every applicable check digit is computed and
 *    compared. The parser never silently accepts data that fails a
 *    critical check digit; such input is reported as `'invalid'`.
 *  - Transparency: OCR-style normalization is conservative and every
 *    single character substitution is recorded in `normalizationChanges`.
 *  - Pure & deterministic: no I/O, no external dependencies. The only
 *    non-determinism is calendar century inference, which depends on the
 *    current year; date parsing is otherwise stable.
 *
 * All character offsets in this file are 0-based. `line` and `position`
 * values reported in {@link MrzNormalizationChange} are also 0-based.
 */

/** Recognised MRZ document layout, or `'unknown'` when detection fails. */
export type MrzFormat = 'TD1' | 'TD2' | 'TD3' | 'unknown';

/**
 * Result of a single check-digit verification.
 *
 * `expected` is the digit character read from the MRZ, `computed` is the
 * digit derived from {@link computeCheckDigit}. `passed` is their equality.
 */
export interface MrzCheckDigitResult {
  /** Logical field the check digit guards (e.g. `'documentNumber'`). */
  field: string;
  /** The check-digit character as read from the (normalized) MRZ. */
  expected: string;
  /** The check digit computed from the field's data, as a single char. */
  computed: string;
  /** Whether `expected` and `computed` are equal. */
  passed: boolean;
}

/**
 * A single character substitution performed during normalization.
 * `line` and `position` are 0-based indices into the normalized lines.
 */
export interface MrzNormalizationChange {
  /** 0-based index of the line that was modified. */
  line: number;
  /** 0-based character offset within the line that was modified. */
  position: number;
  /** The original character (post-uppercasing) at that position. */
  from: string;
  /** The substituted character written into the normalized line. */
  to: string;
  /** Human-readable explanation of why the substitution was made. */
  reason: string;
}

/**
 * Parsed, human-meaningful MRZ fields. Every field is optional because a
 * field may be absent, empty (filler only), or unparseable. Dates that
 * cannot be interpreted as a real calendar date are left `undefined`.
 */
export interface MrzFields {
  /** Document type code (fillers stripped), e.g. `'P'` or `'ID'`. */
  documentType?: string;
  /** Issuing state / organization (3-letter code, fillers stripped). */
  issuingCountry?: string;
  /** Document number (fillers stripped). */
  documentNumber?: string;
  /** Holder nationality (3-letter code, fillers stripped). */
  nationality?: string;
  /** Date of birth as ISO `YYYY-MM-DD`, or `undefined` if unparseable. */
  dateOfBirth?: string;
  /** Holder sex, restricted to ICAO values, or `undefined`. */
  sex?: 'M' | 'F' | 'X' | undefined;
  /** Document expiry date as ISO `YYYY-MM-DD`, or `undefined`. */
  expiryDate?: string;
  /** Surname (primary identifier), spaces normalized. */
  surname?: string;
  /** Given names (secondary identifier), spaces normalized. */
  givenNames?: string;
  /** Optional/personal-number data (fillers stripped). */
  optionalData?: string;
}

/** Complete result of parsing an MRZ via {@link parseMrz}. */
export interface MrzParseResult {
  /** Detected layout. */
  format: MrzFormat;
  /** Input lines after splitting/trimming, before normalization. */
  rawLines: string[];
  /** Lines after uppercasing, length-normalization, and OCR cleanup. */
  normalizedLines: string[];
  /** Every character substitution applied during normalization. */
  normalizationChanges: MrzNormalizationChange[];
  /** Parsed, human-meaningful fields (best effort). */
  fields: MrzFields;
  /** All applicable check-digit verifications. */
  checkDigits: MrzCheckDigitResult[];
  /**
   * Overall status:
   *  - `'valid'`: every applicable check digit passes.
   *  - `'invalid'`: a critical check digit (documentNumber, dateOfBirth,
   *    expiryDate, or composite) fails.
   *  - `'partial'`: format is unknown / lines too short, or only a
   *    non-critical check digit (e.g. optional data) fails.
   */
  status: 'valid' | 'partial' | 'invalid';
}

/**
 * Map an MRZ character to its ICAO numeric value used in check-digit math.
 *
 *  - `'0'`-`'9'` -> `0`..`9`
 *  - `'A'`-`'Z'` -> `10`..`35`
 *  - `'<'` (filler) -> `0`
 *  - any other character -> `0`
 *
 * @param ch A single-character string. Only the first character is read.
 * @returns The numeric value (0..35).
 */
export function mrzCharValue(ch: string): number {
  if (ch.length === 0) {
    return 0;
  }
  const code = ch.charCodeAt(0);
  // '0'..'9'
  if (code >= 48 && code <= 57) {
    return code - 48;
  }
  // 'A'..'Z'
  if (code >= 65 && code <= 90) {
    return code - 65 + 10;
  }
  // '<' filler and everything else.
  return 0;
}

/**
 * Compute the ICAO 9303 check digit for a string of MRZ characters.
 *
 * The algorithm multiplies each character's {@link mrzCharValue} by a
 * weight that cycles `[7, 3, 1]` starting at index 0, sums the products,
 * and returns the sum modulo 10.
 *
 * @param input The MRZ substring to compute a check digit for.
 * @returns A single digit in the range 0..9.
 */
export function computeCheckDigit(input: string): number {
  const weights = [7, 3, 1] as const;
  let sum = 0;
  for (let i = 0; i < input.length; i += 1) {
    sum += mrzCharValue(input[i]) * weights[i % 3];
  }
  return sum % 10;
}

/** Canonical line length (in characters) for each known format. */
const CANONICAL_LENGTH: Readonly<Record<Exclude<MrzFormat, 'unknown'>, number>> = {
  TD1: 30,
  TD2: 36,
  TD3: 44,
};

/** Canonical line count for each known format. */
const CANONICAL_LINES: Readonly<Record<Exclude<MrzFormat, 'unknown'>, number>> = {
  TD1: 3,
  TD2: 2,
  TD3: 2,
};

/** True when `value` is within `tol` of `target` (OCR length tolerance). */
function withinTolerance(value: number, target: number, tol = 3): boolean {
  return Math.abs(value - target) <= tol;
}

/**
 * Detect the MRZ layout from the shape (line count and length) of the
 * provided lines. Length is matched with a tolerance (default +/-3) to absorb
 * common OCR truncation/padding/filler errors on real-world photos. When a
 * length is ambiguous, the nearest canonical length wins.
 *
 * @param lines The candidate MRZ lines (already split; case-insensitive).
 * @returns The detected {@link MrzFormat}, or `'unknown'`.
 */
export function detectMrzFormat(lines: string[]): MrzFormat {
  const nonEmpty = lines.filter((line) => line.length > 0);
  const count = nonEmpty.length;
  if (count === 0) {
    return 'unknown';
  }
  const maxLen = Math.max(...nonEmpty.map((line) => line.length));

  if (count === CANONICAL_LINES.TD1 && withinTolerance(maxLen, CANONICAL_LENGTH.TD1)) {
    return 'TD1';
  }
  if (count === 2) {
    // Choose the nearest canonical 2-line length (TD3=44, TD2=36) within tolerance.
    const dTd3 = Math.abs(maxLen - CANONICAL_LENGTH.TD3);
    const dTd2 = Math.abs(maxLen - CANONICAL_LENGTH.TD2);
    if (dTd3 <= 3 && dTd3 <= dTd2) {
      return 'TD3';
    }
    if (dTd2 <= 3) {
      return 'TD2';
    }
  }
  return 'unknown';
}

/**
 * Position classification used to drive OCR normalization.
 *  - `'n'`: numeric-only (dates, check digits).
 *  - `'a'`: alpha-only (country codes, names, sex).
 *  - `'m'`: alphanumeric (document number, optional data, fillers).
 */
type PositionType = 'n' | 'a' | 'm';

/** Substitutions applied in numeric-only positions (letter -> digit). */
const NUMERIC_MAP: Readonly<Record<string, string>> = {
  O: '0',
  I: '1',
  B: '8',
  S: '5',
  Z: '2',
  Q: '0',
  D: '0',
};

/** Substitutions applied in alpha-only positions (digit -> letter). */
const ALPHA_MAP: Readonly<Record<string, string>> = {
  '0': 'O',
  '1': 'I',
  '8': 'B',
  '5': 'S',
  '2': 'Z',
};

/** Fill `arr[start..end]` (inclusive) with `type`. */
function fillRange(arr: PositionType[], start: number, end: number, type: PositionType): void {
  for (let i = start; i <= end && i < arr.length; i += 1) {
    arr[i] = type;
  }
}

/**
 * Build the per-line, per-position type maps for a known format. The
 * returned array has one entry per line; each entry is an array of
 * {@link PositionType} of canonical length.
 */
function buildPositionTypes(format: Exclude<MrzFormat, 'unknown'>): PositionType[][] {
  if (format === 'TD3') {
    const line1: PositionType[] = new Array<PositionType>(44).fill('m');
    line1[0] = 'a'; // document type
    fillRange(line1, 2, 4, 'a'); // issuing country
    fillRange(line1, 5, 43, 'a'); // name

    const line2: PositionType[] = new Array<PositionType>(44).fill('m');
    line2[9] = 'n'; // document number check
    fillRange(line2, 10, 12, 'a'); // nationality
    fillRange(line2, 13, 18, 'n'); // date of birth
    line2[19] = 'n'; // dob check
    line2[20] = 'a'; // sex
    fillRange(line2, 21, 26, 'n'); // expiry
    line2[27] = 'n'; // expiry check
    line2[42] = 'n'; // optional data check
    line2[43] = 'n'; // composite check
    return [line1, line2];
  }

  if (format === 'TD2') {
    const line1: PositionType[] = new Array<PositionType>(36).fill('m');
    line1[0] = 'a';
    fillRange(line1, 2, 4, 'a');
    fillRange(line1, 5, 35, 'a');

    const line2: PositionType[] = new Array<PositionType>(36).fill('m');
    line2[9] = 'n';
    fillRange(line2, 10, 12, 'a');
    fillRange(line2, 13, 18, 'n');
    line2[19] = 'n';
    line2[20] = 'a';
    fillRange(line2, 21, 26, 'n');
    line2[27] = 'n';
    line2[35] = 'n'; // composite check
    return [line1, line2];
  }

  // TD1
  const line1: PositionType[] = new Array<PositionType>(30).fill('m');
  fillRange(line1, 0, 1, 'a'); // document type
  fillRange(line1, 2, 4, 'a'); // issuing country
  // [5..13] document number (alphanumeric), [14] doc number check (numeric)
  line1[14] = 'n';
  // [15..29] optional data 1 (alphanumeric)

  const line2: PositionType[] = new Array<PositionType>(30).fill('m');
  fillRange(line2, 0, 5, 'n'); // date of birth
  line2[6] = 'n'; // dob check
  line2[7] = 'a'; // sex
  fillRange(line2, 8, 13, 'n'); // expiry
  line2[14] = 'n'; // expiry check
  fillRange(line2, 15, 17, 'a'); // nationality
  // [18..28] optional data 2 (alphanumeric)
  line2[29] = 'n'; // composite check

  const line3: PositionType[] = new Array<PositionType>(30).fill('a'); // name
  return [line1, line2, line3];
}

/** Result of normalizing a single character. */
interface CharNormalization {
  to: string;
  changed: boolean;
  reason: string;
}

/**
 * Normalize a single character according to its position type. The input
 * character is assumed to already be uppercased.
 */
function normalizeChar(ch: string, type: PositionType): CharNormalization {
  if (type === 'n') {
    const mapped = NUMERIC_MAP[ch];
    if (mapped !== undefined) {
      return { to: mapped, changed: true, reason: 'ocr-letter-to-digit' };
    }
    if (ch >= '0' && ch <= '9') {
      return { to: ch, changed: false, reason: '' };
    }
    if (ch === '<') {
      return { to: ch, changed: false, reason: '' };
    }
    return { to: '<', changed: true, reason: 'illegal-in-numeric' };
  }

  if (type === 'a') {
    const mapped = ALPHA_MAP[ch];
    if (mapped !== undefined) {
      return { to: mapped, changed: true, reason: 'ocr-digit-to-letter' };
    }
    if (ch >= 'A' && ch <= 'Z') {
      return { to: ch, changed: false, reason: '' };
    }
    if (ch === '<') {
      return { to: ch, changed: false, reason: '' };
    }
    return { to: '<', changed: true, reason: 'illegal-in-alpha' };
  }

  // type === 'm' (alphanumeric): no letter/digit conversion.
  if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '<') {
    return { to: ch, changed: false, reason: '' };
  }
  return { to: '<', changed: true, reason: 'illegal-in-alphanumeric' };
}

/**
 * Pad (with `'<'`) or truncate a line to the given canonical length.
 */
function fitToLength(line: string, length: number): string {
  if (line.length === length) {
    return line;
  }
  if (line.length > length) {
    return line.slice(0, length);
  }
  return line + '<'.repeat(length - line.length);
}

/**
 * Normalize one line against its position-type map, recording every
 * substitution into `changes`.
 *
 * @param line The uppercased, length-fitted line.
 * @param types The position-type map for the line.
 * @param lineIndex 0-based index used in recorded changes.
 * @param changes Mutable array that receives one entry per substitution.
 * @returns The normalized line.
 */
function normalizeLine(
  line: string,
  types: PositionType[],
  lineIndex: number,
  changes: MrzNormalizationChange[],
): string {
  let out = '';
  for (let i = 0; i < line.length; i += 1) {
    const type = types[i] ?? 'm';
    const original = line[i];
    const result = normalizeChar(original, type);
    if (result.changed) {
      changes.push({
        line: lineIndex,
        position: i,
        from: original,
        to: result.to,
        reason: result.reason,
      });
    }
    out += result.to;
  }
  return out;
}

/** Remove filler characters and surrounding whitespace from a field. */
function stripFillers(field: string): string {
  return field.replace(/</g, '').trim();
}

/** Collapse fillers/whitespace in a name component into single spaces. */
function cleanNameComponent(component: string): string {
  return component
    .replace(/</g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parsed name parts. */
interface ParsedName {
  surname?: string;
  givenNames?: string;
}

/**
 * Parse an MRZ name field into surname and given names. The two are
 * separated by `'<<'`; remaining single `'<'` characters act as spaces.
 */
function parseName(nameField: string): ParsedName {
  const sep = nameField.indexOf('<<');
  const surnameRaw = sep >= 0 ? nameField.slice(0, sep) : nameField;
  const givenRaw = sep >= 0 ? nameField.slice(sep + 2) : '';
  const surname = cleanNameComponent(surnameRaw);
  const givenNames = cleanNameComponent(givenRaw);
  const parsed: ParsedName = {};
  if (surname.length > 0) {
    parsed.surname = surname;
  }
  if (givenNames.length > 0) {
    parsed.givenNames = givenNames;
  }
  return parsed;
}

/** Interpret an MRZ sex character; anything else yields `undefined`. */
function parseSex(ch: string): 'M' | 'F' | 'X' | undefined {
  if (ch === 'M' || ch === 'F' || ch === 'X') {
    return ch;
  }
  return undefined;
}

/**
 * Parse a 6-digit `YYMMDD` MRZ date into an ISO `YYYY-MM-DD` string.
 *
 * Century inference:
 *  - For dates of birth (`isExpiry === false`) the year must not be in the
 *    future: `2000 + yy` is used unless that exceeds the current year, in
 *    which case `1900 + yy` is used.
 *  - For expiry dates (`isExpiry === true`) future years are allowed, so
 *    `2000 + yy` is always used.
 *
 * The result is validated as a real calendar date (correct month length,
 * leap years). Invalid input returns `undefined` and never throws.
 *
 * @param value A candidate `YYMMDD` string.
 * @param isExpiry Whether the field is an expiry date.
 * @returns ISO date string, or `undefined` when unparseable/invalid.
 */
function parseMrzDate(value: string, isExpiry: boolean): string | undefined {
  if (value.length !== 6 || !/^[0-9]{6}$/.test(value)) {
    return undefined;
  }
  const yy = Number.parseInt(value.slice(0, 2), 10);
  const mm = Number.parseInt(value.slice(2, 4), 10);
  const dd = Number.parseInt(value.slice(4, 6), 10);

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    return undefined;
  }

  const currentYear = new Date().getFullYear();
  let fullYear = 2000 + yy;
  if (!isExpiry && fullYear > currentYear) {
    fullYear = 1900 + yy;
  }

  // Validate via UTC round-trip to reject impossible days (e.g. 02-30).
  const timestamp = Date.UTC(fullYear, mm - 1, dd);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== fullYear ||
    date.getUTCMonth() !== mm - 1 ||
    date.getUTCDate() !== dd
  ) {
    return undefined;
  }

  const yyyy = String(fullYear).padStart(4, '0');
  const month = String(mm).padStart(2, '0');
  const day = String(dd).padStart(2, '0');
  return `${yyyy}-${month}-${day}`;
}

/** Assign `value` to `target[key]` only when it is a non-empty string. */
function assignIfPresent(target: MrzFields, key: keyof MrzFields, value: string): void {
  if (value.length > 0) {
    // Each string field of MrzFields accepts a string; sex is handled
    // separately because of its restricted union type.
    (target[key] as string) = value;
  }
}

/** Build a single check-digit result by comparing read vs computed. */
function makeCheckDigit(field: string, data: string, expected: string): MrzCheckDigitResult {
  const computed = String(computeCheckDigit(data));
  return {
    field,
    expected,
    computed,
    passed: expected === computed,
  };
}

/** Fields used to decide `'invalid'` status when their check digit fails. */
const CRITICAL_FIELDS: ReadonlySet<string> = new Set([
  'documentNumber',
  'dateOfBirth',
  'expiryDate',
  'composite',
]);

/**
 * Derive the overall status from the set of check-digit results.
 *
 * @param checks All applicable check-digit results.
 * @returns `'valid'` when all pass, `'invalid'` when a critical check
 *          fails, otherwise `'partial'`.
 */
function deriveStatus(checks: MrzCheckDigitResult[]): 'valid' | 'partial' | 'invalid' {
  const criticalFailed = checks.some((c) => CRITICAL_FIELDS.has(c.field) && !c.passed);
  if (criticalFailed) {
    return 'invalid';
  }
  const allPassed = checks.every((c) => c.passed);
  return allPassed ? 'valid' : 'partial';
}

/** Extract fields and check digits for a TD3 document. */
function parseTd3(lines: string[]): { fields: MrzFields; checks: MrzCheckDigitResult[] } {
  const [l1, l2] = lines;
  const fields: MrzFields = {};

  assignIfPresent(fields, 'documentType', stripFillers(l1.slice(0, 2)));
  assignIfPresent(fields, 'issuingCountry', stripFillers(l1.slice(2, 5)));
  assignIfPresent(fields, 'documentNumber', stripFillers(l2.slice(0, 9)));
  assignIfPresent(fields, 'nationality', stripFillers(l2.slice(10, 13)));
  assignIfPresent(fields, 'optionalData', stripFillers(l2.slice(28, 42)));

  const dob = parseMrzDate(l2.slice(13, 19), false);
  if (dob !== undefined) {
    fields.dateOfBirth = dob;
  }
  const expiry = parseMrzDate(l2.slice(21, 27), true);
  if (expiry !== undefined) {
    fields.expiryDate = expiry;
  }
  const sex = parseSex(l2[20]);
  if (sex !== undefined) {
    fields.sex = sex;
  }

  const name = parseName(l1.slice(5, 44));
  if (name.surname !== undefined) {
    fields.surname = name.surname;
  }
  if (name.givenNames !== undefined) {
    fields.givenNames = name.givenNames;
  }

  const composite = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43);
  const checks: MrzCheckDigitResult[] = [
    makeCheckDigit('documentNumber', l2.slice(0, 9), l2[9]),
    makeCheckDigit('dateOfBirth', l2.slice(13, 19), l2[19]),
    makeCheckDigit('expiryDate', l2.slice(21, 27), l2[27]),
    makeCheckDigit('optionalData', l2.slice(28, 42), l2[42]),
    makeCheckDigit('composite', composite, l2[43]),
  ];
  return { fields, checks };
}

/** Extract fields and check digits for a TD2 document. */
function parseTd2(lines: string[]): { fields: MrzFields; checks: MrzCheckDigitResult[] } {
  const [l1, l2] = lines;
  const fields: MrzFields = {};

  assignIfPresent(fields, 'documentType', stripFillers(l1.slice(0, 2)));
  assignIfPresent(fields, 'issuingCountry', stripFillers(l1.slice(2, 5)));
  assignIfPresent(fields, 'documentNumber', stripFillers(l2.slice(0, 9)));
  assignIfPresent(fields, 'nationality', stripFillers(l2.slice(10, 13)));
  assignIfPresent(fields, 'optionalData', stripFillers(l2.slice(28, 35)));

  const dob = parseMrzDate(l2.slice(13, 19), false);
  if (dob !== undefined) {
    fields.dateOfBirth = dob;
  }
  const expiry = parseMrzDate(l2.slice(21, 27), true);
  if (expiry !== undefined) {
    fields.expiryDate = expiry;
  }
  const sex = parseSex(l2[20]);
  if (sex !== undefined) {
    fields.sex = sex;
  }

  const name = parseName(l1.slice(5, 36));
  if (name.surname !== undefined) {
    fields.surname = name.surname;
  }
  if (name.givenNames !== undefined) {
    fields.givenNames = name.givenNames;
  }

  const composite = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 35);
  const checks: MrzCheckDigitResult[] = [
    makeCheckDigit('documentNumber', l2.slice(0, 9), l2[9]),
    makeCheckDigit('dateOfBirth', l2.slice(13, 19), l2[19]),
    makeCheckDigit('expiryDate', l2.slice(21, 27), l2[27]),
    makeCheckDigit('composite', composite, l2[35]),
  ];
  return { fields, checks };
}

/** Extract fields and check digits for a TD1 document. */
function parseTd1(lines: string[]): { fields: MrzFields; checks: MrzCheckDigitResult[] } {
  const [l1, l2, l3] = lines;
  const fields: MrzFields = {};

  assignIfPresent(fields, 'documentType', stripFillers(l1.slice(0, 2)));
  assignIfPresent(fields, 'issuingCountry', stripFillers(l1.slice(2, 5)));
  assignIfPresent(fields, 'documentNumber', stripFillers(l1.slice(5, 14)));
  assignIfPresent(fields, 'nationality', stripFillers(l2.slice(15, 18)));

  const optional = stripFillers(l1.slice(15, 30)) + stripFillers(l2.slice(18, 29));
  assignIfPresent(fields, 'optionalData', optional);

  const dob = parseMrzDate(l2.slice(0, 6), false);
  if (dob !== undefined) {
    fields.dateOfBirth = dob;
  }
  const expiry = parseMrzDate(l2.slice(8, 14), true);
  if (expiry !== undefined) {
    fields.expiryDate = expiry;
  }
  const sex = parseSex(l2[7]);
  if (sex !== undefined) {
    fields.sex = sex;
  }

  const name = parseName(l3.slice(0, 30));
  if (name.surname !== undefined) {
    fields.surname = name.surname;
  }
  if (name.givenNames !== undefined) {
    fields.givenNames = name.givenNames;
  }

  const composite =
    l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
  const checks: MrzCheckDigitResult[] = [
    makeCheckDigit('documentNumber', l1.slice(5, 14), l1[14]),
    makeCheckDigit('dateOfBirth', l2.slice(0, 6), l2[6]),
    makeCheckDigit('expiryDate', l2.slice(8, 14), l2[14]),
    makeCheckDigit('composite', composite, l2[29]),
  ];
  return { fields, checks };
}

/**
 * Standard, MRZ-relevant OCR confusion pairs. Each pair `[a, b]` means
 * `a` and `b` are commonly mistaken for one another by OCR engines on the
 * OCR-B font used by machine-readable travel documents. The relation is
 * treated as bidirectional when the confusion map is built.
 */
const OCR_CONFUSION_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['0', 'O'],
  ['0', 'Q'],
  ['0', 'D'],
  ['1', 'I'],
  ['1', 'L'],
  ['2', 'Z'],
  ['5', 'S'],
  ['6', 'G'],
  ['8', 'B'],
  ['4', 'A'],
  ['7', 'T'],
  ['9', 'G'],
];

/**
 * Build a bidirectional confusion map from {@link OCR_CONFUSION_PAIRS}.
 * Insertion order is preserved so the correction search is deterministic.
 */
function buildConfusionMap(): Readonly<Record<string, string[]>> {
  const map: Record<string, string[]> = {};
  const add = (from: string, to: string): void => {
    const list = map[from] ?? (map[from] = []);
    if (!list.includes(to)) {
      list.push(to);
    }
  };
  for (const [a, b] of OCR_CONFUSION_PAIRS) {
    add(a, b);
    add(b, a);
  }
  return map;
}

/** Precomputed, immutable confusion map shared by all corrections. */
const CONFUSION_MAP = buildConfusionMap();

/** A single character position within the (normalized) line grid. */
interface Cell {
  line: number;
  pos: number;
}

/**
 * A field that is guarded by a dedicated check digit and is therefore a
 * candidate for check-digit-guided correction. `cells` are the data
 * positions (in check-digit order); `checkLine`/`checkPos` locate the
 * read check-digit character.
 */
interface CorrectableField {
  name: string;
  cells: Cell[];
  checkLine: number;
  checkPos: number;
}

/** Build the inclusive-exclusive `[start, end)` cell range on one line. */
function rangeCells(line: number, start: number, end: number): Cell[] {
  const cells: Cell[] = [];
  for (let pos = start; pos < end; pos += 1) {
    cells.push({ line, pos });
  }
  return cells;
}

/**
 * Describe every check-digit-guarded field for a known format, mirroring
 * the offsets used by the per-format parsers. The `'composite'` field is
 * always listed last so component corrections happen first.
 */
function getCorrectableFields(format: Exclude<MrzFormat, 'unknown'>): CorrectableField[] {
  if (format === 'TD3') {
    return [
      { name: 'documentNumber', cells: rangeCells(1, 0, 9), checkLine: 1, checkPos: 9 },
      { name: 'dateOfBirth', cells: rangeCells(1, 13, 19), checkLine: 1, checkPos: 19 },
      { name: 'expiryDate', cells: rangeCells(1, 21, 27), checkLine: 1, checkPos: 27 },
      { name: 'optionalData', cells: rangeCells(1, 28, 42), checkLine: 1, checkPos: 42 },
      {
        name: 'composite',
        cells: [...rangeCells(1, 0, 10), ...rangeCells(1, 13, 20), ...rangeCells(1, 21, 43)],
        checkLine: 1,
        checkPos: 43,
      },
    ];
  }
  if (format === 'TD2') {
    return [
      { name: 'documentNumber', cells: rangeCells(1, 0, 9), checkLine: 1, checkPos: 9 },
      { name: 'dateOfBirth', cells: rangeCells(1, 13, 19), checkLine: 1, checkPos: 19 },
      { name: 'expiryDate', cells: rangeCells(1, 21, 27), checkLine: 1, checkPos: 27 },
      {
        name: 'composite',
        cells: [...rangeCells(1, 0, 10), ...rangeCells(1, 13, 20), ...rangeCells(1, 21, 35)],
        checkLine: 1,
        checkPos: 35,
      },
    ];
  }
  // TD1
  return [
    { name: 'documentNumber', cells: rangeCells(0, 5, 14), checkLine: 0, checkPos: 14 },
    { name: 'dateOfBirth', cells: rangeCells(1, 0, 6), checkLine: 1, checkPos: 6 },
    { name: 'expiryDate', cells: rangeCells(1, 8, 14), checkLine: 1, checkPos: 14 },
    {
      name: 'composite',
      cells: [
        ...rangeCells(0, 5, 30),
        ...rangeCells(1, 0, 7),
        ...rangeCells(1, 8, 15),
        ...rangeCells(1, 18, 29),
      ],
      checkLine: 1,
      checkPos: 29,
    },
  ];
}

/** True when `ch` is a single ASCII digit `'0'`..`'9'`. */
function isDigitChar(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/** A candidate substitution slot: one cell plus its replacement options. */
interface CorrectionSlot {
  cell: Cell;
  candidates: string[];
}

/** Shared, mutable evaluation budget guarding the correction search. */
interface CorrectionBudget {
  count: number;
  max: number;
}

/**
 * Attempt to repair a single check-digit-guarded field on the mutable
 * character grid `grid`. Tries single then double OCR-confusion
 * substitutions (over the field's data cells and the read check digit)
 * and accepts the first combination that makes the field's computed check
 * digit equal the read check digit. Accepted substitutions are applied to
 * `grid` and recorded in `changes`.
 *
 * The search is bounded by `budget` and never accepts a change that does
 * not make the check digit pass, so a clean (already-passing) field is
 * left untouched.
 *
 * @returns `true` when a correction was applied, otherwise `false`.
 */
function tryCorrectField(
  grid: string[][],
  field: CorrectableField,
  changes: MrzNormalizationChange[],
  budget: CorrectionBudget,
): boolean {
  const checkCell: Cell = { line: field.checkLine, pos: field.checkPos };
  const readData = (): string => field.cells.map((c) => grid[c.line][c.pos]).join('');
  const readCheck = (): string => grid[checkCell.line][checkCell.pos];

  // Already consistent: never touch a passing field.
  if (String(computeCheckDigit(readData())) === readCheck()) {
    return false;
  }

  // Build candidate slots (data cells, then the check-digit cell).
  const slots: CorrectionSlot[] = [];
  for (const cell of field.cells) {
    const candidates = CONFUSION_MAP[grid[cell.line][cell.pos]] ?? [];
    if (candidates.length > 0) {
      slots.push({ cell, candidates });
    }
  }
  const checkCandidates = (CONFUSION_MAP[readCheck()] ?? []).filter(isDigitChar);
  if (checkCandidates.length > 0) {
    slots.push({ cell: checkCell, candidates: checkCandidates });
  }

  // Test a set of overrides against the grid, reverting afterwards.
  const test = (overrides: Array<{ cell: Cell; ch: string }>): boolean => {
    budget.count += 1;
    const saved = overrides.map((o) => grid[o.cell.line][o.cell.pos]);
    overrides.forEach((o) => {
      grid[o.cell.line][o.cell.pos] = o.ch;
    });
    const ok = String(computeCheckDigit(readData())) === readCheck();
    overrides.forEach((o, idx) => {
      grid[o.cell.line][o.cell.pos] = saved[idx];
    });
    return ok;
  };

  // Apply accepted overrides to the grid and record each change.
  const apply = (overrides: Array<{ cell: Cell; ch: string }>): void => {
    for (const o of overrides) {
      const from = grid[o.cell.line][o.cell.pos];
      grid[o.cell.line][o.cell.pos] = o.ch;
      changes.push({
        line: o.cell.line,
        position: o.cell.pos,
        from,
        to: o.ch,
        reason: 'check-digit guided correction',
      });
    }
  };

  // Single substitution.
  for (const slot of slots) {
    for (const ch of slot.candidates) {
      if (budget.count >= budget.max) {
        return false;
      }
      if (grid[slot.cell.line][slot.cell.pos] === ch) {
        continue;
      }
      if (test([{ cell: slot.cell, ch }])) {
        apply([{ cell: slot.cell, ch }]);
        return true;
      }
    }
  }

  // Double substitution (bounded by budget).
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      const s1 = slots[i];
      const s2 = slots[j];
      for (const c1 of s1.candidates) {
        for (const c2 of s2.candidates) {
          if (budget.count >= budget.max) {
            return false;
          }
          if (grid[s1.cell.line][s1.cell.pos] === c1 && grid[s2.cell.line][s2.cell.pos] === c2) {
            continue;
          }
          if (test([{ cell: s1.cell, ch: c1 }, { cell: s2.cell, ch: c2 }])) {
            apply([{ cell: s1.cell, ch: c1 }, { cell: s2.cell, ch: c2 }]);
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Run check-digit-guided OCR correction over the normalized lines of a
 * known-format MRZ. Component fields (document number, dates, optional
 * data) are corrected first; the composite is corrected only when every
 * component check digit already passes, so the search never mangles a
 * still-broken component to satisfy the composite.
 *
 * Returns the corrected lines and pushes every accepted substitution into
 * `changes`. The input array is not mutated.
 */
function autoCorrectLines(
  format: Exclude<MrzFormat, 'unknown'>,
  normalizedLines: string[],
  changes: MrzNormalizationChange[],
): string[] {
  const grid = normalizedLines.map((line) => line.split(''));
  const budget: CorrectionBudget = { count: 0, max: 512 };
  const fields = getCorrectableFields(format);
  const components = fields.filter((f) => f.name !== 'composite');
  const composite = fields.find((f) => f.name === 'composite');

  for (const field of components) {
    tryCorrectField(grid, field, changes, budget);
  }

  if (composite !== undefined) {
    const allComponentsPass = components.every((field) => {
      const data = field.cells.map((c) => grid[c.line][c.pos]).join('');
      const check = grid[field.checkLine][field.checkPos];
      return String(computeCheckDigit(data)) === check;
    });
    if (allComponentsPass) {
      tryCorrectField(grid, composite, changes, budget);
    }
  }

  return grid.map((chars) => chars.join(''));
}

/** Options accepted by {@link parseMrz}. */
export interface MrzParseOptions {
  /**
   * When `true`, enables check-digit-guided OCR error correction: fields
   * whose check digit fails are repaired by trying common OCR-confusion
   * substitutions, accepting a fix only when it makes the check digit
   * pass. Every accepted substitution is recorded in
   * {@link MrzParseResult.normalizationChanges}. Defaults to `false`, in
   * which case parsing behaves exactly as without options.
   */
  autoCorrect?: boolean;
}

/**
 * Parse raw MRZ text into a structured {@link MrzParseResult}.
 *
 * Processing pipeline:
 *  1. Split on newlines and trim each line; drop empty lines.
 *  2. Uppercase each line.
 *  3. Detect the layout from line count and length.
 *  4. Fit each line to the canonical length (pad/truncate with `'<'`).
 *  5. Apply position-aware OCR normalization, recording every change.
 *  6. Extract fields and verify all applicable check digits.
 *  7. Derive overall status.
 *
 * When the format cannot be detected the result has format `'unknown'`,
 * empty fields and check digits, and status `'partial'`.
 *
 * When `options.autoCorrect` is `true`, an additional check-digit-guided
 * correction pass runs after normalization (step 5.5): any field whose
 * check digit fails is repaired with OCR-confusion substitutions, but
 * only when a substitution makes the check digit pass. This never accepts
 * an unverified guess, so a clean MRZ is left unchanged and an
 * uncorrectable one stays `'invalid'`.
 *
 * @param rawText The raw MRZ text (one line per physical MRZ row).
 * @param options Optional parsing flags. Omitting it (or `autoCorrect`)
 *                preserves the exact default behavior.
 * @returns A fully populated {@link MrzParseResult}.
 */
export function parseMrz(rawText: string, options?: MrzParseOptions): MrzParseResult {
  const autoCorrect = options?.autoCorrect ?? false;
  const rawLines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const upperLines = rawLines.map((line) => line.toUpperCase());
  const format = detectMrzFormat(upperLines);

  if (format === 'unknown') {
    return {
      format,
      rawLines,
      normalizedLines: upperLines,
      normalizationChanges: [],
      fields: {},
      checkDigits: [],
      status: 'partial',
    };
  }

  const canonicalLength = CANONICAL_LENGTH[format];
  const positionTypes = buildPositionTypes(format);
  const fittedLines = upperLines.map((line) => fitToLength(line, canonicalLength));

  const normalizationChanges: MrzNormalizationChange[] = [];
  const normalizedLines = fittedLines.map((line, index) =>
    normalizeLine(line, positionTypes[index] ?? [], index, normalizationChanges),
  );

  const finalLines = autoCorrect
    ? autoCorrectLines(format, normalizedLines, normalizationChanges)
    : normalizedLines;

  const parsed =
    format === 'TD3'
      ? parseTd3(finalLines)
      : format === 'TD2'
        ? parseTd2(finalLines)
        : parseTd1(finalLines);

  return {
    format,
    rawLines,
    normalizedLines: finalLines,
    normalizationChanges,
    fields: parsed.fields,
    checkDigits: parsed.checks,
    status: deriveStatus(parsed.checks),
  };
}
