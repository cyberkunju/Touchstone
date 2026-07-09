"""Shared test plumbing.

CORPUS-HONESTY: document images are gitignored (manifests are tracked); a
fresh checkout (CI) has no pixels. Tests that read corpus images or the
pinned ONNX models skip LOUDLY when the artifacts are absent instead of
failing on infrastructure — the full-corpus certification lives on the
Modal burst (bench/modal_gate.py), not in unit CI.
"""

from __future__ import annotations

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CORPUS_PROBE = ROOT / "test_cases" / "passports" / "synthetic" / "id00_clean.png"
MODELS_PROBE = ROOT / "public" / "models" / "PP-OCRv5_server_rec_infer.onnx"

HAS_CORPUS = CORPUS_PROBE.exists()
HAS_MODELS = MODELS_PROBE.exists()

# Test modules that require corpus images/files and/or model weights.
_CORPUS_MODULES = {
    "test_ladder_e2e", "test_service_http", "test_lattice_tap",
    "test_codes_stage", "test_reconcile", "test_native_routes",
}


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if HAS_CORPUS and HAS_MODELS:
        return
    reason = (f"corpus images present: {HAS_CORPUS}, models present: {HAS_MODELS} — "
              "full certification runs on the Modal burst, not unit CI")
    skip = pytest.mark.skip(reason=reason)
    for item in items:
        if item.module.__name__ in _CORPUS_MODULES:  # type: ignore[union-attr]
            item.add_marker(skip)
