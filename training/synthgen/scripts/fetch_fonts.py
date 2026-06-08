"""
Download Noto fonts for multilingual synthesis (OPTIONAL, run once).

Noto gives the widest glyph coverage for Arabic / Devanagari / CJK / Cyrillic,
which lets the generator render non-Latin documents instead of tofu boxes.

This script REQUIRES network access and is NOT invoked during generation — the
generator works font-agnostic and falls back to Latin when these are absent
(see synthgen/i18n.py + fonts.py). Run it manually:

    python -m synthgen.scripts.fetch_fonts
    python -m synthgen.scripts.fetch_fonts --dest /custom/font/dir

Fonts land in `synthgen/assets/fonts/` by default, which `fonts.py` searches
first, so bundled Noto is automatically preferred once present.

Licensing: Noto fonts are released under the SIL Open Font License 1.1. Review
https://github.com/notofonts/notofonts.github.io before redistribution.
"""
from __future__ import annotations

import argparse
import os
import sys
import urllib.request

# Raw download URLs for representative Noto faces (one per target script). These
# are static hinted TTFs from the official notofonts GitHub distribution.
_BASE = "https://github.com/notofonts/notofonts.github.io/raw/main/fonts"
_FONTS: dict[str, str] = {
    "NotoSans-Regular.ttf":
        f"{_BASE}/NotoSans/hinted/ttf/NotoSans-Regular.ttf",
    "NotoSerif-Regular.ttf":
        f"{_BASE}/NotoSerif/hinted/ttf/NotoSerif-Regular.ttf",
    "NotoSansArabic-Regular.ttf":
        f"{_BASE}/NotoSansArabic/hinted/ttf/NotoSansArabic-Regular.ttf",
    "NotoSansDevanagari-Regular.ttf":
        f"{_BASE}/NotoSansDevanagari/hinted/ttf/NotoSansDevanagari-Regular.ttf",
    # CJK ships from the dedicated noto-cjk repo (super-family, large file).
    "NotoSansSC-Regular.otf":
        "https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/"
        "SimplifiedChinese/NotoSansCJKsc-Regular.otf",
}

_DEFAULT_DEST = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "fonts"
)


def _download(url: str, path: str) -> bool:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "synthgen-fetch"})
        with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310
            data = resp.read()
        with open(path, "wb") as fh:
            fh.write(data)
        return True
    except Exception as e:  # noqa: BLE001 - report and continue with the rest
        print(f"  ! failed {os.path.basename(path)}: {e}", file=sys.stderr)
        return False


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Fetch Noto fonts for synthgen")
    p.add_argument("--dest", default=_DEFAULT_DEST, help="destination font dir")
    p.add_argument("--force", action="store_true", help="re-download existing files")
    args = p.parse_args(argv)

    os.makedirs(args.dest, exist_ok=True)
    ok = 0
    for name, url in _FONTS.items():
        dst = os.path.join(args.dest, name)
        if os.path.exists(dst) and not args.force:
            print(f"  = exists {name}")
            ok += 1
            continue
        print(f"  + downloading {name}")
        if _download(url, dst):
            ok += 1
    print(f"Done: {ok}/{len(_FONTS)} fonts in {args.dest}", file=sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
