# `ontology/` — docdet-v1 labeling contract (Phase 0)

The single source of truth for class definitions, source-dataset mappings,
per-annotation provenance, and leakage-key computation. Every generator,
dataset importer, auto-label validator, and human QA session conforms to this.
Changing any rule requires a `CLASS_VERSION` bump and dataset migration.

## Files

| file | purpose |
|---|---|
| `CLASS_SPEC.md` | **★ read this first.** Full labeling contract with decision tree and edge-case rulings for all 12 classes + `ignore_region`. |
| `classes.py` | Staged class sets (Model 1 / 2 / 3), per-class min-size fractions, data-reality flags (`SYNTHETIC_OR_EVAL_ONLY_CLASSES`, `NEEDS_CONTENT_VALIDATOR`, `REAL_GATED_CLASSES`), v0→v1 migration map. |
| `source_map.py` | Dataset-ontology → docdet-v1 mapping with `class_confidence`, `geometry` tag, `needs_validator` flag, license/data-class buckets, and `audit_lineage()` (blocks RED / research-only in shippable lineages). |
| `provenance.py` | Per-annotation `ImageProvenance` + `AnnotationProvenance` + `RenderVariantProvenance` dataclasses; `perceptual_hash()` (pinned `phash64:` tagged, imagehash hard dep); `compute_split_group_key()` (leakage-free group key via sha1); `to_record()` (the ONLY sanctioned manifest writer — rejects empty/per-frame split_group_key). |
| `__init__.py` | Re-exports everything public so callers can `from ontology import …`. |

## Key design decisions

- **Provenance is per-annotation, not per-image.** One composited frame can mix
  a human-labeled DocLayNet crop + a synthetic MRZ + an auto-labeled negative.
- **`to_record()` is the ONLY sanctioned manifest writer.** It enforces that
  every emitted record has a real group key (not empty, not a per-frame id).
- **`seal` and `logo` are `SYNTHETIC_OR_EVAL_ONLY_CLASSES`** — they have no
  license-clean real-data source and are excluded from the hard real recall gate
  until one exists. Never create a gate that cannot be measured.
- **`photo` is in `NEEDS_CONTENT_VALIDATOR`** — DocLayNet `Picture` / PubLayNet
  `figure` are largely charts; importing them as `photo` poisons the class.

## Tests

`../tests/test_ontology.py` (18 tests) + `../tests/test_class_consistency.py`
(5 tests). Run: `python -m pytest tests/test_ontology.py tests/test_class_consistency.py -q`
