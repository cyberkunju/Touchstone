# UX Principles — Edge DocGraph Engine

**Purpose:** Define the user experience philosophy for the local evidence graph document-to-form system.

---

## 1. Core UX promise

The product is not an OCR text dump and not an “AI guessed form.”

The product promise is:

```text
Upload any document.
The app extracts text, fields, tables, photos, signatures, stamps, codes, and MRZ locally.
Every result shows evidence.
Uncertain results ask for review.
User corrections teach the template for next time.
```

The UI must make this feel powerful without hiding uncertainty.

---

## 2. Main UX philosophy

The UI is:

1. **correction-first**
2. **evidence-first**
3. **uncertainty-aware**
4. **local-first**
5. **template-learning-first**
6. **review-efficient**
7. **audit-ready**

---

## 3. Correction-first principle

The system will not be perfect on every unknown document. The UX should make correction fast, precise, and reusable.

Correction must feel like:

```text
Fix once → future similar documents become fast and accurate.
```

Every correction should be easy:

- rename label
- edit value
- change field type
- redraw region
- correct crop
- add missing field
- delete false field
- merge/split fields
- correct table cells
- correct checkbox state
- save/update template

Correction is not an afterthought. It is the learning interface.

---

## 4. Evidence-first principle

Every field must answer:

```text
Where did this value come from?
```

UI must show:

- source crop
- OCR text
- detected object box
- parser output
- validator result
- template ROI
- user correction history
- conflict sources

A field without evidence must be visibly user-created or manual.

---

## 5. Uncertainty-aware principle

The app must never pretend.

Statuses must be visible:

- Confirmed
- Needs review
- Missing
- Conflict
- Invalid
- Unsupported
- Rejected

Bad:

```text
DOB: 01/02/1999
```

Good:

```text
Date of Birth: 01/02/1999
Needs review — date format is ambiguous.
```

---

## 6. Local-first principle

Users upload sensitive documents. The UI must reinforce privacy.

Show clear messaging:

```text
Processing locally. Your document is not uploaded.
```

User should understand:

- no cloud OCR
- no server upload
- models run on device
- templates stored locally
- user controls exports

Do not overstate absolute security, but be clear about local processing.

---

## 7. Template-learning principle

The UI must connect correction to future speed.

After user reviews a document, offer:

- Save as new template
- Update existing template
- Create new version
- Do not learn

The template save UI must show what will be learned and what will not.

Important wording:

```text
This saves the layout and extraction rules, not this document’s private values.
```

---

## 8. Review-efficiency principle

The user should not manually inspect everything if most fields are reliable.

The UI should prioritize:

1. conflicts
2. invalid critical fields
3. missing required fields
4. needs-review critical fields
5. uncertain assets/tables
6. optional low-confidence fields

Confirmed fields should still have evidence available, but they should not overwhelm the review queue.

---

## 9. Document + form side-by-side principle

The main workspace should show:

```text
left: document viewer with overlays
right: generated form with statuses
```

Selecting a field highlights its source region.  
Selecting a region highlights related fields.

This bidirectional linking is essential.

---

## 10. Minimal hidden magic principle

The product can feel magical, but the system must not hide how it works.

For every field:

- show status
- show evidence
- show reason
- allow correction
- show validator conflict when present

The user should trust the app because it is transparent.

---

## 11. Fast path vs review path

### Known template

UI should feel fast:

```text
Matched template: Vendor Invoice v2
18 confirmed
2 need review
```

### Unknown document

UI should feel guided:

```text
New layout detected.
Review extracted fields and save as a template if you want future fast extraction.
```

Do not use the same UI tone for unknown and known documents.

---

## 12. Progressive disclosure

Default UI should be clean.

Show:

- field
- value
- status
- short reason

On demand show:

- confidence components
- graph links
- model versions
- validator details
- raw evidence
- provenance

Normal users need clarity. Developers need traceability.

---

## 13. User control principle

The user must control:

- whether to save template
- whether to update template
- whether to create new version
- whether to export uncertain fields
- whether to include evidence/crops in exports
- whether to delete templates
- whether to ignore a field

No silent template updates.

---

## 14. Safety wording principle

Avoid confident wording for uncertain extraction.

Bad:

```text
Extracted successfully.
```

Better:

```text
Extraction complete. 18 fields confirmed, 3 need review.
```

Bad:

```text
Invalid document.
```

Better:

```text
Some fields could not be verified. Review highlighted issues.
```

---

## 15. Accessibility principle

The UI must be usable with:

- keyboard
- screen readers
- high contrast mode
- zoom
- reduced motion
- non-color cues

Status must never be communicated by color alone.

---

## 16. Performance UX principle

Edge inference can take time on weak devices. UI should:

- show progress by stage
- allow cancellation
- keep main thread responsive
- lazy-load heavy features
- show page-by-page progress
- avoid freezing viewer

Do not show vague indefinite loading when progress can be known.

---

## 17. Error recovery principle

Errors should be actionable.

Bad:

```text
Error.
```

Good:

```text
The scan is too blurry to verify the passport number. Retake the image or enter the value manually.
```

Every error should say:

- what happened
- why it matters
- what user can do

---

## 18. UX invariants

1. Every field has status.
2. Every field has evidence or is marked manual.
3. Every uncertain field is visible.
4. Conflicts show both sources.
5. User correction creates graph evidence.
6. Template updates require user action.
7. Export preserves status.
8. Local processing is clearly communicated.
9. Color is never the only signal.
10. UI must not hide silent error risk.

---

## 19. Final UX statement

The UI should make the product feel like a local document intelligence workstation: precise, inspectable, correctable, fast on repeated layouts, and honest when uncertain. The best UX is not one that pretends everything is perfect; it is one that lets users reach trustworthy results with minimal effort.
