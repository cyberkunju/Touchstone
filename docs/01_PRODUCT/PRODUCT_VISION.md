# Product Vision — Edge DocGraph Engine

**Document status:** Product vision and strategic direction  
**Core thesis:** Build a local evidence graph engine, not an OCR form filler.  
**North star:** Turn any document into an editable, evidence-backed form that learns corrected templates locally and never silently lies.

---

## 1. One-sentence vision

Edge DocGraph Engine is a local-only document intelligence system that converts uploaded documents into editable, evidence-backed forms by building a graph of text, visual assets, tables, codes, validators, and user corrections, then learning reusable templates after one correction.

---

## 2. The product we are actually building

This project is not an OCR scanner. It is not a document chatbot. It is not a simple “upload PDF → extract text” tool. It is a local document perception engine.

A user uploads a document. The system does not merely read text. It detects document structure, visual elements, semantic fields, tables, codes, identity zones, signatures, stamps, logos, photos, symbols, and relationships. Then it creates a form that the user can inspect and correct. Every form field must be linked to visible evidence.

When the user corrects the form once, the app saves a local TemplateGraph. On the next similar upload, the system recognizes the template, aligns the page, extracts known regions first, verifies every field, and fills the form fast.

The experience should feel like this:

```text
First upload:
  "I found the likely fields, assets, and tables. Here is the evidence. Please review uncertain parts."

After correction:
  "I learned this layout locally."

Second similar upload:
  "I matched the saved template, extracted the known fields, verified them, and flagged only what changed."
```

The intelligence is not just in models. The intelligence is in the system architecture: evidence graph, verifier, template learning, ROI-first extraction, and correction-driven improvement.

---

## 3. Why this product matters

Documents are still one of the biggest bottlenecks in real-world workflows. People manually enter data from passports, invoices, receipts, certificates, forms, bank statements, licenses, admission records, compliance forms, and local documents every day.

Most existing tools fail in one of three ways:

1. **OCR-only tools** extract text but lose structure, images, relationships, and trust.
2. **Cloud document AI tools** may work well but send sensitive documents to external infrastructure.
3. **VLM-style tools** may understand the page broadly but can hallucinate, miss tiny text, and provide weak coordinate/crop guarantees.

This project solves a different problem:

> Local, private, evidence-backed document-to-form automation.

That means the user keeps data on-device, sees evidence for every output, corrects mistakes, and gets better repeated extraction without cloud retraining.

---

## 4. The fundamental product shift

The project must shift from:

```text
OCR → text → AI guessing → form
```

to:

```text
document → evidence extraction → DocGraph → hypotheses → verification → editable form → TemplateGraph learning
```

This shift is the entire product.

OCR is only one evidence producer. The detector, parser, segmenter, table engine, barcode scanner, MRZ parser, face checker, validators, and user corrections all produce evidence. The DocGraph stores and relates that evidence. The verifier decides whether a field is trustworthy. The form is only a view over verified or reviewable hypotheses.

This prevents the most dangerous failure mode: confident wrong fields.

---

## 5. Product principles

### 5.1 Local-first by default

The system must run on the user's device. The user should be able to process sensitive documents without uploading them.

Local-first is not only a technical constraint. It is a trust promise.

The app should not require:

- cloud OCR
- cloud VLMs
- server-side extraction
- remote document uploads
- remote template storage
- remote telemetry containing document data

### 5.2 Evidence before automation

Automation is only valuable when it is trustworthy. Every extracted item must answer:

```text
What is this?
Where did it come from?
Which module found it?
What is the evidence?
What validation passed?
What could be wrong?
Did the user correct it?
```

A field without evidence is not a field. It is a guess.

### 5.3 Uncertainty is a feature, not a failure

The system should not pretend uncertain extraction is perfect. It should clearly mark uncertainty and make correction easy.

Allowed field states:

- confirmed
- needs_review
- missing
- conflict
- invalid
- unsupported

The best product is not the one that guesses the most. The best product is the one that minimizes silent critical errors.

### 5.4 Correction is learning

Manual correction is not a failure. It is the training interface.

When the user corrects:

- a label
- a value
- a field type
- a crop
- a table
- a checkbox
- a template version

the system should record high-trust evidence and update the TemplateGraph. The next similar upload should improve.

### 5.5 Repeated documents should become fast

The first upload of an unknown document may require review. The second similar upload should feel magical. The app should not rediscover the entire document. It should align the saved template and extract from known regions.

Known-template extraction must be:

```text
match → align → project ROIs → OCR/parse/crop → verify → fill
```

### 5.6 Templates must be versioned

Documents change. Vendors update invoice layouts. Passport formats change. Forms get redesigned. If the system blindly overwrites templates, it corrupts learning.

The app must distinguish:

- same template
- same family, new version
- unknown template

### 5.7 The UI is part of the intelligence

The correction UI is not merely a front-end. It is how the system receives high-quality human evidence.

The UI must make it easy to:

