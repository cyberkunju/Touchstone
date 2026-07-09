/**
 * P2.5 — Browser PDF text-layer logic (PDF.js interim route).
 *
 * Faithful twin of the certified service stages (pdf_stage.py +
 * reconcile.py): identical constants, identical laws.
 *
 *  - Classification: ≥ MIN_DIGITAL_CHARS extractable chars ⇒ digital page
 *    (text from the content stream, N1-gold, skips OCR); else scanned.
 *  - A text layer is a CLAIM, not evidence (I9): digital-route trust is
 *    granted only after sampled spans are re-OCR'd from RENDERED pixels and
 *    agree. Disagreement beyond UNTRUSTED_FRAC ⇒ page flagged
 *    textLayerUntrusted and treated as scanned — never silently believed.
 *  - Similarity is Ratcliff/Obershelp (Python difflib parity) on
 *    whitespace-stripped uppercase.
 *
 * This module is pure (runs come from pdfjs-dist getTextContent in the
 * runtime wrapper); every law is unit-tested without a browser.
 */

/** One text-layer run in PAGE units (PDF.js viewport space, y-down). */
export interface TextRun {
  text: string;
  /** [x0, y0, x1, y1] in page units. */
  box: [number, number, number, number];
}

export interface PdfPageText {
  index: number;
  width: number;
  height: number;
  runs: TextRun[];
  kind: 'digital' | 'scanned';
}

// Constants — MUST match service/stages/pdf_stage.py + reconcile.py.
export const MIN_DIGITAL_CHARS = 32;
export const MIN_SPAN_CHARS = 4;
export const AGREE_SIMILARITY = 0.6;
export const UNTRUSTED_FRAC = 0.34;
/** ~200 DPI on letter/A4: raster long side for the interim route. */
export const RASTER_LONG_SIDE = 2200;

export function normalizeSpan(s: string): string {
  return s.replace(/\s+/g, '').toUpperCase();
}

/** Ratcliff/Obershelp ratio — difflib.SequenceMatcher parity. */
export function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const matches = matchingChars(a, 0, a.length, b, 0, b.length);
  return (2 * matches) / (a.length + b.length);
}

function matchingChars(a: string, aLo: number, aHi: number, b: string, bLo: number, bHi: number): number {
  // Longest matching block within the windows (quadratic DP — spans are short).
  let bestI = aLo;
  let bestJ = bLo;
  let bestLen = 0;
  const runLengths = new Map<number, number>();
  for (let i = aLo; i < aHi; i++) {
    const next = new Map<number, number>();
    for (let j = bLo; j < bHi; j++) {
      if (a[i] === b[j]) {
        const len = (runLengths.get(j - 1) ?? 0) + 1;
        next.set(j, len);
        if (len > bestLen) {
          bestLen = len;
          bestI = i - len + 1;
          bestJ = j - len + 1;
        }
      }
    }
    runLengths.clear();
    for (const [k, v] of next) runLengths.set(k, v);
  }
  if (bestLen === 0) return 0;
  return (
    bestLen +
    matchingChars(a, aLo, bestI, b, bLo, bestJ) +
    matchingChars(a, bestI + bestLen, aHi, b, bestJ + bestLen, bHi)
  );
}

/** Classify one page from its extracted runs (pdf_stage law). */
export function classifyPage(index: number, width: number, height: number, runs: TextRun[]): PdfPageText {
  const totalChars = runs.reduce((n, r) => n + normalizeSpan(r.text).length, 0);
  return {
    index,
    width,
    height,
    runs,
    kind: totalChars >= MIN_DIGITAL_CHARS ? 'digital' : 'scanned',
  };
}

/** Whole-document route (pdf_stage.classify_document law). */
export function classifyDocument(pages: readonly PdfPageText[]): 'digital' | 'scanned' | 'hybrid' {
  const kinds = new Set(pages.map((p) => p.kind));
  if (kinds.size === 1) return kinds.has('digital') ? 'digital' : 'scanned';
  return 'hybrid';
}

/** Deterministic LCG mirroring the seeded sampling contract. */
function lcg(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (1103515245 * state + 12345) >>> 0;
    return state / 2 ** 32;
  };
}

