# Requirements — Edge DocGraph Engine

**Purpose:** Define functional, non-functional, privacy, performance, reliability, and implementation requirements.  
**Priority levels:**  
- **P0:** Non-negotiable for the core product  
- **P1:** Required for strong v1  
- **P2:** Important after v1  
- **P3:** Future/optional

---

## 1. Product requirements overview

The product must let a user upload document images and PDFs, convert them into evidence-backed editable forms, allow correction, save corrected TemplateGraphs, and process future similar documents quickly using local-only inference and verification.

The system must not be judged by OCR alone. It must be judged by extraction trust, evidence quality, correction quality, template learning, repeated extraction speed, and silent-error prevention.

---

## 2. Input requirements

| ID | Requirement | Priority |
|---|---|---|
| IN-001 | Support image upload: PNG, JPEG, WebP. | P0 |
| IN-002 | Support PDF upload. | P0 |
| IN-003 | Support multi-page documents. | P1 |
| IN-004 | Detect unsupported/corrupt files and show clear errors. | P0 |
| IN-005 | Process files locally without server upload. | P0 |
| IN-006 | Preserve original file metadata when useful. | P1 |
| IN-007 | Support drag-and-drop and file picker. | P1 |
| IN-008 | Avoid loading entire huge documents into memory when not needed. | P1 |

---

## 3. PDF requirements

| ID | Requirement | Priority |
|---|---|---|
| PDF-001 | Render PDF pages locally. | P0 |
| PDF-002 | Extract embedded text where available. | P0 |
| PDF-003 | Store embedded text with coordinates when available. | P1 |
| PDF-004 | Distinguish digital PDF from scanned PDF where possible. | P1 |
| PDF-005 | Treat image-only PDFs as scanned documents. | P0 |
| PDF-006 | Keep PDFium WASM as a quality rendering trial. | P2 |
| PDF-007 | Support page-by-page processing to avoid memory spikes. | P1 |

---

## 4. Page normalization requirements

| ID | Requirement | Priority |
|---|---|---|
| PN-001 | Detect document/page boundary. | P0 |
| PN-002 | Correct perspective for photographed pages. | P0 |
| PN-003 | Deskew pages. | P0 |
| PN-004 | Normalize orientation. | P0 |
| PN-005 | Detect blur. | P0 |
| PN-006 | Detect glare/overexposure where possible. | P1 |
| PN-007 | Detect low resolution. | P0 |
| PN-008 | Detect missing corners or incomplete crop. | P1 |
| PN-009 | Create canonical coordinate system. | P0 |
| PN-010 | Store original pixel and normalized coordinates. | P0 |
| PN-011 | Store transformation metadata. | P0 |
| PN-012 | Add PP-LCNet orientation classifier trial. | P2 |

---

## 5. Evidence extraction requirements

| ID | Requirement | Priority |
|---|---|---|
| EX-001 | Every extraction module must output evidence records. | P0 |
| EX-002 | Evidence records must include page ID and coordinates where applicable. | P0 |
| EX-003 | Evidence records must include source module and model/parser version. | P0 |
| EX-004 | Evidence records must include confidence when available. | P0 |
| EX-005 | Evidence records must support provenance links. | P0 |
| EX-006 | No module may write directly to final form without DocGraph. | P0 |

---

## 6. Detector requirements

| ID | Requirement | Priority |
|---|---|---|
| DET-001 | Use YOLOv11n custom-trained as primary detector. | P0 |
| DET-002 | Detector must output normalized boxes. | P0 |
| DET-003 | Detector must include confidence scores. | P0 |
| DET-004 | Detector must preserve model version in evidence. | P0 |
| DET-005 | Initial classes must include photo, signature, stamp, seal, logo, QR, barcode, MRZ, table, checkbox, text block, document page. | P0 |
| DET-006 | Detector must be fine-tuned on document-specific objects. | P0 |
| DET-007 | Public DocLayNet YOLO models may be used only for trial/bootstrapping, not final. | P1 |
| DET-008 | Detector must not be treated as final truth. | P0 |

