/**
 * @file scalars.ts
 *
 * Deterministic scalar parsers used by the verifier.
 *
 * Design principles (shared by every parser in this module):
 *  - **Preserve the raw input.** The original string is always echoed back in
 *    the `raw` field so downstream consumers can audit provenance.
 *  - **Normalize separately.** A normalized / candidate interpretation is
 *    returned alongside the raw value, never in place of it.
 *  - **Flag ambiguity, never guess.** When more than one valid interpretation
 *    exists (e.g. `01/02/1999` could be DMY or MDY), the result is marked
 *    `ambiguous` and every candidate is returned instead of silently picking
 *    one.
 *  - **Never throw.** Bad input yields a structured result with `valid: false`
 *    and a human-readable `reason`; it does not raise.
 *
 * The module is dependency-free and written for TypeScript `strict` mode with
 * no use of `any`.
 */

/* -------------------------------------------------------------------------- */
/*  Dates                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Result of attempting to parse a date string.
 */
export interface DateParseResult {
  /** The exact input string, preserved verbatim. */
  raw: string;
  /** `YYYY-MM-DD` when a single unambiguous interpretation exists. */
  iso?: string;
  /**
   * `true` when more than one valid calendar interpretation exists and no
   * locale hint disambiguates (e.g. `01/02/1999` as DMY vs MDY).
   */
  ambiguous: boolean;
  /** `true` if at least one valid calendar interpretation exists. */
  valid: boolean;
  /** All valid ISO interpretations, sorted ascending (1 or 2 entries). */
  candidates: string[];
  /** Human-readable explanation, present mainly on failure. */
  reason?: string;
}

/** Locale hint used to disambiguate numeric, year-last date formats. */
export type DateLocale = 'dmy' | 'mdy' | 'ymd';

/**
 * Mapping of English month names and common abbreviations to their 1-based
 * month number. Keys are lower-cased; the lookup lower-cases its input.
 */
const MONTH_NAMES: Readonly<Record<string, number>> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/**
 * @returns `true` if `year` is a Gregorian leap year.
 */
function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * @returns the number of days in the given 1-based `month` of `year`.
 */
function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1];
}

/**
 * @returns `true` if `(year, month, day)` is a real calendar date. `month`
 *          and `day` are 1-based.
 */
function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) {
    return false;
  }
  if (day < 1) {
    return false;
  }
  return day <= daysInMonth(year, month);
}

/**
 * Formats a `(year, month, day)` triple as a zero-padded `YYYY-MM-DD` string.
 */
