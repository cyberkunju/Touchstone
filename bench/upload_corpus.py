"""Chunked, retried, verified corpus upload to the Modal volume.

Residential uplinks reset long single-stream uploads (live-caught:
WinError 10054 killed two 913MB `modal volume put` attempts). Chunks make
success inevitable: each 48MB piece retries independently, progress
survives disconnects, and the in-cloud reassembly verifies sha256 before
any extraction.

Usage:  python bench/upload_corpus.py            # split + upload + verify
Then:   modal run bench/modal_gate.py --seed     # reassemble + untar in-cloud
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tarfile
import tempfile
import time
from pathlib import Path

CHUNK_MB = 48
VOLUME = "docutract-corpus"
ROOT = Path(__file__).resolve().parents[1]
TAR = ROOT / ".modal-corpus.tar.gz"
RETRIES = 6


def build_tar() -> None:
    print("building tar…")
    t0 = time.time()
    with tarfile.open(TAR, "w:gz", compresslevel=1) as t:
        t.add(ROOT / "test_cases", arcname="test_cases")
    print(f"  {TAR.stat().st_size / 1e6:.0f} MB in {time.time() - t0:.0f}s")


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def put_with_retries(local: Path, remote: str) -> None:
    for attempt in range(1, RETRIES + 1):
        proc = subprocess.run(
            ["modal", "volume", "put", VOLUME, str(local), remote, "--force"],
            capture_output=True, text=True)
        if proc.returncode == 0:
            return
        print(f"  attempt {attempt}/{RETRIES} failed "
              f"({proc.stderr.strip().splitlines()[-1][:80] if proc.stderr.strip() else 'no stderr'}) — retrying")
        time.sleep(min(2 ** attempt, 30))
    raise SystemExit(f"upload of {remote} failed after {RETRIES} attempts")


def main() -> None:
    if not TAR.exists():
        build_tar()
    total_sha = sha256_of(TAR)
    size = TAR.stat().st_size
    n_chunks = (size + CHUNK_MB * 1024 * 1024 - 1) // (CHUNK_MB * 1024 * 1024)
    print(f"tar {size / 1e6:.0f} MB → {n_chunks} chunks of {CHUNK_MB} MB · sha256 {total_sha[:12]}…")

    with tempfile.TemporaryDirectory() as tmp:
        manifest = {"sha256": total_sha, "chunks": int(n_chunks), "size": size}
        with TAR.open("rb") as f:
            for i in range(n_chunks):
                part = Path(tmp) / f"part-{i:03d}"
                part.write_bytes(f.read(CHUNK_MB * 1024 * 1024))
                t0 = time.time()
                put_with_retries(part, f"/chunks/part-{i:03d}")
                mb = part.stat().st_size / 1e6
                print(f"  part-{i:03d} ✓ {mb:.0f} MB in {time.time() - t0:.0f}s "
                      f"({i + 1}/{n_chunks})")
                part.unlink()
        mpath = Path(tmp) / "manifest.json"
        mpath.write_text(json.dumps(manifest))
        put_with_retries(mpath, "/chunks/manifest.json")
    print("all chunks uploaded — run: modal run bench/modal_gate.py --seed")


if __name__ == "__main__":
    sys.exit(main())
