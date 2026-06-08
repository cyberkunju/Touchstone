"""
Font discovery + caching for the generator.

We want font *variety* (domain randomization drives sim->real transfer) and a
reliable monospace font for MRZ/codes. We discover TrueType fonts from common
OS locations and fall back to bundled assets, then to PIL's default bitmap font
so generation never hard-fails on a bare machine.
"""
from __future__ import annotations

import glob
import os
import random
from functools import lru_cache

from PIL import ImageFont

# Local bundled font dir (populated by scripts/fetch_fonts.py; optional). Placed
# FIRST so bundled Noto fonts are discovered and preferred when present.
_LOCAL_FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "fonts")

# Common system font directories across OSes.
_FONT_DIRS = [
    _LOCAL_FONT_DIR,
    r"C:\Windows\Fonts",
    "/usr/share/fonts",
    "/usr/local/share/fonts",
    os.path.expanduser("~/.fonts"),
    os.path.expanduser("~/Library/Fonts"),
    "/Library/Fonts",
    "/System/Library/Fonts",
]

# Preferred sans/serif families for body text (substring match, case-insensitive).
# Noto first so it wins when available (best multilingual glyph coverage).
_SANS_HINTS = ["notosans", "arial", "dejavusans", "liberationsans", "verdana",
               "tahoma", "segoeui", "calibri", "helvetica", "roboto"]
_SERIF_HINTS = ["notoserif", "times", "georgia", "dejavuserif", "liberationserif",
                "garamond", "cambria"]
_MONO_HINTS = ["notomono", "consola", "couriernew", "courier", "dejavusansmono",
               "liberationmono", "lucon", "ocr", "robotomono"]

# Per-script Noto family hints (substring match). We prefer Noto for non-Latin
# scripts because it has the widest coverage; fall back to any system font that
# happens to cover the script, then to the default body pool.
_SCRIPT_HINTS: dict[str, list[str]] = {
    "arabic": ["notosansarabic", "notonaskharabic", "arial", "tahoma", "segoeui"],
    "devanagari": ["notosansdevanagari", "mangal", "nirmala"],
    "cjk": ["notosanscjk", "notosansjp", "notosanssc", "notosanskr",
            "msgothic", "msmincho", "yugothic", "malgun", "simsun", "mssong"],
    "cyrillic": ["notosans", "arial", "dejavusans", "segoeui", "tahoma"],
    "latin": _SANS_HINTS,
}


@lru_cache(maxsize=1)
def _all_fonts() -> list[str]:
    paths: list[str] = []
    for d in _FONT_DIRS:
        if os.path.isdir(d):
            for ext in ("*.ttf", "*.otf", "*.ttc"):
                paths.extend(glob.glob(os.path.join(d, "**", ext), recursive=True))
    return paths


def _match(hints: list[str]) -> list[str]:
    out = []
    for p in _all_fonts():
        name = os.path.basename(p).lower()
        if any(h in name for h in hints):
            out.append(p)
    return out


@lru_cache(maxsize=1)
def sans_fonts() -> list[str]:
    return _match(_SANS_HINTS)


@lru_cache(maxsize=1)
def serif_fonts() -> list[str]:
    return _match(_SERIF_HINTS)


@lru_cache(maxsize=1)
def mono_fonts() -> list[str]:
    return _match(_MONO_HINTS)


@lru_cache(maxsize=512)
def load(path: str | None, size: int) -> ImageFont.FreeTypeFont:
    """Load a font at `size`, falling back to PIL default on failure."""
    if path:
        try:
            return ImageFont.truetype(path, size=size)
        except Exception:  # noqa: BLE001 - any font load failure -> fallback
            pass
    try:
        # PIL ships DejaVuSans; load_default(size) works on Pillow>=10.1.
        return ImageFont.load_default(size=size)
    except TypeError:  # very old Pillow
        return ImageFont.load_default()


def pick_body(rng: random.Random, size: int) -> ImageFont.FreeTypeFont:
    pool = sans_fonts() + serif_fonts()
    return load(rng.choice(pool) if pool else None, size)


def pick_sans(rng: random.Random, size: int) -> ImageFont.FreeTypeFont:
    pool = sans_fonts()
    return load(rng.choice(pool) if pool else None, size)


def pick_serif(rng: random.Random, size: int) -> ImageFont.FreeTypeFont:
    pool = serif_fonts() or sans_fonts()
    return load(rng.choice(pool) if pool else None, size)


def pick_mono(rng: random.Random, size: int) -> ImageFont.FreeTypeFont:
    pool = mono_fonts()
    return load(rng.choice(pool) if pool else None, size)


@lru_cache(maxsize=16)
def script_fonts(script: str) -> tuple[str, ...]:
    """Fonts that (by name) target a given script. Empty if none found."""
    hints = _SCRIPT_HINTS.get(script, _SANS_HINTS)
    return tuple(_match(hints))


def has_script_font(script: str) -> bool:
    """True if a font plausibly covering `script` is installed/bundled."""
    return bool(script_fonts(script))


def pick_script(rng: random.Random, size: int, script: str) -> ImageFont.FreeTypeFont:
    """Pick a font for `script`, falling back to the body pool then default.

    Never raises: if no script-specific font exists we degrade to Latin so
    generation keeps working on a bare machine (callers should fall back to
    Latin *content* in that case via `has_script_font`).
    """
    pool = list(script_fonts(script))
    if not pool:
        pool = sans_fonts() + serif_fonts()
    return load(rng.choice(pool) if pool else None, size)
