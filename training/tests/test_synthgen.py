"""
Self-contained validation suite for the synthetic generator.

Runnable with `python -m tests.test_synthgen` (from training/) or via pytest.
Covers SYNTHETIC_DATA_GENERATION.md §18: deterministic output, valid boxes,
MRZ check digits, QR decode, augmentation label transforms, no split leakage.
"""
from __future__ import annotations

import io
import os
import random
import sys

# Allow running as a plain script from training/.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np  # noqa: E402

from synthgen import augment as aug  # noqa: E402
from synthgen import categories as cats  # noqa: E402
from synthgen import labels as lbl  # noqa: E402
from synthgen import mrz  # noqa: E402
from synthgen.config import CLASS_NAMES  # noqa: E402


def test_mrz_check_digits_valid():
    """Every generated (non-corrupted) MRZ must satisfy ICAO check digits."""
    for fmt in ("TD1", "TD2", "TD3"):
        for s in range(50):
            rng = random.Random(s)
            res = mrz.generate(rng, fmt)
            if fmt == "TD3":
                l2 = res.lines[1]
                assert mrz.compute_check_digit(l2[0:9]) == int(l2[9]), (fmt, "docno")
                assert mrz.compute_check_digit(l2[13:19]) == int(l2[19]), (fmt, "dob")
                assert mrz.compute_check_digit(l2[21:27]) == int(l2[27]), (fmt, "exp")
            elif fmt == "TD2":
                l2 = res.lines[1]
                assert mrz.compute_check_digit(l2[0:9]) == int(l2[9]), (fmt, "docno")
                assert mrz.compute_check_digit(l2[13:19]) == int(l2[19]), (fmt, "dob")
                assert mrz.compute_check_digit(l2[21:27]) == int(l2[27]), (fmt, "exp")
            else:  # TD1
                l1, l2 = res.lines[0], res.lines[1]
                assert mrz.compute_check_digit(l1[5:14]) == int(l1[14]), (fmt, "docno")
                assert mrz.compute_check_digit(l2[0:6]) == int(l2[6]), (fmt, "dob")
                assert mrz.compute_check_digit(l2[8:14]) == int(l2[14]), (fmt, "exp")
            # Line lengths canonical.
            exp_len = {"TD1": 30, "TD2": 36, "TD3": 44}[fmt]
            for line in res.lines:
                assert len(line) == exp_len, (fmt, len(line))


def test_mrz_corrupt_breaks_a_check():
    """corrupt() must produce at least one failing critical check most of the time."""
    broken = 0
    for s in range(60):
        rng = random.Random(s)
        res = mrz.corrupt(rng, mrz.generate(rng, "TD3"))
        l2 = res.lines[1]
        ok = (mrz.compute_check_digit(l2[0:9]) == (int(l2[9]) if l2[9].isdigit() else -1)
              and mrz.compute_check_digit(l2[13:19]) == (int(l2[19]) if l2[19].isdigit() else -1)
              and mrz.compute_check_digit(l2[21:27]) == (int(l2[27]) if l2[27].isdigit() else -1))
        if not ok:
            broken += 1
    assert broken >= 40, broken  # corruption may occasionally hit a no-op cell


def test_known_check_digit_vector():
    """Spot-check against a known ICAO example value."""
    # ICAO 9303 worked example: 'D23145890' -> check digit 7.
    assert mrz.compute_check_digit("D23145890") == 7
    # Date 740812 -> 2.
    assert mrz.compute_check_digit("740812") == 2


def _validate_boxes(boxes, sample):
    for b in boxes:
        assert 0 <= b.xc <= 1 and 0 <= b.yc <= 1, b.line()
        assert 0 < b.w <= 1 and 0 < b.h <= 1, b.line()
        assert b.xc - b.w / 2 >= -1e-6 and b.xc + b.w / 2 <= 1 + 1e-6, b.line()
        assert b.yc - b.h / 2 >= -1e-6 and b.yc + b.h / 2 <= 1 + 1e-6, b.line()
        assert 0 <= b.class_id < len(CLASS_NAMES)


