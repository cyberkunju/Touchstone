"""
Leakage-FREE dataset splitting for docdet training (master plan §9).

THE CARDINAL RULE: a single `split_group_key` must NEVER appear in more than one
split (train/val/test). MIDV-style near-duplicate video frames, render-variant
forks, and multi-page captures of the same document share a group key precisely
so they land in ONE split — otherwise they leak across train/test and silently
inflate the eval gate (the model "remembers" a near-identical frame it trained
on). See ontology/provenance.py::compute_split_group_key for how the key is
derived (canonical doc > capture session > pHash cluster > source video).

This module provides:
  * cluster_perceptual_hashes - group near-duplicate pHashes (Hamming distance)
                                into cluster ids, feeding pHash-cluster group keys
  * assign_splits             - assign WHOLE groups to splits, approximating the
                                per-image ratios, deterministic, optionally
                                stratified by an arbitrary key
  * audit_split               - the ENFORCEMENT check: report any group key that
                                leaked across more than one split

Stdlib only (optional numpy is not required). Python 3.12 / Windows; assumes
$env:PYTHONUTF8=1.

Runnable both as a script (`python benchmarks/leakage_split.py`) and as an
import (`from benchmarks.leakage_split import assign_splits`).
"""
from __future__ import annotations

import json
import os
import random
import sys
from collections import Counter, defaultdict

try:  # package import
    from ontology.provenance import compute_split_group_key, perceptual_hash
except ImportError:  # pragma: no cover - script-mode fallback
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from ontology.provenance import compute_split_group_key, perceptual_hash  # type: ignore

SPLIT_NAMES: tuple[str, str, str] = ("train", "val", "test")


