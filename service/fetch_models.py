"""Model fetcher (P3.1) — download + sha256-verify the pinned model set.

Idempotent: files already present AND hash-matching are skipped; a present
but hash-MISMATCHING file is a hard error (never silently re-downloaded —
a changed artifact must be a deliberate MANIFEST bump, not drift).

Usage:
  python service/fetch_models.py            # fetch into config.MODEL_DIR
  python service/fetch_models.py --verify   # verify only, no network
"""

from __future__ import annotations

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import MODEL_DIR  # noqa: E402

MANIFEST_PATH = Path(__file__).resolve().parent / "MANIFEST.json"


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _download(url: str, dest: Path) -> None:
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url) as resp, tmp.open("wb") as out:  # noqa: S310 — pinned https URLs from the committed manifest
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
    tmp.replace(dest)


def run(verify_only: bool = False, model_dir: Path = MODEL_DIR) -> int:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    model_dir.mkdir(parents=True, exist_ok=True)
    failures = 0

    for entry in manifest["models"]:
        dest = model_dir / entry["file"]
        want = entry["sha256"]

        if dest.exists():
            got = _sha256(dest)
            if got == want:
                print(f"ok       {entry['file']}")
                continue
            print(f"MISMATCH {entry['file']}: sha256 {got[:12]}… != pinned {want[:12]}…")
            failures += 1
            continue

        if verify_only:
            print(f"MISSING  {entry['file']}")
            failures += 1
            continue

        print(f"fetch    {entry['file']} …")
        _download(entry["url"], dest)
        got = _sha256(dest)
        if got != want:
            dest.unlink()
            print(f"BAD FETCH {entry['file']}: sha256 {got[:12]}… != pinned {want[:12]}… (deleted)")
            failures += 1
        else:
            print(f"verified {entry['file']}")

    return failures


if __name__ == "__main__":
    sys.exit(run(verify_only="--verify" in sys.argv))
