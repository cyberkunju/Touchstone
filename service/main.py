"""Perception service HTTP surface (P3.1) — thin composition over ladder.py.

Frozen contract: 05 section 2. Binds 127.0.0.1 ONLY (Constitution). The
endpoints own transport concerns exclusively — every perception decision
lives in `ladder.perceive`/`ladder.reperceive`; every failure maps to the
error envelope `{ error: { code, detail } }` with no stack traces.

Run: `uvicorn service.main:app --host 127.0.0.1 --port 8477`
(or `python -m service.main`).
"""

from __future__ import annotations

import hmac
import json
import os
import secrets
import stat
import sys
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

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
    TOKEN_FILE,
)
from ladder import Models, UnsupportedType, perceive, reperceive  # noqa: E402

app = FastAPI(title="docutract perception service", version=SERVICE_VERSION,
              docs_url=None, redoc_url=None)

_models = Models(model_dir=MODEL_DIR)


def _init_token() -> str:
    """P7.3 §2.2: random per-start bearer token, written to a USER-ONLY
    handshake file (0600) the UI reads. `DOCUTRACT_TOKEN` env overrides for
    test harnesses. Defeats other-local-user access on shared machines."""
    env = os.environ.get("DOCUTRACT_TOKEN")
    if env:
        return env
    token = secrets.token_urlsafe(32)
    try:
        TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        TOKEN_FILE.write_text(token, encoding="utf-8")
        try:
            TOKEN_FILE.chmod(stat.S_IRUSR | stat.S_IWUSR)  # 0600 (POSIX; no-op ACLs on Windows)
        except OSError:
            pass
    except OSError as e:  # unwritable home: still serve, log loudly
        print(f"WARNING: could not write token handshake file {TOKEN_FILE}: {e}")
    return token


_TOKEN = _init_token()


@app.middleware("http")
async def _require_bearer(request: Request, call_next: Any) -> Any:
    """Every endpoint except tokenless /v1/health (liveness carries no
    document data) and the static UI requires the bearer token,
    constant-time compared. 401 envelope on failure — never a stack trace."""
    path = request.url.path
    if not path.startswith("/v1/") or path == "/v1/health":
        return await call_next(request)
    auth = request.headers.get("authorization", "")
    presented = auth[7:] if auth.startswith("Bearer ") else ""
    if not hmac.compare_digest(presented.encode(), _TOKEN.encode()):
        return _error(401, "UNAUTHORIZED", "missing or invalid bearer token")
    return await call_next(request)


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
        "authRequired": True,  # P7.3 §2.2 — data endpoints need the bearer token
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


def _mount_ui() -> None:
    """P7.2: serve the built UI from the service so one process delivers the
    whole product. Mounted LAST so /v1/* always wins. Resolution order:
    `DOCUTRACT_UI_DIR` env → repo-layout `../dist` → packaged `ui/`. Absent
    UI is not an error — the service is a valid headless deployment."""
    candidates = []
    env_dir = os.environ.get("DOCUTRACT_UI_DIR")
    if env_dir:
        candidates.append(Path(env_dir))
    here = Path(__file__).resolve().parent
    candidates.append(here.parent / "dist")
    candidates.append(here / "ui")
    for c in candidates:
        if c.is_dir() and (c / "index.html").is_file():
            app.mount("/", StaticFiles(directory=str(c), html=True), name="ui")
            return


_mount_ui()


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
