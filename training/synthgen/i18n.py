"""
Multilingual content pools + script selection.

Domain randomization should not be Latin-only: real documents arrive in Arabic,
Devanagari, CJK and Cyrillic scripts. We keep small, privacy-safe sample pools
per script and a helper that picks a script ONLY if a font that can render it is
available (otherwise we stay Latin so a bare machine never produces tofu-only
pages or crashes). Everything is pure given a seeded `random.Random`.

Fonts: run `python -m synthgen.scripts.fetch_fonts` once to download Noto
families into `synthgen/assets/fonts/` for full coverage. Without that, the
generator falls back to whatever system fonts exist (often Latin + Cyrillic
only), which is fine.
"""
from __future__ import annotations

import random

from . import fonts

# BCP-47-ish language code per script (used for Sample.language).
SCRIPT_LANG = {
    "latin": "en",
    "arabic": "ar",
    "devanagari": "hi",
    "cjk": "zh",
    "cyrillic": "ru",
}

# Privacy-safe, clearly-synthetic strings. Keyed by script then by role so a
# builder can request a "title" / "label" / "name" / "word" in a chosen script.
_POOLS: dict[str, dict[str, list[str]]] = {
    "arabic": {
        "title": ["نموذج طلب", "شهادة", "فاتورة", "بطاقة هوية", "كشف حساب"],
        "label": ["الاسم", "العنوان", "التاريخ", "المدينة", "الهاتف", "الرقم"],
        "name": ["محمد علي", "فاطمة حسن", "أحمد إبراهيم", "ليلى خالد"],
        "word": ["نعم", "لا", "قياسي", "سريع"],
    },
    "devanagari": {
        "title": ["आवेदन पत्र", "प्रमाण पत्र", "बीजक", "पहचान पत्र", "विवरण"],
        "label": ["नाम", "पता", "दिनांक", "शहर", "फ़ोन", "संख्या"],
        "name": ["राहुल शर्मा", "प्रिया वर्मा", "अमित कुमार", "सुनीता देवी"],
        "word": ["हाँ", "नहीं", "मानक", "तेज़"],
    },
    "cjk": {
        "title": ["申请表", "证书", "发票", "身份证", "对账单"],
        "label": ["姓名", "地址", "日期", "城市", "电话", "编号"],
        "name": ["李伟", "王芳", "张敏", "刘洋"],
        "word": ["是", "否", "标准", "快速"],
    },
    "cyrillic": {
        "title": ["Заявление", "Сертификат", "Счёт", "Удостоверение", "Выписка"],
        "label": ["Имя", "Адрес", "Дата", "Город", "Телефон", "Номер"],
        "name": ["Иван Петров", "Анна Смирнова", "Сергей Иванов", "Елена Попова"],
        "word": ["Да", "Нет", "Стандарт", "Срочно"],
    },
}

# Order we try non-Latin scripts in (rarer scripts first so they still appear).
_NON_LATIN = ["arabic", "devanagari", "cjk", "cyrillic"]


def available_scripts() -> list[str]:
    """Non-Latin scripts that have a usable font on this machine."""
    return [s for s in _NON_LATIN if fonts.has_script_font(s)]


def maybe_pick_script(rng: random.Random, prob: float = 0.18) -> str:
    """Return a non-Latin script with probability `prob`, else 'latin'.

    Only scripts with an installed/bundled font are eligible, so the result is
    always renderable. Deterministic given `rng`.
    """
    if rng.random() >= prob:
        return "latin"
    pool = available_scripts()
    if not pool:
        return "latin"
    return rng.choice(pool)


def pool(script: str, role: str) -> list[str]:
    return _POOLS.get(script, {}).get(role, [])


def pick(rng: random.Random, script: str, role: str, fallback: str) -> str:
    """Pick a string for (script, role); fall back to `fallback` if none."""
    choices = pool(script, role)
    return rng.choice(choices) if choices else fallback
