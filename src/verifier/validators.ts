/**
 * Validator registry for the Edge DocGraph Engine.
 *
 * Validators are deterministic, pure checks. Each returns a {@link ValidationOutcome};
 * the Verifier wraps outcomes into {@link ValidationResult} records and decides the
 * final field status. Validators NEVER mutate the graph and NEVER decide final
 * `confirmed` status by themselves.
 *
 * See mini-doc/06_VERIFICATION.md.
 */

import { FieldStatus, FieldValueType, ValidationResult } from '../core/types';
import {
  parseDate,
  parseAmount,
  normalizeId,
  matchesIdPattern,
  isValidEmail,
  isPlausiblePhone,
  isExpiryAfterIssue,
} from '../parsers/scalars';
import { MrzParseResult } from '../parsers/mrz';

/** Severity used by validators (mirrors ValidationResult severity). */
export type ValidationSeverity = ValidationResult['severity'];
export type ValidationStatus = ValidationResult['status'];

/** Context passed to a validator for a single field hypothesis. */
export interface ValidatorContext {
  targetId: string;
  documentId: string;
  label: string;
  valueType: FieldValueType;
  /** The current field value (raw or normalized). For MRZ it is an MrzParseResult. */
  value: unknown;
  evidenceIds: string[];
  required: boolean;
  /** Optional per-field/template configuration (regex patterns, expected sums, locale...). */
  config?: Record<string, unknown>;
}

/** The result of running a single validator. */
export interface ValidationOutcome {
  validatorId: string;
  status: ValidationStatus;
  severity: ValidationSeverity;
  message: string;
  details?: Record<string, unknown>;
  /**
   * Optional explicit status the verifier should consider for this field
   * when this validator fails/warns. The verifier still applies precedence.
   */
  suggestedStatus?: FieldStatus;
}

