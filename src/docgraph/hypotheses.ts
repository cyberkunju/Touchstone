/**
 * Evidence-driven field hypothesis generation.
 *
 * This module proposes form fields from recognized text items using geometry
 * (label/value pairing) and HONEST normalization only. It performs NO value
 * fabrication: it never substitutes a "known correct" answer for OCR output.
 * Uncertain values stay as the recognized text and are flagged downstream by
 * the Verifier.
 *
 * See mini-doc/04_PIPELINES.md (Form generation) and 06_VERIFICATION.md.
 */

import { Box, getBoxCenter } from '../core/geometry';
import { FieldValueType } from '../core/types';
import { parseDate, parseAmount, normalizeId } from '../parsers/scalars';

/** A recognized text region (OCR line) with its graph node id. */
export interface TextItem {
  text: string;
  boxNorm: Box;
  nodeId: string;
}

/** A label/value pair discovered by geometry. */
export interface LabelValuePair {
  label: TextItem;
  value: TextItem;
}

/** The result of honest value normalization. */
export interface NormalizedValue {
  /** The cleaned editable value (whitespace-collapsed). Never fabricated. */
  value: string;
  /** Display string. */
  displayValue: string;
  /** Optional canonical form (ISO date, numeric amount, normalized id). */
  normalizedValue?: unknown;
}

/** Collapse whitespace and trim. The only universal cleanup applied. */
export function cleanText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Axis-aligned bounding box enclosing a set of boxes. */
export function getBoundingBoxOfBoxes(boxes: Box[]): Box {
  if (boxes.length === 0) return [0, 0, 0, 0];
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const [bx1, by1, bx2, by2] of boxes) {
    x1 = Math.min(x1, bx1);
    y1 = Math.min(y1, by1);
    x2 = Math.max(x2, bx2);
    y2 = Math.max(y2, by2);
  }
  return [x1, y1, x2, y2];
}

/** Fraction of box `b`'s area covered by its intersection with box `a`. */
export function boxOverlapFraction(a: Box, b: Box): number {
  const [ax1, ay1, ax2, ay2] = a;
  const [bx1, by1, bx2, by2] = b;
  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const areaB = (bx2 - bx1) * (by2 - by1);
  return areaB <= 0 ? 0 : inter / areaB;
}

/** Find the first text item whose lowercased text contains any keyword. */
export function findLabelItem(items: TextItem[], keywords: string[]): TextItem | null {
  const lowered = keywords.map((k) => k.toLowerCase());
  for (const item of items) {
    const t = item.text.toLowerCase();
    if (lowered.some((k) => t.includes(k))) return item;
  }
  return null;
}

/**
 * Find the value paired with a label. Strategy: locate a label item by
 * keyword, then choose the nearest item that is either to the right on the
 * same baseline or directly below — the classic label/value geometry.
 */
export function findValueForLabel(
  items: TextItem[],
  keywords: string[],
): LabelValuePair | null {
  const label = findLabelItem(items, keywords);
  if (!label) return null;

  const [lx1, ly1, lx2, ly2] = label.boxNorm;
  const [lcx, lcy] = getBoxCenter(label.boxNorm);

  let best: TextItem | null = null;
  let bestDist = Infinity;

  for (const item of items) {
    if (item.nodeId === label.nodeId) continue;
    const [nx1, ny1] = item.boxNorm;
    const [ncx, ncy] = getBoxCenter(item.boxNorm);

    const toRight = nx1 >= lx2 - 0.02 && ny1 >= ly1 - 0.02 && ny1 <= ly2 + 0.02;
    const below = ny1 >= ly2 - 0.01 && nx1 >= lx1 - 0.05 && nx1 <= lx2 + 0.15;

    if (toRight || below) {
      const dist = Math.hypot(lcx - ncx, lcy - ncy);
      if (dist < bestDist) {
        bestDist = dist;
        best = item;
      }
    }
  }

  return best ? { label, value: best } : null;
}

/** Heuristic: lines that look like MRZ rows (mostly A–Z, 0–9, and '<'). */
export function findMrzLines(items: TextItem[]): TextItem[] {
  return items.filter((item) => {
    const t = item.text.toUpperCase().replace(/\s/g, '');
    if (t.length < 20) return false;
    const fillerCount = (t.match(/</g) ?? []).length;
    const mrzChars = (t.match(/[A-Z0-9<]/g) ?? []).length;
    return fillerCount >= 3 && mrzChars / t.length > 0.9;
  });
}

/**
 * Honest normalization for a field value. Trims/collapses whitespace and adds
 * a canonical `normalizedValue` (ISO date, numeric amount, normalized id) when
 * one can be derived. It NEVER replaces the recognized text with a guessed
 * "correct" answer.
 */
export function normalizeFieldValue(valueType: FieldValueType, raw: string): NormalizedValue {
  const value = cleanText(raw);
  const base: NormalizedValue = { value, displayValue: value };

  switch (valueType) {
    case 'date': {
      const r = parseDate(value);
      if (r.valid && r.iso) base.normalizedValue = r.iso;
      return base;
    }
    case 'amount':
    case 'currency': {
      const r = parseAmount(value);
      if (r.valid) base.normalizedValue = { value: r.value, currency: r.currency };
      return base;
    }
    case 'id_number': {
      base.normalizedValue = normalizeId(value).normalized;
      return base;
    }
    default:
      return base;
  }
}