/** Sample spans for render-verification: seeded, no replacement (I9). */
export function pickVerificationSamples(runs: readonly TextRun[], sampleN = 8, seed = 0): TextRun[] {
  const candidates = runs.filter((r) => normalizeSpan(r.text).length >= MIN_SPAN_CHARS);
  if (candidates.length <= sampleN) return [...candidates];
  const rand = lcg(seed);
  const pool = [...candidates];
  const out: TextRun[] = [];
  for (let i = 0; i < sampleN; i++) {
    const idx = Math.floor(rand() * pool.length);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

export interface ReconcileVerdict {
  trusted: boolean;
  sampled: number;
  disagreements: number;
  details: Array<{ claimed: string; seen: string; similarity: number; agree: boolean }>;
}

/**
 * Judge sampled claims against their re-OCR reads (reconcile.py law).
 * `reads[i]` is the OCR of the rendered pixels under `samples[i]`.
 */
export function judgeTextLayer(samples: readonly TextRun[], reads: readonly string[]): ReconcileVerdict {
  if (samples.length === 0) {
    // Nothing claimed ⇒ nothing to distrust; vision handles pixels.
    return { trusted: true, sampled: 0, disagreements: 0, details: [] };
  }
  if (reads.length !== samples.length) {
    throw new Error(`judgeTextLayer: ${samples.length} samples but ${reads.length} reads`);
  }
  const details: ReconcileVerdict['details'] = [];
  let disagreements = 0;
  for (let i = 0; i < samples.length; i++) {
    const claimed = normalizeSpan(samples[i].text);
    const seen = normalizeSpan(reads[i]);
    const sim = similarity(seen, claimed);
    const agree = sim >= AGREE_SIMILARITY;
    if (!agree) disagreements++;
    details.push({ claimed: samples[i].text, seen: reads[i], similarity: Math.round(sim * 1000) / 1000, agree });
  }
  return {
    trusted: disagreements / samples.length <= UNTRUSTED_FRAC,
    sampled: samples.length,
    disagreements,
    details,
  };
}

/**
 * Convert trusted digital-page runs into OCR-line-compatible output so
 * digital pages SKIP OCR entirely: same-baseline runs group into lines
 * (y-overlap ≥ 50% of the shorter run), left-to-right, single-space joins.
 * Boxes normalize to [0,1] page space.
 */
export interface DigitalLine {
  text: string;
  boxNorm: [number, number, number, number];
  /** Digital-route provenance: exact by construction, not an OCR guess. */
  channel: 'native';
}

export function textLayerToLines(page: PdfPageText): DigitalLine[] {
  const runs = page.runs
    .filter((r) => r.text.trim().length > 0)
    .slice()
    .sort((a, b) => (a.box[1] - b.box[1]) || (a.box[0] - b.box[0]));

  const groups: TextRun[][] = [];
  for (const run of runs) {
    const last = groups[groups.length - 1];
    if (last && yOverlap(last[0].box, run.box) >= 0.5) {
      last.push(run);
    } else {
      groups.push([run]);
    }
  }

  return groups.map((group) => {
    const sorted = group.slice().sort((a, b) => a.box[0] - b.box[0]);
    const x0 = Math.min(...sorted.map((r) => r.box[0]));
    const y0 = Math.min(...sorted.map((r) => r.box[1]));
    const x1 = Math.max(...sorted.map((r) => r.box[2]));
    const y1 = Math.max(...sorted.map((r) => r.box[3]));
    return {
      text: sorted.map((r) => r.text.trim()).join(' '),
      boxNorm: [
        x0 / page.width,
        y0 / page.height,
        x1 / page.width,
        y1 / page.height,
      ] as [number, number, number, number],
      channel: 'native' as const,
    };
  });
}

function yOverlap(a: [number, number, number, number], b: [number, number, number, number]): number {
  const top = Math.max(a[1], b[1]);
  const bottom = Math.min(a[3], b[3]);
  const overlap = Math.max(0, bottom - top);
  const shorter = Math.min(a[3] - a[1], b[3] - b[1]);
  return shorter <= 0 ? 0 : overlap / shorter;
}
