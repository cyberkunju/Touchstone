"""P3.6 — v6-vs-v5 recognition A/B on the P1 gate corpus (MRZ-exact law).

Same code path as production (stages/ocr_tap.tap_line); ONLY the rec model
differs. Detection stays pinned v5 (enum locks rec first). Scoring is
label-free-strict: the manifest's mrzLines are exact 44-char ground truth,
so per-line EXACT match and per-char accuracy are both computable with no
human judgment.

v6 artifacts download to .ab-cache/ (never the pinned model dir) with the
sha256 of what was actually fetched printed into the verdict artifact —
re-runs verify against first-fetch hashes (drift is LOUD).

Run: python bench/ab_v6.py [--limit N]
Verdict: bench/baselines/ab-v6-rec.json
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "service"))

from PIL import Image  # noqa: E402

from config import MODEL_DIR  # noqa: E402
from stages import det_stage  # noqa: E402
from stages.ocr_tap import create_session, load_vocab, tap_line  # noqa: E402

AB_CACHE = ROOT / ".ab-cache"
V6_BASE = "https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec_onnx/resolve/main"
V6_FILES = {"inference.onnx": "v6_small_rec.onnx", "inference.yml": "v6_small_rec.yml"}
CORPUS = ROOT / "test_cases" / "passports" / "synthetic"
VERDICT = ROOT / "bench" / "baselines" / "ab-v6-rec.json"


def fetch_v6() -> tuple[Path, Path]:
    AB_CACHE.mkdir(exist_ok=True)
    hashes_file = AB_CACHE / "hashes.json"
    hashes = json.loads(hashes_file.read_text()) if hashes_file.exists() else {}
    out: list[Path] = []
    for remote, local in V6_FILES.items():
        dest = AB_CACHE / local
        if not dest.exists():
            print(f"fetching {remote} …")
            urllib.request.urlretrieve(f"{V6_BASE}/{remote}", dest)  # noqa: S310
        h = hashlib.sha256(dest.read_bytes()).hexdigest()
        if local in hashes and hashes[local] != h:
            raise SystemExit(f"A/B artifact drift: {local} {h[:12]} != first-fetch {hashes[local][:12]}")
        hashes[local] = h
        out.append(dest)
    hashes_file.write_text(json.dumps(hashes, indent=1))
    return out[0], out[1]


def load_v6_vocab(yml_path: Path) -> list[str]:
    """Extract character_dict from the PaddleOCR inference.yml (the list under
    PostProcess.character_dict — parsed tolerantly, no yaml dep)."""
    chars: list[str] = []
    in_dict = False
    for raw in yml_path.read_text(encoding="utf-8").splitlines():
        if "character_dict" in raw:
            in_dict = True
            continue
        if in_dict:
            stripped = raw.rstrip("\n")
            if stripped.lstrip().startswith("- "):
                val = stripped.lstrip()[2:]
                if val.startswith("'") and val.endswith("'") and len(val) >= 2:
                    val = val[1:-1].replace("''", "'")
                elif val.startswith('"') and val.endswith('"') and len(val) >= 2:
                    val = val[1:-1]
                chars.append(val)
            elif stripped.strip() and not stripped.startswith(" "):
                break
    if len(chars) < 1000:
        raise SystemExit(f"v6 vocab parse suspicious: {len(chars)} chars")
    return chars


def is_mrz_like(s: str) -> bool:
    t = s.replace(" ", "")
    return len(t) >= 30 and sum(1 for ch in t if ch == "<") >= 4


def char_acc(got: str, want: str) -> float:
    if not want:
        return 0.0
    got = got.replace(" ", "")
    hits = sum(1 for a, b in zip(got, want) if a == b)
    return hits / max(len(want), len(got))


def main() -> None:
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 60
    onnx_v6, yml_v6 = fetch_v6()

    det = create_session(str(MODEL_DIR / "PP-OCRv5_server_det_infer.onnx"))
    rec5 = create_session(str(MODEL_DIR / "PP-OCRv5_server_rec_infer.onnx"))
    vocab5 = load_vocab(str(MODEL_DIR / "ppocrv5_dict.txt"))
    rec6 = create_session(str(onnx_v6))
    vocab6 = load_v6_vocab(yml_v6)
    print(f"vocabs: v5={len(vocab5)} v6={len(vocab6)}")

    manifest = json.loads((CORPUS / "manifest.json").read_text(encoding="utf-8"))
    entries = [e for e in manifest if (e.get("truth") or {}).get("mrzLines")][:limit]

    score = {
        "v5": {"exact": 0, "charAcc": 0.0, "ms": 0.0},
        "v6": {"exact": 0, "charAcc": 0.0, "ms": 0.0},
    }
    total_lines = 0

    for entry in entries:
        img = Image.open(CORPUS / entry["file"]).convert("RGB")
        truth = entry["truth"]["mrzLines"]
        boxes = det_stage.detect_lines(det, img)
        # MRZ band: bottom-region wide lines, matched to truth by best acc.
        band = [b for b in boxes if b[1] > 0.6]
        crops = []
        for x0, y0, x1, y1 in band:
            c = img.crop((int(x0 * img.width), int(y0 * img.height),
                          int(x1 * img.width), int(y1 * img.height)))
            if c.width >= 100 and c.height >= 8:
                crops.append(c)
        if not crops:
            continue

        for name, rec, vocab in (("v5", rec5, vocab5), ("v6", rec6, vocab6)):
            reads: list[str] = []
            t0 = time.perf_counter()
            for c in crops:
                try:
                    text, _conf, lattice, _ = tap_line(rec, c, vocab)
                    reads.append(text)
                except Exception as e:  # noqa: BLE001 — a model that crashes loses
                    reads.append(f"<ERROR:{e}>")
            score[name]["ms"] += (time.perf_counter() - t0) * 1000
            for want in truth:
                best = max((char_acc(r, want) for r in reads), default=0.0)
                score[name]["charAcc"] += best
                if any(r.replace(" ", "") == want for r in reads):
                    score[name]["exact"] += 1
        total_lines += len(truth)

    for name in ("v5", "v6"):
        s = score[name]
        s["exactRate"] = round(s["exact"] / max(total_lines, 1), 4)
        s["charAcc"] = round(s["charAcc"] / max(total_lines, 1), 4)
        s["msPerDoc"] = round(s["ms"] / max(len(entries), 1), 1)

    verdict = {
        "when": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "corpus": f"passports/synthetic[:{limit}] (MRZ-exact law)",
        "detector": "PP-OCRv5_server (pinned)",
        "candidates": {
            "v5": {"model": "PP-OCRv5_server_rec (pinned)", **score["v5"]},
            "v6": {"model": "PP-OCRv6_small_rec", **score["v6"]},
        },
        "artifacts": json.loads((AB_CACHE / "hashes.json").read_text()),
        "totalMrzLines": total_lines,
    }
    d5, d6 = score["v5"], score["v6"]
    if d6["exactRate"] > d5["exactRate"] and d6["charAcc"] >= d5["charAcc"]:
        verdict["verdict"] = "v6-small WINS on MRZ-exact — promote via change control (enum + browser A/B next)"
    elif d6["exactRate"] == d5["exactRate"] and d6["msPerDoc"] < d5["msPerDoc"] * 0.7:
        verdict["verdict"] = "tie on accuracy; v6-small markedly faster — promotion is a perf call"
    else:
        verdict["verdict"] = "v5-server HOLDS — enum stays locked at v5 (evidence recorded)"

    VERDICT.write_text(json.dumps(verdict, indent=1), encoding="utf-8")
    print(json.dumps(verdict["candidates"], indent=1))
    print(verdict["verdict"])
    print(f"verdict → {VERDICT}")


if __name__ == "__main__":
    main()
