"""
Tests for benchmarks/leakage_split.py — the leakage-free dataset splitter.

Focus areas:
  * the cardinal rule: no split_group_key spans two splits (audit ok=True)
  * per-image ratios approximately respected on a larger synthetic set
  * audit_split actually CATCHES an intentionally leaked group (ok=False)
  * perceptual-hash clustering merges near-identical hashes (1-2 bits apart)
    and keeps very different ones separate
"""
from __future__ import annotations

import os
import sys

# Make `benchmarks` importable when running pytest from the training dir.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from benchmarks.leakage_split import (  # noqa: E402
    assign_splits,
    audit_split,
    cluster_perceptual_hashes,
)


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _hex64(bits: str) -> str:
    """64-bit binary string -> 16-char hex pHash."""
    assert len(bits) == 64
    return f"{int(bits, 2):016x}"


def _flip_bits(bits: str, positions: list[int]) -> str:
    chars = list(bits)
    for p in positions:
        chars[p] = "1" if chars[p] == "0" else "0"
    return "".join(chars)


# --------------------------------------------------------------------------- #
# 1. cardinal rule: no group spans two splits
# --------------------------------------------------------------------------- #
def test_no_group_spans_two_splits():
    # 20 documents, each with 1-8 frames sharing one group key.
    items = []
    for doc in range(20):
        gkey = f"group-{doc}"
        for frame in range((doc % 8) + 1):
            items.append({"id": f"d{doc}-f{frame}", "split_group_key": gkey})

    assignment = assign_splits(items, ratios=(0.8, 0.1, 0.1), seed=0)
    audit = audit_split(assignment, items)
    assert audit["ok"] is True
    assert audit["leaked_groups"] == []

    # every item placed exactly once
    placed = [i for ids in assignment.values() for i in ids]
    assert sorted(placed) == sorted(it["id"] for it in items)
    assert len(placed) == len(set(placed))


def test_deterministic_given_seed():
    items = [
        {"id": f"d{d}-f{f}", "split_group_key": f"g{d}"}
        for d in range(15)
        for f in range((d % 4) + 1)
    ]
    a1 = assign_splits(items, seed=42)
    a2 = assign_splits(items, seed=42)
    assert a1 == a2


# --------------------------------------------------------------------------- #
# 2. ratios approximately respected
# --------------------------------------------------------------------------- #
def test_ratios_approximately_respected():
    # 300 single-frame groups -> fine granularity, ratios should land close.
    items = [{"id": f"x{i}", "split_group_key": f"g{i}"} for i in range(300)]
    assignment = assign_splits(items, ratios=(0.8, 0.1, 0.1), seed=0)

    total = len(items)
    frac = {k: len(v) / total for k, v in assignment.items()}
    assert abs(frac["train"] - 0.8) < 0.05
    assert abs(frac["val"] - 0.1) < 0.05
    assert abs(frac["test"] - 0.1) < 0.05

    # no leakage even on the large set
    assert audit_split(assignment, items)["ok"] is True


def test_ratios_with_multiframe_groups():
    # groups of varying size still approximate ratios reasonably.
    items = []
    for g in range(120):
        for f in range((g % 5) + 1):
            items.append({"id": f"g{g}-f{f}", "split_group_key": f"g{g}"})
    assignment = assign_splits(items, ratios=(0.7, 0.2, 0.1), seed=7)
    total = len(items)
    frac = {k: len(v) / total for k, v in assignment.items()}
    assert abs(frac["train"] - 0.7) < 0.08
    assert abs(frac["val"] - 0.2) < 0.08
    assert abs(frac["test"] - 0.1) < 0.08
    assert audit_split(assignment, items)["ok"] is True


# --------------------------------------------------------------------------- #
# 3. stratification balances the key across splits
# --------------------------------------------------------------------------- #
def test_stratification_balances_classes():
    items = []
    for g in range(200):
        cls = "A" if g % 2 == 0 else "B"
        items.append({"id": f"g{g}", "split_group_key": f"g{g}", "class": cls})
    assignment = assign_splits(items, ratios=(0.8, 0.1, 0.1), seed=0,
                               stratify_key="class")

    cls_of = {it["id"]: it["class"] for it in items}
    # train should hold ~80% of EACH class, not just overall.
    for cls in ("A", "B"):
        total_cls = sum(1 for v in cls_of.values() if v == cls)
        train_cls = sum(1 for i in assignment["train"] if cls_of[i] == cls)
        assert abs(train_cls / total_cls - 0.8) < 0.06

    assert audit_split(assignment, items)["ok"] is True


