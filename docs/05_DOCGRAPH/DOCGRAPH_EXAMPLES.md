# DocGraph Examples — Edge DocGraph Engine

**Purpose:** Provide concrete example graphs for passport/ID, invoice/receipt, and generic form documents.

---

## 1. Example principles

These examples are simplified but structurally accurate.

They show:

- pages
- evidence
- nodes
- edges
- hypotheses
- validations
- provenance
- statuses

Production graphs will contain more evidence and metadata.

---

## 2. Example 1 — Passport / ID page

### 2.1 Scenario

A passport-like page contains:

- portrait photo
- name
- passport number
- date of birth
- expiry date
- MRZ zone
- logo/emblem

The system extracts OCR, photo, MRZ, and validates MRZ against visual fields.

---

### 2.2 Simplified graph

```json
{
  "id": "graph_passport_001",
  "documentId": "doc_passport_001",
  "schemaVersion": "1.0.0",
  "metadata": {
    "documentName": "passport_sample.png",
    "sourceFileType": "image",
    "pageCount": 1,
    "processingMode": "unknown_document",
    "runtime": {
      "appVersion": "0.1.0",
      "executionProvider": "webgpu"
    }
  },
  "pages": [
    {
      "id": "page_1",
      "type": "page",
      "documentId": "doc_passport_001",
      "pageIndex": 0,
      "original": {
        "widthPx": 1600,
        "heightPx": 1000,
        "imageId": "img_original_1"
      },
      "normalized": {
        "widthPx": 1600,
        "heightPx": 1000,
        "canonicalWidth": 1000,
        "canonicalHeight": 625,
        "imageId": "img_norm_1"
      },
      "transforms": [],
      "quality": {
        "safeToExtract": true,
        "warnings": []
      },
      "evidenceIds": []
    }
  ],
  "evidence": [
    {
      "id": "ev_det_photo",
      "documentId": "doc_passport_001",
      "pageId": "page_1",
      "source": "detector",
      "kind": "object_detection",
      "boxNorm": [0.08, 0.25, 0.28, 0.62],
      "confidence": 0.96,
      "payload": {
        "className": "photo",
        "modelName": "yolov11n-doc",
        "modelVersion": "0.1.0"
      },
      "provenance": [],
      "createdAt": 1000
    },
    {
      "id": "ev_ocr_name_label",
      "documentId": "doc_passport_001",
      "pageId": "page_1",
      "source": "ocr",
      "kind": "text",
      "boxNorm": [0.34, 0.24, 0.45, 0.27],
      "confidence": 0.94,
      "payload": {
        "text": "Name",
        "mode": "full_page",
        "modelName": "pp-ocrv5-mobile",
        "modelVersion": "0.1.0"
      },
      "provenance": [],
      "createdAt": 1001
    },
    {
      "id": "ev_ocr_name_value",
      "documentId": "doc_passport_001",
      "pageId": "page_1",
      "source": "ocr",
      "kind": "text",
      "boxNorm": [0.47, 0.24, 0.75, 0.27],
      "confidence": 0.92,
      "payload": {
        "text": "JOHN DOE",
        "mode": "full_page",
        "modelName": "pp-ocrv5-mobile",
        "modelVersion": "0.1.0"
      },
      "provenance": [],
      "createdAt": 1001
    },
    {
      "id": "ev_mrz",
      "documentId": "doc_passport_001",
      "pageId": "page_1",
      "source": "mrz_parser",
      "kind": "mrz_parse",
      "boxNorm": [0.08, 0.78, 0.92, 0.90],
      "confidence": 0.98,
      "payload": {
        "rawLines": [
          "P<UTO DOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<",
          "A1234567<0UTO9902012M3001019<<<<<<<<<<<<<<06"
        ],
        "normalizedLines": [
          "P<UTODOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<",
          "A1234567<0UTO9902012M3001019<<<<<<<<<<<<<<06"
        ],
        "format": "TD3",
        "parsed": {
          "documentNumber": "A1234567",
          "surname": "DOE",
          "givenNames": "JOHN",
          "dateOfBirth": "1999-02-01",
          "expiryDate": "2030-01-01"
        },
        "checkDigits": {
          "documentNumber": true,
          "dateOfBirth": true,
          "expiryDate": true
        },
        "status": "valid"
      },
      "provenance": [],
      "createdAt": 1002
    }
  ],
  "nodes": [
    {
      "id": "asset_photo",
      "type": "visual_asset",
      "documentId": "doc_passport_001",
      "pageId": "page_1",
      "boxNorm": [0.08, 0.25, 0.28, 0.62],
      "evidenceIds": ["ev_det_photo"],
      "confidence": 0.96,
      "status": "confirmed",
      "metadata": {
        "assetType": "photo",
        "rawCropId": "crop_photo_1"
      },
      "createdAt": 1003
    },
    {
      "id": "text_name_label",
      "type": "text_line",
      "documentId": "doc_passport_001",
      "pageId": "page_1",
      "boxNorm": [0.34, 0.24, 0.45, 0.27],
      "evidenceIds": ["ev_ocr_name_label"],
      "confidence": 0.94,
      "metadata": {
        "text": "Name"
      },
      "createdAt": 1003
    },
    {
      "id": "text_name_value",
      "type": "text_line",
      "documentId": "doc_passport_001",
      "pageId": "page_1",
      "boxNorm": [0.47, 0.24, 0.75, 0.27],
      "evidenceIds": ["ev_ocr_name_value"],
      "confidence": 0.92,
      "metadata": {
        "text": "JOHN DOE"
      },
      "createdAt": 1003
    },
    {
      "id": "mrz_node",
      "type": "mrz",
      "documentId": "doc_passport_001",
      "pageId": "page_1",
      "boxNorm": [0.08, 0.78, 0.92, 0.90],
      "evidenceIds": ["ev_mrz"],
      "confidence": 0.98,
      "status": "confirmed",
      "metadata": {
        "format": "TD3",
        "mrzStatus": "valid"
      },
      "createdAt": 1003
    }
  ],
  "edges": [
    {
      "id": "edge_name_label",
      "type": "label_of",
      "from": "text_name_label",
      "to": "text_name_value",
      "confidence": 0.88,
      "evidenceIds": ["ev_ocr_name_label", "ev_ocr_name_value"],
      "createdAt": 1004
    }
  ],
  "hypotheses": [
    {
      "id": "hyp_name",
      "documentId": "doc_passport_001",
      "pageId": "page_1",
      "label": "Name",
      "canonicalLabel": "Full Name",
      "value": "JOHN DOE",
      "valueType": "name",
      "labelNodeIds": ["text_name_label"],
      "valueNodeIds": ["text_name_value"],
      "assetNodeIds": [],
      "tableNodeIds": [],
      "confidence": {
        "overall": 0.91,
        "components": {
          "ocr": 0.92,
          "geometry": 0.88,
          "parser": 0.95
        },
        "reasons": [
          "nearby label-value geometry",
          "MRZ parsed name is consistent"
        ]
      },
      "status": "confirmed",
      "evidenceIds": ["ev_ocr_name_label", "ev_ocr_name_value", "ev_mrz"],
      "validationIds": ["val_name_mrz_match"],
      "source": "hybrid",
      "reasons": ["Visual name matches MRZ name"],
      "createdAt": 1005
    },
    {
      "id": "hyp_photo",
      "documentId": "doc_passport_001",
      "pageId": "page_1",
      "label": "Portrait Photo",
      "value": "asset_photo",
      "valueType": "photo",
      "labelNodeIds": [],
      "valueNodeIds": [],
      "assetNodeIds": ["asset_photo"],
      "tableNodeIds": [],
      "confidence": {
        "overall": 0.94,
        "components": {
          "detector": 0.96,
          "validator": 0.92
        },
        "reasons": [
          "photo detected",
          "face present in crop"
        ]
      },
      "status": "confirmed",
      "evidenceIds": ["ev_det_photo"],
      "validationIds": ["val_face_present"],
      "source": "visual_asset",
      "reasons": ["Portrait crop detected and face presence validator passed"],
      "createdAt": 1005
    }
  ],
  "validations": [
    {
      "id": "val_name_mrz_match",
      "documentId": "doc_passport_001",
      "targetId": "hyp_name",
      "validatorId": "mrz_visual_name_match",
      "status": "pass",
      "severity": "medium",
      "message": "Visual name is consistent with MRZ parsed name.",
      "evidenceIds": ["ev_ocr_name_value", "ev_mrz"],
      "createdAt": 1006
    },
    {
      "id": "val_face_present",
      "documentId": "doc_passport_001",
      "targetId": "asset_photo",
      "validatorId": "portrait_face_present",
      "status": "pass",
      "severity": "medium",
      "message": "Face detected in portrait crop.",
      "evidenceIds": ["ev_det_photo"],
      "createdAt": 1006
    }
  ],
  "provenance": [],
  "quality": {
    "pageQuality": {},
    "warnings": [],
    "safeToAutoConfirm": true
  },
  "createdAt": 1000,
  "updatedAt": 1006
}
```

