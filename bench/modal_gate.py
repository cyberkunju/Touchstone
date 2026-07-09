"""Modal burst harness — the full certification chain in ~15 minutes.

Architecture (each piece earned by a live failure):
  - IMAGE: app + deps + Chrome + pinned models + built dist. No corpus —
    image stays stable across corpus growth.
  - VOLUME `docutract-corpus`: the test_cases tree. Write-once/read-many is
    Modal Volumes' stated design center (2.5 GB/s reads). Seeded ONCE by
    uploading a tar (single stream — per-file upload saturated the uplink
    and starved build heartbeats) and untarring IN the datacenter. The tar
    is built with Python's tarfile: PowerShell Compress-Archive writes
    backslash entry names that Linux unzip rejects (live-caught).
  - bench/ ships from an immutable snapshot: the local gate commits
    baselines while running, and Modal aborts on mid-upload mutation
    (live-caught).

Usage:
  python -c "import tarfile; t=tarfile.open('.modal-corpus.tar.gz','w:gz'); t.add('test_cases'); t.close()"
  modal volume create docutract-corpus            # once
  modal volume put docutract-corpus .modal-corpus.tar.gz /corpus.tar.gz --force
  modal run bench/modal_gate.py --seed            # untar in-cloud, once per corpus change
  modal run bench/modal_gate.py --families docs   # smoke
  modal run bench/modal_gate.py                   # full chain
"""

from __future__ import annotations

import modal

APP_NAME = "docutract-gate-burst"
app = modal.App(APP_NAME)

corpus_volume = modal.Volume.from_name("docutract-corpus", create_if_missing=True)

# Warm pool for iteration days: MODAL_GATE_WARM=8 keeps 8 containers hot
# (Chrome + models resident), killing the ~35s/container cold tax on repeat
# runs. Default 0 — warm containers bill while idle.
import os as _os

_WARM = int(_os.environ.get("MODAL_GATE_WARM", "0"))


def _stage_bench() -> str:
    """Snapshot bench/ into an immutable dir before upload.

    The local certification chain writes bench/baselines/*.json while it
    runs; Modal hashes uploads and ABORTS on mid-upload mutation
    (live-caught: composites.json committed during image build). The
    snapshot decouples the harness from concurrent local gate activity.
    """
    import shutil
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    stage = root / ".modal-stage" / "bench"
    if stage.exists():
        shutil.rmtree(stage)
    shutil.copytree(
        root / "bench", stage,
        ignore=shutil.ignore_patterns("_*.log", "*.pyc", "__pycache__", "modal_gate.py"),
    )
    return str(stage)


_BENCH_DIR = _stage_bench() if modal.is_local() else "/root/app/bench"

# P3.6 A/B knob: GATE_OCR_TIER=v6-small builds the image with the v6
# recognition tier (build-time constant — different command string ⇒ new
# layer hash ⇒ clean rebuild). Default = the certified v5-server lock.
_OCR_TIER = _os.environ.get("GATE_OCR_TIER", "v5-server") if modal.is_local() else "v5-server"

