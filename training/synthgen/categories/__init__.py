"""
Document category builders.

Each builder composes universal primitives into a realistic layout for one
document category and returns a `Sample` with exact annotations (pre-
augmentation). Universality is by construction: the SAME primitive renderers
appear across every category, so the detector learns primitives in many
contexts rather than one document type.
"""
from __future__ import annotations

import random
from collections.abc import Callable

from ..core import Sample
from . import certificate, decoys, form, invoice, license_card, passport, statement

Builder = Callable[[random.Random, int], Sample]

# name -> builder. `form` covers all primitives, so it is the spec-mandated
# baseline; passports/invoices add ID/table realism. `decoy` emits NEGATIVE
# samples (zero boxes) for precision.
REGISTRY: dict[str, Builder] = {
    "passport": passport.build,
    "invoice": invoice.build,
    "form": form.build,
    "certificate": certificate.build,
    "statement": statement.build,
    "license": license_card.build,
    "decoy": decoys.build,
}

# Document (positive) categories — those that must contain a document_page and
# real primitives. Excludes the negative `decoy` class.
DOCUMENT_CATEGORIES: list[str] = [
    "passport", "invoice", "form", "certificate", "statement", "license",
]

# Default sampling weights. Decoys are ~15% of the corpus (hard negatives for
# precision). `form` is up-weighted because it naturally exercises every rare
# primitive (checkbox/stamp/seal/signature), helping rare-class floors; the
# positive split stays close to the prior plan once decoys are excluded.
DEFAULT_WEIGHTS: dict[str, float] = {
    "passport": 0.20,
    "invoice": 0.18,
    "form": 0.22,
    "certificate": 0.11,
    "statement": 0.08,
    "license": 0.06,
    "decoy": 0.15,
}


def categories() -> list[str]:
    return list(REGISTRY.keys())
