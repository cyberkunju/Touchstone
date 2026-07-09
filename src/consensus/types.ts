/**
 * Consensus types (08 §1, §4) — the frozen seam between candidates,
 * attestors, and the solver.
 *
 * THE LAW AS A TYPE (08 §4): `status === 'confirmed'` ⟺ at least one
 * attestation with verdict 'proves'. The only constructor able to produce a
 * confirmed field lives in solver.ts and enforces this statically and at
 * runtime; a fuzz test attempts to forge confirmed-without-proof and must
 * find it unrepresentable.
 */

/** Where a candidate value came from — ordered by channel strength (08 §2). */
export type Channel =
  | 'native'            // digital file structure — exact by construction
  | 'payload'           // decoded barcode/QR payload field
  | 'mrz_beam'          // checksum-guided beam decode
  | 'template'          // template ROI projection
  | 'lattice_decode'    // grammar re-decode over the lattice (I3)
  | 'ocr'               // raw OCR read
  | 'user';             // user-entered

/** Relative strength for soft ranking (NEVER grants confirmation). */
export const CHANNEL_STRENGTH: Readonly<Record<Channel, number>> = {
  native: 1.0,
  user: 1.0,
  payload: 0.95,
  mrz_beam: 0.9,
  template: 0.6,
  lattice_decode: 0.5,
  ocr: 0.35,
};

/** A reference to the evidence a verdict stands on — never empty prose. */
export interface EvidenceRef {
  /** What kind of thing is referenced. */
  kind: 'candidate' | 'node' | 'computation' | 'payload_field' | 'peer_field';
  /** Identifier within that kind (candidate id, node id, formula, …). */
  ref: string;
  /** Human-readable one-liner (UI tooltip; not a substitute for `ref`). */
  note?: string;
}

/** One candidate value for one prospective field (08 §1). */
export interface FieldCandidate {
  /** Stable id within the document solve (for evidence refs). */
  id: string;
  /** Canonical field label when known ('total', 'passport_number', …). */
  canonicalLabel: string | null;
  /** Schema value type ('amount', 'date', 'id_number', 'name', 'text', …). */
  valueType: string;
  value: string;
  channel: Channel;
  /** Normalized page box when the value has geometry. */
  boxNorm?: [number, number, number, number];
  /** Beam/decode log-prob when the channel provides one. */
  pathProb?: number;
  /** Structural marks attached by pattern-gated attestors (self-labels). */
  marks: string[];
}

/** Document-level context the attestors may consult (08 §1). */
export interface DocContext {
  docType: string;
  /** Every candidate in the document — cross-field attestors need peers. */
  allCandidates: readonly FieldCandidate[];
  /** 'DMY' | 'MDY' | 'YMD' when established document-globally; else null. */
  dateOrder: 'DMY' | 'MDY' | 'YMD' | null;
  /** Today, injected for deterministic tests. */
  now: Date;
}

export interface Attestation {
  attestorId: string;
  /** 'proves' grants confirmation; 'supports' only ranks; 'contradicts'
   *  forces conflict handling. Structural-only attestors may never emit
   *  'proves' (08 §6 #16). */
  verdict: 'proves' | 'supports' | 'contradicts';
  /** Calibrated (1 − blind-spot rate) of the underlying check (08 §6). */
  strength: number;
  /** ALWAYS non-empty — no unexplained verdicts. */
  evidence: EvidenceRef[];
}

export interface Attestor {
  id: string;
  /** Cheap gate: pattern/type match before any computation. */
  appliesTo(field: FieldCandidate, ctx: DocContext): boolean;
  /** null = cannot judge (NOT a pass, NOT a fail — silence). */
  attest(field: FieldCandidate, ctx: DocContext): Attestation | null;
}
