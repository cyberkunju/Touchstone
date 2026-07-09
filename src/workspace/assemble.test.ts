/**
 * Assembly laws (P2.4 IA): schema derivation, the ADDITIVE merge, and
 * verbatim value photographing.
 */
import { describe, expect, it } from 'vitest';

import type { DocGraph, FieldHypothesis } from '../core/types';
import { familyNameFor, fieldIdFor, mergeSchema, schemaFromGraph, valuesFromGraph } from './assemble';
import type { FormField } from './types';

function hyp(over: Partial<FieldHypothesis>): FieldHypothesis {
  return {
    id: over.id ?? 'h1',
    documentId: 'd1',
    label: over.label ?? 'Field',
    value: over.value ?? 'v',
    valueType: over.valueType ?? 'text',
    labelNodeIds: [],
    valueNodeIds: [],
    assetNodeIds: [],
    tableNodeIds: [],
    confidence: { overall: 0.9, components: {}, penalties: [], reasons: [] },
    status: over.status ?? 'confirmed',
    evidenceIds: [],
    validationIds: [],
    reasons: over.reasons ?? [],
    createdAt: 0,
    ...over,
  } as FieldHypothesis;
}

function graphWith(hyps: FieldHypothesis[]): DocGraph {
  return { hypotheses: hyps } as unknown as DocGraph;
}

describe('schemaFromGraph', () => {
  it('derives ordered fields, skipping raw MRZ and rejected hypotheses', () => {
    const g = graphWith([
      hyp({ id: 'a', label: 'Full Name', valueType: 'name' }),
      hyp({ id: 'b', label: 'MRZ Payload', valueType: 'mrz' }),
      hyp({ id: 'c', label: 'Total', valueType: 'amount' }),
      hyp({ id: 'd', label: 'Bad', status: 'rejected' }),
      hyp({ id: 'e', label: 'Photo', valueType: 'visual_asset' }),
    ]);
    const s = schemaFromGraph(g);
    expect(s.map((f) => f.fieldId)).toEqual(['full_name', 'total', 'photo']);
    expect(s[1].valueType).toBe('amount');
    expect(s[1].column).toBe(true);
    expect(s[2].valueType).toBe('photo');
    expect(s[2].column).toBe(false); // assets are not table columns
  });

  it('first occurrence wins on duplicate canonical labels', () => {
    const g = graphWith([
      hyp({ id: 'a', label: 'Date of Birth', canonicalLabel: 'date_of_birth', valueType: 'date' }),
      hyp({ id: 'b', label: 'DOB', canonicalLabel: 'date_of_birth', valueType: 'date' }),
    ]);
    expect(schemaFromGraph(g)).toHaveLength(1);
  });
});

describe('mergeSchema — THE ADDITIVE LAW', () => {
  const f = (fieldId: string): FormField => ({
    fieldId, label: fieldId, valueType: 'text', required: false, critical: false, column: true,
  });

  it('never removes or reorders; new fields append', () => {
    const existing = [f('a'), f('b'), f('c')];
    const incoming = [f('c'), f('d'), f('a')];
    const merged = mergeSchema(existing, incoming);
    expect(merged.map((x) => x.fieldId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns the SAME reference when nothing changed (write-skip contract)', () => {
    const existing = [f('a'), f('b')];
    expect(mergeSchema(existing, [f('b'), f('a')])).toBe(existing);
  });
});

describe('valuesFromGraph — verbatim photograph', () => {
  it('stores value, status and reasons exactly as the verifier decided', () => {
    const g = graphWith([
      hyp({ id: 'a', label: 'Total', valueType: 'amount', value: '128.00', status: 'needs_review', reasons: ['low conf'] }),
    ]);
    const v = valuesFromGraph(g);
    expect(v.total).toEqual({
      value: '128.00',
      status: 'needs_review',
      justification: { attestations: [], confidence: 0.9, reasons: ['low conf'] },
    });
  });

  it('non-string values render via displayValue, else JSON', () => {
    const g = graphWith([
      hyp({ id: 'a', label: 'Boxes', valueType: 'checkbox', value: { checked: true }, displayValue: 'Yes' }),
      hyp({ id: 'b', label: 'Grid', valueType: 'table', value: { rows: [] } }),
    ]);
    const v = valuesFromGraph(g);
    expect(v.boxes.value).toBe('Yes');
    expect(v.grid.value).toBe('{"rows":[]}');
  });
});

describe('naming helpers', () => {
  it('fieldIdFor slugs safely', () => {
    expect(fieldIdFor('Date of Birth')).toBe('date_of_birth');
    expect(fieldIdFor('  --  ')).toBe('field');
  });
  it('familyNameFor prettifies docType slugs', () => {
    expect(familyNameFor('tax_form')).toBe('Tax Form');
    expect(familyNameFor('passport')).toBe('Passport');
    expect(familyNameFor('')).toBe('Documents');
  });
});
