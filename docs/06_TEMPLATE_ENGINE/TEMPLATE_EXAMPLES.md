# Template Examples — Edge DocGraph Engine

**Purpose:** Provide concrete TemplateGraph examples for passport, invoice, and generic form templates.

---

## 1. Example principles

These examples are simplified but show the intended structure.

They demonstrate:

- anchors
- fields
- assets
- tables
- codes/MRZ
- validators
- relationships
- versioning

---

## 2. Passport template example

### 2.1 Description

A passport-like document with:

- title text anchor
- portrait photo
- passport number
- name
- date of birth
- expiry date
- MRZ zone
- emblem/logo

### 2.2 TemplateGraph

```json
{
  "id": "tpl_passport_td3_v1",
  "familyId": "fam_passport_td3",
  "version": 1,
  "schemaVersion": "1.0.0",
  "name": "Generic TD3 Passport",
  "docType": "passport",
  "pageCount": 1,
  "canonicalPages": [
    {
      "id": "tpl_page_1",
      "pageIndex": 0,
      "canonicalWidth": 1000,
      "canonicalHeight": 625,
      "aspectRatio": 1.6,
      "pageRole": "main"
    }
  ],
  "fingerprint": {
    "textSignature": {
      "stableTokens": ["PASSPORT", "Surname", "Given Names", "Date of Birth"],
      "tokenHashes": []
    },
    "layoutSignature": {
      "textBlockHistogram": [0.1, 0.2, 0.3],
      "objectClassHistogram": {
        "photo": 1,
        "mrz_zone": 1,
        "logo": 1
      },
      "regionDistribution": [0.2, 0.5, 0.8]
    },
    "specialZones": {
      "hasMRZ": true,
      "hasQRCode": false,
      "hasBarcode": false,
      "hasPhoto": true,
      "hasTable": false,
      "hasCheckboxes": false
    },
    "pageGeometry": {
      "aspectRatio": 1.6,
      "pageCount": 1
    }
  },
  "anchors": [
    {
      "id": "anc_passport_title",
      "pageIndex": 0,
      "type": "text",
      "value": "PASSPORT",
      "boxNorm": [0.36, 0.05, 0.64, 0.09],
      "importance": 0.95,
      "stability": 0.95,
      "requiredForMatch": true,
      "createdFromNodeIds": [],
      "createdFromEvidenceIds": []
    },
    {
      "id": "anc_photo_region",
      "pageIndex": 0,
      "type": "special_zone",
      "label": "Portrait Photo Region",
      "boxNorm": [0.08, 0.25, 0.28, 0.62],
      "importance": 0.85,
      "stability": 0.9,
      "requiredForMatch": false,
      "createdFromNodeIds": [],
      "createdFromEvidenceIds": []
    },
    {
      "id": "anc_mrz_zone",
      "pageIndex": 0,
      "type": "special_zone",
      "label": "MRZ Zone",
      "boxNorm": [0.08, 0.78, 0.92, 0.90],
      "importance": 0.98,
      "stability": 0.95,
      "requiredForMatch": true,
      "createdFromNodeIds": [],
      "createdFromEvidenceIds": []
    }
  ],
  "fields": [
    {
      "id": "field_passport_number",
      "pageIndex": 0,
      "label": "Passport Number",
      "aliases": ["Passport No", "Document No", "P No"],
      "valueType": "id_number",
      "labelBoxNorm": [0.56, 0.20, 0.70, 0.23],
      "valueBoxNorm": [0.70, 0.20, 0.88, 0.24],
      "required": true,
      "extraction": {
        "preferredMode": "roi_ocr",
        "roiExpansion": 0.1,
        "ocrMode": "roi"
      },
      "validators": ["val_required_passport_number", "val_passport_number_pattern"],
      "relationships": ["rel_mrz_confirms_passport_number"],
      "anchorIds": ["anc_passport_title", "anc_mrz_zone"],
      "createdFromCorrectionIds": []
    },
    {
      "id": "field_date_of_birth",
      "pageIndex": 0,
      "label": "Date of Birth",
      "aliases": ["DOB", "Birth Date", "D.O.B"],
      "valueType": "date",
      "labelBoxNorm": [0.32, 0.42, 0.48, 0.45],
      "valueBoxNorm": [0.50, 0.42, 0.66, 0.46],
      "required": true,
      "extraction": {
        "preferredMode": "roi_ocr",
        "roiExpansion": 0.08,
        "ocrMode": "roi"
      },
      "validators": ["val_dob_date", "val_dob_mrz_match"],
      "relationships": ["rel_mrz_confirms_dob"],
      "anchorIds": ["anc_mrz_zone"],
      "createdFromCorrectionIds": []
    }
  ],
  "assets": [
    {
      "id": "asset_portrait_photo",
      "pageIndex": 0,
      "label": "Portrait Photo",
      "assetType": "photo",
      "boxNorm": [0.08, 0.25, 0.28, 0.62],
      "required": true,
      "extraction": {
        "cropExpansion": 0.02,
        "segmentationPolicy": "optional",
        "preserveRawCrop": true
      },
      "validators": ["val_face_present"],
      "anchorIds": ["anc_photo_region"],
      "createdFromCorrectionIds": []
    }
  ],
  "mrzZones": [
    {
      "id": "mrz_td3",
      "pageIndex": 0,
      "boxNorm": [0.08, 0.78, 0.92, 0.90],
      "formatHint": "TD3",
      "required": true,
      "extraction": {
        "roiExpansion": 0.03,
        "ocrMode": "mrz",
        "normalizationProfile": "mrz_default"
      },
      "validators": ["val_mrz_checksum"],
      "crossCheckFieldIds": ["field_passport_number", "field_date_of_birth"]
    }
  ],
  "tables": [],
  "codes": [],
  "checkboxes": [],
  "sections": [
    {
      "id": "sec_identity",
      "label": "Identity Details",
      "fieldIds": ["field_passport_number", "field_date_of_birth"],
      "assetIds": ["asset_portrait_photo"],
      "tableIds": [],
      "order": 1
    }
  ],
  "aliases": {
    "Date of Birth": ["DOB", "Birth Date", "D.O.B"],
    "Passport Number": ["Passport No", "Document No", "P No"]
  },
  "validators": [
    {
      "id": "val_mrz_checksum",
      "validatorType": "mrz_checksum",
      "targetIds": ["mrz_td3"],
      "severity": "critical",
      "config": {}
    },
    {
      "id": "val_face_present",
      "validatorType": "face_present",
      "targetIds": ["asset_portrait_photo"],
      "severity": "medium",
      "config": {}
    }
  ],
  "relationships": [
    {
      "id": "rel_mrz_confirms_passport_number",
      "type": "mrz_confirms_field",
      "fromId": "mrz_td3",
      "toId": "field_passport_number"
    },
    {
      "id": "rel_mrz_confirms_dob",
      "type": "mrz_confirms_field",
      "fromId": "mrz_td3",
      "toId": "field_date_of_birth"
    }
  ],
  "matching": {
    "requiredAnchorIds": ["anc_passport_title", "anc_mrz_zone"],
    "weights": {
      "textAnchor": 0.25,
      "visualAnchor": 0.15,
      "geometry": 0.20,
      "keypoint": 0.10,
      "specialZone": 0.20,
      "requiredRegion": 0.10
    },
    "thresholds": {
      "sameTemplate": 0.88,
      "sameFamilyNewVersion": 0.60,
      "unknown": 0.45,
      "ambiguousMargin": 0.05
    }
  },
  "extraction": {
    "defaultRoiExpansion": 0.08,
    "localSearch": {
      "enabled": true,
      "maxShiftNorm": 0.03,
      "maxRetries": 2
    },
    "ocr": {
      "batchRois": true,
      "highResSmallFields": true
    },
    "segmentation": {
      "lazyLoad": true,
      "enabledAssetTypes": ["photo", "signature", "stamp", "seal"]
    }
  },
  "versioning": {
    "familyId": "fam_passport_td3",
    "version": 1,
    "versionReason": "initial",
    "compatibleWithVersions": []
  },
  "provenance": [],
  "createdAt": 1000,
  "updatedAt": 1000
}
```

