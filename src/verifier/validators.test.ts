/**
 * Tests for the validator registry.
 *
 * Validators are pure and deterministic. Each test builds a ValidatorContext
 * and asserts the ValidationOutcome (status, suggestedStatus, severity).
 */

import { describe, it, expect } from 'vitest';
import {
  ValidatorContext,
  requiredValidator,
  dateValidator,
  amountValidator,
  idPatternValidator,
  emailValidator,
  phoneValidator,
  mrzChecksumValidator,
  tableArithmeticValidator,
  runValidators,
} from './validators';
import { FieldValueType } from '../core/types';
import { MrzParseResult } from '../parsers/mrz';

function ctx(partial: Partial<ValidatorContext>): ValidatorContext {
  return {
    targetId: 'hyp-1',
    documentId: 'doc-1',
    label: 'Field',
    valueType: 'text' as FieldValueType,
    value: '',
    evidenceIds: [],
    required: false,
    config: undefined,
    ...partial,
  };
}

describe('requiredValidator', () => {
  it('applies only to required fields', () => {
    expect(requiredValidator.appliesTo(ctx({ required: false }))).toBe(false);
    expect(requiredValidator.appliesTo(ctx({ required: true }))).toBe(true);
  });

  it('fails with suggestedStatus missing when empty', () => {
    const o = requiredValidator.run(ctx({ required: true, value: '   ' }));
    expect(o.status).toBe('fail');
    expect(o.suggestedStatus).toBe('missing');
  });

  it('passes when a value is present', () => {
    const o = requiredValidator.run(ctx({ required: true, value: 'John' }));
    expect(o.status).toBe('pass');
    expect(o.suggestedStatus).toBeUndefined();
  });
});

describe('dateValidator', () => {
  it('applies to non-empty date fields only', () => {
    expect(dateValidator.appliesTo(ctx({ valueType: 'date', value: '' }))).toBe(false);
    expect(dateValidator.appliesTo(ctx({ valueType: 'date', value: '2020-01-01' }))).toBe(true);
    expect(dateValidator.appliesTo(ctx({ valueType: 'text', value: '2020-01-01' }))).toBe(false);
  });

  it('fails on an impossible calendar date', () => {
    const o = dateValidator.run(ctx({ valueType: 'date', value: '2023-02-30' }));
    expect(o.status).toBe('fail');
    expect(o.suggestedStatus).toBe('invalid');
  });

  it('warns (needs_review) on an ambiguous date', () => {
    const o = dateValidator.run(ctx({ valueType: 'date', value: '01/02/2020' }));
    expect(o.status).toBe('warn');
    expect(o.suggestedStatus).toBe('needs_review');
    expect((o.details?.candidates as string[]).length).toBeGreaterThan(1);
  });

  it('passes on an unambiguous ISO date', () => {
    const o = dateValidator.run(ctx({ valueType: 'date', value: '1974-08-12' }));
    expect(o.status).toBe('pass');
    expect(o.details?.iso).toBe('1974-08-12');
  });
});

describe('amountValidator', () => {
  it('passes on a parseable amount', () => {
    const o = amountValidator.run(ctx({ valueType: 'amount', value: '$1,250.00' }));
    expect(o.status).toBe('pass');
    expect(o.details?.value).toBe(1250);
  });

  it('fails on garbage', () => {
    const o = amountValidator.run(ctx({ valueType: 'amount', value: 'abc' }));
    expect(o.status).toBe('fail');
    expect(o.suggestedStatus).toBe('invalid');
  });
});

describe('idPatternValidator', () => {
  it('is not_applicable without a configured pattern', () => {
    const o = idPatternValidator.run(ctx({ valueType: 'id_number', value: 'A1234567' }));
    expect(o.status).toBe('not_applicable');
  });

  it('passes when the value matches the pattern', () => {
    const o = idPatternValidator.run(
      ctx({ valueType: 'id_number', value: 'A1234567', config: { idPattern: '^[A-Z][0-9]{7}$' } }),
    );
    expect(o.status).toBe('pass');
  });

  it('fails (invalid) when the value does not match', () => {
    const o = idPatternValidator.run(
      ctx({ valueType: 'id_number', value: '123', config: { idPattern: '^[A-Z][0-9]{7}$' } }),
    );
    expect(o.status).toBe('fail');
    expect(o.suggestedStatus).toBe('invalid');
  });
});

describe('emailValidator', () => {
  it('passes valid email and fails invalid', () => {
    expect(emailValidator.run(ctx({ valueType: 'email', value: 'a@b.com' })).status).toBe('pass');
    const bad = emailValidator.run(ctx({ valueType: 'email', value: 'not-an-email' }));
    expect(bad.status).toBe('fail');
    expect(bad.suggestedStatus).toBe('invalid');
  });
});

describe('phoneValidator', () => {
  it('warns (needs_review) on implausible phone', () => {
    const o = phoneValidator.run(ctx({ valueType: 'phone', value: '12' }));
    expect(o.status).toBe('warn');
    expect(o.suggestedStatus).toBe('needs_review');
  });
});

describe('mrzChecksumValidator', () => {
  const valid: MrzParseResult = {
    format: 'TD3',
    status: 'valid',
    fields: {},
    checkDigits: [{ field: 'composite', expected: '4', actual: '4', passed: true }],
    normalizationChanges: [],
    rawLines: [],
  } as unknown as MrzParseResult;

  it('passes when MRZ status is valid', () => {
    expect(mrzChecksumValidator.run(ctx({ valueType: 'mrz', value: valid })).status).toBe('pass');
  });

  it('fails (invalid) when a check digit fails', () => {
    const invalid = {
      ...valid,
      status: 'invalid',
      checkDigits: [{ field: 'documentNumber', expected: '1', actual: '2', passed: false }],
    } as unknown as MrzParseResult;
    const o = mrzChecksumValidator.run(ctx({ valueType: 'mrz', value: invalid }));
    expect(o.status).toBe('fail');
    expect(o.suggestedStatus).toBe('invalid');
    expect(o.severity).toBe('critical');
  });
});

describe('tableArithmeticValidator', () => {
  it('passes when rows sum to the expected total', () => {
    const o = tableArithmeticValidator.run(
      ctx({ config: { lineValues: [100, 150], expectedSum: 250 } }),
    );
    expect(o.status).toBe('pass');
  });

  it('fails (conflict) when rows do not sum to the total', () => {
    const o = tableArithmeticValidator.run(
      ctx({ config: { lineValues: [100, 150], expectedSum: 300 } }),
    );
    expect(o.status).toBe('fail');
    expect(o.suggestedStatus).toBe('conflict');
  });
});

describe('runValidators', () => {
  it('runs only applicable validators', () => {
    const outcomes = runValidators(
      ctx({ valueType: 'date', value: '2023-02-30', required: true }),
    );
    const ids = outcomes.map((o) => o.validatorId);
    expect(ids).toContain('required_presence');
    expect(ids).toContain('date_validity');
    expect(ids).not.toContain('amount_format');
  });
});