---

## 3. Example 2 — Invoice / receipt

### 3.1 Scenario

An invoice has:

- vendor logo
- invoice number
- date
- line item table
- subtotal
- tax
- total
- QR code

Important graph behavior:

- table confirms total
- QR may confirm invoice number or tax ID
- total may be conflict if arithmetic fails

---

### 3.2 Key hypotheses

```json
[
  {
    "id": "hyp_invoice_no",
    "label": "Invoice Number",
    "value": "INV-10045",
    "valueType": "id_number",
    "status": "confirmed",
    "evidenceIds": ["ev_ocr_invoice_label", "ev_ocr_invoice_value"],
    "validationIds": ["val_invoice_no_pattern"],
    "reasons": ["label-value geometry strong", "ID pattern valid"]
  },
  {
    "id": "hyp_line_items",
    "label": "Line Items",
    "value": "table_items",
    "valueType": "table",
    "status": "needs_review",
    "evidenceIds": ["ev_table_geometry"],
    "validationIds": ["val_table_structure_warn"],
    "reasons": ["table detected", "one row has ambiguous cell assignment"]
  },
  {
    "id": "hyp_total",
    "label": "Total",
    "value": "1200.00",
    "valueType": "amount",
    "status": "confirmed",
    "evidenceIds": ["ev_ocr_total", "ev_table_geometry"],
    "validationIds": ["val_invoice_total_math"],
    "reasons": ["amount parser passed", "subtotal plus tax equals total"]
  }
]
```