# ---------------------------------------------------------------- image ----
# Layered for cache-friendliness: node+chrome deps rarely change; deps layer
# changes with the lockfile; source layer changes per commit; corpus is a
# runtime-attached dir (content-addressed upload, no image rebuilds).

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install(
        "curl", "ca-certificates", "gnupg", "unzip",
        # Chrome runtime deps (puppeteer's chrome-for-testing needs these):
        "libasound2", "libatk-bridge2.0-0", "libatk1.0-0", "libcairo2",
        "libcups2", "libdbus-1-3", "libdrm2", "libgbm1", "libglib2.0-0",
        "libnss3", "libpango-1.0-0", "libx11-6", "libxcb1", "libxcomposite1",
        "libxdamage1", "libxext6", "libxfixes3", "libxkbcommon0",
        "libxrandr2", "fonts-liberation", "fonts-noto-cjk",
    )
    .run_commands(
        # Node 20 (NodeSource).
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs",
        "node --version",
    )
    # Dependency layer (invalidates only when the lockfile changes).
    .add_local_file("package.json", "/root/app/package.json", copy=True)
    .add_local_file("package-lock.json", "/root/app/package-lock.json", copy=True)
    .run_commands(
        # --ignore-scripts: the project's OWN postinstall (copy-ort-wasm)
        # needs scripts/ which lands in a later layer (live-caught build
        # failure); dependency lifecycle scripts re-run via npm rebuild below.
        "cd /root/app && npm ci --no-audit --no-fund --ignore-scripts",
        "cd /root/app && npx puppeteer browsers install chrome",
    )
    # Source layer.
    .add_local_file("index.html", "/root/app/index.html", copy=True)
    .add_local_file("vite.config.ts", "/root/app/vite.config.ts", copy=True)
    .add_local_file("tsconfig.json", "/root/app/tsconfig.json", copy=True)
    # Our own trained layout model ships IN the repo (no upstream host) —
    # fetch-models can't fetch it; it must land before the vite build copies
    # public/ into dist/.
    .add_local_file("public/models/docdet_v1.onnx",
                    "/root/app/public/models/docdet_v1.onnx", copy=True)
    .add_local_dir("src", "/root/app/src", copy=True)
    .add_local_dir("scripts", "/root/app/scripts", copy=True)
    .run_commands(
        # Dependency postinstalls skipped at ci time (esbuild's binary etc.).
        "cd /root/app && npm rebuild",
        # ORT wasm + pinned models baked in (fetch-models verifies sha256s).
        "cd /root/app && node scripts/copy-ort-wasm.mjs",
        "cd /root/app && node scripts/fetch-models.mjs",
        # Production build — deterministic, no HMR, no dev-server races.
        # OCR tier is a build-time constant (P3.6 A/B knob).
        f"cd /root/app && VITE_OCR_TIER={_OCR_TIER} npx tsc --noEmit && VITE_OCR_TIER={_OCR_TIER} npx vite build",
    )
    # Gate + baselines (immutable snapshot — see _stage_bench).
    .add_local_dir(_BENCH_DIR, "/root/app/bench", copy=True)
)


@app.function(image=image, volumes={"/vol": corpus_volume}, timeout=1800, cpu=2.0)
def seed_corpus() -> str:
    """Reassemble chunked upload, verify sha256, untar INTO the volume.

    Chunked because residential uplinks reset long single streams
    (live-caught: WinError 10054 × 2 on 913MB puts). Verification before
    extraction: a torn tar must never silently seed a partial corpus.
    """
    import hashlib
    import json
    import subprocess
    from pathlib import Path

    chunks_dir = Path("/vol/chunks")
    manifest = json.loads((chunks_dir / "manifest.json").read_text())

    h = hashlib.sha256()
    with open("/tmp/corpus.tar.gz", "wb") as out:
        for i in range(manifest["chunks"]):
            data = (chunks_dir / f"part-{i:03d}").read_bytes()
            h.update(data)
            out.write(data)
    if h.hexdigest() != manifest["sha256"]:
        raise RuntimeError(
            f"corpus integrity: got {h.hexdigest()[:12]} want {manifest['sha256'][:12]} — refusing to seed")

    subprocess.run(["rm", "-rf", "/vol/test_cases"], check=True)
    proc = subprocess.run(
        ["tar", "-xzf", "/tmp/corpus.tar.gz", "-C", "/vol",
         "-m", "--no-same-owner", "--no-same-permissions"],
        capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"tar failed ({proc.returncode}): {proc.stderr[-800:]}")
    subprocess.run(["rm", "-rf", "/vol/chunks"], check=True)
    corpus_volume.commit()
    out2 = subprocess.run(["ls", "/vol/test_cases"], capture_output=True, text=True)
    return f"seeded: {len(out2.stdout.splitlines())} families (sha256 verified)"


