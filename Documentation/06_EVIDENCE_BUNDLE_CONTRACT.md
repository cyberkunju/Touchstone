# 06 — Evidence Bundle Contract (v1)

The single seam between senses and brain. Versioned, schema-validated on both sides, additive-only.
This file is the human-readable elaboration; the frozen source of truth is plan.md §13.1 and the
generated JSON Schema.

---

## 1. Top level

```ts
interface EvidenceBundle {
  bundleVersion: 1;
  source: {
    kind: 'image'|'pdf_digital'|'pdf_scanned'|'pdf_hybrid'|'xlsx'|'docx'|'csv';
    sha256: string;          // of the original file bytes — identity tier 1 (I13)
    pages: number;
  };
  timings: Record<string, number>;   // per-stage ms — consumed by perf CI (13)
  stageErrors?: { stage: string; code: string; detail: string }[];  // partials are explicit
  pages: PageEvidence[];
}
```

## 2. Page evidence

```ts
interface PageEvidence {
  index: number;                     // 0-based
  geometry: {
    wPx: number; hPx: number;        // of the processed (rectified) raster
    deskewDeg: number;               // applied rotation
    dewarp?: { applied: boolean; method: 'classical'|'uvdoc' };
    quality: { blur: number; glare: number; contrast: number };   // all 0..1, 1 = worst blur/glare
  };
  ocr: OcrLine[];
  layout: { cls: LayoutClass; box: Box; conf: number }[];
  codes:  { format: string; payload: string; box: Box; ecLevel?: string }[];
  faces:  { box: Box; landmarks5: [number, number][]; conf: number }[];
  tables: {
    box: Box;
    method: 'rulings'|'slanet'|'lore'|'cluster';
    cells: { r: number; c: number; rs: number; cs: number; box: Box }[];
  }[];
  native?: {                        // digital routes only — exact, not perceived
    cells?:    { r: number; c: number; value: string; formula?: string; numFmt?: string;
                 merged?: [number, number, number, number] }[];
    textRuns?: { text: string; box: Box; font?: string; sizePt?: number; bold?: boolean }[];
    textLayerUntrusted?: boolean;   // hybrid reconciliation verdict (I9)
  };
}
```

## 3. The OCR line — where the whole architecture hinges

```ts
interface OcrLine {
  poly: [number, number][];         // 4+ points, normalized 0..1 of page
  top1: string;                     // greedy decode — display/logging only
  conf: number;                     // mean emitted-char prob — display only, never trust
  rot: 0|90|180|270;
  lattice: [string, number][][];    // REQUIRED. Per CTC step: top-k=5 [char, prob],
                                    // includes the blank token as '' when in top-k.
}
```

**Semantics:** the lattice is the pre-argmax, pre-collapse distribution. The brain's beam decoders
(I2/I3) and confusion priors (I5) operate exclusively on it; `top1`/`conf` exist for humans. A
bundle whose vision-route pages lack lattices is **invalid** and rejected by the brain's validator.

## 4. Shared primitives

- `Box = [x, y, w, h]`, normalized 0..1 against the *processed* page raster. All geometry in the
  bundle uses the same space; the brain maps to display space via `geometry`.
- `LayoutClass` = PP-DocLayout's 23 class names **verbatim** (`doc_title`, `paragraph_title`,
  `text`, `page_number`, `abstract`, `table_of_contents`, `references`, `footnotes`, `header`,
  `footer`, `algorithm`, `formula`, `formula_number`, `image`, `figure_title`, `table`,
  `table_title`, `seal`, `chart`, `chart_title`, `sidebar_text`, `list`, `aside_text` — the
  authoritative list is pinned from the model card at P4.1 integration and frozen in
  `bundle-types.ts`). The brain owns any semantic regrouping; the service never renames.

## 5. Versioning governance

1. Within `bundleVersion: 1`: fields may be **added** (optional), never renamed, retyped, or
   removed. The brain must tolerate unknown fields (forward compatibility).
2. Both sides validate against the same JSON Schema, generated from one source
   (`src/perception/bundle-schema.json`, mirrored into `service/`); CI diffs them — drift fails.
3. A breaking need ⇒ `bundleVersion: 2` side-by-side support in the brain for one phase, then the
   old version is dropped. (Not expected within this plan's scope.)
4. The browser fallback pipeline emits the **identical** shape (it is a second implementation of
   the same contract, minus stages it can't run — absent stages are simply empty arrays plus
   `stageErrors` entries).

## 6. Worked example (abridged, passport photo page)

```jsonc
{
  "bundleVersion": 1,
  "source": { "kind": "image", "sha256": "9f2c…", "pages": 1 },
  "timings": { "quality": 12, "layout": 18, "ocr.det": 95, "ocr.rec": 310, "codes": 22, "faces": 6 },
  "pages": [{
    "index": 0,
    "geometry": { "wPx": 2200, "hPx": 1546, "deskewDeg": -1.8,
                  "quality": { "blur": 0.08, "glare": 0.03, "contrast": 0.71 } },
    "layout": [ { "cls": "image", "box": [0.052, 0.30, 0.21, 0.42], "conf": 0.94 },
                { "cls": "text",  "box": [0.30, 0.28, 0.65, 0.44], "conf": 0.97 } ],
    "faces":  [ { "box": [0.07, 0.33, 0.16, 0.30],
                  "landmarks5": [[0.115,0.42],[0.175,0.42],[0.145,0.48],[0.12,0.55],[0.17,0.55]],
                  "conf": 0.998 } ],
    "codes":  [],
    "tables": [],
    "ocr": [
      { "poly": [[0.06,0.865],[0.94,0.865],[0.94,0.895],[0.06,0.895]],
        "top1": "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
        "conf": 0.91, "rot": 0,
        "lattice": [ [["P",0.99],["F",0.007],["",0.002],["R",0.0006],["B",0.0004]],
                     [["<",0.97],["K",0.02],["",0.006],["C",0.003],["L",0.001]] /* … 42 more steps */ ] }
      /* + line 2 of the MRZ, + VIZ lines … */
    ]
  }]
}
```

The brain takes this bundle, beam-decodes the two MRZ lines jointly under ICAO check-digit
constraints (I2), cross-attests VIZ fields against the MRZ (I1), crops the portrait using the face
landmarks (F12), and emits a form where every confirmed field carries its justification chain.