def test_all_categories_produce_valid_labels():
    for name in cats.DOCUMENT_CATEGORIES:
        builder = cats.REGISTRY[name]
        for s in range(6):
            rng = random.Random(1000 + s)
            sample = builder(rng, 1000 + s)
            boxes = lbl.sample_to_yolo(sample)
            assert len(boxes) >= 3, (name, "too few boxes", len(boxes))
            _validate_boxes(boxes, sample)
            # Every document category must contain a document_page.
            ids = {b.class_id for b in boxes}
            assert CLASS_NAMES.index("document_page") in ids, (name, "no page")


def test_determinism_same_seed():
    def render(seed):
        rng = random.Random(seed)
        cat = cats.REGISTRY["passport"]
        s = cat(rng, seed)
        aug.augment(s, rng, intensity=0.8)
        buf = io.BytesIO()
        s.image.convert("RGB").save(buf, format="PNG")
        return buf.getvalue(), lbl.sample_to_yolo(s)

    a_img, a_box = render(777)
    b_img, b_box = render(777)
    assert a_img == b_img, "image not deterministic for same seed"
    assert [x.line() for x in a_box] == [x.line() for x in b_box], "labels not deterministic"


def test_augmentation_preserves_valid_boxes():
    for s in range(20):
        rng = random.Random(2000 + s)
        sample = cats.REGISTRY["invoice"](rng, 2000 + s)
        aug.augment(sample, rng, intensity=1.0)
        boxes = lbl.sample_to_yolo(sample)
        _validate_boxes(boxes, sample)
        assert len(boxes) >= 1


def test_qr_decodes():
    """At least one rendered QR must decode back to its payload (OpenCV)."""
    import cv2

    from synthgen.core import Sample
    from synthgen import primitives
    from PIL import Image

    decoded_ok = 0
    total = 0
    det = cv2.QRCodeDetector()
    for s in range(8):
        rng = random.Random(3000 + s)
        img = Image.new("RGB", (400, 400), (255, 255, 255))
        sample = Sample(image=img)
        payload = f"DOC-TEST-{s}-{rng.randint(1000,9999)}"
        ann = primitives.render_qr(sample, rng, 60, 60, 240, payload=payload)
        total += 1
        arr = np.asarray(sample.image.convert("RGB"))
        data, _, _ = det.detectAndDecode(cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY))
        if data == payload:
            decoded_ok += 1
    # OpenCV's decoder is imperfect; require a strong majority.
    assert decoded_ok >= max(1, int(total * 0.6)), f"{decoded_ok}/{total} QR decoded"


def test_no_split_leakage_by_seed():
    """A given seed maps to exactly one split, deterministically."""
    from synthgen.generate import _split_for_seed

    seen = {}
    for seed in range(5000, 5300):
        sp = _split_for_seed(seed, 0.15, 0.15, None)
        sp2 = _split_for_seed(seed, 0.15, 0.15, None)
        assert sp == sp2
        seen.setdefault(sp, 0)
        seen[sp] += 1
    assert set(seen) <= {"train", "val", "test"}
    assert seen.get("train", 0) > seen.get("val", 0)  # train is majority


# --------------------------------------------------------------------------- #
# Fix 1: text_block boxes are the REAL inked pixel box (no ascender drift).     #
# --------------------------------------------------------------------------- #

def test_text_block_box_matches_ink():
    """Recorded text_block box must match the inked pixel bbox within ~1px."""
    from PIL import Image, ImageDraw
    from synthgen import fonts, primitives
    from synthgen.core import Sample

    rng = random.Random(11)
    samples_checked = 0
    for size in (14, 20, 28, 40, 56):
        # White canvas so we can recover the exact inked bbox.
        img = Image.new("RGB", (900, 200), (255, 255, 255))
        sample = Sample(image=img)
        d = ImageDraw.Draw(sample.image)
        font = fonts.pick_sans(rng, size)
        # Use text with both ascenders and descenders.
        ann = primitives.draw_text_block(sample, d, rng, 40, 80, "Apgjy Qf 90", font, (0, 0, 0))
        arr = np.asarray(sample.image.convert("L"))
        ys, xs = np.where(arr < 128)
        assert len(xs) > 0, "nothing inked"
        ink = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        bx = ann.aabb()
        for got, exp in zip(bx, ink):
            assert abs(got - exp) <= 1.5, (size, "box", bx, "ink", ink)
        samples_checked += 1
    assert samples_checked == 5


