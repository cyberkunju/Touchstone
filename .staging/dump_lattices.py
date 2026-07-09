"""Dump MRZ-band lattices from the v6-failing composites through all three
rec models — the TS beam consumes these JSONs to reproduce the exact silent."""
import sys, json
sys.path.insert(0, 'service'); sys.path.insert(0, 'bench')
from pathlib import Path
from PIL import Image
from stages import det_stage
from stages.ocr_tap import create_session, load_vocab, tap_line
from ab_v6 import load_v6_vocab
from config import MODEL_DIR

det = create_session(str(MODEL_DIR / 'PP-OCRv5_server_det_infer.onnx'))
models = {
    'v5-server': (create_session(str(MODEL_DIR / 'PP-OCRv5_server_rec_infer.onnx')),
                  load_vocab(str(MODEL_DIR / 'ppocrv5_dict.txt'))),
    'v6-small': (create_session('.ab-cache/v6_small_rec.onnx'),
                 load_v6_vocab(Path('.ab-cache/v6_small_rec.yml'))),
    'v6-medium': (create_session('.ab-cache/v6_medium_rec.onnx'),
                  load_v6_vocab(Path('.ab-cache/v6_medium_rec.yml'))),
}

CORPUS = Path('test_cases/composites')
manifest = json.load(open(CORPUS / 'manifest.json', encoding='utf-8'))
targets = [e for e in manifest if 'id03' in e['file']]
print('targets:', [e['file'] for e in targets])

MRZ_CHARS = set('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<')


def mrzish(text: str) -> bool:
    t = text.replace(' ', '').upper()
    return len(t) >= 20 and sum(1 for ch in t if ch in MRZ_CHARS) / max(len(t), 1) > 0.85 and '<' in t


out = {}
for e in targets:
    img = Image.open(CORPUS / e['file']).convert('RGB')
    boxes = det_stage.detect_lines(det, img)
    per_model = {}
    for name, (rec, vocab) in models.items():
        lines = []
        for x0, y0, x1, y1 in boxes:
            c = img.crop((int(x0 * img.width), int(y0 * img.height),
                          int(x1 * img.width), int(y1 * img.height)))
            if c.width < 120 or c.height < 8:
                continue
            try:
                text, conf, lattice, _ = tap_line(rec, c, vocab)
            except Exception:
                continue
            if mrzish(text):
                lines.append({'text': text, 'y': y0, 'conf': conf,
                              'lattice': [[[ch, float(p)] for ch, p in step] for step in lattice]})
        lines.sort(key=lambda l: l['y'])
        per_model[name] = lines
        print(f"{e['file']} {name}: {len(lines)} MRZ-ish lines: {[l['text'][:44] for l in lines]}")
    # truth from constituents
    truth = {}
    for c in e.get('constituents', []):
        t = c.get('truth') or {}
        if t.get('mrzLines'):
            truth = t
    out[e['file']] = {'truth': truth, 'models': per_model}

Path('.staging/failing_lattices.json').write_text(json.dumps(out), encoding='utf-8')
print('dumped -> .staging/failing_lattices.json')
