/**
 * Draft-family schema editor reducer (P2.4 draft review screen) — the user
 * renames/retypes/deletes proposed fields BEFORE approval (J4). Pure; the
 * screen renders state and dispatches. Approval emits the final schema for
 * `approveFamily` + `updateFamilySchema`.
 *
 * Laws: fieldIds are stable across edits (renames touch labels only);
 * deletes are reversible until approval (soft-delete + undo); a draft with
 * zero surviving fields cannot be approved (an empty family is a bug, not
 * a choice).
 *
 * DESTINATION: src/workspace/ui/schema-editor.ts
 */

import type { FormField } from '../../../../src/workspace/types';

export interface SchemaEditorState {
  fields: (FormField & { deleted: boolean })[];
  /** Stack of undoable deletes (fieldIds, most recent last). */
  undoStack: string[];
  approved: FormField[] | null;      // set once on APPROVE — terminal
  error: string | null;
}

export type SchemaEditorEvent =
  | { type: 'RENAME'; fieldId: string; label: string }
  | { type: 'RETYPE'; fieldId: string; valueType: FormField['valueType'] }
  | { type: 'TOGGLE_REQUIRED'; fieldId: string }
  | { type: 'TOGGLE_COLUMN'; fieldId: string }
  | { type: 'DELETE'; fieldId: string }
  | { type: 'UNDO_DELETE' }
  | { type: 'APPROVE' };

export function initSchemaEditor(proposed: FormField[]): SchemaEditorState {
  return {
    fields: proposed.map((f) => ({ ...f, deleted: false })),
    undoStack: [],
    approved: null,
    error: null,
  };
}

export function schemaEditorReduce(
  state: SchemaEditorState,
  event: SchemaEditorEvent,
): SchemaEditorState {
  if (state.approved) return state;                 // terminal
  const clearErr = { ...state, error: null };

  const patch = (fieldId: string, fn: (f: FormField & { deleted: boolean }) => FormField & { deleted: boolean }) => ({
    ...clearErr,
    fields: state.fields.map((f) => (f.fieldId === fieldId ? fn(f) : f)),
  });

  switch (event.type) {
    case 'RENAME': {
      const label = event.label.trim();
      if (label.length === 0) {
        return { ...state, error: 'A field label cannot be empty.' };
      }
      return patch(event.fieldId, (f) => ({ ...f, label }));
    }
    case 'RETYPE':
      return patch(event.fieldId, (f) => ({ ...f, valueType: event.valueType }));
    case 'TOGGLE_REQUIRED':
      return patch(event.fieldId, (f) => ({ ...f, required: !f.required }));
    case 'TOGGLE_COLUMN':
      return patch(event.fieldId, (f) => ({ ...f, column: !f.column }));
    case 'DELETE': {
      const target = state.fields.find((f) => f.fieldId === event.fieldId);
      if (!target || target.deleted) return state;
      return {
        ...patch(event.fieldId, (f) => ({ ...f, deleted: true })),
        undoStack: [...state.undoStack, event.fieldId],
      };
    }
    case 'UNDO_DELETE': {
      const last = state.undoStack[state.undoStack.length - 1];
      if (!last) return state;
      return {
        ...patch(last, (f) => ({ ...f, deleted: false })),
        undoStack: state.undoStack.slice(0, -1),
      };
    }
    case 'APPROVE': {
      const surviving = state.fields.filter((f) => !f.deleted);
      if (surviving.length === 0) {
        return { ...state, error: 'A family needs at least one field.' };
      }
      return {
        ...clearErr,
        approved: surviving.map(({ deleted: _deleted, ...f }) => f),
      };
    }
  }
}
