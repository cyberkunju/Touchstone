# `models/` — versioned model artifacts (non-clobbering home)

Each model version gets its own folder so a new train never overwrites an old
one. An exported model folder holds: `model.onnx`, `best.pt`, `classes.json`,
`metadata.json` (imgsz, sha256, classVersion), `metrics_v2.json` (the REAL gate
result that accepted it), and `preprocessing.json`/`postprocessing.json`.

```
models/
  docdet-v0/                  the original single 12-class detector (HISTORICAL)
                              -> the live snapshot still lives in ../winner_model/
                                 (kept there so existing `--model winner_model/best.pt`
                                  commands keep working). Treat as v0 / superseded.
  docdet-v1/                  the STAGED topology (current target; see CLASS_SPEC.md)
    model1-page-locator/      document_page region + 4-corner quad
    model2-primitives/        10 in-page primitives, runs on the rectified crop
    model3-text/              DBNet-style text_line/text_region (on demand)
```

Naming: `docdet-v<major>` bumps on any class-set / topology change;
per-model subfolders are stable. The REAL gate of record for any artifact is its
`metrics_v2.json` produced by `benchmarks/eval_v2.py` (never synthetic mAP).
