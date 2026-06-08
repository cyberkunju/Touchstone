"""docdet-v1 ontology: class sets, source mapping, provenance + leakage keys."""
from .classes import (  # noqa: F401
    CLASS_VERSION,
    PAGE_CLASS_NAMES, PAGE_CLASS_ID,
    PRIMITIVE_CLASS_NAMES, PRIMITIVE_CLASS_ID, PRIMITIVE_MIN_SIDE_PX,
    PRIMITIVE_MIN_SIDE_FRAC,
    TEXT_CLASS_NAMES, TEXT_CLASS_ID,
    VALIDATED_CLASSES, CONFUSION_GROUP, V0_TO_V1_PRIMITIVE,
    SYNTHETIC_OR_EVAL_ONLY_CLASSES, NEEDS_CONTENT_VALIDATOR, REAL_GATED_CLASSES,
)
from .source_map import (  # noqa: F401
    map_label, is_research_only, license_bucket_for, data_class, audit_lineage,
    Mapping, OUT_OF_SCOPE, UNKNOWN, RED_SOURCES,
)
from .provenance import (  # noqa: F401
    ImageProvenance, AnnotationProvenance, RenderVariantProvenance,
    perceptual_hash, compute_split_group_key, to_record,
)
