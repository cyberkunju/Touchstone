"""Service configuration (05 section 6) — every value has exactly ONE source
of truth here; nothing reads env vars ad hoc.

`DOCUTRACT_PROFILE` (lite|full) is the single supported env var, read once
at import into `PROFILE`.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

SERVICE_VERSION = "0.1.0"
BUNDLE_VERSION = 1

# Hard-coded by Constitution: changing the bind address before Phase 7's
# authenticated exposure is a violation (05 section 1).
# DOCUTRACT_BIND_HOST exists SOLELY for containerized deployment, where the
# container boundary provides the isolation and the host-side publish rule
# (`-p 127.0.0.1:8477:8477`) re-establishes loopback-only reachability.
# Setting it on a bare host is a constitutional violation, not a feature.
BIND_HOST = os.environ.get("DOCUTRACT_BIND_HOST", "127.0.0.1")
BIND_PORT = 8477

MODEL_DIR = Path(os.environ.get("DOCUTRACT_MODEL_DIR",
                                Path(__file__).resolve().parents[1] / "public" / "models"))

MAX_UPLOAD_BYTES = 64 * 1024 * 1024          # PAYLOAD_TOO_LARGE above this
DEFAULT_BUDGET_MS = 6000

# P7.3 §2.2: bearer-token handshake. A random token generated at service
# start is written to a user-only handshake file the UI reads — defeats
# other-local-user access on shared machines. /v1/health stays tokenless
# (liveness probing carries no document data).
TOKEN_FILE = Path(os.environ.get(
    "DOCUTRACT_TOKEN_FILE",
    Path.home() / ".docutract" / "service-token"))


@dataclass(frozen=True)
class Profile:
    name: str
    ocr_tier: str
    dewarp: str
    resident_ceiling_mb: int
    discovery_long_side: int
    lattice_k: int


_PROFILES = {
    "lite": Profile(name="lite", ocr_tier="v5-server", dewarp="classical",
                    resident_ceiling_mb=450, discovery_long_side=2200, lattice_k=5),
    "full": Profile(name="full", ocr_tier="v5-server", dewarp="classical",
                    resident_ceiling_mb=900, discovery_long_side=2200, lattice_k=5),
}

PROFILE: Profile = _PROFILES[os.environ.get("DOCUTRACT_PROFILE", "lite")]
