import { Box } from '../core/geometry';
import type { Lattice } from '../beam/lattice';

/**
 * A single recognized OCR text region used by the extraction engine.
 * Coordinates are normalized to the page in [0,1].
 */
export interface OcrItem {
  /** Recognized text (honest OCR output, never fabricated). */
  text: string;
  /** Normalized bounding box [x_min, y_min, x_max, y_max]. */
  boxNorm: Box;
  /** Id of the backing DocGraph node. */
  nodeId: string;
  /** Real OCR confidence in [0,1]. */
  confidence: number;
  /** Top-k CTC lattice when available (vision route) — enables typed
   *  grammar re-decode (I3) instead of trusting the greedy top-1. */
  lattice?: Lattice;
  /** Rotated source quad (TL,TR,BR,BL normalized) when the line was read
   *  from a RECTIFIED crop (quad-native perception, P1). `boxNorm` remains
   *  the geometry of record; the quad records what pixels were read. */
  quadNorm?: [number, number][];
  /** P5: per emitted character, the fraction of the LINE's width where its
   *  CTC emission occurred — enables exact substring geometry (inline
   *  "Label: value" values, MRZ field spans) instead of whole-line boxes. */
  charSpans?: { start: number; end: number }[];
  /** P8: page-surface id ('L'/'R' on two-page spreads). Extraction NEVER
   *  binds a caption on one surface to a value on the other (live class:
   *  inside-cover text polluting the data page). */
  regionId?: string;
}