# --------------------------------------------------------------------------- #
# 4. audit catches an intentional leak
# --------------------------------------------------------------------------- #
def test_audit_detects_leak():
    items = [
        {"id": "a", "split_group_key": "shared"},
        {"id": "b", "split_group_key": "shared"},
        {"id": "c", "split_group_key": "other"},
    ]
    # force the SAME group key into train and test
    leaked_assignment = {"train": ["a"], "val": ["c"], "test": ["b"]}
    audit = audit_split(leaked_assignment, items)
    assert audit["ok"] is False
    assert "shared" in audit["leaked_groups"]
    assert "other" not in audit["leaked_groups"]


# --------------------------------------------------------------------------- #
# 5. perceptual-hash clustering
# --------------------------------------------------------------------------- #
def test_clustering_merges_near_duplicates_and_separates_distant():
    base = "0" * 64
    h0 = _hex64(base)
    h1 = _hex64(_flip_bits(base, [3]))        # 1 bit from h0
    h2 = _hex64(_flip_bits(base, [3, 17]))    # 2 bits from h0
    far = _hex64("1" * 64)                    # 64 bits from h0 -> separate

    mapping = cluster_perceptual_hashes([h0, h1, h2, far], max_hamming=6)

    # the three near-duplicates share one cluster
    assert mapping[h0] == mapping[h1] == mapping[h2]
    # the very different hash is in its own cluster
    assert mapping[far] != mapping[h0]
    # exactly two distinct clusters
    assert len(set(mapping.values())) == 2


def test_clustering_handles_ahash_prefix_and_threshold():
    base = "0" * 64
    near = _flip_bits(base, [1, 2, 3])        # 3 bits apart
    over = _flip_bits(base, list(range(10)))  # 10 bits apart

    a = f"ahash:{_hex64(base)}"
    b = f"ahash:{_hex64(near)}"
    c = f"ahash:{_hex64(over)}"

    mapping = cluster_perceptual_hashes([a, b, c], max_hamming=6)
    assert mapping[a] == mapping[b]      # within threshold -> merged
    assert mapping[c] != mapping[a]      # beyond threshold -> separate


def test_clustering_mixed_prefix_forms_are_NOT_merged():
    # Different algorithm tags are different feature spaces and must NEVER be
    # compared/merged, even with identical hex bits (fixes the prior false-merge).
    bits = "1010" * 16
    plain = _hex64(bits)
    prefixed = f"ahash:{_hex64(bits)}"
    mapping = cluster_perceptual_hashes([plain, prefixed], max_hamming=1)
    assert mapping[plain] != mapping[prefixed]


def test_clustering_differing_widths_never_merge():
    # Different bit-widths (e.g. 64-bit pHash vs 256-bit aHash) are incomparable
    # and must land in separate clusters; must not crash.
    short = "ffff"            # 16 bits
    long = "0" * 64           # 256 bits
    mapping = cluster_perceptual_hashes([short, long], max_hamming=6)
    assert mapping[short] != mapping[long]


def test_no_empty_val_test_with_few_large_groups():
    # The prior critical bug: greedy absolute-deficit dumped everything into
    # train, leaving val AND test EMPTY for exactly this (few large groups) case.
    items = [{"id": f"d{d}-{f}", "split_group_key": f"doc{d}"}
             for d in range(3) for f in range(5)]
    a = assign_splits(items, ratios=(0.8, 0.1, 0.1), seed=0)
    assert len(a["val"]) > 0
    assert len(a["test"]) > 0
    assert audit_split(a, items)["ok"] is True


def test_assign_splits_rejects_bad_input():
    import pytest
    with pytest.raises(ValueError):
        assign_splits([{"id": "x"}])  # missing split_group_key
    with pytest.raises(ValueError):
        assign_splits([{"split_group_key": "g"}])  # missing id
    with pytest.raises(ValueError):
        assign_splits([{"id": "a", "split_group_key": "g"}], ratios=(1.0, -0.5, 0.5))
    with pytest.raises(ValueError):  # same id under two different group keys
        assign_splits([{"id": "a", "split_group_key": "g1"},
                       {"id": "a", "split_group_key": "g2"}])
