# Error Messages — Edge DocGraph Engine

**Purpose:** Define exact user-facing wording for blur, missing fields, conflicts, invalid scans, unsupported files, model loading, template issues, storage issues, and export warnings.

---

## 1. Error message principles

Every message should answer:

1. What happened?
2. Why does it matter?
3. What can the user do?

Use clear language. Avoid internal jargon unless in developer mode.

---

## 2. Local processing messages

### Upload start

```text
Processing locally. Your document is not uploaded.
```

### Model loading

```text
Loading local extraction models on this device.
```

### Offline ready

```text
Ready for local processing.
```

---

## 3. Unsupported file messages

### Unsupported type

```text
This file type is not supported yet. Please upload a PNG, JPEG, WebP, or PDF.
```

### Corrupt file

```text
This file could not be opened. Try a different file or export it again.
```

### Too large

```text
This file is too large for local processing on this device. Try a smaller file or process fewer pages.
```

### Password PDF

```text
This PDF is password-protected. Unlock it first, then upload it again.
```

---

## 4. Image quality messages

### Blur

```text
This scan is blurry. Some fields may need review.
```

Field-specific:

```text
Needs review because this field is affected by blur.
```

Critical field:

```text
The passport number is too blurry to confirm. Retake the image or enter the value manually.
```

### Glare

```text
Glare was detected on the document. Fields in the highlighted area may need review.
```

Field-specific:

```text
Needs review because glare overlaps this field.
```

### Low resolution

```text
The image resolution is low. Small text may not be read accurately.
```

### Crop incomplete

```text
The document appears to be cut off. Some fields may be missing.
```

### Perspective issue

```text
The document is photographed at an angle. Extraction may be less accurate.
```

### Too dark

```text
The image is too dark in some areas. Review highlighted fields.
```

### Too bright

```text
The image is overexposed in some areas. Review highlighted fields.
```

---

## 5. Extraction messages

### Extraction complete

```text
Extraction complete. Review highlighted fields before export.
```

### No reliable fields

```text
No reliable fields were detected. You can select regions manually to create fields.
```

### Unknown layout

```text
New layout detected. Review the extracted fields and save a template if you want future fast extraction.
```

### Known template match

```text
Matched template: {templateName}. Fields were extracted from saved regions and verified.
```

### Ambiguous template match

```text
This document matches multiple templates. Choose one or process it as a new layout.
```

### Layout drift

```text
This looks like the same document family, but the layout has changed. Review it and create a new template version if needed.
```

---

## 6. Field status messages

### Confirmed

```text
Confirmed.
```

With reason:

```text
Confirmed because OCR confidence is high and validators passed.
```

### Needs review

```text
Needs review.
```

Specific:

```text
Needs review because OCR confidence is low.
```

```text
Needs review because the date format is ambiguous.
```

```text
Needs review because the source crop may be incomplete.
```

### Missing

```text
Missing required field.
```

Specific:

```text
Missing because the expected region contained no readable value.
```

```text
Missing because this required asset was not found.
```

### Conflict

```text
Conflict detected.
```

Specific:

```text
Conflict: MRZ and visible field show different dates of birth.
```

```text
Conflict: QR payload does not match the printed invoice number.
```

```text
Conflict: table total does not match the printed total.
```

### Invalid

```text
Invalid value.
```

Specific:

```text
Invalid because the MRZ check digit failed.
```

```text
Invalid because the expiry date is before the issue date.
```

```text
Invalid because this amount could not be parsed.
```

### Unsupported

```text
Unsupported content.
```

Specific:

```text
This region appears meaningful, but the app does not support this content type yet.
```

---

## 7. MRZ messages

### MRZ valid

```text
MRZ validated successfully.
```

### MRZ checksum failed

```text
MRZ check digit failed. Review this field before using it.
```

### MRZ unreadable

```text
The MRZ area could not be read clearly. Retake the image or enter the fields manually.
```

### MRZ conflict

```text
MRZ data conflicts with visible document text.
```

---

## 8. QR/barcode messages

### Code decoded

```text
Code decoded successfully.
```

