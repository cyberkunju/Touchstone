/**
 * P2.5 tests — the text layer is a claim, not evidence.
 */

import { describe, expect, it } from 'vitest';
import {
  AGREE_SIMILARITY,
  classifyDocument,
  classifyPage,
  judgeTextLayer,
  normalizeSpan,
  pickVerificationSamples,
  similarity,
  textLayerToLines,
  type TextRun,
} from './pdf-text-layer';

const run = (text: string, box: [number, number, number, number]): TextRun => ({ text, box });

describe('similarity: difflib parity (Ratcliff/Obershelp)', () => {
  it('identity and disjoint extremes', () => {
    expect(similarity('ABCDEF', 'ABCDEF')).toBe(1);
    expect(similarity('AAAA', 'BBBB')).toBe(0);
    expect(similarity('', '')).toBe(1);
  });

  it('matches Python difflib on reference pairs', () => {
    // python3: SequenceMatcher(None,'ABCD','ABD').ratio() == 0.8571428571428571
    expect(similarity('ABCD', 'ABD')).toBeCloseTo(0.857142857, 8);
    // SequenceMatcher(None,'INVOICE','1NVOICE').ratio() == 0.8571428571428571
    expect(similarity('INVOICE', '1NVOICE')).toBeCloseTo(0.857142857, 8);
    // SequenceMatcher(None,'TOTAL:123.45','TOTAL:128.45').ratio() == 0.9166666666666666
    expect(similarity('TOTAL:123.45', 'TOTAL:128.45')).toBeCloseTo(0.916666666, 8);
  });

  it('recursion covers text around the longest block', () => {
    // 'XXABYY' vs 'ZZABWW': block 'AB' only → 2*2/12
    expect(similarity('XXABYY', 'ZZABWW')).toBeCloseTo(4 / 12, 8);
  });
});

describe('classification (pdf_stage law)', () => {
  it('≥32 normalized chars ⇒ digital; fewer ⇒ scanned', () => {
    const rich = classifyPage(0, 612, 792, [run('A'.repeat(32), [0, 0, 100, 12])]);
    expect(rich.kind).toBe('digital');
    const sparse = classifyPage(0, 612, 792, [run('WATERMARK', [0, 0, 100, 12])]);
    expect(sparse.kind).toBe('scanned');
    // Whitespace never counts toward the threshold.
    const spaces = classifyPage(0, 612, 792, [run('A B '.repeat(10), [0, 0, 100, 12])]);
    expect(normalizeSpan('A B '.repeat(10)).length).toBe(20);
    expect(spaces.kind).toBe('scanned');
  });

  it('document route: all-digital / all-scanned / hybrid', () => {
    const d = classifyPage(0, 612, 792, [run('A'.repeat(40), [0, 0, 9, 9])]);
    const s = classifyPage(1, 612, 792, []);
    expect(classifyDocument([d, d])).toBe('digital');
    expect(classifyDocument([s, s])).toBe('scanned');
    expect(classifyDocument([d, s])).toBe('hybrid');
  });
});

describe('pickVerificationSamples (I9 sampling)', () => {
  const runs = Array.from({ length: 20 }, (_, i) => run(`SPAN-${String(i).padStart(3, '0')}`, [0, i * 10, 50, i * 10 + 8]));

  it('is deterministic per seed and never repeats a span', () => {
    const a = pickVerificationSamples(runs, 8, 42);
    const b = pickVerificationSamples(runs, 8, 42);
    expect(a.map((r) => r.text)).toEqual(b.map((r) => r.text));
    expect(new Set(a.map((r) => r.text)).size).toBe(8);
    const c = pickVerificationSamples(runs, 8, 7);
    expect(c.map((r) => r.text)).not.toEqual(a.map((r) => r.text));
  });

  it('excludes unsampleable fragments (< 4 normalized chars)', () => {
    const noisy = [...runs, run('a', [0, 0, 2, 2]), run('. .', [0, 0, 2, 2])];
    const picked = pickVerificationSamples(noisy, 30, 0);
    expect(picked.every((r) => normalizeSpan(r.text).length >= 4)).toBe(true);
  });
});

describe('judgeTextLayer (I9): never silently believed', () => {
  const samples = [
    run('Invoice Number: 12345', [0, 0, 10, 2]),
    run('Total Due: $540.00', [0, 5, 10, 7]),
    run('Payment Terms: Net 30', [0, 10, 10, 12]),
  ];

  it('honest layer: OCR agrees ⇒ trusted', () => {
    const v = judgeTextLayer(samples, ['Invoice Number: 12345', 'Total Due: $540.00', 'Payment Terms: Net 30']);
    expect(v).toMatchObject({ trusted: true, sampled: 3, disagreements: 0 });
  });

  it('one OCR hiccup on a legit page must not poison the route (≤34%)', () => {
    const v = judgeTextLayer(samples, ['Invoice Number: 12345', 'Total Due: $540.00', 'ZZZZZZZZZ']);
    expect(v.disagreements).toBe(1);
    expect(v.trusted).toBe(true); // 1/3 ≤ 0.34
  });

  it('planted garbage layer: rendered pixels disagree ⇒ UNTRUSTED', () => {
    const v = judgeTextLayer(samples, ['COMPLETELY', 'DIFFERENT', 'PIXELS']);
    expect(v.trusted).toBe(false);
    expect(v.disagreements).toBe(3);
    for (const d of v.details) expect(d.agree).toBe(false);
  });

  it('small OCR noise within similarity threshold still agrees', () => {
    const v = judgeTextLayer([samples[0]], ['Invoice Number: I2345']); // 1→I
    expect(v.details[0].similarity).toBeGreaterThanOrEqual(AGREE_SIMILARITY);
    expect(v.trusted).toBe(true);
  });

  it('empty claims are honest: nothing claimed, nothing distrusted', () => {
    expect(judgeTextLayer([], [])).toMatchObject({ trusted: true, sampled: 0 });
  });

  it('sample/read count mismatch throws (harness bug, not data)', () => {
    expect(() => judgeTextLayer(samples, ['only one'])).toThrow(/samples but/);
  });
});

describe('textLayerToLines: digital pages skip OCR', () => {
  it('groups same-baseline runs into lines, left-to-right, normalized boxes', () => {
    const page = classifyPage(0, 600, 800, [
      run('Total:', [300, 100, 350, 112]),
      run('Invoice', [50, 100, 120, 112]),
      run('$540.00', [360, 101, 420, 113]),
      run('Line two', [50, 130, 130, 142]),
    ]);
    const lines = textLayerToLines(page);
    expect(lines.length).toBe(2);
    expect(lines[0].text).toBe('Invoice Total: $540.00');
    expect(lines[1].text).toBe('Line two');
    expect(lines[0].channel).toBe('native');
    const [x0, y0, x1, y1] = lines[0].boxNorm;
    expect(x0).toBeCloseTo(50 / 600);
    expect(y0).toBeCloseTo(100 / 800);
    expect(x1).toBeCloseTo(420 / 600);
    expect(y1).toBeCloseTo(113 / 800);
  });

  it('drops whitespace-only runs; separate baselines never merge', () => {
    const page = classifyPage(0, 100, 100, [
      run('   ', [0, 0, 5, 5]),
      run('A', [0, 10, 5, 18]),
      run('B', [0, 30, 5, 38]),
    ]);
    const lines = textLayerToLines(page);
    expect(lines.map((l) => l.text)).toEqual(['A', 'B']);
  });
});