function toIso(year: number, month: number, day: number): string {
  const yyyy = String(year).padStart(4, '0');
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Builds an invalid {@link DateParseResult}. */
function invalidDate(raw: string, reason: string): DateParseResult {
  return { raw, ambiguous: false, valid: false, candidates: [], reason };
}

/** Builds a valid, unambiguous {@link DateParseResult}. */
function unambiguousDate(raw: string, iso: string): DateParseResult {
  return { raw, iso, ambiguous: false, valid: true, candidates: [iso] };
}

/**
 * Parses a date string into a structured, ambiguity-aware result.
 *
 * Supported formats:
 *  - `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY/MM/DD` — unambiguous (ymd).
 *  - `DD/MM/YYYY`, `MM/DD/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY` — ambiguous unless
 *    a component `> 12` disambiguates, or a `locale` hint is provided.
 *  - `DD MMM YYYY` and `MMM DD, YYYY` with English month names / abbreviations
 *    — unambiguous.
 *  - Bare 6-digit `YYMMDD` — only accepted when `locale === 'ymd'`; for general
 *    parsing a bare 6-digit run is rejected (`valid: false`) to avoid false
 *    positives.
 *
 * Every interpretation is validated against the real calendar (rejecting e.g.
 * `2023-02-30`, `2023-13-01`, April 31, and non-leap Feb 29).
 *
 * @param raw    the date string to parse (preserved in the result).
 * @param locale optional hint to resolve ambiguity for numeric, year-last
 *               formats: `'dmy'`, `'mdy'`, or `'ymd'`.
 */
export function parseDate(raw: string, locale?: DateLocale): DateParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return invalidDate(raw, 'empty input');
  }

  // --- Numeric, year-first: YYYY[sep]MM[sep]DD (unambiguous ymd). ----------
  const ymd = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(trimmed);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (isValidCalendarDate(year, month, day)) {
      return unambiguousDate(raw, toIso(year, month, day));
    }
    return invalidDate(raw, 'invalid calendar date');
  }

  // --- Numeric, year-last: aa[sep]bb[sep]YYYY (DMY vs MDY). ----------------
  const dayMonth = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(trimmed);
  if (dayMonth) {
    const first = Number(dayMonth[1]);
    const second = Number(dayMonth[2]);
    const year = Number(dayMonth[3]);

    // DMY: first = day, second = month. MDY: first = month, second = day.
    const dmyValid = isValidCalendarDate(year, second, first);
    const mdyValid = isValidCalendarDate(year, first, second);
    const dmyIso = dmyValid ? toIso(year, second, first) : undefined;
    const mdyIso = mdyValid ? toIso(year, first, second) : undefined;

    if (locale === 'dmy') {
      return dmyIso !== undefined
        ? unambiguousDate(raw, dmyIso)
        : invalidDate(raw, 'invalid calendar date for dmy interpretation');
    }
    if (locale === 'mdy') {
      return mdyIso !== undefined
        ? unambiguousDate(raw, mdyIso)
        : invalidDate(raw, 'invalid calendar date for mdy interpretation');
    }

    // No applicable locale hint: resolve purely by calendar validity.
    const unique = new Set<string>();
    if (dmyIso !== undefined) {
      unique.add(dmyIso);
    }
    if (mdyIso !== undefined) {
      unique.add(mdyIso);
    }
    const candidates = [...unique].sort();
    if (candidates.length === 0) {
      return invalidDate(raw, 'invalid calendar date');
    }
    if (candidates.length === 1) {
      return { raw, iso: candidates[0], ambiguous: false, valid: true, candidates };
    }
    return { raw, ambiguous: true, valid: true, candidates };
  }

  // --- Month-name: DD MMM YYYY (unambiguous). -----------------------------
  const dayName = /^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/.exec(trimmed);
  if (dayName) {
    const day = Number(dayName[1]);
    const month = MONTH_NAMES[dayName[2].toLowerCase()];
    const year = Number(dayName[3]);
    if (month !== undefined && isValidCalendarDate(year, month, day)) {
      return unambiguousDate(raw, toIso(year, month, day));
    }
    return invalidDate(raw, 'invalid month name or calendar date');
  }

  // --- Month-name: MMM DD, YYYY (unambiguous). ----------------------------
  const nameDay = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(trimmed);
  if (nameDay) {
    const month = MONTH_NAMES[nameDay[1].toLowerCase()];
    const day = Number(nameDay[2]);
    const year = Number(nameDay[3]);
    if (month !== undefined && isValidCalendarDate(year, month, day)) {
      return unambiguousDate(raw, toIso(year, month, day));
    }
    return invalidDate(raw, 'invalid month name or calendar date');
  }

  // --- Bare 6 digits: only valid as YYMMDD when locale === 'ymd'. ---------
  if (/^\d{6}$/.test(trimmed)) {
    if (locale === 'ymd') {
      const year = 2000 + Number(trimmed.slice(0, 2));
      const month = Number(trimmed.slice(2, 4));
      const day = Number(trimmed.slice(4, 6));
      if (isValidCalendarDate(year, month, day)) {
        return unambiguousDate(raw, toIso(year, month, day));
      }
      return invalidDate(raw, 'invalid calendar date');
    }
    return invalidDate(raw, 'bare 6-digit number not treated as a date');
  }

  return invalidDate(raw, 'unrecognized date format');
}

/**
 * @returns `true` if `expiryIso` is strictly after `issueIso`. Both arguments
 *          are expected to be `YYYY-MM-DD` strings; ISO date strings sort
 *          chronologically under lexicographic comparison.
 */
export function isExpiryAfterIssue(issueIso: string, expiryIso: string): boolean {
  return expiryIso > issueIso;
}

/* -------------------------------------------------------------------------- */
/*  Amounts                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Result of attempting to parse a monetary amount.
 */
export interface AmountParseResult {
  /** The exact input string, preserved verbatim. */
  raw: string;
  /** Numeric value (sign applied), rounded to 4 decimal places. */
  value?: number;
  /**
   * Currency code. Symbols are mapped to ISO codes (`$`→USD, `₹`→INR, `€`→EUR,
   * `£`→GBP). When no currency indicator is present, defaults to `USD`.
   */
  currency?: string;
  /** `true` if a leading `-` or surrounding parentheses indicate a negative. */
  negative: boolean;
  /** `true` if at least one digit was found and parsed. */
  valid: boolean;
  /** Human-readable explanation, present mainly on failure. */
  reason?: string;
}

/** Maps recognized currency symbols to ISO 4217 codes. */
const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  $: 'USD',
  '₹': 'INR',
  '€': 'EUR',
  '£': 'GBP',
};

/**
 * Normalizes a digits-and-separators string (only `0-9`, `,`, `.`) into a
 * plain decimal string parseable by {@link Number.parseFloat}.
 *
 * Heuristics:
 *  - Both `,` and `.` present: the separator that appears *last* is the decimal
 *    point; the other is a thousands separator (handles `1,200.00` and the
 *    European `1.200,00`).
 *  - A single separator type appearing more than once is a thousands separator.
 *  - A single separator occurrence is a decimal point unless it is followed by
 *    exactly 3 digits (a thousands grouping, e.g. `1,200` → `1200`).
 */