@app.function(
    image=image,
    volumes={
        "/root/app/test_cases": corpus_volume.with_mount_options(
            sub_path="/test_cases", read_only=True),
    },
    cpu=4.0,
    memory=6144,
    timeout=3600,
    max_containers=64,
    min_containers=_WARM,
)
def run_shard(family: str, filter_re: str | None = None) -> dict:
    """One gate shard: serve the built app, run the real gate, return verdicts."""
    import re
    import subprocess
    import time
    from pathlib import Path

    cwd = "/root/app"
    server = subprocess.Popen(
        ["npx", "vite", "preview", "--port", "5173", "--strictPort", "--host", "127.0.0.1"],
        cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        # Wait for the server.
        import urllib.request
        for _ in range(60):
            try:
                urllib.request.urlopen("http://localhost:5173/", timeout=1)
                break
            except Exception:
                time.sleep(0.5)

        cmd = ["node", "bench/gate.mjs", "--corpus", family]
        if filter_re:
            cmd += ["--filter", filter_re]
        proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=3300)
        log = proc.stdout + proc.stderr

        summary = {}
        m = re.search(r"entries=(\d+) passed=(\d+) SILENT=(\d+)", log)
        if m:
            summary = {"entries": int(m.group(1)), "passed": int(m.group(2)),
                       "silent": int(m.group(3))}
        rates = re.search(r"mrzValidRate=([\d.]+)% fieldHitRate=([\d.]+)%", log)
        if rates:
            summary["mrzValidRate"] = float(rates.group(1))
            summary["fieldHitRate"] = float(rates.group(2))

        silents = re.findall(r"SILENT ERROR .+", log)
        last_run = Path(cwd, "bench/baselines/last-run.json")
        return {
            "family": family,
            "filter": filter_re,
            "exit": proc.returncode,
            "summary": summary,
            "silents": silents,
            "lastRun": last_run.read_text() if last_run.exists() else None,
            "tail": "\n".join(log.splitlines()[-15:]),
        }
    finally:
        server.terminate()


# Families and their shard filters. Shard sizing law: the wall-clock equals
# the SLOWEST shard, so slow families (real entries run 15-25s) split hardest;
# floor ~10-15 entries/shard keeps the ~35s container startup amortized.
FAMILIES: dict[str, list[str | None]] = {
    "passports": ["^id0[01]", "^id0[23]", "^id0[45]", "^id0[67]",
                  "^id0[89]", "^id1[01]", "^id1[2-3]", "^id1[4-5]|^(?!id)"],
    "docs": [None],
    "ids": ["^td1_id0", "^td1_id1", "^td2_id0", "^td2_id1"],
    "licenses": ["^lic_id0[0-4]", "^lic_id0[5-9]", "^lic_id1"],
    "bank": ["bank_id0[0-2]", "bank_id0[3-5]", "bank_id0[6-9]"],
    "payslips": ["payslip_id0[0-2]", "payslip_id0[3-5]", "payslip_id0[6-9]"],
    "utility": ["util.*id0[0-3]", "util.*id0[4-9]"],
    "vehicles": ["veh.*id0[0-4]", "veh.*id0[5-9]"],
    "boarding": ["bp.*id0[0-4]|boarding.*id0[0-4]", "bp.*id0[5-9]|boarding.*id0[5-9]"],
    "shipping": ["ship.*id0[0-4]", "ship.*id0[5-9]"],
    "cards": [None],
    "visas": ["visa_id0[0-3]", "visa_id0[4-9]"],
    "permits": ["perm_id0[0-3]", "perm_id0[4-9]"],
    "tax": [None],
    "po": [None],
    "insurance": [None],
    "certificates": [None],
    "transcripts": [None],
    "labs": [None],
    "icards": [None],
    "blanks": [None],
    "foreign": [None],
    "letters": [None],
    "leases": [None],
    "rx": ["rx.*id0[0-4]|presc.*id0[0-4]", "rx.*id0[5-9]|presc.*id0[5-9]"],
    "quest": [None],
    "composites": ["__desk", "__fabric", "__lowlight"],
    "mixed": [None],
    "real": ["forge_0[0-2]", "forge_0[3-5]", "forge_0[6-9]",
             "forge_1[0-2]", "forge_1[3-5]", "forge_1[6-9]",
             "forge_2[0-2]", "forge_2[3-5]", "forge_2[6-9]",
             "^(?!.*forge)"],
}