### Code undecodable

```text
A code was detected but could not be decoded. Review the highlighted region.
```

### URL safety

```text
This code contains a URL. The app will not open it automatically.
```

### Payload conflict

```text
Decoded code data conflicts with printed document text.
```

---

## 9. Table messages

### Table uncertain

```text
This table needs review because some rows or columns are uncertain.
```

### Cell low confidence

```text
This cell needs review because OCR confidence is low.
```

### Total mismatch

```text
The table calculation does not match the printed total.
```

### Missing column

```text
A required table column is missing.
```

### Unsupported table

```text
This table is too complex for automatic extraction. You can correct it manually.
```

---

## 10. Correction messages

### Correction saved

```text
Correction saved. Related checks were updated.
```

### Correction invalid

```text
This corrected value still fails validation.
```

### Region updated

```text
Region updated. Extraction was rerun for this field.
```

### Field rejected

```text
Field removed from the form. Original evidence is kept for audit.
```

### Conflict resolved

```text
Conflict resolved using your selected value.
```

---

## 11. Template messages

### Save prompt

```text
Save this layout as a local template to make future similar documents faster.
```

### Template saved

```text
Template saved locally. Future similar documents can use fast verified extraction.
```

### Template updated

```text
Template updated locally.
```

### New version created

```text
New template version created. The old version was preserved.
```

### Draft saved

```text
Draft template saved. It will not be used automatically until activated.
```

### Do not learn

```text
No template was saved for this document.
```

### Weak anchors

```text
This template does not have enough stable anchors to match safely. Add anchors or save it as a draft.
```

### Variable anchor warning

```text
This looks like a document-specific value and should not be used as a template anchor.
```

### Template save blocked

```text
This template cannot be saved as active until critical conflicts are resolved.
```

---

## 12. Storage messages

### Storage full

```text
Local storage is full. Delete old documents/templates or free space, then try again.
```

### Template save failed

```text
Template could not be saved because local storage is unavailable or full. Your corrections are still visible in this session.
```

### Model cache failed

```text
Local model files could not be cached. Processing may be slower next time.
```

---

## 13. Model/runtime messages

### Model load failed

```text
A local model could not be loaded. Try refreshing or using a supported browser/device.
```

### WebGPU unavailable

```text
Hardware acceleration is unavailable. The app will use a slower local runtime.
```

### Processing cancelled

```text
Processing cancelled.
```

### Memory issue

```text
This document needs more memory than this device can provide. Try fewer pages or a smaller image.
```

---

## 14. Export messages

### Export ready

```text
Ready to export.
```

### Export with warnings

```text
This export contains fields that need review.
```

### Critical unresolved fields

```text
This export contains unresolved critical fields. Review them or export with statuses included.
```

### Confirmed only export

```text
Only confirmed fields will be exported. Unresolved fields will be excluded.
```

### Export blocked

```text
Export is blocked until critical invalid or conflicting fields are resolved, or you choose to export with warnings.
```

---

## 15. Privacy/export warning

Evidence package:

```text
This evidence package may include document text, crops, and sensitive extracted data. Export only if you trust the recipient.
```

Template export:

```text
Template exports may reveal document layout and field labels. Export only if safe.
```

---

## 16. Developer-mode messages

Developer mode can include IDs and technical details, but user mode should not.

Example developer details:

```text
Validator failed: mrz_checksum_document_number. Evidence: ev_mrz_12.
```

Normal user message:

```text
MRZ check digit failed.
```

---

## 17. Tone rules

Use:

- clear
- calm
- specific
- actionable

Avoid:

- blaming user
- overconfidence
- vague AI language
- internal IDs in normal mode
- “hallucination” in user-facing messages unless educational context

---

## 18. Tests

Test that:

- every status has a message
- every critical validation failure has wording
- messages show action
- messages do not expose internal IDs in normal mode
- screen readers can announce messages
- export warnings appear when unresolved statuses exist

---

## 19. Final message rule

The app’s wording must be honest. Never say “success” when unresolved critical issues remain. Say exactly what happened and what the user can do next.
