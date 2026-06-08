# Heavy Model Research Bucket — Edge DocGraph Engine

**Purpose:** Define how LayoutLM, LayoutXLM, Donut, GLM-OCR, DeepSeek-OCR, Docling, document VLMs, and other heavy document AI systems are treated in this project.

---

## 1. Research bucket status

Heavy document AI models are **not** production runtime core for v1.

They may be used for:

- offline benchmarking
- teacher labels
- comparison
- research notes
- future optional desktop quality packs
- schema ideas
- layout understanding references

They must not replace the local DocGraph architecture.

---

## 2. Why heavy models are not core

The product requires:

- local-only processing
- weak-device feasibility
- exact text
- coordinates
- visual asset crops
- mask/crop provenance
- ROI-first known-template extraction
- no silent hallucination
- predictable latency
- local template learning

Heavy document VLMs and foundation models often struggle with at least one of:

- size
- memory
- latency
- browser runtime
- deterministic output
- exact coordinates
- hallucination risk
- integration complexity

Therefore they are research/teacher candidates.

---

## 3. Candidate categories

### 3.1 LayoutLM / LayoutXLM family

Strengths:

- document layout + text reasoning
- token + box modeling
- useful for forms and structured docs

Limitations for v1:

- requires OCR tokens as input
- not designed for visual asset extraction
- not ideal for browser runtime
- does not solve crops/masks/assets
- not the simplest path for edge

Status:

- research-only

---

### 3.2 Donut-style OCR-free document models

Strengths:

- can parse documents end-to-end
- useful for structured extraction research

Limitations:

- generative output risk
- may hallucinate fields
- coordinate evidence weaker
- heavy for edge/browser
- less aligned with evidence graph

Status:

- research-only

---

### 3.3 GLM-OCR / DeepSeek-OCR / OCR-VLMs

Strengths:

- strong document parsing ability
- good for complex layout benchmarks
- useful as offline teacher/reference

Limitations:

- too heavy for default weak-edge runtime
- not ideal for deterministic field/crop evidence
- generative output variability
- more difficult to integrate as precise evidence producer

Status:

- research-only / possible desktop quality pack later

---

### 3.4 Docling and similar frameworks

Strengths:

- good reference for document conversion architecture
- useful for comparing layout/table extraction
- useful offline tooling

Limitations:

- not our browser-edge runtime core
- does not replace custom DocGraph/TemplateGraph/verifier
- may rely on Python/server-like workflows

Status:

- reference and research, not production core

---

### 3.5 PaddleOCR-VL and similar document VLMs

Strengths:

- strong document parsing
- useful comparison/teacher
- may support tables/formulas/charts

Limitations:

- heavier than PP-OCRv5
- not needed for exact ROI OCR
- not first choice for weak edge runtime
- could be future desktop quality mode

Status:

- teacher/benchmark/research bucket

---

## 4. When a heavy model may be used

A heavy model may be used only if it is clearly scoped.

Allowed uses:

### 4.1 Offline teacher labeling

Use heavy model to suggest labels on synthetic or non-sensitive benchmark documents, then review manually.

### 4.2 Benchmark comparison

Compare our pipeline against heavy model on:

- field extraction
- table extraction
- layout parsing
- hallucination rate
- runtime

### 4.3 Future desktop quality pack

A local Tauri desktop mode may optionally run heavier models on capable machines, but this must not be required for core extraction.

### 4.4 Research idea extraction

Use models/frameworks to inspire schema, table handling, or layout logic.

---

## 5. When heavy models are not allowed

Heavy models must not:

- process user documents in cloud
- become mandatory runtime dependency
- bypass DocGraph
- generate final fields without evidence
- replace verifier
- overwrite user corrections
- replace TemplateGraph learning
- confirm critical fields without validation

---

## 6. Evaluation criteria

If a heavy model is tested, evaluate:

- local runtime feasibility
- model size
- memory peak
- latency
- exact field accuracy
- hallucination rate
- coordinate availability
- visual asset extraction ability
- crop/mask support
- table structure quality
- integration complexity
- silent critical error rate

---

## 7. Research questions

Heavy model research should answer:

1. Can it improve unknown-document field discovery?
2. Can it suggest better labels for ambiguous fields?
3. Can it help generate synthetic training data?
4. Can it improve table structure extraction?
5. Can it run locally in Tauri on moderate hardware?
6. Can its output be converted into evidence records?
7. Does it reduce or increase silent error risk?
8. Does it provide coordinates or just text?
9. Does it help enough to justify runtime cost?

---

## 8. Possible future architecture

A future optional quality pack could use:

```text
standard edge path:
  YOLO + PP-OCRv5 + parsers + DocGraph

optional heavy local quality path:
  document VLM suggests additional hypotheses
  → DocGraph stores as low/medium-trust evidence
  → verifier validates before use
```

Even then, the heavy model remains evidence producer, not truth engine.

---

## 9. Why not start here

Starting with a heavy VLM would make the system impressive in demos but fragile in product:

- hard to run everywhere
- harder to debug
- harder to prove correctness
- more likely to hallucinate
- less compatible with template ROI flow
- slower iteration on core UI/templates/verifier

The product moat is not a giant model. It is the evidence graph + correction-driven template engine.

---

## 10. Final heavy model policy

Heavy document AI models are valuable research tools, but they are not the v1 runtime core. Keep them in the research bucket until they prove local runtime, coordinate/evidence compatibility, acceptable performance, and reduced silent-error risk.
