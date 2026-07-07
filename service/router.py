"""Format router — magic bytes, never extensions (Documentation/05 section 3).

Pure function: bytes -> route token. The FastAPI layer maps tokens to stage
pipelines; anything unrecognized is an explicit UNSUPPORTED_TYPE, never a
guess (N1 applies to file typing too: a mis-routed file produces garbage
downstream that looks like data).
"""

from __future__ import annotations

import io
import zipfile

# Route tokens (stable API between router and ladder).
ROUTE_PDF = "pdf"
ROUTE_XLSX = "xlsx"
ROUTE_DOCX = "docx"
ROUTE_LEGACY_OFFICE = "legacy_office"   # OLE container: explicit unsupported-with-guidance
ROUTE_IMAGE = "image"
ROUTE_CSV = "csv"
ROUTE_UNSUPPORTED = "unsupported"

_IMAGE_SIGNATURES: list[tuple[bytes, int]] = [
    (b"\xff\xd8\xff", 0),          # JPEG
    (b"\x89PNG\r\n\x1a\n", 0),     # PNG
    (b"II*\x00", 0),               # TIFF little-endian
    (b"MM\x00*", 0),               # TIFF big-endian
    (b"BM", 0),                    # BMP
]


def _is_webp(head: bytes) -> bool:
    return head[:4] == b"RIFF" and head[8:12] == b"WEBP"


def _zip_route(data: bytes) -> str:
    """Distinguish OOXML flavors by container contents (never by name)."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            names = set(zf.namelist())
            if "[Content_Types].xml" in names:
                types_xml = zf.read("[Content_Types].xml")
                if b"spreadsheetml" in types_xml:
                    return ROUTE_XLSX
                if b"wordprocessingml" in types_xml:
                    return ROUTE_DOCX
            if any(n.startswith("word/") for n in names):
                return ROUTE_DOCX
            if any(n.startswith("xl/") for n in names):
                return ROUTE_XLSX
    except zipfile.BadZipFile:
        pass
    return ROUTE_UNSUPPORTED


def _plausible_csv(data: bytes) -> bool:
    """Text bytes with consistent separators across the first lines."""
    sample = data[:8192]
    try:
        text = sample.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = sample.decode("latin-1")
        except UnicodeDecodeError:
            return False
    # Control characters other than whitespace => binary, not CSV.
    if any(ord(c) < 9 or 13 < ord(c) < 32 for c in text):
        return False
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if len(lines) < 2:
        return False
    for sep in (",", ";", "\t", "|"):
        counts = [ln.count(sep) for ln in lines[:10]]
        if counts[0] >= 1 and all(c == counts[0] for c in counts):
            return True
    return False


def sniff_route(data: bytes) -> str:
    """Classify a byte payload into a processing route.

    Order matters: containers first (their headers are unambiguous), then
    images, then the text heuristics — so a CSV whose first cell happens to
    say '%PDF' still routes as PDF only when the real header is present at
    offset 0, which is the correct call.
    """
    if len(data) < 4:
        return ROUTE_UNSUPPORTED
    if data[:4] == b"%PDF":
        return ROUTE_PDF
    if data[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        return ROUTE_LEGACY_OFFICE
    if data[:2] == b"PK":
        return _zip_route(data)
    head = data[:16]
    if _is_webp(head):
        return ROUTE_IMAGE
    for sig, off in _IMAGE_SIGNATURES:
        if data[off:off + len(sig)] == sig:
            return ROUTE_IMAGE
    if _plausible_csv(data):
        return ROUTE_CSV
    return ROUTE_UNSUPPORTED