def test_logo_and_mrz_boxes_match_ink():
    """render_logo wordmark and render_mrz boxes hug their ink within a few px."""
    from PIL import Image
    from synthgen import primitives
    from synthgen.core import Sample

    # Logo: the right/bottom edge must reach the wordmark ink.
    for s in range(6):
        rng = random.Random(400 + s)
        img = Image.new("RGB", (700, 200), (255, 255, 255))
        sample = Sample(image=img)
        ann = primitives.render_logo(sample, rng, 20, 40, 120, 100, name="VERTEX")
        arr = np.asarray(sample.image.convert("L"))
        ys, xs = np.where(arr < 200)
        ink = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        bx = ann.aabb()
        # Box right edge should be close to ink right edge (was len-based before).
        assert abs(bx[2] - ink[2]) <= 4, (bx, ink)

    # MRZ: bottom edge must include the last line's descenders.
    rng = random.Random(99)
    img = Image.new("RGB", (900, 200), (255, 255, 255))
    sample = Sample(image=img)
    lines = ["P<UTOPIAN<<SPECIMEN<<<<<<<<<<<<<<<<<<<<<<<<<", "L898902C36UTO7408122M1204159<<<<<<<<<<<<<<06"]
    ann = primitives.render_mrz(sample, rng, 20, 40, 850, lines)
    arr = np.asarray(sample.image.convert("L"))
    ys, xs = np.where(arr < 128)
    ink = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    bx = ann.aabb()
    for got, exp in zip(bx, ink):
        assert abs(got - exp) <= 6, ("mrz", bx, ink)


# --------------------------------------------------------------------------- #
# Fix 2: consistent text_block labelling across ALL categories.                #
# --------------------------------------------------------------------------- #

def test_text_label_consistency():
    """Titles/captions are labelled text_blocks in EVERY category (not raw)."""
    # Every document category must emit text_block annotations.
    for name in cats.DOCUMENT_CATEGORIES:
        rng = random.Random(1234)
        sample = cats.REGISTRY[name](rng, 1234)
        texts = [a.text for a in sample.annotations if a.class_name == "text_block"]
        assert len(texts) >= 3, (name, "too few labelled text blocks", len(texts))

    # Statement title is always English -> must appear as a labelled text_block.
    rng = random.Random(7)
    s = cats.REGISTRY["statement"](rng, 7)
    texts = [a.text for a in s.annotations if a.class_name == "text_block"]
    assert "ACCOUNT STATEMENT" in texts, "statement title not labelled"

    # Find a Latin invoice/form/license/passport and assert their title is labelled.
    def first_latin(cat, titles):
        for seed in range(200):
            rng = random.Random(seed)
            sm = cats.REGISTRY[cat](rng, seed)
            if sm.language == "en":
                tx = [a.text for a in sm.annotations if a.class_name == "text_block"]
                return tx
        return None

    inv = first_latin("invoice", None)
    assert inv is not None and "INVOICE" in inv, "invoice title not labelled"
    pas = first_latin("passport", None)
    assert pas is not None and any(
        t in ("PASSPORT", "PASSEPORT", "IDENTITY CARD", "TRAVEL DOCUMENT") for t in pas
    ), "passport title not labelled"


# --------------------------------------------------------------------------- #
# Fix 3: decoys are written as negatives (image + empty label, zero boxes).     #
# --------------------------------------------------------------------------- #

def test_decoys_are_negative():
    for s in range(12):
        rng = random.Random(8000 + s)
        sample = cats.REGISTRY["decoy"](rng, 8000 + s)
        assert sample.allow_empty is True, "decoy must allow empty"
        assert len(sample.annotations) == 0, "decoy must have no annotations"
        boxes = lbl.sample_to_yolo(sample)
        assert boxes == [], "decoy must yield zero boxes"