# --------------------------------------------------------------------------- #
# 1. Perceptual-hash clustering
# --------------------------------------------------------------------------- #
def cluster_perceptual_hashes(hashes: list[str], max_hamming: int = 6) -> dict[str, str]:
    """Cluster near-duplicate perceptual hashes by Hamming distance.

    Two hashes join the same cluster when their bit-level Hamming distance is
    ``<= max_hamming``. Clustering is transitive (union-find).

    CORRECTNESS GUARANTEES (fixing prior brutal-review defects):
      * Hashes are only ever compared WITHIN the same ``(algorithm-tag, bit-width)``
        group. A pHash (64-bit) and an aHash (256-bit) are different feature
        spaces; comparing them by integer XOR is meaningless and previously
        produced false merges (e.g. ``"ff"`` vs ``"00ff"``). Different tag/width
        => different clusters, never merged.
      * Within a group, candidate generation uses LSH banding (pigeonhole): with
        ``b = max_hamming + 1`` contiguous bands, any pair within ``max_hamming``
        bits MUST share >=1 identical band, so banding yields NO false negatives
        while avoiding the O(n^2) all-pairs scan (which is DOA at 1e5-1e6+).
        Candidates are then verified by exact Hamming distance.

    Cluster id = the lexicographically smallest original hash string in the
    group (stable / deterministic / order-independent).
    """
    unique = sorted(set(hashes))
    parent: dict[str, str] = {h: h for h in unique}

    def find(x: str) -> str:
        root = x
        while parent[root] != root:
            root = parent[root]
        while parent[x] != root:  # path compression
            parent[x], x = root, parent[x]
        return root

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra == rb:
            return
        lo, hi = (ra, rb) if ra < rb else (rb, ra)
        parent[hi] = lo

    # Group by (tag, bit-width) so only commensurable hashes are ever compared.
    groups: dict[tuple[str, int], list[str]] = defaultdict(list)
    bits_of: dict[str, int] = {}
    width_of: dict[str, int] = {}
    for h in unique:
        tag, payload = _split_tag(h)
        try:
            val = int(payload, 16) if payload else 0
        except ValueError:
            val = 0
        width = len(payload) * 4  # hex chars -> bits (fixed width per string)
        bits_of[h] = val
        width_of[h] = width
        groups[(tag, width)].append(h)

    b = max(1, max_hamming + 1)  # pigeonhole bands
    for (_tag, width), members in groups.items():
        if len(members) <= 1:
            continue
        band_width = max(1, width // b) if width else 1
        # band index -> {band_value -> [hashes]}
        buckets: dict[int, dict[int, list[str]]] = defaultdict(lambda: defaultdict(list))
        for h in members:
            v = bits_of[h]
            for band in range(b):
                shift = band * band_width
                mask = (1 << band_width) - 1
                key = (v >> shift) & mask
                buckets[band][key].append(h)
        # candidate pairs = share an identical band; verify exact Hamming.
        seen_pairs: set = set()
        for band in buckets:
            for _key, cand in buckets[band].items():
                if len(cand) < 2:
                    continue
                for i in range(len(cand)):
                    for j in range(i + 1, len(cand)):
                        a, c = cand[i], cand[j]
                        pair = (a, c) if a < c else (c, a)
                        if pair in seen_pairs:
                            continue
                        seen_pairs.add(pair)
                        if (bits_of[a] ^ bits_of[c]).bit_count() <= max_hamming:
                            union(a, c)

    return {h: find(h) for h in unique}


def _split_tag(h: str) -> tuple[str, str]:
    """Return (algorithm_tag, hex_payload). Untagged hashes get tag ''."""
    h = h.strip()
    if ":" in h:
        tag, payload = h.rsplit(":", 1)
        return tag, payload
    return "", h


# --------------------------------------------------------------------------- #
# 2 + 3. Group-atomic split assignment (with optional stratification)
# --------------------------------------------------------------------------- #
def _majority(values: list[str]) -> str:
    """Deterministic majority vote: most common value, ties broken by sort."""
    counts = Counter(values)
    top = max(counts.values())
    return sorted(k for k, v in counts.items() if v == top)[0]


def assign_splits(
    items: list[dict],
    ratios: tuple[float, float, float] = (0.8, 0.1, 0.1),
    seed: int = 0,
    stratify_key: str | None = None,
) -> dict[str, list]:
    """Assign whole `split_group_key` groups to train/val/test splits.

    No group is ever split across two splits (the cardinal rule). Per-IMAGE
    ratios are approximated by a deterministic greedy "largest deficit" packing:
    groups are processed largest-first and each is placed in the split that is
    currently furthest below its target image count.

    Stratification: when ``stratify_key`` is given, each group is reduced to a
    single (majority) stratum value, per-stratum image targets are computed for
    each split, and the greedy deficit is evaluated WITHIN that stratum. This
    balances the stratify key across splits as evenly as the group granularity
    allows, while still never splitting a group.

    Determinism: identical (items, ratios, seed, stratify_key) always yields the
    identical assignment. ``seed`` shuffles groups before the stable size sort so
    equal-sized groups are distributed reproducibly but not always in input order.

    Args:
        items: dicts each with at least ``"id"`` and ``"split_group_key"``;
               ``stratify_key`` is read when stratifying (missing -> ``""``).
        ratios: (train, val, test) fractions; normalized internally.
        seed: RNG seed for reproducible tie-breaking.
        stratify_key: optional item field to balance across splits.

    Returns:
        ``{"train": [ids], "val": [ids], "test": [ids]}`` (ids sorted per split).
    """
    if len(ratios) != 3:
        raise ValueError("ratios must be a 3-tuple (train, val, test)")
    if any(r < 0 for r in ratios):
        raise ValueError(f"ratios must be non-negative, got {ratios}")
    total_ratio = float(sum(ratios))
    if total_ratio <= 0:
        raise ValueError("ratios must sum to a positive value")
    norm = [r / total_ratio for r in ratios]

    # ---- validate items + gather groups: key -> {ids, stratum} ------------ #
    group_ids: dict[str, list] = defaultdict(list)
    group_strata: dict[str, list[str]] = defaultdict(list)
    seen_ids: dict = {}
    for it in items:
        if "id" not in it or "split_group_key" not in it:
            raise ValueError(
                "each item requires 'id' and 'split_group_key' "
                f"(offending item: {it!r})"
            )
        _id = it["id"]
        key = it["split_group_key"]
        if _id in seen_ids and seen_ids[_id] != key:
            raise ValueError(
                f"duplicate id {_id!r} appears under two different group keys "
                f"({seen_ids[_id]!r} and {key!r}); ids must be globally unique to "
                "avoid an id leaking across splits"
            )
        seen_ids[_id] = key
        group_ids[key].append(_id)
        if stratify_key is not None:
            group_strata[key].append(str(it.get(stratify_key, "")))

    # deterministic group order INDEPENDENT of caller/filesystem iteration:
    # sort by key first, then seed-shuffle, then stable size-descending sort.
    groups = sorted(group_ids.keys())
    rng = random.Random(seed)
    rng.shuffle(groups)
    groups.sort(key=lambda k: len(group_ids[k]), reverse=True)

    stratum_of = {
        k: (_majority(group_strata[k]) if stratify_key is not None else "_all")
        for k in groups
    }

    # ---- per-(split, stratum) image targets ------------------------------- #
    stratum_totals: Counter = Counter()
    for k in groups:
        stratum_totals[stratum_of[k]] += len(group_ids[k])

    targets: dict[tuple[int, str], float] = {}
    for stratum, tot in stratum_totals.items():
        for si in range(3):
            targets[(si, stratum)] = norm[si] * tot
    current: dict[tuple[int, str], int] = defaultdict(int)

    assignment: dict[str, list] = {name: [] for name in SPLIT_NAMES}

    # ---- greedy: place each group in its stratum's RELATIVELY most-deficient
    # split. Using the NORMALIZED deficit (unmet FRACTION of target) instead of
    # the absolute deficit prevents train (largest target) from swallowing every
    # group and starving val/test to EMPTY -- the prior critical bug. A ratio-0
    # split is excluded; an empty split (current 0) has deficit 1.0 and wins
    # until filled.
    for k in groups:
        stratum = stratum_of[k]
        size = len(group_ids[k])

        def _norm_deficit(si: int, _stratum=stratum) -> float:
            tgt = targets[(si, _stratum)]
            if tgt <= 0:
                return -1.0  # ratio-0 split never receives data
            return (tgt - current[(si, _stratum)]) / tgt

        best_si = max(range(3), key=lambda si: (_norm_deficit(si), -si))
        assignment[SPLIT_NAMES[best_si]].extend(group_ids[k])
        current[(best_si, stratum)] += size

    for name in SPLIT_NAMES:
        assignment[name].sort()
    return assignment


# --------------------------------------------------------------------------- #
# 4. Leakage audit (enforcement)
# --------------------------------------------------------------------------- #
def audit_split(assignment: dict, items: list[dict]) -> dict:
    """Enforcement check: detect any group key spanning more than one split.

    Args:
        assignment: ``{"train": [ids], "val": [ids], "test": [ids]}``.
        items: the original items (to map id -> split_group_key).

    Returns:
        ``{"leaked_groups": [keys...], "ok": bool}`` where ``ok`` is True iff no
        group key appears in two or more splits. ``leaked_groups`` is sorted.
    """
    key_of = {it["id"]: it["split_group_key"] for it in items}
    splits_per_group: dict[str, set] = defaultdict(set)
    for split_name, ids in assignment.items():
        for _id in ids:
            if _id in key_of:
                splits_per_group[key_of[_id]].add(split_name)

    leaked = sorted(k for k, s in splits_per_group.items() if len(s) > 1)
    return {"leaked_groups": leaked, "ok": len(leaked) == 0}


# --------------------------------------------------------------------------- #
# Script-mode demo
# --------------------------------------------------------------------------- #
def _demo() -> None:  # pragma: no cover - illustrative only
    # A tiny synthetic dataset: 3 documents, several frames each (MIDV-style).
    items: list[dict] = []
    for doc in range(3):
        gkey = compute_split_group_key(canonical_document_id=f"doc-{doc}")
        for frame in range(5):
            items.append({
                "id": f"doc{doc}-f{frame}",
                "split_group_key": gkey,
                "domain_bucket": "phone_handheld",
            })
    assignment = assign_splits(items, stratify_key="domain_bucket")
    audit = audit_split(assignment, items)
    print("perceptual_hash available:", callable(perceptual_hash))
    print("assignment:", {k: len(v) for k, v in assignment.items()})
    print("audit:", audit)


def split_manifest(manifest_path: str, ratios=(0.8, 0.1, 0.1), seed: int = 0,
                   stratify_key: str | None = "domain_bucket",
                   out_path: str | None = None) -> dict:
    """Produce a leakage-free train/val/test assignment from a dataset manifest.

    Reads a ``manifest_<split>.json`` (``{"samples": [{image, split_group_key,
    ...}]}``), assigns whole ``split_group_key`` groups to splits, audits for
    leakage, and writes ``splits.json``. This is the pipeline entry point that
    makes :func:`assign_splits` real (not test-only): any training dataset built
    from a manifest gets a leakage-free split here before use.
    """
    with open(manifest_path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    samples = data.get("samples", [])
    items = []
    missing = 0
    for s in samples:
        key = s.get("split_group_key")
        if not key:
            missing += 1
            continue
        items.append({"id": s.get("image"), "split_group_key": key,
                      "domain_bucket": s.get("captureCondition")
                      or s.get("domain_bucket") or "_all"})
    assignment = assign_splits(items, ratios=ratios, seed=seed,
                               stratify_key=stratify_key if stratify_key else None)
    audit = audit_split(assignment, items)
    result = {
        "manifest": os.path.abspath(manifest_path),
        "ratios": list(ratios), "seed": seed,
        "counts": {k: len(v) for k, v in assignment.items()},
        "samplesMissingKey": missing,
        "leakageAudit": audit,
        "assignment": assignment,
    }
    out_path = out_path or os.path.join(os.path.dirname(manifest_path), "splits.json")
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2)
    result["out"] = out_path
    return result


def _main(argv=None) -> int:
    import argparse
    p = argparse.ArgumentParser(
        description="Produce a leakage-free split from a dataset manifest.")
    p.add_argument("--manifest", required=True, help="manifest_<split>.json")
    p.add_argument("--ratios", default="0.8,0.1,0.1")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--stratify-key", default="domain_bucket")
    p.add_argument("--out", default=None)
    args = p.parse_args(argv)
    ratios = tuple(float(x) for x in args.ratios.split(","))
    res = split_manifest(args.manifest, ratios=ratios, seed=args.seed,
                         stratify_key=args.stratify_key or None, out_path=args.out)
    print(json.dumps({k: v for k, v in res.items() if k != "assignment"}, indent=2))
    return 0 if res["leakageAudit"]["ok"] else 1


if __name__ == "__main__":  # pragma: no cover
    import sys as _sys
    raise SystemExit(_main())
