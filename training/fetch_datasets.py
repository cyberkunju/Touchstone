"""
Robust, resumable, budget-aware dataset downloader for docdet training.

Downloads real/permissive public datasets into training/datasets/real/<key>/.
Designed to be run unattended:
  * RESUMABLE — Hugging Face snapshot_download resumes; URL downloads use HTTP
    Range to continue partial files; git uses clone-or-pull.
  * FAULT-TOLERANT — each dataset is independent; a failure (bad id, network,
    gated) is logged and the run continues to the next.
  * DISK-BUDGETED — stops starting new downloads once free space drops below
    --min-free-gb, so it never fills the disk.
  * PRIORITIZED — P0 (permissive, highest value) first, then P1, then giant/opt.

Usage (from training/):
  python fetch_datasets.py                      # P0+P1 accessible, keep 150GB free
  python fetch_datasets.py --priority 0         # only P0
  python fetch_datasets.py --only signature cord funsd
  python fetch_datasets.py --include-giant      # also the 90GB+/490GB monsters
  python fetch_datasets.py --min-free-gb 100    # tighter/looser disk headroom
  python fetch_datasets.py --list               # print the registry and exit

License classes are recorded but NOTHING here is shipped; research-only sets are
downloaded for local training/eval only (see benchmarks/datasets/README.md).
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time

# Speed up HF downloads when hf_transfer is present.
os.environ.setdefault("HF_HUB_ENABLE_HF_TRANSFER", "1")

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "datasets", "real")


# --- registry ----------------------------------------------------------------
# kind: hf | midv | url | git | manual
#   hf    -> huggingface_hub.snapshot_download(repo_id, repo_type='dataset', allow_patterns)
#   midv  -> midv500 package FTP download (+ optional COCO labels)
#   url   -> direct file download(s) with resume
#   git   -> git clone/pull (data that lives in the repo)
#   manual-> gated/FTP/registration; we only print instructions
REGISTRY: list[dict] = [
    # ---------------- BACKGROUNDS: real scenes for Engine A compositing -------
    # The Phase-2 prerequisite. Documents get pasted onto these real photos
    # (desks/tables/hands/floors/indoor clutter) so the detector stops assuming
    # a clean full-frame document. COCO val2017 = 5000 varied real scenes,
    # direct download, no API key. Lands in assets/backgrounds/ (NOT datasets/).
    {"key": "coco_val2017", "kind": "url_zip", "priority": -1,
     "dest": "assets/backgrounds",
     "urls": ["http://images.cocodataset.org/zips/val2017.zip"],
     "approx_gb": 1.0, "license": "COCO images (Flickr, CC-various) — research backgrounds",
     "classes": ["background"]},

    # ---------------- P0: permissive + highest value ----------------
    {"key": "signature_detection", "kind": "hf", "repo_id": "tech4humans/signature-detection",
     "approx_gb": 0.3, "license": "Apache-2.0", "priority": 0, "classes": ["signature"]},
    {"key": "cord", "kind": "hf", "repo_id": "naver-clova-ix/cord-v2",
     "approx_gb": 0.3, "license": "CC-BY-4.0", "priority": 0, "classes": ["text_block", "table"]},
    {"key": "commonforms", "kind": "hf", "repo_id": "jbarrow/CommonForms",
     "approx_gb": 40.0, "license": "code Apache; data UNVERIFIED", "priority": 0,
     "classes": ["checkbox", "signature", "text_block"]},
    {"key": "doclaynet_base", "kind": "hf", "repo_id": "pierreguillou/DocLayNet-base",
     "approx_gb": 8.0, "license": "CDLA-Permissive-1.0", "priority": 0,
     "classes": ["text_block", "table"]},
    {"key": "midv500_2019", "kind": "midv", "datasets": ["midv500", "midv2019"],
     "approx_gb": 30.0, "license": "research-only (train, do not redistribute)",
     "priority": 0, "classes": ["document_page", "photo", "mrz_zone"]},
    {"key": "abbyy_barcode", "kind": "git",
     "url": "https://github.com/abbyy/barcode_detection_benchmark.git",
     "approx_gb": 1.0, "license": "Apache-2.0", "priority": 0, "classes": ["qr_code", "barcode"]},

    # ---------------- P1: strong, after P0 ----------------
    {"key": "funsd", "kind": "hf", "repo_id": "nielsr/funsd-layoutlmv3",
     "approx_gb": 0.2, "license": "research-only", "priority": 1, "classes": ["text_block"]},
    {"key": "xfund", "kind": "hf", "repo_id": "rogerdehe/xfund",
     "approx_gb": 1.5, "license": "research-only (NC)", "priority": 1, "classes": ["text_block"]},
    {"key": "wildreceipt", "kind": "hf", "repo_id": "Theivaprakasham/wildreceipt",
     "approx_gb": 0.4, "license": "UNVERIFIED", "priority": 1, "classes": ["text_block"]},
    {"key": "fintabnet_c", "kind": "hf", "repo_id": "bsmock/FinTabNet.c",
     "approx_gb": 3.0, "license": "CDLA-Permissive-2.0", "priority": 1, "classes": ["table"]},
    {"key": "doclaynet_full", "kind": "hf", "repo_id": "ds4sd/DocLayNet",
     "approx_gb": 28.0, "license": "CDLA-Permissive-1.0", "priority": 1,
     "classes": ["text_block", "table"]},
    {"key": "ddi100", "kind": "git",
     "url": "https://github.com/machine-intelligence-laboratory/DDI-100.git",
     "approx_gb": 1.0, "license": "MIT (verify)", "priority": 1, "classes": ["stamp", "text_block"]},
    {"key": "tabrecset", "kind": "git",
     "url": "https://github.com/MaxKinny/TabRecSet.git",
     "approx_gb": 2.0, "license": "CC-BY-4.0", "priority": 1, "classes": ["table"]},

    # ---------------- P2: giant / opt-in only (--include-giant) ----------------
    {"key": "pubtables1m", "kind": "hf", "repo_id": "bsmock/pubtables-1m",
     "approx_gb": 90.0, "license": "CDLA-Permissive", "priority": 2, "classes": ["table"]},
    {"key": "idnet", "kind": "hf", "repo_id": "cactuslab/IDNet-2025",
     "approx_gb": 490.0, "license": "UNVERIFIED", "priority": 2,
     "classes": ["document_page"]},

    # ---------------- manual / gated (instructions only) ----------------
    {"key": "midv2020", "kind": "manual", "priority": 1,
     "note": "MIDV-2020: FTP ftp://smartengines.com/midv-2020 or http://l3i-share.univ-lr.fr — "
             "large, research-use. Download manually into datasets/real/midv2020/."},
    {"key": "docile", "kind": "manual", "priority": 1,
     "note": "DocILE: register for a token at https://docile.rossum.ai/ then use their CLI."},
    {"key": "hiertext", "kind": "manual", "priority": 1,
     "note": "HierText: gs://gresearch/hiertext (needs gsutil). "
             "Run: gsutil -m cp -r gs://gresearch/hiertext datasets/real/hiertext/"},
    {"key": "khatt", "kind": "manual", "priority": 1,
     "note": "KHATT (Arabic handwriting): free for research at http://khatt.ideas2serve.net/ (form)."},
]


def free_gb(path: str) -> float:
    import ctypes
    try:
        return shutil.disk_usage(path).free / 1e9
    except Exception:  # noqa: BLE001
        return float("inf")


def _dir_size_gb(path: str) -> float:
    total = 0
    for r, _d, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(r, f))
            except OSError:
                pass
    return total / 1e9


def fetch_hf(entry: dict, out: str) -> dict:
    from huggingface_hub import snapshot_download
    snapshot_download(repo_id=entry["repo_id"], repo_type="dataset",
                      local_dir=out, allow_patterns=entry.get("allow_patterns"),
                      max_workers=4)
    return {"sizeGb": round(_dir_size_gb(out), 2)}


def fetch_midv(entry: dict, out: str) -> dict:
    import midv500
    for ds in entry["datasets"]:
        midv500.download_dataset(out, dataset_name=ds)
    return {"sizeGb": round(_dir_size_gb(out), 2)}


def fetch_git(entry: dict, out: str) -> dict:
    if os.path.isdir(os.path.join(out, ".git")):
        subprocess.run(["git", "-C", out, "pull", "--ff-only"], check=False)
    else:
        subprocess.run(["git", "clone", "--depth", "1", entry["url"], out], check=True)
    return {"sizeGb": round(_dir_size_gb(out), 2)}


def fetch_url(entry: dict, out: str) -> dict:
    import requests
    os.makedirs(out, exist_ok=True)
    for url in entry.get("urls", [entry.get("url")]):
        if not url:
            continue
        fname = os.path.join(out, url.split("/")[-1].split("?")[0])
        headers = {}
        pos = 0
        if os.path.exists(fname):
            pos = os.path.getsize(fname)
            headers["Range"] = f"bytes={pos}-"
        with requests.get(url, headers=headers, stream=True, timeout=60) as r:
            if r.status_code in (200, 206):
                mode = "ab" if r.status_code == 206 else "wb"
                with open(fname, mode) as fh:
                    for chunk in r.iter_content(chunk_size=1 << 20):
                        fh.write(chunk)
    return {"sizeGb": round(_dir_size_gb(out), 2)}


def fetch_url_zip(entry: dict, out: str) -> dict:
    """Download zip(s) with resume, then extract into `out` (idempotent)."""
    import zipfile
    import requests
    os.makedirs(out, exist_ok=True)
    for url in entry.get("urls", [entry.get("url")]):
        if not url:
            continue
        fname = os.path.join(out, url.split("/")[-1].split("?")[0])
        pos = os.path.getsize(fname) if os.path.exists(fname) else 0
        headers = {"Range": f"bytes={pos}-"} if pos else {}
        with requests.get(url, headers=headers, stream=True, timeout=120) as r:
            if r.status_code in (200, 206):
                mode = "ab" if r.status_code == 206 else "wb"
                with open(fname, mode) as fh:
                    for chunk in r.iter_content(chunk_size=1 << 20):
                        fh.write(chunk)
        # extract
        if fname.lower().endswith(".zip") and zipfile.is_zipfile(fname):
            with zipfile.ZipFile(fname) as zf:
                zf.extractall(out)
            os.remove(fname)  # drop the archive once extracted
    return {"sizeGb": round(_dir_size_gb(out), 2)}


FETCHERS = {"hf": fetch_hf, "midv": fetch_midv, "git": fetch_git, "url": fetch_url,
            "url_zip": fetch_url_zip}


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Download docdet training datasets (resumable)")
    p.add_argument("--priority", type=int, default=None, help="only this priority tier (0/1/2)")
    p.add_argument("--only", nargs="*", default=None, help="only these dataset keys")
    p.add_argument("--include-giant", action="store_true", help="include P2 90GB+/490GB sets")
    p.add_argument("--min-free-gb", type=float, default=150.0,
                   help="stop starting downloads when free space drops below this")
    p.add_argument("--list", action="store_true", help="print registry and exit")
    args = p.parse_args(argv)

    if args.list:
        for e in REGISTRY:
            print(f"{e['priority']}  {e['key']:20s} {e['kind']:7s} ~{e.get('approx_gb','?')}GB  "
                  f"{e.get('license','')}  {e.get('classes','')}")
        return 0

    os.makedirs(ROOT, exist_ok=True)
    status = {"started": int(time.time()), "results": {}}
    status_path = os.path.join(ROOT, "_download_status.json")

    for e in REGISTRY:
        key = e["key"]
        if args.only and key not in args.only:
            continue
        if args.priority is not None and e["priority"] != args.priority:
            continue
        if e["priority"] == 2 and not args.include_giant and not args.only:
            status["results"][key] = {"status": "skipped", "reason": "giant (use --include-giant)"}
            continue
        if e["kind"] == "manual":
            print(f"[manual] {key}: {e.get('note','')}")
            status["results"][key] = {"status": "manual", "note": e.get("note", "")}
            continue

        free = free_gb(ROOT)
        if free < args.min_free_gb and not args.only:
            print(f"[budget] free {free:.0f}GB < {args.min_free_gb:.0f}GB — stopping before {key}")
            status["results"][key] = {"status": "skipped", "reason": "disk budget"}
            continue

        out = os.path.join(ROOT, key)
        if e.get("dest"):  # background banks live outside datasets/real/
            out = os.path.join(os.path.dirname(os.path.abspath(__file__)), e["dest"], key)
        os.makedirs(out, exist_ok=True)
        print(f"\n=== {key} ({e['kind']}, ~{e.get('approx_gb','?')}GB, {e.get('license','')}) "
              f"-> {out}  [free {free:.0f}GB] ===", flush=True)
        t0 = time.time()
        try:
            info = FETCHERS[e["kind"]](e, out)
            info.update({"status": "ok", "minutes": round((time.time() - t0) / 60, 1),
                         "license": e.get("license"), "classes": e.get("classes")})
            status["results"][key] = info
            print(f"[ok] {key}: {info.get('sizeGb','?')}GB in {info['minutes']}min")
        except Exception as exc:  # noqa: BLE001 - keep going on any single failure
            status["results"][key] = {"status": "FAILED", "error": f"{type(exc).__name__}: {exc}",
                                      "minutes": round((time.time() - t0) / 60, 1)}
            print(f"[FAILED] {key}: {type(exc).__name__}: {exc}")
        # Persist status after every dataset so progress survives interruption.
        with open(status_path, "w", encoding="utf-8") as fh:
            json.dump(status, fh, indent=2)

    ok = sum(1 for r in status["results"].values() if r.get("status") == "ok")
    print(f"\nDONE: {ok} downloaded. Status -> {status_path}")
    print(f"Free space now: {free_gb(ROOT):.0f}GB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
