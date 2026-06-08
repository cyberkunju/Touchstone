/**
 * Tests for evidence-driven hypothesis generation.
 *
 * Critical invariant: normalization is HONEST. The recognized text is never
 * replaced by a guessed "correct" answer. Canonical forms are additive.
 */

import { describe, it, expect } from 'vitest';
import {
  TextItem,
  cleanText,
  getBoundingBoxOfBoxes,
  boxOverlapFraction,
  findLabelItem,
  findValueForLabel,
  findMrzLines,
  normalizeFieldValue,
} from './hypotheses';
import { Box } from '../core/geometry';

function item(text: string, box: Box, nodeId: string): TextItem {
  return { text, boxNorm: box, nodeId };
}

describe('cleanText', () => {
  it('collapses whitespace and trims', () => {
    expect(cleanText('  John   Doe \n')).toBe('John Doe');
  });
});

describe('getBoundingBoxOfBoxes', () => {
  it('returns the enclosing box', () => {
    expect(getBoundingBoxOfBoxes([[0.1, 0.1, 0.2, 0.2], [0.3, 0.05, 0.4, 0.5]])).toEqual([
      0.1, 0.05, 0.4, 0.5,
    ]);
  });

  it('returns a zero box for no input', () => {
    expect(getBoundingBoxOfBoxes([])).toEqual([0, 0, 0, 0]);
  });
});

describe('boxOverlapFraction', () => {
  it('is 1 when b is fully inside a', () => {
    expect(boxOverlapFraction([0, 0, 1, 1], [0.2, 0.2, 0.4, 0.4])).toBeCloseTo(1);
  });

  it('is 0 when disjoint', () => {
    expect(boxOverlapFraction([0, 0, 0.1, 0.1], [0.5, 0.5, 0.6, 0.6])).toBe(0);
  });
});

describe('findLabelItem', () => {
  it('finds the first item containing a keyword', () => {
    const items = [
      item('Surname', [0, 0, 0.2, 0.05], 'n1'),
      item('Date of Birth', [0, 0.1, 0.3, 0.15], 'n2'),
    ];
    expect(findLabelItem(items, ['birth'])?.nodeId).toBe('n2');
  });

  it('returns null when no keyword matches', () => {
    expect(findLabelItem([item('Name', [0, 0, 1, 1], 'n')], ['invoice'])).toBeNull();
  });
});

describe('findValueForLabel', () => {
  it('pairs a label with the value to its right', () => {
    const items = [
      item('Name', [0.05, 0.1, 0.2, 0.14], 'label'),
      item('JOHN DOE', [0.25, 0.1, 0.5, 0.14], 'value'),
      item('Unrelated', [0.05, 0.8, 0.2, 0.84], 'far'),
    ];
    const pair = findValueForLabel(items, ['name']);
    expect(pair?.value.nodeId).toBe('value');
  });

  it('pairs a label with the value directly below', () => {
    const items = [
      item('Address', [0.05, 0.1, 0.2, 0.14], 'label'),
      item('123 Main St', [0.05, 0.15, 0.3, 0.19], 'value'),
    ];
    const pair = findValueForLabel(items, ['address']);
    expect(pair?.value.nodeId).toBe('value');
  });

  it('returns null when the label is absent', () => {
    expect(findValueForLabel([item('Name', [0, 0, 0.2, 0.05], 'n')], ['invoice'])).toBeNull();
  });
});

describe('findMrzLines', () => {
  it('detects machine-readable zone lines', () => {
    const items = [
      item('P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', [0, 0.9, 1, 0.93], 'mrz1'),
      item('L898902C36UTO7408122F1204159ZE184226B<<<<<10', [0, 0.94, 1, 0.97], 'mrz2'),
      item('Just a normal sentence here', [0, 0.1, 0.5, 0.14], 'text'),
    ];
    const lines = findMrzLines(items);
    expect(lines.map((l) => l.nodeId)).toEqual(['mrz1', 'mrz2']);
  });
});

describe('normalizeFieldValue — honest normalization', () => {
  it('adds an ISO canonical form for a valid date but keeps the text', () => {
    const r = normalizeFieldValue('date', ' 1974-08-12 ');
    expect(r.value).toBe('1974-08-12');
    expect(r.normalizedValue).toBe('1974-08-12');
  });

  it('does not invent an ISO date for an ambiguous value', () => {
    const r = normalizeFieldValue('date', '01/02/2020');
    expect(r.value).toBe('01/02/2020');
    expect(r.normalizedValue).toBeUndefined();
  });

  it('adds a numeric canonical form for an amount', () => {
    const r = normalizeFieldValue('amount', '$1,250.00');
    expect((r.normalizedValue as { value: number }).value).toBe(1250);
  });

  it('normalizes an id without fabricating', () => {
    const r = normalizeFieldValue('id_number', 'a1234567');
    expect(r.normalizedValue).toBe('A1234567');
    expect(r.value).toBe('a1234567');
  });

  it('leaves plain text untouched beyond whitespace cleanup', () => {
    const r = normalizeFieldValue('text', '  hello  world ');
    expect(r.value).toBe('hello world');
    expect(r.normalizedValue).toBeUndefined();
  });
});