---

## 3. Invoice template example

### 3.1 Description

Invoice template with:

- vendor logo
- invoice number
- date
- line item table
- subtotal/tax/total
- QR code

### 3.2 Key elements

```json
{
  "id": "tpl_vendor_invoice_v1",
  "familyId": "fam_vendor_invoice",
  "version": 1,
  "name": "Vendor Invoice v1",
  "docType": "invoice",
  "pageCount": 1,
  "anchors": [
    {
      "id": "anc_vendor_logo",
      "pageIndex": 0,
      "type": "visual",
      "label": "Vendor Logo",
      "boxNorm": [0.06, 0.04, 0.22, 0.12],
      "descriptorId": "desc_logo_1",
      "importance": 0.85,
      "stability": 0.9,
      "requiredForMatch": true,
      "createdFromNodeIds": [],
      "createdFromEvidenceIds": []
    },
    {
      "id": "anc_invoice_title",
      "pageIndex": 0,
      "type": "text",
      "value": "TAX INVOICE",
      "boxNorm": [0.40, 0.05, 0.65, 0.09],
      "importance": 0.9,
      "stability": 0.95,
      "requiredForMatch": true,
      "createdFromNodeIds": [],
      "createdFromEvidenceIds": []
    }
  ],
  "fields": [
    {
      "id": "field_invoice_number",
      "pageIndex": 0,
      "label": "Invoice Number",
      "aliases": ["Invoice No", "Inv No", "Bill No"],
      "valueType": "id_number",
      "valueBoxNorm": [0.73, 0.15, 0.92, 0.19],
      "required": true,
      "extraction": {
        "preferredMode": "roi_ocr",
        "roiExpansion": 0.08,
        "ocrMode": "roi"
      },
      "validators": ["val_invoice_number_required"],
      "relationships": ["rel_qr_confirms_invoice_number"],
      "anchorIds": ["anc_invoice_title"],
      "createdFromCorrectionIds": []
    },
    {
      "id": "field_total",
      "pageIndex": 0,
      "label": "Total",
      "aliases": ["Grand Total", "Amount Due", "Total Amount"],
      "valueType": "amount",
      "valueBoxNorm": [0.74, 0.82, 0.93, 0.86],
      "required": true,
      "extraction": {
        "preferredMode": "roi_ocr",
        "roiExpansion": 0.08,
        "ocrMode": "roi"
      },
      "validators": ["val_amount_format", "val_invoice_total_math"],
      "relationships": ["rel_table_confirms_total"],
      "anchorIds": [],
      "createdFromCorrectionIds": []
    }
  ],
  "tables": [
    {
      "id": "table_line_items",
      "pageIndex": 0,
      "label": "Line Items",
      "boxNorm": [0.06, 0.32, 0.94, 0.72],
      "required": true,
      "columns": [
        {
          "id": "col_description",
          "label": "Description",
          "aliases": ["Item", "Particulars"],
          "valueType": "text",
          "required": true,
          "validators": []
        },
        {
          "id": "col_qty",
          "label": "Quantity",
          "aliases": ["Qty"],
          "valueType": "number",
          "required": false,
          "validators": []
        },
        {
          "id": "col_amount",
          "label": "Amount",
          "aliases": ["Line Total"],
          "valueType": "amount",
          "required": true,
          "validators": ["val_amount_format"]
        }
      ],
      "headerRows": [0],
      "extraction": {
        "strategy": "schema_guided_geometry",
        "roiExpansion": 0.03,
        "allowVariableRows": true,
        "allowMergedCells": false
      },
      "validators": ["val_line_item_sum"],
      "createdFromCorrectionIds": []
    }
  ],
  "codes": [
    {
      "id": "code_invoice_qr",
      "pageIndex": 0,
      "label": "Invoice QR",
      "codeType": "qr",
      "boxNorm": [0.82, 0.04, 0.94, 0.16],
      "required": false,
      "payloadParsers": ["invoice_qr_payload"],
      "validators": ["val_qr_invoice_match"],
      "anchorIds": []
    }
  ],
  "relationships": [
    {
      "id": "rel_table_confirms_total",
      "type": "table_confirms_field",
      "fromId": "table_line_items",
      "toId": "field_total"
    },
    {
      "id": "rel_qr_confirms_invoice_number",
      "type": "code_confirms_field",
      "fromId": "code_invoice_qr",
      "toId": "field_invoice_number"
    }
  ]
}
```