---

### 3.3 Important edges

```json
[
  {
    "id": "edge_total_validated",
    "type": "validated_by",
    "from": "hyp_total",
    "to": "val_invoice_total_math",
    "evidenceIds": ["ev_table_geometry", "ev_ocr_total"],
    "createdAt": 2000
  },
  {
    "id": "edge_table_value",
    "type": "value_of",
    "from": "table_items",
    "to": "hyp_line_items",
    "evidenceIds": ["ev_table_geometry"],
    "createdAt": 2000
  },
  {
    "id": "edge_qr_confirms_invoice_no",
    "type": "confirms",
    "from": "qr_node",
    "to": "hyp_invoice_no",
    "evidenceIds": ["ev_qr_payload"],
    "createdAt": 2000
  }
]
```

---

## 4. Example 3 — Generic form

### 4.1 Scenario

A generic form contains:

- applicant name
- date
- checkbox group
- signature
- stamp
- remarks table

The system creates a review-first form and the user corrects one field.

---

### 4.2 Checkbox hypothesis

```json
{
  "id": "hyp_consent",
  "label": "Consent Given",
  "value": true,
  "valueType": "checkbox",
  "labelNodeIds": ["text_consent_label"],
  "valueNodeIds": [],
  "assetNodeIds": [],
  "tableNodeIds": [],
  "confidence": {
    "overall": 0.78,
    "components": {
      "detector": 0.82,
      "geometry": 0.75
    },
    "reasons": [
      "checkbox detected",
      "nearby label suggests consent",
      "mark inside checkbox is faint"
    ]
  },
  "status": "needs_review",
  "evidenceIds": ["ev_checkbox_det", "ev_checkbox_state"],
  "validationIds": [],
  "source": "checkbox",
  "reasons": ["Checkbox state is visually faint"],
  "createdAt": 3000
}
```

---

### 4.3 Signature asset

