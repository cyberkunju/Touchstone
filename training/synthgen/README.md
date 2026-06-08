# `synthgen/` — synthetic document generator (docdet-v0 / Engine C skeleton)

Generates auto-labeled YOLO datasets from pure code — no real personal data.
Currently implements the **docdet-v0** procedural generator (12 classes,
full-frame biased). It is being promoted to **Engine C** in the v1 pipeline
(symbolic/layout generator: MRZ, barcode/QR with decode-validation,
forms/checkboxes, clean scan/PDF renders).

> **Current role:** produces training-ready synthetic YOLO datasets and feeds
> Engine A as pre-rendered foreground pages.
>
> **Migration status:** `config.py` carries the v0 12-class list. When Engine A
> and Engine C are rebuilt for the v1 staged topology, the class space migrates to
> `ontology/classes.py`. The `config.py` migration header explains the v0→v1 map.

---

## Quick start

```powershell
# 15k images, auto-split, ~16-20 samples/s on a modern CPU:
python -m synthgen.generate --out datasets/docdet_v0 --count 15000 --seed 1000

# A locked hard test set (maximum degradation, all in 'test'):
python -m synthgen.generate --out datasets/docdet_v0_hard --count 1500 `
    --force-split test --augment 1.0 --intensity 1.0 --seed 900000

# Visualize labels overlaid on images:
python -m synthgen.viz --dataset datasets/docdet_v0 --split train --n 16
# -> datasets/docdet_v0/_preview/*_overlay.png
```

---

## Files

| file | purpose |
|---|---|
| `config.py` | v0 stable class ids, min-box floor, background RGB. Read migration notice at the top. |
| `core.py` | `Sample` / `Annotation` data structures; polygon-accurate labels via homography. |
| `mrz.py` | ICAO 9303 TD1/TD2/TD3 MRZ generator with correct check digits and OCR-B rendering. |
| `primitives.py` | Per-class renderers: photo, signature, stamp, seal, logo, qr_code, barcode, mrz_zone, table, checkbox, text_block. |
| `augment.py` | Capture-degradation graph: geometry → Augraphy-style paper/ink → light/glare → ISP/noise → codec. Label-preserving (all polygons go through the same homography). |
| `backgrounds.py` | Procedural real-ish backgrounds (gradient + noise + scatter + second-document strip). Being superseded by real-photo backgrounds in Engine A. |
| `labels.py` | Polygon → clipped normalized YOLO label; dataset.yaml; sample manifest. |
| `fonts.py` | Font discovery and caching (variety + monospace OCR-B for MRZ). |
| `i18n.py` | Multilingual text sampling. |
| `generate.py` | CLI: multiprocessing pipeline, ~16-20 samples/s. |
| `viz.py` | Draw labels back onto images for sanity checking. |
| `categories/` | Per-category page layouts: passport, invoice, form, certificate, statement, license, decoys. |

---

## Privacy note

All identities, numbers, faces, logos, and signatures are synthetic. Country
codes mix real ICAO codes with the ICAO specimen code `UTO` (Utopia) so no
sample is mistaken for a real document.

## Tests

`../tests/test_synthgen.py`. Run: `python -m pytest tests/test_synthgen.py -q`
