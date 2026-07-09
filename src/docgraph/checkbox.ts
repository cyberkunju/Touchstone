/**
 * Checkbox primitive (P4 scope) — fill-ratio classification with an
 * ambiguity band. THE law (per the questionnaire corpus class): a checkbox
 * is never guessed — anything between the calibrated thresholds is
 * `ambiguous` and routes to review.
 *
 * Method: within the ROI, drop a border band (the printed box outline),
 * adaptively threshold the interior against the ROI's own luma statistics
 * (robust to lighting), and measure the dark-pixel fill ratio.
 *
 * DESTINATION: src/docgraph/checkbox.ts.
 * Gate scoring proposal (lead wires): truth `checkedStates[i]` vs primitive
 * output on template ROIs — `checked`/`unchecked` must match truth exactly;
 * `ambiguous` counts as review (never a silent), gate passes iff zero
 * wrong confident states.
 */

export type CheckboxState = 'checked' | 'unchecked' | 'ambiguous';

export interface CheckboxRead {
  state: CheckboxState;
  /** Dark-pixel fill ratio of the ROI interior, in [0, 1]. */
  fillRatio: number;
  /** Largest connected dark component as a fraction of all dark pixels —
   *  1.0 = one coherent stroke, → 0 = scattered speckle. */
  strokeCoherence: number;
}

/** Fill ratios ABOVE this are confidently checked regardless of shape. */
export const CHECKED_MIN = 0.12;
/** Fill ratios BELOW this are confidently unchecked. */
export const UNCHECKED_MAX = 0.05;
/** Mid-band fills are checked ONLY when the ink is a coherent stroke
 *  (largest connected component ≥ this fraction of all ink) — a thin
 *  checkmark is a stroke; a smudge is scatter. */
export const STROKE_COHERENCE_MIN = 0.5;
/** Fraction of ROI width/height treated as printed-outline border. */
export const BORDER_BAND = 0.15;
/** Interior mean this far below surrounding paper = solid fill (checked). */
export const SOLID_FILL_DELTA = 60;

/**
 * Classify one checkbox ROI on an RGBA raster.
 *
 * @param rgba Row-major RGBA page pixels.
 * @param imgW Page width in px.
 * @param roi  ROI in pixels {x, y, w, h} — the checkbox CELL (outline included).
 */
export function readCheckbox(
  rgba: Uint8ClampedArray,
  imgW: number,
  roi: { x: number; y: number; w: number; h: number },
): CheckboxRead {
  const x0 = Math.max(0, Math.floor(roi.x + roi.w * BORDER_BAND));
  const y0 = Math.max(0, Math.floor(roi.y + roi.h * BORDER_BAND));
  const x1 = Math.floor(roi.x + roi.w * (1 - BORDER_BAND));
  const y1 = Math.floor(roi.y + roi.h * (1 - BORDER_BAND));

  if (x1 - x0 < 4 || y1 - y0 < 4) {
    // Sub-analyzable ROI: no evidence either way — never guess.
    return { state: 'ambiguous', fillRatio: 0, strokeCoherence: 0 };
  }

  // Paper reference: a thin ring just OUTSIDE the ROI (the surrounding
  // form). A solid-filled box has a near-uniform dark interior where any
  // relative threshold collapses — the ring is the absolute anchor.
  let ringSum = 0;
  let ringN = 0;
  const ring = Math.max(2, Math.floor(Math.min(roi.w, roi.h) * 0.15));
  for (let y = Math.max(0, roi.y - ring); y < roi.y + roi.h + ring; y++) {
    for (let x = Math.max(0, roi.x - ring); x < roi.x + roi.w + ring; x++) {
      const insideRoi = x >= roi.x && x < roi.x + roi.w && y >= roi.y && y < roi.y + roi.h;
      if (insideRoi || x >= imgW) continue;
      const i = (y * imgW + x) * 4;
      if (i + 2 >= rgba.length) continue;
      ringSum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      ringN++;
    }
  }
  const paper = ringN > 0 ? ringSum / ringN : 255;

  // Pass 1: luma statistics of the interior.
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * imgW + x) * 4;
      const luma = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      sum += luma;
      sumSq += luma * luma;
      n++;
    }
  }
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));

  // Solid fill: the interior as a whole is far darker than the paper ring.
  if (mean < paper - SOLID_FILL_DELTA) {
    return { state: 'checked', fillRatio: 1, strokeCoherence: 1 };
  }

  // Adaptive dark threshold anchored to PAPER (not the interior mean — a
  // heavily-marked interior drags its own mean down): ink is well below
  // paper, with a spread-sensitive pull for shaded scans.
  const threshold = Math.min(paper - 25, mean - 0.5 * std);

  const iw = x1 - x0;
  const ih = y1 - y0;
  const dark = new Uint8Array(iw * ih);
  let darkCount = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * imgW + x) * 4;
      const luma = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      if (luma < threshold) {
        dark[(y - y0) * iw + (x - x0)] = 1;
        darkCount++;
      }
    }
  }
  const fillRatio = darkCount / n;

  // Stroke coherence: largest 4-connected component / all ink.
  let largest = 0;
  if (darkCount > 0) {
    const seen = new Uint8Array(iw * ih);
    const stack: number[] = [];
    for (let s = 0; s < dark.length; s++) {
      if (dark[s] === 0 || seen[s] !== 0) continue;
      let size = 0;
      stack.push(s);
      seen[s] = 1;
      while (stack.length > 0) {
        const cur = stack.pop()!;
        size++;
        const cx = cur % iw;
        const cy = (cur - cx) / iw;
        if (cx + 1 < iw && dark[cur + 1] && !seen[cur + 1]) { seen[cur + 1] = 1; stack.push(cur + 1); }
        if (cx - 1 >= 0 && dark[cur - 1] && !seen[cur - 1]) { seen[cur - 1] = 1; stack.push(cur - 1); }
        if (cy + 1 < ih && dark[cur + iw] && !seen[cur + iw]) { seen[cur + iw] = 1; stack.push(cur + iw); }
        if (cy - 1 >= 0 && dark[cur - iw] && !seen[cur - iw]) { seen[cur - iw] = 1; stack.push(cur - iw); }
      }
      if (size > largest) largest = size;
    }
  }
  const strokeCoherence = darkCount > 0 ? largest / darkCount : 0;

  let state: CheckboxState;
  if (fillRatio >= CHECKED_MIN) {
    state = 'checked';
  } else if (fillRatio <= UNCHECKED_MAX) {
    state = 'unchecked';
  } else {
    // Mid-band: a coherent stroke is a deliberate mark; scatter is not
    // provable either way — review, never guess.
    state = strokeCoherence >= STROKE_COHERENCE_MIN ? 'checked' : 'ambiguous';
  }
  return { state, fillRatio, strokeCoherence };
}

/** Batch helper for a template's checkbox group; order preserved. */
export function readCheckboxGroup(
  rgba: Uint8ClampedArray,
  imgW: number,
  rois: { x: number; y: number; w: number; h: number }[],
): CheckboxRead[] {
  return rois.map((roi) => readCheckbox(rgba, imgW, roi));
}