```json
{
  "id": "asset_signature",
  "type": "visual_asset",
  "documentId": "doc_form_001",
  "pageId": "page_1",
  "boxNorm": [0.62, 0.78, 0.88, 0.86],
  "evidenceIds": ["ev_det_signature"],
  "confidence": 0.86,
  "status": "needs_review",
  "metadata": {
    "assetType": "signature",
    "rawCropId": "crop_signature_raw"
  },
  "createdAt": 3001
}
```

---

### 4.4 User correction

The user redraws the signature crop.

```json
{
  "id": "ev_corr_signature_crop",
  "documentId": "doc_form_001",
  "pageId": "page_1",
  "source": "user_correction",
  "kind": "correction",
  "boxNorm": [0.60, 0.76, 0.90, 0.87],
  "payload": {
    "correctionKind": "asset_crop_edit",
    "targetId": "asset_signature",
    "before": [0.62, 0.78, 0.88, 0.86],
    "after": [0.60, 0.76, 0.90, 0.87]
  },
  "provenance": [],
  "createdAt": 3010
}
```

Edge:

```json
{
  "id": "edge_signature_corrected",
  "type": "corrected_by",
  "from": "asset_signature",
  "to": "corr_signature_crop_node",
  "evidenceIds": ["ev_corr_signature_crop"],
  "createdAt": 3011
}
```

---

## 5. Known-template example

After correction, the generic form is saved as TemplateGraph. A new similar form is uploaded.

DocGraph template context:

```json
{
  "templateContext": {
    "templateId": "tpl_generic_form_001",
    "familyId": "fam_generic_form",
    "version": 1,
    "matchScore": 0.93,
    "decision": "same_template",
    "projectedRoiIds": [
      "ev_tpl_roi_name",
      "ev_tpl_roi_signature",
      "ev_tpl_roi_consent"
    ],
    "alignmentTransformIds": ["transform_homography_1", "transform_local_offset_2"]
  }
}
```

Template-projected field evidence:

```json
{
  "id": "ev_tpl_roi_name",
  "documentId": "doc_form_002",
  "pageId": "page_1",
  "source": "template_projection",
  "kind": "template_roi",
  "boxNorm": [0.32, 0.21, 0.70, 0.25],
  "confidence": 0.94,
  "payload": {
    "templateId": "tpl_generic_form_001",
    "templateElementId": "field_applicant_name",
    "projectionType": "field",
    "projectionConfidence": 0.94
  },
  "provenance": [],
  "createdAt": 4000
}
```

---

## 6. Conflict example

Invoice total conflict.

```json
{
  "id": "val_total_conflict",
  "documentId": "doc_invoice_002",
  "targetId": "hyp_total",
  "validatorId": "invoice_total_math",
  "status": "fail",
  "severity": "critical",
  "message": "Printed total does not equal subtotal plus tax.",
  "details": {
    "printedTotal": "1200.00",
    "computedTotal": "1170.00"
  },
  "evidenceIds": ["ev_ocr_total", "ev_table_cells"],
  "createdAt": 5000
}
```

Hypothesis:

```json
{
  "id": "hyp_total",
  "label": "Total",
  "value": "1200.00",
  "valueType": "amount",
  "status": "conflict",
  "reasons": [
    "Amount OCR confidence high",
    "Table arithmetic disagrees with printed total"
  ],
  "validationIds": ["val_total_conflict"]
}
```

---

## 7. Missing field example

Known template expects passport number, but ROI is unreadable.

```json
{
  "id": "hyp_passport_number",
  "label": "Passport Number",
  "value": null,
  "valueType": "id_number",
  "status": "missing",
  "required": true,
  "templateFieldId": "tpl_field_passport_number",
  "reasons": [
    "Required template field was expected",
    "Projected ROI contained no readable OCR text"
  ],
  "evidenceIds": ["ev_tpl_roi_passport_number"],
  "validationIds": ["val_required_missing"]
}
```

---

## 8. Invalid MRZ example

```json
{
  "id": "hyp_mrz_document_number",
  "label": "MRZ Document Number",
  "value": "A1234567",
  "valueType": "id_number",
  "status": "invalid",
  "reasons": [
    "MRZ document number check digit failed"
  ],
  "validationIds": ["val_mrz_doc_number_fail"]
}
```

---

## 9. Final example lesson

A DocGraph is not just extracted text. It is a traceable model of what the document contains, what evidence supports it, what conflicts exist, what the user corrected, and what the system should learn for next time.