---

## 7. OCR requirements

| ID | Requirement | Priority |
|---|---|---|
| OCR-001 | Use PP-OCRv5 mobile ONNX as core OCR model family. | P0 |
| OCR-002 | OCR must return text with coordinates. | P0 |
| OCR-003 | OCR must return confidence. | P0 |
| OCR-004 | Support full-page OCR for unknown document context. | P1 |
| OCR-005 | Support ROI-first OCR for known templates. | P0 |
| OCR-006 | Support high-resolution ROI OCR. | P0 |
| OCR-007 | Support MRZ-specific OCR mode or post-processing. | P1 |
| OCR-008 | Support table-cell OCR. | P1 |
| OCR-009 | OCR evidence must include source mode. | P0 |
| OCR-010 | Plain text without geometry is invalid as primary evidence. | P0 |

---

## 8. Visual asset requirements

| ID | Requirement | Priority |
|---|---|---|
| VA-001 | Detect and extract photos. | P0 |
| VA-002 | Detect and extract signatures. | P0 |
| VA-003 | Detect and extract stamps. | P1 |
| VA-004 | Detect and extract seals. | P1 |
| VA-005 | Detect and extract logos. | P0 |
| VA-006 | Detect and extract emblems/flags/symbols as expanded classes. | P2 |
| VA-007 | Store crop ID for each asset. | P0 |
| VA-008 | Store coordinates for each asset. | P0 |
| VA-009 | Store mask ID when segmentation is used. | P1 |
| VA-010 | Allow user crop correction. | P0 |
| VA-011 | Use segmentation conditionally, not always-on full page. | P0 |

---

## 9. Segmentation requirements

| ID | Requirement | Priority |
|---|---|---|
| SEG-001 | Test YOLOv11n-seg for known asset masks. | P1 |
| SEG-002 | Keep EfficientSAM in experiment bucket. | P2 |
| SEG-003 | Keep SlimSAM-77 in experiment bucket. | P2 |
| SEG-004 | Reject full-page SAM as default. | P0 |
| SEG-005 | Segmentation must be triggered by asset boxes or user action. | P0 |
| SEG-006 | Mask output must map back to page coordinates. | P0 |

---

## 10. Barcode / QR requirements

| ID | Requirement | Priority |
|---|---|---|
| CODE-001 | Use zxing-wasm / ZXing-C++ WASM. | P0 |
| CODE-002 | Decode QR codes locally. | P0 |
| CODE-003 | Decode common barcodes locally. | P1 |
| CODE-004 | Decode PDF417 where possible. | P1 |
| CODE-005 | Store decoded payload as evidence. | P0 |
| CODE-006 | Link decoded payload to visual code region. | P0 |
| CODE-007 | Cross-check payload with printed fields when possible. | P1 |
| CODE-008 | Do not depend on native BarcodeDetector. | P0 |

---

## 11. MRZ requirements

| ID | Requirement | Priority |
|---|---|---|
| MRZ-001 | Implement custom TypeScript MRZ parser. | P0 |
| MRZ-002 | Support TD1 format. | P1 |
| MRZ-003 | Support TD2 format. | P1 |
| MRZ-004 | Support TD3 format. | P0 |
| MRZ-005 | Normalize common OCR-B confusions. | P0 |
| MRZ-006 | Validate check digits. | P0 |
| MRZ-007 | Extract parsed fields into evidence. | P0 |
| MRZ-008 | Cross-check MRZ fields with visual fields. | P1 |
| MRZ-009 | Mark checksum failures as conflict/invalid. | P0 |

---

## 12. Table requirements

