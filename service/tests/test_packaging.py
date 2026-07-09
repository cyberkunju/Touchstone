"""P7.2 packaging + UI-serving tests.

The wheel-data law: a flat py-modules wheel silently drops MANIFEST.json /
bundle-schema.json; the package-dir layout must ship them. Verified by
BUILDING the real wheel and inspecting its contents — not by trusting
configuration.
"""

from __future__ import annotations

import subprocess
import sys
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

SERVICE_DIR = Path(__file__).resolve().parents[1]


@pytest.mark.filterwarnings("ignore")
def test_wheel_ships_data_files_and_entry_point(tmp_path):
    out = tmp_path / "dist"
    r = subprocess.run(
        [sys.executable, "-m", "pip", "wheel", "--no-deps", "--no-build-isolation",
         "-w", str(out), str(SERVICE_DIR)],
        capture_output=True, text=True, timeout=600,
    )
    assert r.returncode == 0, f"wheel build failed:\n{r.stdout}\n{r.stderr}"
    wheels = list(out.glob("docutract_service-*.whl"))
    assert len(wheels) == 1, f"expected one wheel, got {wheels}"

    names = zipfile.ZipFile(wheels[0]).namelist()
    assert "docutract_service/MANIFEST.json" in names, "model manifest missing from wheel"
    assert "docutract_service/bundle-schema.json" in names, "bundle schema missing from wheel"
    assert "docutract_service/main.py" in names
    assert "docutract_service/stages/reconcile.py" in names
    # Console script wiring.
    meta = next(n for n in names if n.endswith("entry_points.txt"))
    entry = zipfile.ZipFile(wheels[0]).read(meta).decode()
    assert "docutract-service = docutract_service.main:run_cli" in entry
    # Tests must NOT ship.
    assert not any("tests/" in n for n in names)


def test_ui_mount_serves_when_dir_present(tmp_path, monkeypatch):
    ui = tmp_path / "ui"
    ui.mkdir()
    (ui / "index.html").write_text("<!doctype html><title>docutract</title>", encoding="utf-8")
    monkeypatch.setenv("DOCUTRACT_UI_DIR", str(ui))

    # Fresh app instance under the env var (main mounts at import time).
    import importlib
    import main as main_module
    importlib.reload(main_module)
    client = TestClient(main_module.app)

    r = client.get("/")
    assert r.status_code == 200
    assert "docutract" in r.text
    # API routes still win over the static mount.
    h = client.get("/v1/health")
    assert h.status_code == 200
    assert h.json()["ok"] is True

    monkeypatch.delenv("DOCUTRACT_UI_DIR")
    importlib.reload(main_module)


def test_headless_when_no_ui_dir(monkeypatch):
    monkeypatch.delenv("DOCUTRACT_UI_DIR", raising=False)
    import importlib
    import main as main_module
    importlib.reload(main_module)
    client = TestClient(main_module.app)
    # Health always works; root 404s honestly when no UI is deployed and no
    # repo dist exists (when ../dist exists in the repo, serving it is right).
    assert client.get("/v1/health").status_code == 200
    root = client.get("/")
    assert root.status_code in (200, 404)