---

## 4. Generic form template example

### 4.1 Description

Generic form with:

- applicant name
- DOB
- checkbox group
- signature
- stamp
- remarks table

### 4.2 Key elements

```json
{
  "id": "tpl_generic_admission_form_v1",
  "familyId": "fam_generic_admission_form",
  "version": 1,
  "name": "Admission Form v1",
  "docType": "generic_form",
  "pageCount": 1,
  "anchors": [
    {
      "id": "anc_form_title",
      "pageIndex": 0,
      "type": "text",
      "value": "APPLICATION FORM",
      "boxNorm": [0.30, 0.05, 0.70, 0.09],
      "importance": 0.9,
      "stability": 0.95,
      "requiredForMatch": true,
      "createdFromNodeIds": [],
      "createdFromEvidenceIds": []
    },
    {
      "id": "anc_checkbox_group",
      "pageIndex": 0,
      "type": "special_zone",
      "label": "Consent Checkbox Group",
      "boxNorm": [0.10, 0.52, 0.45, 0.64],
      "importance": 0.65,
      "stability": 0.8,
      "requiredForMatch": false,
      "createdFromNodeIds": [],
      "createdFromEvidenceIds": []
    }
  ],
  "fields": [
    {
      "id": "field_applicant_name",
      "pageIndex": 0,
      "label": "Applicant Name",
      "aliases": ["Name", "Full Name"],
      "valueType": "name",
      "valueBoxNorm": [0.30, 0.20, 0.82, 0.25],
      "required": true,
      "extraction": {
        "preferredMode": "roi_ocr",
        "roiExpansion": 0.10,
        "ocrMode": "roi"
      },
      "validators": ["val_required_name"],
      "relationships": [],
      "anchorIds": ["anc_form_title"],
      "createdFromCorrectionIds": []
    }
  ],
  "checkboxes": [
    {
      "id": "checkbox_consent_yes",
      "pageIndex": 0,
      "label": "Consent Yes",
      "labelBoxNorm": [0.15, 0.54, 0.28, 0.57],
      "boxNorm": [0.10, 0.54, 0.13, 0.57],
      "groupId": "group_consent",
      "required": false,
      "statePolicy": "extract",
      "validators": ["val_consent_group"]
    },
    {
      "id": "checkbox_consent_no",
      "pageIndex": 0,
      "label": "Consent No",
      "labelBoxNorm": [0.15, 0.59, 0.28, 0.62],
      "boxNorm": [0.10, 0.59, 0.13, 0.62],
      "groupId": "group_consent",
      "required": false,
      "statePolicy": "extract",
      "validators": ["val_consent_group"]
    }
  ],
  "assets": [
    {
      "id": "asset_signature",
      "pageIndex": 0,
      "label": "Applicant Signature",
      "assetType": "signature",
      "boxNorm": [0.58, 0.78, 0.88, 0.86],
      "required": false,
      "extraction": {
        "cropExpansion": 0.08,
        "segmentationPolicy": "optional",
        "preserveRawCrop": true
      },
      "validators": ["val_asset_present_optional"],
      "anchorIds": [],
      "createdFromCorrectionIds": []
    }
  ]
}
```

