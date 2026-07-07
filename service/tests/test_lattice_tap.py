"""P3.2 permanent lattice-tap test (Documentation/05 section 7).

Asserts, forever:
  1. the raw recognition tensor is [T, C] with C == len(vocab) + 1 (blank),
  2. every timestep row is a probability distribution (post-softmax, sums to 1),
  3. top-k lattice ordering and the blank-as-'' contract,
  4. greedy decode over the raw tensor reads a golden crop exactly,
  5. the forward pass is deterministic.

The golden crops are committed PNG fixtures (generated once from a monospace
font); the expected strings are their file-name-independent truths below.
If fixtures are missing they are regenerated deterministically from the
system's Courier New — but the committed files are canonical.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from stages.ocr_tap import (  # noqa: E402
    LATTICE_K,
    REC_HEIGHT,
    compute_rec_target_width,
    create_session,
    extract_lattice,
    greedy_decode,
    load_vocab,
    normalize_crop,
    run_rec,
    tap_line,
)

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / "public" / "models" / "PP-OCRv5_server_rec_infer.onnx"
DICT = ROOT / "public" / "models" / "ppocrv5_dict.txt"
FIXTURES = Path(__file__).resolve().parent / "fixtures"

# Golden truths. MRZ-charset line = the project's highest-value character
# class; the second exercises mixed case, digits and punctuation.
GOLDENS = {
    "golden_mrz.png": "P<UTOSMITH<<JOHN<PETER<<<<<<<<<",
    "golden_text.png": "Invoice Total: 1,908.84 EUR",
}


def _render(text: str) -> Image.Image:
    font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 64)
    pad = 16
    probe = Image.new("RGB", (8, 8))
    box = ImageDraw.Draw(probe).textbbox((0, 0), text, font=font)
    img = Image.new("RGB", (box[2] - box[0] + 2 * pad, box[3] - box[1] + 2 * pad), "white")
    ImageDraw.Draw(img).text((pad - box[0], pad - box[1]), text, font=font, fill="black")
    return img


def _fixture(name: str) -> Image.Image:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    path = FIXTURES / name
    if not path.exists():
        _render(GOLDENS[name]).save(path)
    return Image.open(path)


@pytest.fixture(scope="module")
def session():
    return create_session(MODEL)


@pytest.fixture(scope="module")
def vocab():
    return load_vocab(DICT)


def test_vocab_matches_model_head(session, vocab):
    c = session.get_outputs()[0].shape[-1]
    assert c == len(vocab) + 1, "classes must be blank + dict + space"


def test_raw_tensor_is_probability_lattice(session, vocab):
    """THE permanent tensor test: shape, prob mass, value range."""
    raw = run_rec(session, normalize_crop(_fixture("golden_mrz.png")))
    assert raw.probs.ndim == 2
    assert raw.num_classes == len(vocab) + 1
    assert raw.time_steps >= 8, "a real line must span many timesteps"
    row_sums = raw.probs.sum(axis=1)
    assert np.allclose(row_sums, 1.0, atol=1e-3), "rows must be post-softmax"
    assert float(raw.probs.min()) >= 0.0
    assert float(raw.probs.max()) <= 1.0 + 1e-6


def test_topk_lattice_contract(session, vocab):
    raw = run_rec(session, normalize_crop(_fixture("golden_mrz.png")))
    lattice = extract_lattice(raw, vocab)
    assert len(lattice) == raw.time_steps
    argmax = np.argmax(raw.probs, axis=1)
    for t, step in enumerate(lattice):
        assert 1 <= len(step) <= LATTICE_K
        probs = [p for _, p in step]
        assert probs == sorted(probs, reverse=True), "descending order"
        for ch, p in step:
            assert isinstance(ch, str) and 0.0 <= p <= 1.0 + 1e-6
        top_c = int(argmax[t])
        expected = "" if top_c == 0 else vocab[top_c - 1]
        assert step[0][0] == expected, "lattice top-1 must equal argmax"


def test_greedy_reads_text_golden_exactly(session, vocab):
    text, conf, _, _ = tap_line(session, _fixture("golden_text.png"), vocab)
    assert text == GOLDENS["golden_text.png"]
    assert conf > 0.9, "clean render must be high-confidence"


def test_mrz_truth_survives_in_lattice(session, vocab):
    """The tap's raison d'etre, demonstrated.

    On MRZ-charset lines (isolated capitals between '<' fillers) greedy
    argmax case-flips some characters — the canonical confusion pair. The
    lattice must retain the TRUE character in its top-k at those steps so
    the checksum beam can recover it. Asserting both halves pins the
    behavior: greedy is case-insensitively right, and every case-flip is
    lattice-recoverable.
    """
    truth = GOLDENS["golden_mrz.png"]
    text, _, lattice, _ = tap_line(session, _fixture("golden_mrz.png"), vocab)
    stripped = text.strip()
    assert stripped.upper() == truth, f"got {stripped!r} want ~{truth!r}"

    # Map each emitted char to its timestep, then check flips.
    emit_steps: list[int] = []
    prev = None
    for t, step in enumerate(lattice):
        ch = step[0][0]
        if ch != "" and ch != prev:
            emit_steps.append(t)
        prev = ch
    emitted = [lattice[t][0][0] for t in emit_steps]
    offset = emitted.index(stripped[0]) if stripped else 0
    for i, want in enumerate(truth):
        got = emitted[offset + i]
        if got == want:
            continue
        step = lattice[emit_steps[offset + i]]
        alts = {c for c, _ in step}
        assert want in alts, (
            f"pos {i}: greedy {got!r} but truth {want!r} missing from top-k {alts}"
        )


def test_lattice_top1_collapse_equals_greedy(session, vocab):
    text, _, lattice, _ = tap_line(session, _fixture("golden_text.png"), vocab)
    out, prev = [], None
    for step in lattice:
        ch = step[0][0]
        if ch != "" and ch != prev:
            out.append(ch)
        prev = ch
    assert "".join(out) == text


def test_forward_is_deterministic(session, vocab):
    tensor = normalize_crop(_fixture("golden_mrz.png"))
    a = run_rec(session, tensor).probs
    b = run_rec(session, tensor).probs
    assert np.array_equal(a, b)


def test_width_math_twin():
    assert compute_rec_target_width(0, 48) == 1
    assert compute_rec_target_width(-5, 48) == 1
    assert compute_rec_target_width(480, 48) == 480
    assert compute_rec_target_width(100000, 48) == 2560
    assert compute_rec_target_width(100, 100, img_h=REC_HEIGHT) == 48
