"""Three-way raw MRZ A/B: v5-server vs v6-small vs v6-medium (P3.6 deep dive)."""
import sys, json, time
sys.path.insert(0, 'service'); sys.path.insert(0, 'bench')
from pathlib import Path
from PIL import Image
from stages import det_stage
from stages.ocr_tap import create_session, load_vocab, tap_line
from ab_v6 import load_v6_vocab, char_acc
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
CORPUS = Path('test_cases/passports/synthetic')
entries = [e for e in json.load(open(CORPUS / 'manifest.json', encoding='utf-8'))
           if (e.get('truth') or {}).get('mrzLines')][:40]
score = {k: {'exact': 0, 'acc': 0.0, 'ms': 0.0} for k in models}
total = 0
for e in entries:
    img = Image.open(CORPUS / e['file']).convert('RGB')
    truth = e['truth']['mrzLines']
    crops = []
    for x0, y0, x1, y1 in det_stage.detect_lines(det, img):
        if y0 > 0.6:
            c = img.crop((int(x0 * img.width), int(y0 * img.height),
                          int(x1 * img.width), int(y1 * img.height)))
            if c.width >= 100 and c.height >= 8:
                crops.append(c)
    if not crops:
        continue
    for name, (rec, vocab) in models.items():
        reads = []
        t0 = time.perf_counter()
        for c in crops:
            try:
                reads.append(tap_line(rec, c, vocab)[0])
            except Exception:
                reads.append('')
        score[name]['ms'] += (time.perf_counter() - t0) * 1000
        for want in truth:
            score[name]['acc'] += max((char_acc(r, want) for r in reads), default=0.0)
            if any(r.replace(' ', '') == want for r in reads):
                score[name]['exact'] += 1
    total += len(truth)
for k, s in score.items():
    print(f"{k:10s} exact={s['exact']}/{total} ({s['exact']/total:.2f}) "
          f"charAcc={s['acc']/total:.4f} ms/doc={s['ms']/len(entries):.0f}")