def test_generate_writes_negative_label_files(tmp_path=None):
    """generate must persist decoy samples as image + EMPTY .txt and count them."""
    import shutil
    import tempfile
    from synthgen import generate

    out = tempfile.mkdtemp(prefix="synthgen_neg_")
    try:
        rc = generate.main([
            "--out", out, "--count", "12", "--seed", "9000",
            "--categories", "decoy", "--workers", "1",
            "--augment", "0.0", "--force-split", "train", "--quiet",
        ])
        assert rc == 0
        img_dir = os.path.join(out, "images", "train")
        lbl_dir = os.path.join(out, "labels", "train")
        imgs = [f for f in os.listdir(img_dir) if f.endswith(".jpg")]
        assert len(imgs) >= 1, "no negative images written"
        empties = 0
        for f in imgs:
            stem = os.path.splitext(f)[0]
            lp = os.path.join(lbl_dir, stem + ".txt")
            assert os.path.exists(lp), ("missing label for", f)
            assert os.path.getsize(lp) == 0, ("negative label not empty", f)
            empties += 1
        assert empties == len(imgs)
    finally:
        shutil.rmtree(out, ignore_errors=True)


# --------------------------------------------------------------------------- #
# Fix 4: document_page becomes a composited sub-region (not always full-frame). #
# --------------------------------------------------------------------------- #

def test_document_page_can_be_subregion():
    page_id = CLASS_NAMES.index("document_page")
    composited = 0
    full_frame = 0
    saw_subregion = False
    for s in range(60):
        rng = random.Random(6000 + s)
        sample = cats.REGISTRY["form"](rng, 6000 + s)
        boxes = lbl.sample_to_yolo(sample)
        _validate_boxes(boxes, sample)
        page = [b for b in boxes if b.class_id == page_id]
        assert page, "no document_page"
        area = page[0].w * page[0].h
        if "composited" in sample.quality_tags:
            composited += 1
            if area < 0.85:
                saw_subregion = True
        else:
            full_frame += 1
    assert composited > 0, "no composited samples produced"
    assert full_frame > 0, "no full-frame samples kept"
    assert saw_subregion, "document_page never became a real sub-region"


# --------------------------------------------------------------------------- #
# Fix 5: orientation (90/180/270) + strong perspective keep boxes valid.        #
# --------------------------------------------------------------------------- #

def test_orientation_and_strong_perspective():
    for k in (1, 2, 3):
        for s in range(6):
            rng = random.Random(7000 + s)
            sample = cats.REGISTRY["invoice"](rng, 7000 + s)
            before = len(lbl.sample_to_yolo(sample))
            aug.orient(sample, rng, k=k)
            boxes = lbl.sample_to_yolo(sample)
            _validate_boxes(boxes, sample)
            # A pure 90*k rotation must not destroy boxes.
            assert len(boxes) >= max(1, before - 1), (k, before, len(boxes))
    # Strong perspective stays label-valid.
    for s in range(10):
        rng = random.Random(7100 + s)
        sample = cats.REGISTRY["form"](rng, 7100 + s)
        aug.perspective(sample, rng, strength=0.3)
        boxes = lbl.sample_to_yolo(sample)
        _validate_boxes(boxes, sample)
    # Curl bend stays label-valid.
    for s in range(10):
        rng = random.Random(7200 + s)
        sample = cats.REGISTRY["certificate"](rng, 7200 + s)
        aug.curl(sample, rng)
        boxes = lbl.sample_to_yolo(sample)
        _validate_boxes(boxes, sample)


# --------------------------------------------------------------------------- #
# Fix 6: polygon-frame clipping for visibility + tighter min box side.          #
# --------------------------------------------------------------------------- #

