"""The lattice tap (P3.2) — raw T x C softmax captured pre-argmax.

This is the kill-risk prototype from Documentation/05 section 4 (`ocr.py`):
prove that a Python ONNX Runtime session over the pinned PP-OCR recognition
model can expose the FULL per-timestep probability tensor, and that greedy
decode + top-k lattice extraction reproduce the browser contract exactly
(src/ai-runtime/ocr.ts + src/beam/lattice.ts).

Everything here is a pure function over (image, params); no state, no server.
The FastAPI wrapper (P3.1/P3.4) composes these.

Contract mirrored from the browser (single source of truth for constants):
  - rec input height 48, aspect-preserving resize, right-pad to batch width
  - normalization (px/255 - 0.5) / 0.5, CHW planes
  - output [N, T, C] POST-SOFTMAX probabilities (softmax is inside the model)
  - class 0 = CTC blank; class c >= 1 maps to vocab[c-1]
  - vocab = dictionary file lines + one trailing space char (use_space_char)
  - lattice: top-k=5 [char, prob] per step, descending, blank as '',
    classes without a vocab mapping are excluded (never emittable)
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

REC_HEIGHT = 48
REC_MAX_WIDTH = 2560
LATTICE_K = 5

# One [char, prob] pair; blank is ''.
LatticeStep = list[tuple[str, float]]
Lattice = list[LatticeStep]


def load_vocab(dict_path: str | Path) -> list[str]:
    """Dictionary lines + trailing space — mirrors App.tsx setRecognitionVocab."""
    lines = Path(dict_path).read_text(encoding="utf-8").splitlines()
    return lines + [" "]


def compute_rec_target_width(src_w: int, src_h: int,
                             img_h: int = REC_HEIGHT,
                             max_w: int = REC_MAX_WIDTH) -> int:
    """Aspect-preserving target width, clamped to [1, max_w] (ocr.ts twin)."""
    if src_w <= 0 or src_h <= 0:
        return 1
    width = math.ceil(img_h * (src_w / src_h))
    return max(1, min(width, max_w))


def normalize_crop(img: Image.Image,
                   img_h: int = REC_HEIGHT,
                   max_w: int = REC_MAX_WIDTH) -> np.ndarray:
    """RGB crop -> [1, 3, img_h, W] float32, (x/255 - 0.5) / 0.5, zero right-pad.

    W is the aspect-resized width (no extra padding beyond the resize target,
    since batch size is 1 in the tap).
    """
    rgb = img.convert("RGB")
    target_w = compute_rec_target_width(rgb.width, rgb.height, img_h, max_w)
    resized = rgb.resize((target_w, img_h), Image.Resampling.BILINEAR)

    arr = np.asarray(resized, dtype=np.float32)          # [H, W, 3]
    arr = (arr / 255.0 - 0.5) / 0.5
    chw = np.transpose(arr, (2, 0, 1))                   # [3, H, W]
    return np.ascontiguousarray(chw[np.newaxis, ...])    # [1, 3, H, W]


@dataclass
class RawRecOutput:
    """The tap's product: the raw probability tensor, nothing collapsed."""
    probs: np.ndarray        # [T, C] float32, post-softmax
    time_steps: int
    num_classes: int


def run_rec(session: ort.InferenceSession, tensor: np.ndarray) -> RawRecOutput:
    """Forward pass capturing the FULL [T, C] tensor pre-argmax."""
    input_name = session.get_inputs()[0].name
    out = session.run(None, {input_name: tensor})[0]     # [1, T, C]
    probs = np.ascontiguousarray(out[0], dtype=np.float32)
    return RawRecOutput(probs=probs, time_steps=probs.shape[0],
                        num_classes=probs.shape[1])


def greedy_decode(raw: RawRecOutput, vocab: list[str]) -> tuple[str, float]:
    """CTC greedy collapse — decodeCTCGreedy twin (blank=0, dedupe, vocab[c-1])."""
    argmax = np.argmax(raw.probs, axis=1)
    text_chars: list[str] = []
    prob_sum = 0.0
    emitted = 0
    prev = -1
    for t in range(raw.time_steps):
        idx = int(argmax[t])
        if idx != 0 and idx != prev:
            char_idx = idx - 1
            if char_idx < len(vocab):
                text_chars.append(vocab[char_idx])
                prob_sum += float(raw.probs[t, idx])
                emitted += 1
        prev = idx
    return "".join(text_chars), (prob_sum / emitted if emitted else 0.0)


def extract_lattice(raw: RawRecOutput, vocab: list[str],
                    k: int = LATTICE_K) -> Lattice:
    """Top-k lattice — extractLattice twin.

    Blank is '', unmappable classes (c-1 >= len(vocab)) are excluded,
    pairs are probability-descending.
    """
    mappable = 1 + len(vocab)                # blank + mapped chars
    usable = raw.probs[:, :min(mappable, raw.num_classes)]

    lattice: Lattice = []
    for t in range(raw.time_steps):
        row = usable[t]
        kk = min(k, row.shape[0])
        top = np.argpartition(row, -kk)[-kk:]
        top = top[np.argsort(row[top])[::-1]]            # descending
        step: LatticeStep = [
            ("" if int(c) == 0 else vocab[int(c) - 1], float(row[c]))
            for c in top
        ]
        lattice.append(step)
    return lattice


def create_session(model_path: str | Path) -> ort.InferenceSession:
    opts = ort.SessionOptions()
    opts.inter_op_num_threads = 1
    return ort.InferenceSession(str(model_path), sess_options=opts,
                                providers=["CPUExecutionProvider"])


def tap_line(session: ort.InferenceSession, crop: Image.Image,
             vocab: list[str], k: int = LATTICE_K
             ) -> tuple[str, float, Lattice, RawRecOutput]:
    """Full tap for one text-line crop: greedy text, confidence, lattice, raw."""
    raw = run_rec(session, normalize_crop(crop))
    text, conf = greedy_decode(raw, vocab)
    return text, conf, extract_lattice(raw, vocab, k), raw
