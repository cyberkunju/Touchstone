"""
Engine A — real-background compositor (docdet-v2 Phase 2).

Turns a rendered full-frame document Sample into a realistic *scene*: the
document is placed as a SUB-REGION of a real photograph (desk/table/hand/
clutter) at a sampled scale, rotation and perspective, then blended in. This is
THE lever that moves real document_page recall off 0.38 — the v0 generator made
documents that fill the frame on clean backgrounds, which is not how documents
are really photographed.

Pipeline position:  category render -> [compose] -> degradation (augment.py)
                    -> labels (labels.sample_to_yolo).

Public API:
    from synthgen.compose import BackgroundBank, compose_sample
"""
from .bank import BackgroundBank  # noqa: F401
from .compositor import compose_sample  # noqa: F401
