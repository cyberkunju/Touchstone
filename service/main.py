"""Perception service HTTP surface (P3.1) — thin composition over ladder.py.

Frozen contract: 05 section 2. Binds 127.0.0.1 ONLY (Constitution). The
endpoints own transport concerns exclusively — every perception decision
lives in `ladder.perceive`/`ladder.reperceive`; every failure maps to the
error envelope `{ error: { code, detail } }` with no stack traces.

Run: `uvicorn service.main:app --host 127.0.0.1 --port 8477`
(or `python -m service.main`).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bundle import BundleInvalid  # noqa: E402
from config import (  # noqa: E402
    BIND_HOST,
    BIND_PORT,
    BUNDLE_VERSION,
    DEFAULT_BUDGET_MS,
    MAX_UPLOAD_BYTES,
    MODEL_DIR,
    PROFILE,
    SERVICE_VERSION,
)
from ladder import Models, UnsupportedType, perceive, reperceive  # noqa: E402

app = FastAPI(title="docutract perception service", version=SERVICE_VERSION,
              docs_url=None, redoc_url=None)

_models = Models(model_dir=MODEL_DIR)


def _error(status: int, code: str, detail: str) -> JSONResponse:
    """The one error envelope (05 section 2) — never a stack trace."""
    return JSONResponse(status_code=status,
                        content={"error": {"code": code, "detail": detail}})


@app.get("/v1/health")
def health() -> dict[str, Any]:
    loaded: dict[str, str] = {}
    if _models._det is not None:  # noqa: SLF001 — introspection, not mutation
        loaded["det"] = "PP-OCRv5_server_det_infer.onnx"
    if _models._rec is not None:  # noqa: SLF001
        loaded["rec"] = "PP-OCRv5_server_rec_infer.onnx"
    return {
        "ok": True,
        "version": SERVICE_VERSION,
        "bundleVersion": BUNDLE_VERSION,
        "profile": PROFILE.name,
        "modelsLoaded": loaded,
        "residentMB": 0,  # populated when the LRU registry lands (post-P3.1)
    }


@app.post("/v1/perceive")
async def v1_perceive(file: UploadFile = File(...),
                      options: str = Form("{}")) -> Any:
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        return _error(413, "PAYLOAD_TOO_LARGE",
                      f"{len(data)} bytes exceeds {MAX_UPLOAD_BYTES}")
    try:
        opts = json.loads(options) if options else {}
    except json.JSONDecodeError as e:
        return _error(400, "DECODE_FAIL", f"options is not JSON: {e}")
    _ = opts.get("budgetMs", DEFAULT_BUDGET_MS)  # budget enforcement: ladder v2

    try:
        return perceive(data, _models)
    except UnsupportedType as e:
        return _error(415, "UNSUPPORTED_TYPE", str(e))
    except BundleInvalid as e:
        return _error(500, "INTERNAL", f"bundle contract violation: {e}")
    except Exception as e:  # noqa: BLE001 — envelope law: no stack traces
        return _error(500, "INTERNAL", str(e))


@app.post("/v1/reperceive")
async def v1_reperceive(file: UploadFile = File(...),
                        request: str = Form(...)) -> Any:
    """Foveation callback. Interim shape: the brain re-sends the file bytes
    alongside `{ page, rois, dpiHint? }` — the sha256-scratch + 410 GONE
    optimization replaces the re-upload when the scratch store lands."""
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        return _error(413, "PAYLOAD_TOO_LARGE",
                      f"{len(data)} bytes exceeds {MAX_UPLOAD_BYTES}")
    try:
        req = json.loads(request)
        page = int(req["page"])
        rois = [tuple(float(v) for v in roi) for roi in req["rois"]]
        if not all(len(r) == 4 for r in rois):
            raise ValueError("each roi must be [x, y, w, h]")
        dpi_scale = float(req.get("dpiHint", 2.0))
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as e:
        return _error(400, "DECODE_FAIL", f"bad reperceive request: {e}")

    try:
        lines = reperceive(data, page, rois, _models, dpi_scale=dpi_scale)
        return {"page": page, "ocr": lines}
    except UnsupportedType as e:
        return _error(415, "UNSUPPORTED_TYPE", str(e))
    except Exception as e:  # noqa: BLE001
        return _error(500, "INTERNAL", str(e))


@app.exception_handler(HTTPException)
async def http_exc_handler(_req: Any, exc: HTTPException) -> JSONResponse:
    return _error(exc.status_code, "INTERNAL", str(exc.detail))


def run_cli() -> None:
    """Console entry point (`docutract-service`) — fetch/verify models, serve."""
    import fetch_models
    import uvicorn

    failures = fetch_models.run(verify_only=False)
    if failures:
        print(f"model fetch/verify failed ({failures}) — refusing to serve unverified models")
        raise SystemExit(1)
    uvicorn.run(app, host=BIND_HOST, port=BIND_PORT)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=BIND_HOST, port=BIND_PORT)