| ID | Requirement | Priority |
|---|---|---|
| TAB-001 | Detect table regions. | P0 |
| TAB-002 | Reconstruct bordered tables geometrically. | P0 |
| TAB-003 | Reconstruct borderless tables using OCR clustering where possible. | P1 |
| TAB-004 | Represent tables as graph nodes and cell nodes. | P0 |
| TAB-005 | Support user correction of rows/columns/cells. | P1 |
| TAB-006 | Validate totals where possible. | P1 |
| TAB-007 | Keep SLANet_plus in table model trial bucket. | P2 |
| TAB-008 | Reject Table Transformer as default runtime model. | P0 |

---

## 13. DocGraph requirements

| ID | Requirement | Priority |
|---|---|---|
| DG-001 | DocGraph is the source of truth. | P0 |
| DG-002 | DocGraph must store pages, nodes, edges, hypotheses, evidence, validations, provenance. | P0 |
| DG-003 | Every final field must link to evidence. | P0 |
| DG-004 | Every final asset must link to source crop/region. | P0 |
| DG-005 | Every validation result must link to target node/field. | P0 |
| DG-006 | User corrections must be represented in DocGraph. | P0 |
| DG-007 | Form renderer must read from DocGraph hypotheses. | P0 |
| DG-008 | Export must include evidence references. | P1 |

---

## 14. Field hypothesis requirements

| ID | Requirement | Priority |
|---|---|---|
| FH-001 | Generate fields from hypotheses, not raw OCR only. | P0 |
| FH-002 | Field hypothesis must include label, value, type, sources, confidence, status. | P0 |
| FH-003 | Hypotheses must support asset fields. | P0 |
| FH-004 | Hypotheses must support table fields. | P1 |
| FH-005 | Hypotheses must include evidence breakdown. | P0 |
| FH-006 | Rejected hypotheses must remain auditable. | P1 |

---

## 15. Verification requirements

| ID | Requirement | Priority |
|---|---|---|
| VER-001 | Implement local verifier. | P0 |
| VER-002 | Field statuses must include confirmed, needs_review, missing, conflict, invalid. | P0 |
| VER-003 | Confirmed fields require sufficient evidence. | P0 |
| VER-004 | Critical validator failure prevents confirmed status. | P0 |
| VER-005 | Verifier must produce explainable reasons. | P0 |
| VER-006 | Verifier must support cross-field checks. | P1 |
| VER-007 | Verifier must support template-required-field checks. | P0 |
| VER-008 | Verifier must drive UI status badges. | P0 |

---

## 16. Form UI requirements

| ID | Requirement | Priority |
|---|---|---|
| UI-001 | Show document viewer and form side-by-side. | P0 |
| UI-002 | Show overlays for selected evidence. | P0 |
| UI-003 | Show confidence/status badges. | P0 |
| UI-004 | Allow field label correction. | P0 |
| UI-005 | Allow field value correction. | P0 |
| UI-006 | Allow field type correction. | P0 |
| UI-007 | Allow crop correction. | P0 |
| UI-008 | Allow table correction. | P1 |
| UI-009 | Show evidence viewer for each field. | P0 |
| UI-010 | Support save/update/version template decisions. | P0 |
| UI-011 | Use accessible color and text status, not color alone. | P1 |

---

## 17. TemplateGraph requirements

| ID | Requirement | Priority |
|---|---|---|
| TG-001 | Save corrected documents as TemplateGraphs. | P0 |
| TG-002 | Store normalized field regions. | P0 |
| TG-003 | Store normalized asset regions. | P0 |
| TG-004 | Store text anchors. | P0 |
| TG-005 | Store visual anchors. | P1 |
| TG-006 | Store geometry anchors. | P0 |
| TG-007 | Store keypoint anchors when available. | P2 |
| TG-008 | Store aliases and validators. | P0 |
| TG-009 | Store table schemas. | P1 |
| TG-010 | Support template family and versioning. | P0 |
| TG-011 | Prevent accidental template overwrite on layout drift. | P0 |

---

## 18. Known-template extraction requirements

