# Model 3 — Text Detector (docdet-v1, on demand)

A dedicated DBNet-style text detector for `text_line` / `text_region`. Kept
SEPARATE from the primitive detector because text is dense, ambiguous, and
high-frequency — folding it into Model 2 would dominate gradients and starve the
rare primitives. Invoked only when text regions are needed (OCR handoff).

- **Classes:** `text_line`, `text_region` (ids owned by this model's own spec).
- **Status:** not started; lowest priority of the three (text detection is a
  solved, swappable component).