function normalizeNumeric(cleaned: string): string {
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    const decimalSep = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.') ? ',' : '.';
    const thousandsSep = decimalSep === ',' ? '.' : ',';
    return cleaned.split(thousandsSep).join('').split(decimalSep).join('.');
  }

  if (hasComma || hasDot) {
    const sep = hasComma ? ',' : '.';
    const occurrences = cleaned.split(sep).length - 1;
    if (occurrences > 1) {
      return cleaned.split(sep).join('');
    }
    const trailing = cleaned.length - cleaned.indexOf(sep) - 1;
    if (trailing === 3) {
      return cleaned.split(sep).join('');
    }
    return cleaned.split(sep).join('.');
  }

  return cleaned;
}

/**
 * Parses a monetary amount, preserving the raw input and detecting currency,
 * sign, and decimal/thousands conventions without throwing.
 *
 * @param raw the amount string to parse.
 */
export function parseAmount(raw: string): AmountParseResult {
  const trimmed = raw.trim();
  let work = trimmed;
  let negative = false;

  // Parentheses denote a negative amount, e.g. "(1200.00)".
  if (/^\(.*\)$/.test(work)) {
    negative = true;
    work = work.slice(1, -1).trim();
  }
  // A leading or embedded minus sign also denotes a negative amount.
  if (work.includes('-')) {
    negative = true;
  }

  // Detect currency: symbol first, then a standalone ISO-style 3-letter code.
  let currency: string | undefined;
  for (const symbol of Object.keys(CURRENCY_SYMBOLS)) {
    if (work.includes(symbol)) {
      currency = CURRENCY_SYMBOLS[symbol];
      break;
    }
  }
  if (currency === undefined) {
    const codeMatch = work.toUpperCase().match(/\b([A-Z]{3})\b/);
    if (codeMatch) {
      currency = codeMatch[1];
    }
  }

  // Extract the numeric portion: keep only digits and separators.
  const cleaned = work.replace(/[^0-9.,]/g, '');
  if (!/\d/.test(cleaned)) {
    return { raw, negative, valid: false, reason: 'no numeric digits found' };
  }

  const normalized = normalizeNumeric(cleaned);
  const magnitude = Number.parseFloat(normalized);
  if (Number.isNaN(magnitude)) {
    return { raw, negative, valid: false, reason: 'unparseable numeric value' };
  }

  const signed = negative ? -magnitude : magnitude;
  // Round to 4 decimal places to avoid floating-point noise.
  const value = Math.round(signed * 10000) / 10000;

  return {
    raw,
    value,
    currency: currency ?? 'USD',
    negative,
    valid: true,
  };
}

/* -------------------------------------------------------------------------- */
/*  Identifiers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Result of normalizing an identifier string.
 */
export interface IdNormalizeResult {
  /** The exact input string, preserved verbatim. */
  raw: string;
  /** Upper-cased, alphanumeric-only normalized form. */
  normalized: string;
  /** `true` if normalization changed the input. */
  changed: boolean;
}

/**
 * Normalizes an identifier: upper-cases the input, strips spaces, hyphens,
 * dots, and any other non-alphanumeric characters, keeping only `[A-Z0-9]`.
 *
 * @param raw the identifier to normalize.
 */
export function normalizeId(raw: string): IdNormalizeResult {
  const normalized = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return { raw, normalized, changed: normalized !== raw };
}

/**
 * Tests whether the *normalized* form of `value` matches `pattern`.
 *
 * The pattern is applied to a fresh, non-stateful regular expression (the
 * global / sticky flags are stripped) so repeated calls behave deterministically.
 *
 * @param value   the identifier to normalize and test.
 * @param pattern the regular expression to match against.
 */
export function matchesIdPattern(value: string, pattern: RegExp): boolean {
  const normalized = normalizeId(value).normalized;
  const flags = pattern.flags.replace(/[gy]/g, '');
  const safe = new RegExp(pattern.source, flags);
  return safe.test(normalized);
}

/* -------------------------------------------------------------------------- */
/*  Email & phone                                                             */
/* -------------------------------------------------------------------------- */

/**
 * @returns `true` if `raw` looks like a plausible email address: exactly one
 *          `@`, a non-empty local part and domain, the domain contains a dot
 *          with non-empty labels, and there is no whitespace.
 */
export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

/**
 * @returns `true` if `raw` is a plausible phone number: an optional leading
 *          `+`, followed by 7 to 15 digits once common separators (spaces,
 *          hyphens, parentheses, dots) are stripped.
 */
export function isPlausiblePhone(raw: string): boolean {
  let body = raw.trim();
  if (body.startsWith('+')) {
    body = body.slice(1);
  }
  const stripped = body.replace(/[\s\-().]/g, '');
  if (!/^\d+$/.test(stripped)) {
    return false;
  }
  return stripped.length >= 7 && stripped.length <= 15;
}
