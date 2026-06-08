# `synthgen/compose/` — Engine A: real-background compositor (Phase 2)

The Phase-2 lever. Turns a rendered full-frame document into a realistic
**scene**: the document is placed as a sub-region of a real photograph (desk,
table, hand, clutter) at a sampled scale, rotation and perspective, then blended
in. v0 made documents that fill a clean frame; real documents don't look like
that — and that mismatch is why real `document_page` recall sat at 0.38.

## Modules

| file | what |
|---|---|
| `bank.py` | `BackgroundBank` — scans a dir of real photos once, samples a seeded RGB canvas at a target long-side (gray fallback if empty). |
| `place.py` | `sample_placement()` — homography placing the doc at **20–70% scale** (tails to 8% / 95%), **±60° rotation**, **perspective** jitter, and **partial-crop** (≈30%). Returns `(H 3×3, quad 4×2)`. |
| `blend.py` | `blend()` — multi-mode compositing (alpha-feather / hard / guarded Poisson) so the model can't latch onto one boundary artifact. |
| `compositor.py` | `compose_sample()` — warps the doc onto the scene, transforms every primitive polygon through the SAME homography, drops the original full-frame page, and emits a fresh `document_page` = the placed quad. |

## Pipeline position
```
category render → compose_sample (Engine A) → augment.augment (degradation) → labels.sample_to_yolo
```

## Use it
```powershell
# backgrounds first (one-time): python fetch_datasets.py --only coco_val2017
python -m synthgen.generate --out datasets/docdet_v1_pilot --count 30000 `
    --compose --bg-dir assets/backgrounds --augment 0.85 --intensity 0.8 --seed 2000
```
`--compose-prob <p>` composites a fraction of samples (rest stay full-frame, for
the "clean upload" end of the distribution).

## Verified behaviour
On a smoke run, composited `document_page` boxes are sub-regions (e.g. 0.30×0.60,
0.23×0.28 of the frame) on real COCO scenes — exactly the scale distribution v0
lacked. 11 unit tests in `../../tests/test_compose.py`.

## Known follow-ups (scale phase, not the pilot)
- hands/occluder bank + confuser negatives, multi-document scenes
- artifact-invariance forks (same placement, K corruption stacks)
- full ontology provenance wiring into the synthgen manifest
