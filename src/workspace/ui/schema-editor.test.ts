/**
 * Schema-editor reducer laws (P2.4 draft review). DESTINATION:
 * src/workspace/ui/schema-editor.test.ts
 */
import { describe, expect, it } from 'vitest';
import type { FormField } from '../types';
import { initSchemaEditor, schemaEditorReduce } from './schema-editor';

const PROPOSED: FormField[] = [
  { fieldId: 'f1', label: 'Invoice Number', valueType: 'id', required: true, critical: true, column: true },
  { fieldId: 'f2', label: 'Date', valueType: 'date', required: true, critical: false, column: true },
  { fieldId: 'f3', label: 'Noise Field', valueType: 'text', required: false, critical: false, column: false },
];

describe('schema editor (J4 draft review)', () => {
  it('rename touches label only — fieldId stable', () => {
    let s = initSchemaEditor(PROPOSED);
    s = schemaEditorReduce(s, { type: 'RENAME', fieldId: 'f1', label: 'Invoice #' });
    const f = s.fields.find((x) => x.fieldId === 'f1')!;
    expect(f.label).toBe('Invoice #');
    expect(f.valueType).toBe('id');
  });

  it('empty rename is a loud error, not a silent no-op', () => {
    let s = initSchemaEditor(PROPOSED);
    s = schemaEditorReduce(s, { type: 'RENAME', fieldId: 'f1', label: '   ' });
    expect(s.error).toMatch(/empty/);
    expect(s.fields[0].label).toBe('Invoice Number');
  });

  it('retype + toggles work per field', () => {
    let s = initSchemaEditor(PROPOSED);
    s = schemaEditorReduce(s, { type: 'RETYPE', fieldId: 'f3', valueType: 'amount' });
    s = schemaEditorReduce(s, { type: 'TOGGLE_REQUIRED', fieldId: 'f3' });
    s = schemaEditorReduce(s, { type: 'TOGGLE_COLUMN', fieldId: 'f3' });
    const f = s.fields.find((x) => x.fieldId === 'f3')!;
    expect(f.valueType).toBe('amount');
    expect(f.required).toBe(true);
    expect(f.column).toBe(true);
  });

  it('delete is soft and undoable, LIFO', () => {
    let s = initSchemaEditor(PROPOSED);
    s = schemaEditorReduce(s, { type: 'DELETE', fieldId: 'f2' });
    s = schemaEditorReduce(s, { type: 'DELETE', fieldId: 'f3' });
    expect(s.fields.filter((f) => f.deleted).map((f) => f.fieldId)).toEqual(['f2', 'f3']);
    s = schemaEditorReduce(s, { type: 'UNDO_DELETE' });
    expect(s.fields.find((f) => f.fieldId === 'f3')!.deleted).toBe(false);
    expect(s.fields.find((f) => f.fieldId === 'f2')!.deleted).toBe(true);
  });

  it('approve emits surviving fields only, without the deleted flag', () => {
    let s = initSchemaEditor(PROPOSED);
    s = schemaEditorReduce(s, { type: 'DELETE', fieldId: 'f3' });
    s = schemaEditorReduce(s, { type: 'APPROVE' });
    expect(s.approved).toHaveLength(2);
    expect(s.approved!.map((f) => f.fieldId)).toEqual(['f1', 'f2']);
    expect('deleted' in s.approved![0]).toBe(false);
  });

  it('cannot approve an empty schema', () => {
    let s = initSchemaEditor([PROPOSED[0]]);
    s = schemaEditorReduce(s, { type: 'DELETE', fieldId: 'f1' });
    s = schemaEditorReduce(s, { type: 'APPROVE' });
    expect(s.approved).toBeNull();
    expect(s.error).toMatch(/at least one/);
  });

  it('approval is terminal — further edits inert', () => {
    let s = initSchemaEditor(PROPOSED);
    s = schemaEditorReduce(s, { type: 'APPROVE' });
    const after = schemaEditorReduce(s, { type: 'RENAME', fieldId: 'f1', label: 'X' });
    expect(after).toBe(s);
  });
});