| ID | Requirement | Priority |
|---|---|---|
| KT-001 | Retrieve candidate templates. | P0 |
| KT-002 | Score templates using multiple signals. | P0 |
| KT-003 | Align page to selected template. | P0 |
| KT-004 | Project saved ROIs. | P0 |
| KT-005 | Apply local correction using anchors. | P1 |
| KT-006 | Run ROI-first OCR/parsing. | P0 |
| KT-007 | Verify all required fields. | P0 |
| KT-008 | Create version when drift is detected. | P0 |
| KT-009 | Fall back to unknown pipeline when match fails. | P0 |

---

## 19. Storage requirements

| ID | Requirement | Priority |
|---|---|---|
| ST-001 | Store structured metadata in IndexedDB. | P0 |
| ST-002 | Store large binaries in OPFS where available. | P1 |
| ST-003 | Separate model cache from user data. | P0 |
| ST-004 | Support document deletion. | P0 |
| ST-005 | Support template deletion. | P0 |
| ST-006 | Support template import/export. | P2 |
| ST-007 | Support schema version migration. | P1 |

---

## 20. Security and privacy requirements

| ID | Requirement | Priority |
|---|---|---|
| SEC-001 | No document data sent to cloud by default. | P0 |
| SEC-002 | No extraction telemetry by default. | P0 |
| SEC-003 | Encrypt sensitive local records where feasible. | P0 |
| SEC-004 | Use WebCrypto AES-GCM for encryption. | P1 |
| SEC-005 | Avoid logging raw OCR text by default. | P0 |
| SEC-006 | Warn before exporting sensitive evidence packages. | P0 |
| SEC-007 | Apply strict CSP in production. | P1 |
| SEC-008 | Support local data clearing. | P0 |

---

## 21. Performance requirements

| ID | Requirement | Priority |
|---|---|---|
| PERF-001 | Heavy work must run off main thread. | P0 |
| PERF-002 | Known-template extraction must be faster than unknown extraction. | P0 |
| PERF-003 | Models must be lazy-loaded. | P0 |
| PERF-004 | Model files should be cached locally. | P1 |
| PERF-005 | Full-page segmentation must not run by default. | P0 |
| PERF-006 | OCR recognition crops should be batched. | P1 |
| PERF-007 | Model sessions/tensors must be disposed when no longer needed. | P0 |
| PERF-008 | UI must remain responsive during processing. | P0 |

---

## 22. Testing requirements

| ID | Requirement | Priority |
|---|---|---|
| TEST-001 | Unit tests for schemas and parsers. | P0 |
| TEST-002 | Unit tests for MRZ check digits. | P0 |
| TEST-003 | Unit tests for validators. | P0 |
| TEST-004 | Integration tests for unknown document pipeline. | P1 |
| TEST-005 | Integration tests for known-template pipeline. | P1 |
| TEST-006 | Regression tests for saved templates. | P1 |
| TEST-007 | Benchmark silent critical error rate. | P0 |
| TEST-008 | Benchmark field F1 and exact match. | P1 |
| TEST-009 | Benchmark crop/mask IoU. | P1 |
| TEST-010 | Benchmark latency and memory across device classes. | P1 |

---

## 23. Acceptance criteria for v1

v1 is acceptable only if:

1. local image/PDF upload works,
2. pages normalize with coordinates,
3. OCR produces text nodes,
4. detector produces object nodes,
5. visual assets can be cropped,
6. barcodes/QR can be decoded,
7. MRZ can be parsed and validated,
8. tables can be represented,
9. DocGraph is generated,
10. form is generated from hypotheses,
11. user can correct fields and crops,
12. TemplateGraph can be saved,
13. known-template ROI extraction works,
14. verifier statuses are visible,
15. all sensitive processing remains local,
16. silent wrong confirmed fields are aggressively prevented.

---

## 24. Requirement conflict policy

When requirements conflict, prioritize in this order:

1. privacy/local-only
2. silent-error prevention
3. evidence/provenance
4. correctness
5. user correction ability
6. template safety
7. performance
8. convenience
9. visual polish

Speed must never justify silent wrong answers.
