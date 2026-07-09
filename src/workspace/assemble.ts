/**
 * Workspace assembly (P2.4 IA) — DocGraph → family schema + record values.
 *
 * Pure functions: the App feeds a verified DocGraph in; these derive the
 * family's FormField schema and the record's stored values. Laws:
 *
 *  - SCHEMA IS ADDITIVE (11 §5): merging a new document's fields into an
 *    existing family NEVER removes or reorders existing fields — removed
 *    fields stay readable in old records; new fields append.
 *  - VALUES ARE VERBATIM: the record stores exactly what the verifier
 *    decided (value + status + justification summary) — no re-scoring, no
 *    prettying. A record is a photograph of a solve, not an opinion.
 *  - MRZ raw payloads never become columns (the parsed fields already did).
 */

import type { DocGraph, FieldHypothesis, FieldValueType } from '../core/types';
import type { FormField, JustificationSummary, RecordValue } from './types';

/** Core value types → form schema value types. */
const VALUE_TYPE_MAP: Partial<Record<FieldValueType, FormField['valueType']>> = {
  text: 'text',
  date: 'date',
  amount: 'amount',
  currency: 'amount',
  id_number: 'id',
  phone: 'phone',
  email: 'email',
  name: 'text',
  country: 'text',
  checkbox: 'checkbox',
  table: 'table',
  visual_asset: 'photo',
  barcode: 'text',
  // 'mrz' intentionally absent — raw machine zones are evidence, not fields.
};

/** Stable fieldId from a label: lowercase slug (the same convention the
 *  extraction layer uses for canonical labels). */
export function fieldIdFor(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'field'
  );
}

/** Hypotheses that become form fields (skips raw MRZ + rejected). */
function formEligible(h: FieldHypothesis): boolean {
  return h.valueType !== 'mrz' && h.status !== 'rejected' && !h.rejected;
}

/** Derives an ordered FormField schema from a verified graph. */
export function schemaFromGraph(graph: DocGraph): FormField[] {
  const seen = new Set<string>();
  const fields: FormField[] = [];
  for (const h of graph.hypotheses) {
    if (!formEligible(h)) continue;
    const id = fieldIdFor(h.canonicalLabel ?? h.label);
    if (seen.has(id)) continue; // first occurrence wins (extraction order)
    seen.add(id);
    const vt = VALUE_TYPE_MAP[h.valueType] ?? 'text';
    fields.push({
      fieldId: id,
      label: h.label,
      valueType: vt,
      required: h.required ?? false,
      critical: false,
      // Scalar values make useful table columns; assets/tables do not.
      column: vt !== 'photo' && vt !== 'signature' && vt !== 'seal' && vt !== 'table',
    });
  }
  return fields;
}

/**
 * ADDITIVE merge: existing schema keeps every field and its order; fields
 * present only in `incoming` append at the end. Returns the same reference
 * when nothing changed (callers skip the write).
 */
export function mergeSchema(existing: FormField[], incoming: FormField[]): FormField[] {
  const have = new Set(existing.map((f) => f.fieldId));
  const added = incoming.filter((f) => !have.has(f.fieldId));
  return added.length === 0 ? existing : [...existing, ...added];
}

function summarize(h: FieldHypothesis): JustificationSummary {
  return {
    attestations: [],
    confidence: h.confidence?.overall ?? 0,
    reasons: (h.reasons ?? []).slice(0, 6),
  };
}

/** Record values keyed by fieldId — verbatim photograph of the solve. */
export function valuesFromGraph(graph: DocGraph): Record<string, RecordValue> {
  const out: Record<string, RecordValue> = {};
  for (const h of graph.hypotheses) {
    if (!formEligible(h)) continue;
    const id = fieldIdFor(h.canonicalLabel ?? h.label);
    if (out[id]) continue; // mirror schemaFromGraph's first-wins
    out[id] = {
      value:
        typeof h.value === 'string'
          ? h.value
          : (h.displayValue ?? (h.value == null ? '' : JSON.stringify(h.value))),
      status: h.status,
      justification: summarize(h),
    };
  }
  return out;
}

/** Family display name from a docType slug ('tax_form' → 'Tax Form'). */
export function familyNameFor(docType: string): string {
  const pretty = docType
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
  return pretty || 'Documents';
}
