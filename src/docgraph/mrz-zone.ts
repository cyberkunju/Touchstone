import { OcrItem } from './ocr-item';

/**
 * A detected Machine-Readable Zone (MRZ) block, grouped from OCR items.
 */
export interface MrzZone {
  /** MRZ line texts, ordered top-to-bottom, uppercased, spaces removed. */
  lines: string[];
  /** nodeIds of the items forming the zone, same order as `lines`. */
  itemIds: string[];
  /** Bounding box enclosing all MRZ items: [x_min, y_min, x_max, y_max]. */
  boxNorm: [number, number, number, number];
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Strip whitespace and uppercase a candidate line. */
function strip(text: string): string {
  return text.toUpperCase().replace(/\s+/g, '');
}

/**
 * Score how MRZ-like a single line is, in [0,1].
 *
 * MRZ lines are dominated by [A-Z0-9<] and contain '<' filler characters.
 * Lines with no '<' are penalized since real MRZ rows almost always carry
 * filler characters.
 */
export function mrzLineScore(text: string): number {
  const t = strip(text);
  if (t.length < 10) return 0;

  const mrzChars = (t.match(/[A-Z0-9<]/g) || []).length;
  const fillers = (t.match(/</g) || []).length;
  const ratio = mrzChars / t.length;

  if (fillers === 0) {
    return clamp01(Math.max(0, ratio - 0.4));
  }
  return clamp01(ratio);
}

/**
 * Whether a line should be treated as an MRZ line.
 *
 * Requires sufficient length, a high MRZ-likeness score, and at least one
 * filler '<' character.
 */
export function isMrzLine(text: string): boolean {
  const t = strip(text);
  const fillers = (t.match(/</g) || []).length;
  return t.length >= 15 && mrzLineScore(text) >= 0.85 && fillers >= 1;
}

function yCenter(box: [number, number, number, number]): number {
  return (box[1] + box[3]) / 2;
}

/**
 * Locate the MRZ lines among OCR items and group them into an ordered block.
 *
 * Returns null when no MRZ-like lines are present.
 */
export function detectMrzZone(items: OcrItem[]): MrzZone | null {
  let candidates = items.filter((item) => isMrzLine(item.text));
  if (candidates.length < 1) return null;

  // Prefer candidates in the lower portion of the page when any exist there.
  const lower = candidates.filter((c) => yCenter(c.boxNorm) > 0.5);
  if (lower.length > 0) {
    candidates = lower;
  }

  // Sort top-to-bottom by y_min, then left-to-right by x_min.
  candidates = candidates.slice().sort((a, b) => {
    if (a.boxNorm[1] !== b.boxNorm[1]) return a.boxNorm[1] - b.boxNorm[1];
    return a.boxNorm[0] - b.boxNorm[0];
  });

  const lines = candidates.map((c) => strip(c.text));
  const itemIds = candidates.map((c) => c.nodeId);

  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  for (const c of candidates) {
    xMin = Math.min(xMin, c.boxNorm[0]);
    yMin = Math.min(yMin, c.boxNorm[1]);
    xMax = Math.max(xMax, c.boxNorm[2]);
    yMax = Math.max(yMax, c.boxNorm[3]);
  }

  return {
    lines,
    itemIds,
    boxNorm: [xMin, yMin, xMax, yMax],
  };
}
