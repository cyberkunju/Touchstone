# 09 — Template Engine v2

How a correction becomes a compiled, versioned, drift-safe extraction program. Builds on the
existing `src/template-engine/template.ts` and the legacy specs in
`bin/docs/06_TEMPLATE_ENGINE/` (still valid where not superseded here).

---

## 1. TemplateGraph v2 (evolution, not rewrite)

Existing structure retained (anchors, fields, fingerprint, config) with additions:

```ts
interface TemplateV2 extends TemplateGraph {
  schemaRef: string;            // familyId — the form schema lives on the family (11)
  anchorSet: {                  // hardened anchors
    text: { token: string; center: [number,number]; uniqueness: number }[];  // uniqueness = 1/occurrences
    zones: { kind: 'mrz'|'qr'|'barcode'|'photo'|'table'|'seal'; box: Box }[];
  };
  fieldBindings: {
    fieldId: string; roi: Box; valueType: FieldValueType;
    grammar?: string;           // grammar id for I3 re-decode
    attestors?: string[];       // expected attestors (e.g. passport number → none; IBAN → ['iban'])
    critical: boolean;          // quorum eligibility (I6)
  }[];
  stats: { uses: number; confirmedFieldHistogram: Record<string, number> };  // feeds template_consistency rule
  version: number; parentVersion?: number;   // strict lineage, append-only
}
```

## 2. Learning (on family approval / correction)

1. Anchors: confirmed, geometrically stable, high-uniqueness text tokens (excluding variable
   values — anything that differed across records or was user-edited is *never* an anchor) +
   special zones.
2. Field bindings from the approved form: ROI = union of observed value boxes (padded), type,
   grammar, expected attestors inferred from history.
3. Fingerprint: layout histogram + anchor token hashes + zone flags + page aspect (existing
   scheme, kept).
4. Version rules: first approval → v1; corrections that only adjust values → stats update;
   corrections that move/add/remove fields or anchors → **new version** with `parentVersion`.
   Silent mutation is structurally impossible — versions are append-only rows.

## 3. Matching (candidate retrieval + scoring)

1. Cheap prefilter: fingerprint similarity + zone-flag compatibility (MRZ present? table count?).
2. Anchor scoring: exact/fuzzy token hits weighted by uniqueness; mutual-consistency check
   (matched anchors must agree geometrically under *some* similarity transform — kills
   coincidental text hits).
3. Decision thresholds (frozen): `match ≥ 0.75` → known-template flow; `0.55–0.75` → ask the user
   ("looks like Passports — confirm?"); `< 0.55` → unknown flow. A wrong silent match is treated
   with silent-error severity in benchmarks ([14](14_QUALITY_TESTING.md)).

## 4. Alignment — text-as-keypoints homography (I7, `src/geometry/homography.ts`)

1. Correspondences: template anchor tokens ↔ page OCR tokens (string equality, then fuzzy ≥ 0.9
   for long tokens), centroid pairs.
2. RANSAC: sample 4 correspondences → DLT homography → inliers by reprojection error
   (≤ 1.5 % of page diagonal) → best consensus set → final H re-estimated on all inliers.
3. Degradation ladder (frozen): ≥ 6 inliers → homography; 3–5 → affine (least squares);
   2 → similarity (translate+scale); < 2 → alignment failed → unknown flow. Ladder position is
   recorded and feeds the `template_consistency` attestation threshold.
4. All field ROIs projected through the chosen transform, clamped to page.

## 5. Template JIT (I8, compilation)

On match+alignment, compile once per document:

```ts
interface ExtractionPlan {
  crops: { fieldId: string; roiPx: Box; dpi: number }[];   // batched into ONE rec inference call
  decoders: { fieldId: string; grammar?: Grammar; attestors: Attestor[] }[];
  expectations: { fieldId: string; valueType: FieldValueType; critical: boolean }[];
  skip: ['layout', 'classification', 'discovery-ocr'];      // the speed comes from what never runs
}
```

Execution: crop all ROIs from the full-res source (foveated — full page never re-perceived) →
single batched recognition (service `/v1/reperceive` or fallback worker) → per-field grammar
decode → attestors → solver ([08](08_CONSENSUS_AND_ATTESTORS.md)) → record append. Budget: ≤ 1.5 s
end-to-end on the lite profile (this number is a perf-CI test, [13](13_PERFORMANCE_BUDGETS.md)).

## 6. Drift & corruption prevention

- Anchor inlier ratio < 0.6 of expected anchors ⇒ **drift suspected**: run unknown-flow discovery
  in parallel, diff layouts, propose a new template version with the diff visualized. The old
  version keeps serving old-layout documents (multi-version families are normal).
- Old records are never rewritten on schema/template changes (append-only truth, [11](11_WORKSPACE_DATA_MODEL.md)).
- Inherited rule (legacy docs, still law): no old extracted *values* are ever reused as new
  extractions — templates carry structure only, never document data.