def test_polygon_clip_and_visibility():
    from synthgen.core import Annotation, Sample, rect_polygon
    from PIL import Image
    from synthgen.config import MIN_BOX_SIDE_NORM

    assert abs(MIN_BOX_SIDE_NORM - 0.012) < 1e-9, "min box side not raised"

    # Clip area math: a square half outside the frame -> ~50% visible.
    poly = [(50, 50), (150, 50), (150, 150), (50, 150)]
    clipped = lbl.clip_polygon_to_rect(poly, 100, 1000)
    assert abs(lbl._polygon_area(clipped) - 5000) < 1.0, lbl._polygon_area(clipped)

    # A box 80% out of frame is dropped (min_visible=0.35); 80% in is kept.
    img = Image.new("RGB", (200, 200), (255, 255, 255))
    sample = Sample(image=img)
    # 100x100 box with only its left 20px inside -> 20% visible -> drop.
    sample.add(Annotation("photo", rect_polygon(-80, 50, 20, 150)))
    # 100x100 box fully inside -> keep.
    sample.add(Annotation("stamp", rect_polygon(50, 50, 150, 150)))
    boxes = lbl.sample_to_yolo(sample)
    kept = {CLASS_NAMES[b.class_id] for b in boxes}
    assert "stamp" in kept and "photo" not in kept, kept

    # Rotated polygon: AABB comes from the CLIPPED polygon, not the raw AABB.
    sample2 = Sample(image=Image.new("RGB", (200, 200), (255, 255, 255)))
    diamond = np.array([[100, -20], [220, 100], [100, 220], [-20, 100]], dtype=np.float64)
    sample2.add(Annotation("table", diamond))
    boxes2 = lbl.sample_to_yolo(sample2)
    assert len(boxes2) == 1
    b = boxes2[0]
    # Clipped diamond AABB spans the full frame in both axes.
    assert b.w > 0.95 and b.h > 0.95, (b.w, b.h)

    # Tiny box below MIN_BOX_SIDE_NORM is dropped.
    sample3 = Sample(image=Image.new("RGB", (1000, 1000), (255, 255, 255)))
    sample3.add(Annotation("checkbox", rect_polygon(10, 10, 18, 18)))  # 8px / 1000 = 0.008
    assert lbl.sample_to_yolo(sample3) == []


# --------------------------------------------------------------------------- #
# Fix 7: tight stamp/signature boxes (no transparent pad / empty region).       #
# --------------------------------------------------------------------------- #

def test_tight_stamp_and_signature_boxes():
    from PIL import Image
    from synthgen import primitives
    from synthgen.core import Sample

    # Stamp: annotation should hug the rotated rounded-rect ink, not the pad.
    for s in range(8):
        rng = random.Random(500 + s)
        img = Image.new("RGB", (500, 400), (255, 255, 255))
        sample = Sample(image=img)
        ann = primitives.render_stamp(sample, rng, 120, 120, 320, 220)
        arr = np.asarray(sample.image.convert("L"))
        ys, xs = np.where(arr < 230)
        ink = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        bx = ann.aabb()
        for got, exp in zip(bx, ink):
            assert abs(got - exp) <= 6, ("stamp", s, bx, ink)

    # Signature: box hugs strokes (+ small pad), not the allocated region.
    for s in range(8):
        rng = random.Random(600 + s)
        img = Image.new("RGB", (500, 300), (255, 255, 255))
        sample = Sample(image=img)
        x0, y0, x1, y1 = 60, 60, 460, 240
        ann = primitives.render_signature(sample, rng, x0, y0, x1, y1)
        arr = np.asarray(sample.image.convert("L"))
        ys, xs = np.where(arr < 200)
        ink = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        bx = ann.aabb()
        for got, exp in zip(bx, ink):
            assert abs(got - exp) <= 8, ("signature", s, bx, ink)
        # And strictly tighter than the allocated region in at least one edge.
        assert (bx[0] > x0 + 1) or (bx[2] < x1 - 1), ("signature not tightened", bx)


# --------------------------------------------------------------------------- #
# Fix 9: corrupted passport ground truth reflects the CORRUPTED MRZ strip.      #
# --------------------------------------------------------------------------- #