/** A registered validator. */
export interface DocumentValidator {
  id: string;
  /** Whether this validator applies to the given field. */
  appliesTo(ctx: ValidatorContext): boolean;
  /** Run the check. Must be pure and deterministic. */
  run(ctx: ValidatorContext): ValidationOutcome;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

const DATE_TYPES: ReadonlySet<FieldValueType> = new Set(['date']);
const AMOUNT_TYPES: ReadonlySet<FieldValueType> = new Set(['amount', 'currency']);

/* ------------------------------------------------------------------ */
/* Validators                                                         */
/* ------------------------------------------------------------------ */

/** Fails when a required field has no value. */
export const requiredValidator: DocumentValidator = {
  id: 'required_presence',
  appliesTo: (ctx) => ctx.required === true,
  run: (ctx) => {
    const empty = isEmptyValue(ctx.value);
    return {
      validatorId: 'required_presence',
      status: empty ? 'fail' : 'pass',
      severity: 'high',
      message: empty ? `Required field '${ctx.label}' has no value.` : 'Required field is present.',
      suggestedStatus: empty ? 'missing' : undefined,
    };
  },
};

/** Validates dates: ambiguity → warn (needs_review); invalid → fail. */
export const dateValidator: DocumentValidator = {
  id: 'date_validity',
  appliesTo: (ctx) => DATE_TYPES.has(ctx.valueType) && !isEmptyValue(ctx.value),
  run: (ctx) => {
    const raw = asString(ctx.value);
    const locale = ctx.config?.dateLocale as 'dmy' | 'mdy' | 'ymd' | undefined;
    const r = parseDate(raw, locale);
    if (!r.valid) {
      return {
        validatorId: 'date_validity',
        status: 'fail',
        severity: 'high',
        message: `Date '${raw}' is not a valid calendar date.`,
        suggestedStatus: 'invalid',
      };
    }
    if (r.ambiguous) {
      return {
        validatorId: 'date_validity',
        status: 'warn',
        severity: 'medium',
        message: `Date '${raw}' is ambiguous (${r.candidates.join(' or ')}).`,
        details: { candidates: r.candidates },
        suggestedStatus: 'needs_review',
      };
    }
    return {
      validatorId: 'date_validity',
      status: 'pass',
      severity: 'low',
      message: `Date parsed as ${r.iso}.`,
      details: { iso: r.iso },
    };
  },
};

/** Validates amounts. */
export const amountValidator: DocumentValidator = {
  id: 'amount_format',
  appliesTo: (ctx) => AMOUNT_TYPES.has(ctx.valueType) && !isEmptyValue(ctx.value),
  run: (ctx) => {
    const raw = asString(ctx.value);
    const r = parseAmount(raw);
    if (!r.valid) {
      return {
        validatorId: 'amount_format',
        status: 'fail',
        severity: 'high',
        message: `Amount '${raw}' could not be parsed.`,
        suggestedStatus: 'invalid',
      };
    }
    return {
      validatorId: 'amount_format',
      status: 'pass',
      severity: 'low',
      message: `Amount parsed as ${r.value} ${r.currency ?? ''}.`.trim(),
      details: { value: r.value, currency: r.currency, negative: r.negative },
    };
  },
};

/** Validates ID numbers against an optional template-provided pattern. */
export const idPatternValidator: DocumentValidator = {
  id: 'id_pattern',
  appliesTo: (ctx) => ctx.valueType === 'id_number' && !isEmptyValue(ctx.value),
  run: (ctx) => {
    const raw = asString(ctx.value);
    const patternSource = ctx.config?.idPattern;
    if (typeof patternSource !== 'string' || patternSource.length === 0) {
      return {
        validatorId: 'id_pattern',
        status: 'not_applicable',
        severity: 'info',
        message: 'No ID pattern configured.',
      };
    }
    let pattern: RegExp;
    try {
      pattern = new RegExp(patternSource);
    } catch {
      return {
        validatorId: 'id_pattern',
        status: 'not_applicable',
        severity: 'info',
        message: 'Configured ID pattern is invalid.',
      };
    }
    const ok = matchesIdPattern(raw, pattern);
    return {
      validatorId: 'id_pattern',
      status: ok ? 'pass' : 'fail',
      severity: 'medium',
      message: ok
        ? 'ID matches expected pattern.'
        : `ID '${normalizeId(raw).normalized}' does not match expected pattern.`,
      suggestedStatus: ok ? undefined : 'invalid',
    };
  },
};

/** Validates email format. */
export const emailValidator: DocumentValidator = {
  id: 'email_format',
  appliesTo: (ctx) => ctx.valueType === 'email' && !isEmptyValue(ctx.value),
  run: (ctx) => {
    const ok = isValidEmail(asString(ctx.value).trim());
    return {
      validatorId: 'email_format',
      status: ok ? 'pass' : 'fail',
      severity: 'medium',
      message: ok ? 'Email format is valid.' : 'Email format is invalid.',
      suggestedStatus: ok ? undefined : 'invalid',
    };
  },
};

/** Validates phone plausibility. */
export const phoneValidator: DocumentValidator = {
  id: 'phone_format',
  appliesTo: (ctx) => ctx.valueType === 'phone' && !isEmptyValue(ctx.value),
  run: (ctx) => {
    const ok = isPlausiblePhone(asString(ctx.value));
    return {
      validatorId: 'phone_format',
      status: ok ? 'pass' : 'warn',
      severity: 'low',
      message: ok ? 'Phone number is plausible.' : 'Phone number does not look plausible.',
      suggestedStatus: ok ? undefined : 'needs_review',
    };
  },
};

/**
 * Validates an MRZ field. The field value must be an MrzParseResult.
 * Failed critical check digits → invalid; partial → needs_review.
 */
export const mrzChecksumValidator: DocumentValidator = {
  id: 'mrz_checksum',
  appliesTo: (ctx) => ctx.valueType === 'mrz' && ctx.value != null,
  run: (ctx) => {
    const mrz = ctx.value as MrzParseResult;
    if (!mrz || typeof mrz !== 'object' || !('status' in mrz)) {
      return {
        validatorId: 'mrz_checksum',
        status: 'not_applicable',
        severity: 'info',
        message: 'MRZ value is not a parsed MRZ result.',
      };
    }
    if (mrz.status === 'invalid') {
      const failed = mrz.checkDigits.filter((c) => !c.passed).map((c) => c.field);
      return {
        validatorId: 'mrz_checksum',
        status: 'fail',
        severity: 'critical',
        message: `MRZ check digit failed: ${failed.join(', ')}.`,
        details: { failed },
        suggestedStatus: 'invalid',
      };
    }
    if (mrz.status === 'partial') {
      return {
        validatorId: 'mrz_checksum',
        status: 'warn',
        severity: 'medium',
        message: 'MRZ could not be fully validated.',
        suggestedStatus: 'needs_review',
      };
    }
    return {
      validatorId: 'mrz_checksum',
      status: 'pass',
      severity: 'critical',
      message: 'All MRZ check digits passed.',
    };
  },
};

/**
 * Validates that a set of numeric line values sums to an expected total.
 * Expects ctx.config.lineValues (number[]) and ctx.config.expectedSum (number).
 */
export const tableArithmeticValidator: DocumentValidator = {
  id: 'table_arithmetic',
  appliesTo: (ctx) =>
    Array.isArray(ctx.config?.lineValues) && typeof ctx.config?.expectedSum === 'number',
  run: (ctx) => {
    const values = ctx.config!.lineValues as number[];
    const expected = ctx.config!.expectedSum as number;
    const actual = values.reduce((acc, v) => acc + (Number(v) || 0), 0);
    const tolerance = (ctx.config?.tolerance as number) ?? 0.01;
    const ok = Math.abs(actual - expected) <= tolerance;
    return {
      validatorId: 'table_arithmetic',
      status: ok ? 'pass' : 'fail',
      severity: 'high',
      message: ok
        ? 'Table total matches the sum of line items.'
        : `Table total mismatch: rows sum to ${actual.toFixed(2)} but total says ${expected.toFixed(2)}.`,
      details: { actual, expected, tolerance },
      suggestedStatus: ok ? undefined : 'conflict',
    };
  },
};

/**
 * Validates a sex/gender field: the value must be an ICAO sex token (M, F or
 * X). Catches gross mispairings (e.g. a "Sex" label pulling a place name) so
 * they are flagged for review rather than confirmed.
 */
export const sexValidator: DocumentValidator = {
  id: 'sex_token',
  appliesTo: (ctx) =>
    /\bsex\b|gender|\bsexe\b/i.test(ctx.label) && !isEmptyValue(ctx.value),
  run: (ctx) => {
    const v = asString(ctx.value).trim().toUpperCase();
    const ok = v === 'M' || v === 'F' || v === 'X';
    return {
      validatorId: 'sex_token',
      status: ok ? 'pass' : 'fail',
      severity: 'medium',
      message: ok ? 'Sex is a valid ICAO token.' : `Sex '${asString(ctx.value)}' is not M, F or X.`,
      suggestedStatus: ok ? undefined : 'needs_review',
    };
  },
};

/* ------------------------------------------------------------------ */
/* Registry                                                           */
/* ------------------------------------------------------------------ */

/** All registered field-level validators (cross-field checks live in the verifier). */
export const VALIDATORS: ReadonlyArray<DocumentValidator> = [
  requiredValidator,
  dateValidator,
  amountValidator,
  idPatternValidator,
  emailValidator,
  phoneValidator,
  mrzChecksumValidator,
  tableArithmeticValidator,
  sexValidator,
];

/** Run all applicable validators for a context. */
export function runValidators(ctx: ValidatorContext): ValidationOutcome[] {
  const outcomes: ValidationOutcome[] = [];
  for (const v of VALIDATORS) {
    if (v.appliesTo(ctx)) outcomes.push(v.run(ctx));
  }
  return outcomes;
}

/** Re-exported scalar utility for cross-field date ordering checks. */
export { isExpiryAfterIssue };
