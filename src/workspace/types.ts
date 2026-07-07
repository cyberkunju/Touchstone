/**
 * Workspace data model (P2.1) — the persistent truth layer's types.
 * Frozen schema: Documentation/11 §1 / plan.md §14. Changes here are
 * CONTRACT changes and require the change-control section of plan.md.
 */

import type { FieldStatus } from '../core/types';

/** Ordered form field of a family's schema. */
export interface FormField {
  fieldId: string;
  label: string;
  valueType:
    | 'text' | 'date' | 'amount' | 'enum' | 'id' | 'email' | 'phone'
    | 'photo' | 'signature' | 'seal' | 'table' | 'checkbox';
  required: boolean;
  enumValues?: string[];
  /** Grammar id for constrained re-decode (I3), when one applies. */
  grammar?: string;
  /** Attestor ids that must weigh in for this field (08 §6). */
  attestors?: string[];
  /** Critical fields demand stronger attestation before confirm. */
  critical: boolean;
  /** Appears as a records-table column. */
  column: boolean;
}

/** A document family: one form + its template lineage + rolling stats. */
export interface Family {
  familyId: string;              // ulid
  name: string;                  // user-editable
  status: 'active' | 'draft';    // draft = awaiting approval (J4)
  formSchema: FormField[];       // ordered
  templateIds: string[];         // all versions; lineage in template store
  stats: FamilyStats;
  createdAt: string;             // ISO
  updatedAt: string;             // ISO
}

export interface FamilyStats {
  records: number;
  /** Rolling straight-through-processing rate in [0,1]. */
  stp: number;
  /** Rolling questions-per-document (I12 target: monotone decline). */
  questionsPerDoc: number;
}

/** Where a value's trust came from — summary of the solver's Justification
 *  (08 §4). Stored denormalized so records render without re-solving. */
export interface JustificationSummary {
  attestations: { attestorId: string; verdict: 'proves' | 'supports' | 'contradicts' }[];
  confidence: number;
  reasons: string[];
}

export interface RecordValue {
  value: string;
  status: FieldStatus;
  justification: JustificationSummary;
}

export type SourceKind = 'image' | 'pdf' | 'office' | 'unknown';

/** One extracted document appended to a family. APPEND-ONLY: machine code
 *  never deletes or rewrites rows; user edits only flip value status to
 *  'confirmed' with provenance (userEdited path in the verifier). */
export interface DocRecord {
  recordId: string;              // ulid
  familyId: string;
  /** Full DocGraph retained for replay (I11) — the graph store keeps it. */
  docGraphId: string;
  values: Record<string /* fieldId */, RecordValue>;
  /** fieldId → OPFS path under assets/<recordId>/. */
  assetRefs: Record<string, string>;
  sourceFile: {
    name: string;
    sha256: string;
    opfsPath: string;            // files/<sha256>
    kind: SourceKind;
  };
  /** Identity tier 2 (I13): 64-bit dHash of the normalized page raster. */
  identity: { phash64: string };
  createdAt: string;             // ISO
  review: { open: boolean; openFieldIds: string[] };
}

/** Confusion prior payload (P6.1 writes, beam reads — Laplace at read). */
export interface ConfusionPrior {
  counts: Record<string /* seen */, Record<string /* true */, number>>;
  total: number;
}

/** Per-family format priors. */
export interface FormatPrior {
  dateOrder?: 'DMY' | 'MDY' | 'YMD';
  decimal?: '.' | ',';
  currency?: string;
}

/** Shadow-CI replay verdict (P6.3). */
export interface BenchRun {
  runId: string;
  createdAt: string;
  engineFrom: string;
  engineTo: string;
  perRecord: { recordId: string; fieldDiffs: { fieldId: string; from: string; to: string }[] }[];
  verdict: 'identical' | 'improved' | 'regressed';
}

/** ULID-ish id: time-sortable, collision-safe for local single-user scale.
 *  (Not spec-exact ULID encoding — monotonic time+counter prefix + strong
 *  random suffix gives the two properties the workspace actually relies on:
 *  chronological sort — EVEN within one millisecond — and uniqueness.) */
let lastMs = 0;
let seq = 0;
export function newId(prefix: string): string {
  const now = Date.now();
  if (now === lastMs) {
    seq += 1;
  } else {
    lastMs = now;
    seq = 0;
  }
  const t = now.toString(36).padStart(9, '0');
  const c = seq.toString(36).padStart(3, '0'); // monotonic within the ms
  const r = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => (b % 36).toString(36))
    .join('');
  return `${prefix}_${t}${c}${r}`;
}