def test_corrupted_passport_ground_truth():
    checked_invalid = 0
    checked_valid = 0
    for s in range(120):
        rng = random.Random(20000 + s)
        sample = cats.REGISTRY["passport"](rng, 20000 + s)
        gt = sample.ground_truth.get("mrz")
        assert gt is not None
        parsed = gt["parsedFields"]
        reparsed = mrz.parse(gt["format"], gt["lines"])
        if not gt["valid"]:
            # Corrupted: parsedFields must equal the parse of the corrupted lines.
            assert parsed == reparsed, ("invalid parse mismatch", s)
            checked_invalid += 1
        else:
            # Valid: parsed source must be consistent with parsing the lines
            # (documentNumber appears on the strip).
            assert parsed.get("documentNumber"), ("valid missing docno", s)
            checked_valid += 1
    assert checked_invalid >= 10, checked_invalid
    assert checked_valid >= 10, checked_valid


def test_mrz_parse_roundtrips_valid():
    for fmt in ("TD1", "TD2", "TD3"):
        rng = random.Random(3)
        res = mrz.generate(rng, fmt)
        parsed = mrz.parse(fmt, res.lines)
        assert parsed["documentNumber"] == res.fields["documentNumber"], (fmt, parsed)
        assert parsed["dateOfBirth"] == res.fields["dateOfBirth"], (fmt, parsed)
        assert parsed["expiryDate"] == res.fields["expiryDate"], (fmt, parsed)


# --------------------------------------------------------------------------- #
# Fix 8: class balance — decoys registered, rare-class inclusion floors.        #
# --------------------------------------------------------------------------- #

def test_class_balance_weights_and_floors():
    assert "decoy" in cats.DEFAULT_WEIGHTS, "decoy not weighted"
    total = sum(cats.DEFAULT_WEIGHTS.values())
    # Decoys ~12-18% of the corpus.
    assert 0.12 <= cats.DEFAULT_WEIGHTS["decoy"] / total <= 0.18, cats.DEFAULT_WEIGHTS

    # Rare primitives should appear at a healthy rate across a sampled corpus.
    from collections import Counter
    counts: Counter = Counter()
    n = 220
    for i in range(n):
        rng = random.Random(40000 + i)
        names = list(cats.DEFAULT_WEIGHTS.keys())
        wts = list(cats.DEFAULT_WEIGHTS.values())
        cat = rng.choices(names, weights=wts, k=1)[0]
        sample = cats.REGISTRY[cat](rng, 40000 + i)
        for a in sample.annotations:
            counts[a.class_name] += 1
    for rare in ("stamp", "seal", "photo", "checkbox", "mrz_zone"):
        assert counts[rare] >= 5, (rare, counts.get(rare, 0), dict(counts))


# --------------------------------------------------------------------------- #
# Fix 10: multilingual content + graceful Latin fallback.                       #
# --------------------------------------------------------------------------- #

def test_multilingual_pools_and_fallback():
    from synthgen import fonts, i18n

    # Fallback: a script with no pool entry returns the fallback string.
    rng = random.Random(1)
    assert i18n.pick(rng, "latin", "title", "FALLBACK") == "FALLBACK"

    # Every advertised script has content for each role.
    for script in ("arabic", "devanagari", "cjk", "cyrillic"):
        for role in ("title", "label", "name", "word"):
            assert i18n.pool(script, role), (script, role)
        assert script in i18n.SCRIPT_LANG

    # available_scripts only returns renderable scripts; pick_script never raises.
    for script in i18n.available_scripts():
        f = fonts.pick_script(rng, 24, script)
        assert f is not None

    # maybe_pick_script returns 'latin' or an available non-Latin script.
    avail = set(i18n.available_scripts())
    for s in range(50):
        sc = i18n.maybe_pick_script(random.Random(s), prob=1.0)
        assert sc == "latin" or sc in avail

    # If any non-Latin font exists, some forms should be tagged non-English.
    if avail:
        langs = set()
        for s in range(80):
            rng = random.Random(50000 + s)
            sample = cats.REGISTRY["form"](rng, 50000 + s)
            langs.add(sample.language)
        assert langs - {"en"}, "no multilingual forms produced despite fonts"


def _run_all() -> int:
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS  {t.__name__}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"FAIL  {t.__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(_run_all())
