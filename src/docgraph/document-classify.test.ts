/**
 * Tests for deterministic document-type classification.
 */

import { describe, it, expect } from 'vitest';
import { classifyDocument, ClassifyInput } from './document-classify';

describe('classifyDocument', () => {
  it('classifies a UAE passport with MRZ as passport (high confidence)', () => {
    const input: ClassifyInput = {
      texts: [
        'United Arab Emirates',
        'Passport No',
        'Nationality',
        'Date of Birth',
        'Place of Birth',
      ],
      hasMrz: true,
    };
    const result = classifyDocument(input);
    expect(result.type).toBe('passport');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('classifies an invoice', () => {
    const input: ClassifyInput = {
      texts: ['INVOICE', 'Bill To', 'Total Due', 'Subtotal'],
      hasMrz: false,
    };
    const result = classifyDocument(input);
    expect(result.type).toBe('invoice');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('classifies a receipt', () => {
    const input: ClassifyInput = {
      texts: ['RECEIPT', 'Subtotal', 'Change Due', 'Thank you'],
      hasMrz: false,
    };
    const result = classifyDocument(input);
    expect(result.type).toBe('receipt');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('classifies an id card with MRZ and identity signal', () => {
    const input: ClassifyInput = {
      texts: ['Identity Card', 'ID No'],
      hasMrz: true,
    };
    const result = classifyDocument(input);
    expect(result.type).toBe('id_card');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('falls back to generic when no signals are present', () => {
    const input: ClassifyInput = {
      texts: ['', 'some random unrelated words'],
      hasMrz: false,
    };
    const result = classifyDocument(input);
    expect(result.type).toBe('generic');
    expect(result.confidence).toBe(0.4);
    expect(result.reasons).toEqual(['No strong document-type signals.']);
  });

  it('handles an empty input as generic', () => {
    const result = classifyDocument({ texts: [], hasMrz: false });
    expect(result.type).toBe('generic');
    expect(result.confidence).toBe(0.4);
  });

  it('returns confidence within [0, 1]', () => {
    const result = classifyDocument({
      texts: ['Passport', 'Nationality', 'Authority'],
      hasMrz: true,
    });
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
