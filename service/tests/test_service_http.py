"""P3.1 acceptance: HTTP surface + model fetch/verify.

TestClient runs the ASGI app in-process — the real endpoints, the real
ladder, the real models; no port binding, no network.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# P7.3 §2.2: pin the bearer token BEFORE main imports (token init is
# import-time). The suite exercises the REAL auth middleware.
os.environ.setdefault("DOCUTRACT_TOKEN", "test-suite-token")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import fetch_models  # noqa: E402
from main import app  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
NATIVE = ROOT / "test_cases" / "native_files"
PASSPORTS = ROOT / "test_cases" / "passports" / "synthetic"


@pytest.fixture(scope="module")
def client():
    c = TestClient(app)
    c.headers.update({"Authorization": "Bearer test-suite-token"})
    return c


def test_health_is_tokenless(client):
    r = TestClient(app).get("/v1/health")  # NO token — liveness must work
    assert r.status_code == 200
    assert r.json()["authRequired"] is True


def test_other_local_user_is_refused():
    """P7.3 acceptance: without the handshake token, data endpoints 401 with
    the error envelope (no stack traces, no partial processing)."""
    anon = TestClient(app)
    r = anon.post("/v1/perceive", files={"file": ("x.png", b"fake")})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHORIZED"
    wrong = TestClient(app)
    wrong.headers.update({"Authorization": "Bearer wrong-token"})
    assert wrong.post("/v1/perceive", files={"file": ("x.png", b"fake")}).status_code == 401


def test_health(client):
    r = client.get("/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["bundleVersion"] == 1
    assert body["profile"] in ("lite", "full")


def test_perceive_xlsx_native_route(client):
    r = client.post(
        "/v1/perceive",
        files={"file": ("ledger.xlsx", (NATIVE / "ledger_00.xlsx").read_bytes())},
    )
    assert r.status_code == 200
    bundle = r.json()
    assert bundle["bundleVersion"] == 1
    assert bundle["source"]["kind"] == "xlsx"
    values = {c["value"] for c in bundle["pages"][0]["native"]["cells"]}
    assert "Opening balance" in values


def test_perceive_image_vision_route_delivers_lattices(client):
    r = client.post(
        "/v1/perceive",
        files={"file": ("p.png", (PASSPORTS / "id00_clean.png").read_bytes())},
        data={"options": json.dumps({"budgetMs": 8000})},
    )
    assert r.status_code == 200
    page = r.json()["pages"][0]
    assert len(page["ocr"]) >= 5
    assert all(line["lattice"] for line in page["ocr"])


def test_perceive_unsupported_type_envelope(client):
    r = client.post("/v1/perceive",
                    files={"file": ("x.bin", b"\x00\x01\x02\x03" * 100)})
    assert r.status_code == 415
    err = r.json()["error"]
    assert err["code"] == "UNSUPPORTED_TYPE"
    assert "traceback" not in json.dumps(r.json()).lower()


def test_perceive_bad_options_envelope(client):
    r = client.post(
        "/v1/perceive",
        files={"file": ("p.png", (PASSPORTS / "id00_clean.png").read_bytes())},
        data={"options": "{not json"},
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "DECODE_FAIL"


def test_reperceive_endpoint(client):
    r = client.post(
        "/v1/reperceive",
        files={"file": ("p.png", (PASSPORTS / "id00_clean.png").read_bytes())},
        data={"request": json.dumps(
            {"page": 0, "rois": [[0.05, 0.80, 0.9, 0.12]], "dpiHint": 2.0})},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["page"] == 0
    assert len(body["ocr"]) == 1
    assert body["ocr"][0]["lattice"]


def test_reperceive_bad_request_envelope(client):
    r = client.post(
        "/v1/reperceive",
        files={"file": ("p.png", (PASSPORTS / "id00_clean.png").read_bytes())},
        data={"request": json.dumps({"rois": "nope"})},
    )
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "DECODE_FAIL"


def test_fetch_models_verify_passes_on_pinned_set():
    assert fetch_models.run(verify_only=True) == 0


def test_fetch_models_detects_corruption(tmp_path):
    manifest = json.loads((Path(fetch_models.MANIFEST_PATH)).read_text(encoding="utf-8"))
    name = manifest["models"][0]["file"]
    (tmp_path / name).write_bytes(b"corrupted artifact")
    failures = fetch_models.run(verify_only=True, model_dir=tmp_path)
    assert failures == len(manifest["models"]), "mismatch + missing must all fail"