@app.local_entrypoint()
def main(families: str = "", seed: bool = False, commit: bool = False,
         upload: bool = False) -> None:
    if upload:
        # Chunked, per-part-retried upload of .modal-corpus.tar.gz.
        # Residential uplinks reset long single streams (WinError 10054 on
        # 913MB puts, live-caught twice); 32MB parts + 5 retries each make
        # the transfer monotonic — progress never restarts from zero.
        import hashlib
        import io
        import json
        import time
        from pathlib import Path

        tar = Path(__file__).resolve().parents[1] / ".modal-corpus.tar.gz"
        if not tar.exists():
            raise SystemExit("build .modal-corpus.tar.gz first (python tarfile)")
        data = tar.read_bytes()
        sha = hashlib.sha256(data).hexdigest()
        part_size = 32 * 1024 * 1024
        parts = [data[i:i + part_size] for i in range(0, len(data), part_size)]
        print(f"uploading {len(data)/1e6:.0f} MB as {len(parts)} parts (sha {sha[:12]}…)")

        vol = modal.Volume.from_name("docutract-corpus", create_if_missing=True)
        for i, part in enumerate(parts):
            for attempt in range(5):
                try:
                    with vol.batch_upload(force=True) as batch:
                        batch.put_file(io.BytesIO(part), f"/chunks/part-{i:03d}")
                    print(f"  part {i + 1}/{len(parts)} ok")
                    break
                except Exception as e:  # noqa: BLE001 — retry is the point
                    wait = 2 ** attempt
                    print(f"  part {i} attempt {attempt + 1} failed ({type(e).__name__}); retry in {wait}s")
                    time.sleep(wait)
            else:
                raise SystemExit(f"part {i} failed after 5 attempts")
        with vol.batch_upload(force=True) as batch:
            batch.put_file(
                io.BytesIO(json.dumps({"chunks": len(parts), "sha256": sha}).encode()),
                "/chunks/manifest.json")
        print("upload complete — run --seed next")
        return

    if seed:
        print(seed_corpus.remote())
        return

    wanted = [f.strip() for f in families.split(",") if f.strip()] or list(FAMILIES)
    shards = [(fam, flt) for fam in wanted for flt in FAMILIES.get(fam, [None])]
    print(f"dispatching {len(shards)} shards across up to 32 containers…")

    results = list(run_shard.starmap(shards))

    print("\n=== MERGED SCOREBOARD ===")
    by_family: dict[str, dict] = {}
    for r in results:
        agg = by_family.setdefault(r["family"], {"entries": 0, "passed": 0, "silent": 0,
                                                 "mrz_w": 0.0, "hit_w": 0.0,
                                                 "silents": [], "exits": []})
        s = r["summary"]
        n = s.get("entries", 0)
        agg["entries"] += n
        agg["passed"] += s.get("passed", 0)
        agg["silent"] += s.get("silent", 0)
        # Entry-weighted rate merge across shards of one family.
        agg["mrz_w"] += s.get("mrzValidRate", 0.0) * n
        agg["hit_w"] += s.get("fieldHitRate", 0.0) * n
        agg["silents"] += r["silents"]
        agg["exits"].append(r["exit"])

    total_e = total_p = total_s = 0
    # Coverage law: merged shard entries must equal the local manifest count
    # — an empty or overlapping shard filter is a SILENT coverage hole
    # (live-caught: 'permit_id' regex vs actual 'perm_id' prefix matched
    # zero files). Loud or it didn't happen.
    import json as _json
    from pathlib import Path as _Path

    _dirs = {
        "passports": "passports/synthetic", "docs": "docs/synthetic",
        "ids": "id_cards/synthetic", "licenses": "licenses/synthetic",
        "bank": "bank_statements/synthetic", "payslips": "payslips/synthetic",
        "utility": "utility_bills/synthetic", "vehicles": "vehicle_docs/synthetic",
        "boarding": "boarding_passes/synthetic", "shipping": "shipping_labels/synthetic",
        "cards": "business_cards/synthetic", "visas": "visas/synthetic",
        "permits": "residence_permits/synthetic", "tax": "tax_forms/synthetic",
        "po": "purchase_orders/synthetic", "insurance": "insurance_notices/synthetic",
        "certificates": "certificates/synthetic", "transcripts": "transcripts/synthetic",
        "labs": "medical_labs/synthetic", "icards": "insurance_cards/synthetic",
        "blanks": "blank_forms/synthetic", "foreign": "foreign_script/synthetic",
        "letters": "letters/synthetic", "leases": "property_leases/synthetic",
        "rx": "prescriptions/synthetic", "quest": "questionnaires/synthetic",
        "composites": "composites", "real": "passports/real_fakes",
    }
    root = _Path(__file__).resolve().parents[1]
    coverage_holes: list[str] = []
    for fam, a in by_family.items():
        manifest = root / "test_cases" / _dirs.get(fam, "") / "manifest.json"
        if manifest.exists():
            expected = len(_json.loads(manifest.read_text(encoding="utf-8")))
            if a["entries"] != expected:
                coverage_holes.append(f"{fam}: shards covered {a['entries']}/{expected}")

    for fam, a in by_family.items():
        total_e += a["entries"]
        total_p += a["passed"]
        total_s += a["silent"]
        flag = "OK " if a["silent"] == 0 else "SIL"
        print(f"{flag} {fam:<14} {a['passed']}/{a['entries']} silent={a['silent']}")
        for s in a["silents"][:5]:
            print(f"      {s}")
    print(f"\nTOTAL {total_p}/{total_e} SILENT={total_s}")
    if coverage_holes:
        print("\n!! COVERAGE HOLES (shard filters missed/double-counted entries):")
        for hole in coverage_holes:
            print(f"   {hole}")

    if commit:
        # Modal is the certification of record: write per-family baselines
        # from merged shard results. The LAW gates the commit — a family
        # commits only with zero silents and every entry accounted for.
        # (Shard exit 3 = rate ratchet vs the PREVIOUS environment's
        # baseline; expected once on the environment switch.)
        import datetime
        import json
        from pathlib import Path

        baselines = Path(__file__).resolve().parent / "baselines"
        committed = 0
        holed = {h.split(":")[0] for h in coverage_holes}
        for fam, a in by_family.items():
            if a["silent"] != 0 or a["entries"] == 0 or fam in holed:
                print(f"NOT committed: {fam} (silent={a['silent']}, entries={a['entries']}, hole={fam in holed})")
                continue
            (baselines / f"{fam}.json").write_text(json.dumps({
                "when": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "entries": a["entries"],
                "passed": a["passed"],
                "silentErrors": 0,
                "mrzValidRate": round(a["mrz_w"] / a["entries"] / 100, 4),
                "fieldHitRate": round(a["hit_w"] / a["entries"] / 100, 4),
                "adversarialRefusalRate": 0,
                "note": "certified on Modal burst (single-environment record; shard-merged)",
            }, indent=1))
            committed += 1
        print(f"baselines committed: {committed}/{len(by_family)}")
    else:
        print("(dry: pass --commit to write per-family baselines)")
