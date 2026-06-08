# Template Matching — Edge DocGraph Engine

**Purpose:** Define multi-signal template scoring, candidate retrieval, false-match prevention, and template decision logic.

---

## 1. Matching goal

Template matching decides whether a new document should use a saved TemplateGraph.

It must answer:

```text
Is this the same template?
Is this the same document family but a new version?
Is this unknown?
Is the match ambiguous?
```

The matching system must be conservative. A false unknown is safer than a false match.

---

## 2. High-level matching flow

```text
normalized page
  → candidate retrieval
  → cheap scoring
  → anchor matching
  → geometry scoring
  → visual scoring
  → special-zone scoring
  → optional keypoint scoring
  → combined score
  → decision
```

---

## 3. Candidate retrieval

Before full scoring, retrieve likely templates.

Signals:

- page count
- aspect ratio
- document type hint
- stable OCR tokens
- layout histogram
- object class histogram
- special zones
- recent templates
- user-selected template group

Output:

```ts
type CandidateTemplate = {
  templateId: string;
  familyId: string;
  version: number;
  roughScore: number;
  reasons: string[];
};
```

Candidate retrieval should favor recall. Full scoring handles precision.

---

## 4. Multi-signal score

Recommended score:

```ts
overall =
  0.25 * textAnchorScore +
  0.20 * geometryScore +
  0.20 * visualAnchorScore +
  0.15 * keypointScore +
  0.10 * specialZoneScore +
  0.10 * requiredRegionScore
```

This is an initial rule. Later calibrate per document family.

---

## 5. Text anchor score

Measures whether stable text anchors are present.

Inputs:

- TemplateAnchor type text
- OCR text nodes
- PDF embedded text evidence
- alias rules
- fuzzy matching rules

Scoring factors:

- number of matched anchors
- importance of matched anchors
- OCR confidence
- position similarity
- required anchor presence
- false-anchor penalty

Example:

```text
PASSPORT matched near expected location → strong
Date matched anywhere → weak
```

---

## 6. Geometry score

Measures structural similarity.

Signals:

- page aspect ratio
- document boundary
- photo region location
- table region location
- text block distribution
- checkbox cluster location
- line separators
- field boxes

Output:

```ts
type GeometryScore = {
  score: number;
  reasons: string[];
  driftVectors?: Array<{
    expected: NormalizedBox;
    observed: NormalizedBox;
    shift: [number, number];
  }>;
};
```

---

## 7. Visual anchor score

Measures logo/emblem/symbol similarity and location.

Signals:

- visual anchor descriptors
- perceptual hash
- ORB descriptors
- asset class match
- location similarity

Caution:

- user-specific photos/signatures should not be used as strong visual anchors
- logos can change and should trigger versioning rather than hard failure if other family signals match

---

## 8. Keypoint score

Uses ORB/RANSAC-style matching where useful.

Strengths:

- robust to scale/rotation
- useful for fixed forms/logos/certificates

Weaknesses:

- fails on low texture
- sensitive to blur
- can match wrong repeated patterns
- not enough alone

Keypoint score should be optional and weighted moderately.

---

## 9. Special-zone score

Checks presence/location of:

- MRZ
- QR/barcode
- photo
- signature
- stamp/seal
- table
- checkbox group

Example:

```text
Template expects MRZ at bottom; new page has MRZ at bottom → strong passport match signal.
```

---

## 10. Required-region score

Checks whether required template elements are plausible.

Signals:

- ROI contains text/object when expected
- required field label nearby
- required asset region exists
- required table region exists
- required code/MRZ region exists

This score is useful before full extraction.

---

## 11. Score breakdown schema

```ts
type TemplateScoreBreakdown = {
  textAnchorScore: number;
  geometryScore: number;
  visualAnchorScore: number;
  keypointScore: number;
  specialZoneScore: number;
  requiredRegionScore: number;

  overall: number;

  matchedAnchorIds: string[];
  missingRequiredAnchorIds: string[];

  reasons: string[];
  warnings: string[];
};
```

---

## 12. Decision logic

Suggested initial logic:

```ts
if (overall >= sameTemplateThreshold && missingRequiredAnchors.length === 0) {
  decision = "same_template";
} else if (overall >= sameFamilyThreshold && familySignalsStrong) {
  decision = "same_family_new_version";
} else if (ambiguousCandidatesClose) {
  decision = "ambiguous_match";
} else {
  decision = "unknown_template";
}
```

---

## 13. Thresholds

Initial threshold examples:

```ts
thresholds: {
  sameTemplate: 0.88,
  sameFamilyNewVersion: 0.60,
  unknown: 0.45,
  ambiguousMargin: 0.05
}
```

These must be calibrated with benchmark data.

---

## 14. Ambiguous match handling

Ambiguous when:

- top candidates are close
- different families share many anchors
- visual layout similar but key text differs
- required anchors conflict
- OCR quality is poor

Action:

- ask user to choose template, or
- run unknown flow, or
- run cautious extraction without saving automatically

Do not force a match.

---

## 15. False-match prevention

False match is dangerous because it can project wrong ROIs.

Rules:

1. Required anchors must be respected.
2. Text and geometry must not strongly disagree.
3. Special-zone mismatch should downgrade.
4. Similar templates need family/version logic.
5. Validator failures after extraction can retroactively downgrade match.
6. If uncertain, run unknown flow.

---

## 16. Same-family new-version detection

A document may be the same family but new layout.

Signals:

- same stable title/vendor/issuer
- similar doc type
- page count same/similar
- anchors present but shifted
- fields added/removed
- table structure changed
- visual logo changed but text remains
- required ROIs fail systematically

Decision:

```text
same_family_new_version
```

Then ask user after correction to create new version.

---

## 17. Matching output

```ts
type TemplateMatchResult = {
  decision:
    | "same_template"
    | "same_family_new_version"
    | "unknown_template"
    | "ambiguous_match";

  selectedTemplateId?: string;

  candidates: Array<{
    templateId: string;
    familyId: string;
    version: number;
    score: TemplateScoreBreakdown;
  }>;

  reasons: string[];
};
```

---

## 18. Integration with alignment

Template matching selects candidate. Alignment proves whether ROIs can be projected.

If alignment fails:

- downgrade same_template to new_version or unknown
- do not proceed blindly

---

## 19. Integration with verifier

After ROI extraction:

- validator failures may reveal false match
- missing required fields may indicate drift
- clustered failures trigger versioning

Template matching is not final trust.

---

## 20. Benchmark metrics

Measure:

- template hit rate
- false match rate
- false unknown rate
- same/new/unknown decision accuracy
- ambiguous rate
- alignment success rate
- downstream field extraction accuracy
- silent error impact

False match rate is the highest priority.

---

## 21. Test cases

- exact same template
- same template with skew
- same template with glare
- same family new version
- different template with same title
- different family with similar layout
- poor OCR but strong geometry
- strong text but weak geometry
- missing required anchor

---

## 22. Final matching rule

Template matching must be multi-signal and conservative. The app should prefer review over wrong ROI projection. The best matching system is not the one that always guesses a template; it is the one that almost never chooses the wrong one.