- see source crops
- correct wrong labels
- adjust crops
- change field types
- fix tables
- resolve conflicts
- save/update/version templates

A bad correction UI creates bad templates.

---

## 6. Target product behavior

### 6.1 Unknown document

When no matching template exists, the system should:

1. normalize the page
2. extract evidence from text, visual objects, tables, codes, and special zones
3. generate tentative field/asset/table hypotheses
4. verify each hypothesis
5. generate an editable form
6. mark uncertain fields clearly
7. let the user correct
8. save a new TemplateGraph if the user chooses

The user should feel:

> “The system understood enough to help me, but it did not lie about uncertainty.”

### 6.2 Known document

When a strong template match exists, the system should:

1. align the new page to the template
2. project saved field and asset regions
3. run ROI-first OCR and parsing
4. extract expected visual assets
5. validate values
6. flag only mismatches or low-confidence fields
7. fill the form quickly

The user should feel:

> “I corrected this once. Now it works fast.”

### 6.3 Changed layout

When a document is similar but not identical, the system should:

1. detect partial match
2. avoid overwriting old template
3. create a new template version if appropriate
4. request targeted correction
5. preserve both old and new template versions

The user should feel:

> “The app noticed the layout changed and did not break my old template.”

### 6.4 Bad scan

When scan quality is poor, the system should:

- request rescan if extraction would be unsafe
- mark low-confidence fields if partial extraction is possible
- show quality reasons such as blur, glare, missing corner, low resolution, or crop issue

The user should feel:

> “The app is careful, not reckless.”

---

## 7. What makes the product innovative

The innovation is not merely combining OCR and vision. That already exists.

The innovation is the product architecture:

```text
local evidence graph
+ verifier-driven trust
+ correction-driven TemplateGraph memory
+ ROI-first repeated extraction
+ visual asset extraction
+ no-cloud execution
```

Most OCR products produce text.  
Most IDP tools produce fields.  
This engine produces an inspectable graph of evidence and learns reusable local templates from corrections.

The product is especially differentiated because it treats visual assets as first-class citizens. A photo, signature, stamp, seal, logo, emblem, QR code, MRZ block, and table are not attachments to OCR. They are structured nodes in the graph.

---

## 8. Product positioning

Preferred positioning:

> **Local evidence-backed document-to-form engine**

Alternative positioning:

> **Edge document perception engine**

Avoid positioning:

- OCR app
- scanner app
- AI form filler
- chatbot for documents
- universal no-review extractor

Public-facing description:

> Edge DocGraph Engine turns document images and PDFs into editable forms with linked evidence. It runs locally, learns corrected templates, and fills future similar documents through verified ROI extraction.

Developer-facing description:

> A local DocGraph/TemplateGraph engine that coordinates OCR, document object detection, segmentation, barcode parsing, MRZ validation, table reconstruction, and user correction into an evidence-backed form generation workflow.

---

## 9. North-star experience

A user uploads a passport-like document. The app shows the page on the left and a generated form on the right. It extracts the holder photo, name, passport number, date of birth, expiry date, MRZ, signature, and emblem where visible. It marks the date ambiguous because visual date format and MRZ date need confirmation. The user corrects the date format, adjusts the signature crop, renames “Document No” to “Passport Number,” and saves a template.

The next day, the user uploads another passport of the same format. The app matches the template, aligns the page, extracts the same fields, verifies MRZ checksum, extracts photo and signature, and fills the form in seconds. Only one field is marked for review because glare partially covers it.

That is the product.

---

## 10. The emotional target

The user should feel:

- safe because data stays local
- confident because evidence is visible
- in control because corrections are easy
- impressed because the system learns after correction
- protected because uncertain fields are flagged
- productive because repeated documents become fast

The user should not feel:

- confused about where data came from
- forced to trust a black box
- anxious about cloud upload
- frustrated by repeated corrections
- misled by fake confidence
- trapped by broken templates

---

## 11. Product boundaries

The product is not a fraud detector. It may flag conflicts and quality issues, but it should not claim legal authenticity verification.

The product is not a biometric identity system. It may verify that a portrait crop contains a face, but it should not identify the person or compare faces in v1.

The product is not a universal legal/financial expert. It extracts and validates evidence-backed fields but does not provide legal, tax, medical, or financial advice.

The product is not a cloud service. Cloud processing is outside the core promise.

---

## 12. Long-term vision

Long-term, the engine can become a full local document automation platform:

- reusable template packs
- custom validators
- plugin document types
- local template marketplace
- encrypted template sharing
- redaction workflows
- dataset export with user consent
- desktop quality pack
- mobile capture mode
- enterprise offline deployments
- domain-specific form packs

But these must not compromise the core:

```text
local-first
evidence-backed
correction-driven
template-learned
verifier-controlled
```

---

## 13. Final vision statement

Build a product that sees documents as structured visual evidence, not text. Let users correct once and benefit repeatedly. Keep sensitive data local. Make every field explainable. Make uncertainty visible. Make templates learnable. Make repeated extraction fast. Never silently lie.
