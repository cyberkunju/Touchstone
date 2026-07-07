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
}
