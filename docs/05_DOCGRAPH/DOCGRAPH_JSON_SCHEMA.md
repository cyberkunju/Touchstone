# DocGraph JSON Schema — Edge DocGraph Engine

**Purpose:** Provide a machine-readable-style JSON schema for DocGraph serialization.  
**Note:** This file is Markdown containing the canonical schema. A `.json` version can be generated later from this source.

---

## 1. Schema design rules

1. No cyclic references.
2. Relationships use IDs.
3. Coordinates are normalized unless explicitly named `Px`.
4. Evidence is first-class.
5. Status is explicit.
6. Schema version is required.
7. Unknown/extension metadata is allowed only in controlled `metadata` or `payload`.
8. Sensitive storage encryption is handled outside JSON schema.

---

## 2. Top-level schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://edge-docgraph-engine.local/schemas/docgraph.schema.json",
  "title": "DocGraph",
  "type": "object",
  "required": [
    "id",
    "documentId",
    "schemaVersion",
    "metadata",
    "pages",
    "nodes",
    "edges",
    "evidence",
    "hypotheses",
    "validations",
    "provenance",
    "quality",
    "createdAt",
    "updatedAt"
  ],
  "properties": {
    "id": { "type": "string" },
    "documentId": { "type": "string" },
    "schemaVersion": { "type": "string" },
    "metadata": { "$ref": "#/$defs/DocGraphMetadata" },
    "pages": {
      "type": "array",
      "items": { "$ref": "#/$defs/PageNode" }
    },
    "nodes": {
      "type": "array",
      "items": { "$ref": "#/$defs/GraphNode" }
    },
    "edges": {
      "type": "array",
      "items": { "$ref": "#/$defs/GraphEdge" }
    },
    "evidence": {
      "type": "array",
      "items": { "$ref": "#/$defs/EvidenceRecord" }
    },
    "hypotheses": {
      "type": "array",
      "items": { "$ref": "#/$defs/FieldHypothesis" }
    },
    "validations": {
      "type": "array",
      "items": { "$ref": "#/$defs/ValidationResult" }
    },
    "provenance": {
      "type": "array",
      "items": { "$ref": "#/$defs/ProvenanceRecord" }
    },
    "quality": { "$ref": "#/$defs/DocumentQualitySummary" },
    "templateContext": { "$ref": "#/$defs/TemplateContext" },
    "createdAt": { "type": "number" },
    "updatedAt": { "type": "number" }
  },
  "$defs": {}
}
```

---

## 3. Shared definitions

```json
{
  "$defs": {
    "NormalizedBox": {
      "type": "array",
      "prefixItems": [
        { "type": "number", "minimum": 0, "maximum": 1 },
        { "type": "number", "minimum": 0, "maximum": 1 },
        { "type": "number", "minimum": 0, "maximum": 1 },
        { "type": "number", "minimum": 0, "maximum": 1 }
      ],
      "minItems": 4,
      "maxItems": 4
    },
    "Point": {
      "type": "array",
      "prefixItems": [
        { "type": "number" },
        { "type": "number" }
      ],
      "minItems": 2,
      "maxItems": 2
    },
    "NormalizedPolygon": {
      "type": "array",
      "items": { "$ref": "#/$defs/Point" }
    }
  }
}
```

---

## 4. Metadata schema

```json
{
  "DocGraphMetadata": {
    "type": "object",
    "required": ["sourceFileType", "pageCount", "processingMode", "runtime"],
    "properties": {
      "documentName": { "type": "string" },
      "sourceFileType": {
        "enum": ["image", "pdf", "unknown"]
      },
      "pageCount": { "type": "integer", "minimum": 1 },
      "processingMode": {
        "enum": [
          "unknown_document",
          "known_template",
          "new_template_version",
          "manual_review"
        ]
      },
      "runtime": {
        "type": "object",
        "required": ["appVersion"],
        "properties": {
          "appVersion": { "type": "string" },
          "workerVersion": { "type": "string" },
          "browser": { "type": "string" },
          "executionProvider": {
            "enum": ["webgpu", "wasm", "native", "unknown"]
          }
        }
      }
    }
  }
}
```

---

## 5. PageNode schema

```json
{
  "PageNode": {
    "type": "object",
    "required": [
      "id",
      "type",
      "documentId",
      "pageIndex",
      "original",
      "transforms",
      "quality",
      "evidenceIds"
    ],
    "properties": {
      "id": { "type": "string" },
      "type": { "const": "page" },
      "documentId": { "type": "string" },
      "pageIndex": { "type": "integer", "minimum": 0 },
      "original": {
        "type": "object",
        "required": ["widthPx", "heightPx"],
        "properties": {
          "widthPx": { "type": "number" },
          "heightPx": { "type": "number" },
          "imageId": { "type": "string" }
        }
      },
      "normalized": {
        "type": "object",
        "required": ["widthPx", "heightPx", "canonicalWidth", "canonicalHeight", "imageId"],
        "properties": {
          "widthPx": { "type": "number" },
          "heightPx": { "type": "number" },
          "canonicalWidth": { "type": "number" },
          "canonicalHeight": { "type": "number" },
          "imageId": { "type": "string" }
        }
      },
      "transforms": {
        "type": "array",
        "items": { "$ref": "#/$defs/PageTransform" }
      },
      "quality": { "$ref": "#/$defs/PageQualityReport" },
      "evidenceIds": {
        "type": "array",
        "items": { "type": "string" }
      }
    }
  }
}
```

---

## 6. GraphNode schema

```json
{
  "GraphNode": {
    "type": "object",
    "required": ["id", "type", "documentId", "evidenceIds", "createdAt"],
    "properties": {
      "id": { "type": "string" },
      "type": {
        "enum": [
          "document_boundary",
          "text_word",
          "text_line",
          "text_block",
          "field",
          "visual_asset",
          "table",
          "table_row",
          "table_column",
          "table_cell",
          "checkbox",
          "barcode",
          "qr_code",
          "mrz",
          "validation",
          "template_anchor",
          "correction",
          "quality_warning",
          "unknown_region"
        ]
      },
      "documentId": { "type": "string" },
      "pageId": { "type": "string" },
      "boxNorm": { "$ref": "#/$defs/NormalizedBox" },
      "polygonNorm": { "$ref": "#/$defs/NormalizedPolygon" },
      "evidenceIds": {
        "type": "array",
        "items": { "type": "string" }
      },
      "confidence": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "status": {
        "enum": [
          "candidate",
          "active",
          "confirmed",
          "needs_review",
          "missing",
          "conflicted",
          "invalid",
          "rejected"
        ]
      },
      "metadata": {
        "type": "object",
        "additionalProperties": true
      },
      "createdAt": { "type": "number" },
      "updatedAt": { "type": "number" }
    },
    "additionalProperties": true
  }
}
```

---

## 7. GraphEdge schema

```json
{
  "GraphEdge": {
    "type": "object",
    "required": ["id", "type", "from", "to", "evidenceIds", "createdAt"],
    "properties": {
      "id": { "type": "string" },
      "type": {
        "enum": [
          "contains",
          "near",
          "above",
          "below",
          "left_of",
          "right_of",
          "same_row",
          "same_column",
          "label_of",
          "value_of",
          "inside_table",
          "table_header_of",
          "cell_in_row",
          "cell_in_column",
          "validated_by",
          "conflicts_with",
          "confirms",
          "derived_from",
          "corrected_by",
          "template_projected_from",
          "anchor_for",
          "part_of",
          "alternative_to"
        ]
      },
      "from": { "type": "string" },
      "to": { "type": "string" },
      "confidence": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "evidenceIds": {
        "type": "array",
        "items": { "type": "string" }
      },
      "metadata": {
        "type": "object",
        "additionalProperties": true
      },
      "createdAt": { "type": "number" }
    }
  }
}
```

---

## 8. EvidenceRecord schema

```json
{
  "EvidenceRecord": {
    "type": "object",
    "required": [
      "id",
      "documentId",
      "source",
      "kind",
      "payload",
      "provenance",
      "createdAt"
    ],
    "properties": {
      "id": { "type": "string" },
      "documentId": { "type": "string" },
      "pageId": { "type": "string" },
      "source": {
        "enum": [
          "pdf_embedded_text",
          "page_quality",
          "detector",
          "ocr",
          "segmentation",
          "barcode_parser",
          "mrz_parser",
          "table_engine",
          "face_detector",
          "template_projection",
          "validator",
          "user_correction",
          "manual_import"
        ]
      },
      "kind": {
        "enum": [
          "text",
          "object_detection",
          "visual_asset",
          "mask",
          "code_payload",
          "mrz_parse",
          "table_structure",
          "table_cell",
          "checkbox_state",
          "validation",
          "quality_warning",
          "template_roi",
          "correction",
          "unknown"
        ]
      },
      "targetNodeIds": {
        "type": "array",
        "items": { "type": "string" }
      },
      "boxNorm": { "$ref": "#/$defs/NormalizedBox" },
      "polygonNorm": { "$ref": "#/$defs/NormalizedPolygon" },
      "confidence": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "payload": {
        "type": "object",
        "additionalProperties": true
      },
      "provenance": {
        "type": "array",
        "items": { "$ref": "#/$defs/ProvenanceRecord" }
      },
      "createdAt": { "type": "number" }
    }
  }
}
```

---

## 9. FieldHypothesis schema

```json
{
  "FieldHypothesis": {
    "type": "object",
    "required": [
      "id",
      "documentId",
      "label",
      "valueType",
      "confidence",
      "status",
      "evidenceIds",
      "validationIds",
      "source",
      "reasons",
      "createdAt"
    ],
    "properties": {
      "id": { "type": "string" },
      "documentId": { "type": "string" },
      "pageId": { "type": "string" },
      "label": { "type": "string" },
      "canonicalLabel": { "type": "string" },
      "aliases": {
        "type": "array",
        "items": { "type": "string" }
      },
      "value": {},
      "displayValue": { "type": "string" },
      "normalizedValue": {},
      "valueType": {
        "enum": [
          "text",
          "name",
          "date",
          "amount",
          "number",
          "id_number",
          "address",
          "phone",
          "email",
          "country",
          "image",
          "photo",
          "signature",
          "stamp",
          "seal",
          "logo",
          "table",
          "checkbox",
          "qr",
          "barcode",
          "mrz",
          "unknown"
        ]
      },
      "labelNodeIds": {
        "type": "array",
        "items": { "type": "string" }
      },
      "valueNodeIds": {
        "type": "array",
        "items": { "type": "string" }
      },
      "assetNodeIds": {
        "type": "array",
        "items": { "type": "string" }
      },
      "tableNodeIds": {
        "type": "array",
        "items": { "type": "string" }
      },
      "boxNorm": { "$ref": "#/$defs/NormalizedBox" },
      "confidence": { "$ref": "#/$defs/ExplainableConfidence" },
      "status": {
        "enum": [
          "confirmed",
          "needs_review",
          "missing",
          "conflict",
          "invalid",
          "unsupported",
          "rejected"
        ]
      },
      "evidenceIds": {
        "type": "array",
        "items": { "type": "string" }
      },
      "validationIds": {
        "type": "array",
        "items": { "type": "string" }
      },
      "source": {
        "enum": [
          "ocr_geometry",
          "template_projection",
          "parser",
          "visual_asset",
          "table",
          "checkbox",
          "user_created",
          "hybrid"
        ]
      },
      "required": { "type": "boolean" },
      "templateFieldId": { "type": "string" },
      "userEdited": { "type": "boolean" },
      "rejected": { "type": "boolean" },
      "reasons": {
        "type": "array",
        "items": { "type": "string" }
      },
      "createdAt": { "type": "number" },
      "updatedAt": { "type": "number" }
    }
  }
}
```

---

## 10. Confidence schema

```json
{
  "ExplainableConfidence": {
    "type": "object",
    "required": ["overall", "components", "reasons"],
    "properties": {
      "overall": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "components": {
        "type": "object",
        "properties": {
          "ocr": { "type": "number" },
          "detector": { "type": "number" },
          "segmentation": { "type": "number" },
          "parser": { "type": "number" },
          "geometry": { "type": "number" },
          "template": { "type": "number" },
          "validator": { "type": "number" },
          "quality": { "type": "number" },
          "userCorrection": { "type": "number" }
        },
        "additionalProperties": false
      },
      "reasons": {
        "type": "array",
        "items": { "type": "string" }
      }
    }
  }
}
```

---

## 11. ValidationResult schema

```json
{
  "ValidationResult": {
    "type": "object",
    "required": [
      "id",
      "documentId",
      "targetId",
      "validatorId",
      "status",
      "severity",
      "message",
      "evidenceIds",
      "createdAt"
    ],
    "properties": {
      "id": { "type": "string" },
      "documentId": { "type": "string" },
      "targetId": { "type": "string" },
      "validatorId": { "type": "string" },
      "status": {
        "enum": ["pass", "warn", "fail", "not_applicable"]
      },
      "severity": {
        "enum": ["info", "low", "medium", "high", "critical"]
      },
      "message": { "type": "string" },
      "details": {
        "type": "object",
        "additionalProperties": true
      },
      "evidenceIds": {
        "type": "array",
        "items": { "type": "string" }
      },
      "createdAt": { "type": "number" }
    }
  }
}
```

---

## 12. ProvenanceRecord schema

```json
{
  "ProvenanceRecord": {
    "type": "object",
    "required": ["id", "actor", "action", "timestamp"],
    "properties": {
      "id": { "type": "string" },
      "actor": {
        "enum": ["system", "model", "parser", "validator", "template_engine", "user"]
      },
      "action": { "type": "string" },
      "sourceId": { "type": "string" },
      "targetId": { "type": "string" },
      "modelName": { "type": "string" },
      "modelVersion": { "type": "string" },
      "parserName": { "type": "string" },
      "parserVersion": { "type": "string" },
      "timestamp": { "type": "number" },
      "parameters": {
        "type": "object",
        "additionalProperties": true
      }
    }
  }
}
```

---

## 13. TemplateContext schema

```json
{
  "TemplateContext": {
    "type": "object",
    "required": ["templateId", "familyId", "version", "matchScore", "decision"],
    "properties": {
      "templateId": { "type": "string" },
      "familyId": { "type": "string" },
      "version": { "type": "integer" },
      "matchScore": { "type": "number" },
      "decision": {
        "enum": [
          "same_template",
          "same_family_new_version",
          "unknown_template",
          "ambiguous_match"
        ]
      },
      "projectedRoiIds": {
        "type": "array",
        "items": { "type": "string" }
      },
      "alignmentTransformIds": {
        "type": "array",
        "items": { "type": "string" }
      }
    }
  }
}
```

---

## 14. Implementation note

The actual implementation may use TypeScript types plus runtime validation via Zod or JSON Schema. This Markdown schema is the canonical human-readable version. A generated `DOCGRAPH_SCHEMA.json` should be derived from this and tested in CI.

---

## 15. Final schema rule

If an output is exported, stored, verified, corrected, or learned into a template, it must fit this schema or an explicitly versioned extension.