---

## 5. New version example

Vendor invoice v2 moves the total and adds discount.

Version metadata:

```json
{
  "id": "tpl_vendor_invoice_v2",
  "familyId": "fam_vendor_invoice",
  "version": 2,
  "versioning": {
    "familyId": "fam_vendor_invoice",
    "version": 2,
    "previousVersionId": "tpl_vendor_invoice_v1",
    "versionReason": "layout_drift",
    "compatibleWithVersions": ["tpl_vendor_invoice_v1"]
  }
}
```

New field:

```json
{
  "id": "field_discount",
  "label": "Discount",
  "valueType": "amount",
  "valueBoxNorm": [0.74, 0.76, 0.93, 0.79],
  "required": false,
  "validators": ["val_amount_format"]
}
```

Old template remains unchanged.

---

## 6. Template matching example

Match result:

```json
{
  "decision": "same_template",
  "selectedTemplateId": "tpl_vendor_invoice_v1",
  "candidates": [
    {
      "templateId": "tpl_vendor_invoice_v1",
      "familyId": "fam_vendor_invoice",
      "version": 1,
      "score": {
        "textAnchorScore": 0.94,
        "geometryScore": 0.90,
        "visualAnchorScore": 0.88,
        "keypointScore": 0.76,
        "specialZoneScore": 0.80,
        "requiredRegionScore": 0.92,
        "overall": 0.89,
        "matchedAnchorIds": ["anc_vendor_logo", "anc_invoice_title"],
        "missingRequiredAnchorIds": [],
        "reasons": ["vendor logo matched", "invoice title matched", "table region aligned"],
        "warnings": []
      }
    }
  ],
  "reasons": ["Top template passed same-template threshold"]
}
```

---

## 7. Template corruption example

Bad case:

```json
{
  "type": "text",
  "value": "JOHN DOE",
  "requiredForMatch": true
}
```

This is wrong because `JOHN DOE` is variable.

Correct:

```json
{
  "field": "Full Name",
  "valueBoxNorm": [0.47, 0.24, 0.75, 0.27],
  "valueType": "name"
}
```

The name is extracted from that region in future documents.

---

## 8. Final lesson

A good TemplateGraph is not a screenshot with rectangles. It is a structured, versioned, evidence-backed extraction plan with anchors, regions, validators, relationships, and corruption safeguards.
