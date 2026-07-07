/**
 * Portrait framing from face geometry (P1.7, Documentation/10 §1).
 *
 * Given a face detection (box + 5 landmarks), computes the standardized
 * ID-portrait crop: eyes leveled (roll from the eye line), 3:4 aspect,
 * eye line at 45% from the top, face box height ≈ 55% of crop height
 * (head-to-chin ≈ 70% including hair/crown margins). Deterministic and
 * explainable — every output value is a trace of the input geometry.
 */

import { Box } from '../core/geometry';
import type { FaceDetection } from '../ai-runtime/yunet';

export interface PortraitFrame {
  /** Crop center in source-normalized coords. */
  centerX: number;
  centerY: number;
  /** Crop size in source-normalized coords (3:4 aspect in PIXEL space). */
  width: number;
  height: number;
  /** Roll to apply (degrees, CCW-positive in canvas terms) to level the eyes. */
  rotationDeg: number;
}

export const PORTRAIT_ASPECT = 3 / 4; // width : height
const EYE_LINE_FROM_TOP = 0.45;
const FACE_TO_CROP_HEIGHT = 0.55;

/**
 * @param face   YuNet detection (landmarks: re, le, nose, rcm, lcm).
 * @param srcW   Source width px (aspect correction — normalized space is
 *               anisotropic, angles/aspect must be computed in pixels).
 * @param srcH   Source height px.
 * @param clampTo Optional region (e.g. detected photo box) the frame must
 *               stay inside — the frame shrinks-to-fit, never crosses it.
 */
export function computePortraitFrame(
  face: FaceDetection,
  srcW: number,
  srcH: number,
  clampTo?: Box
): PortraitFrame {
  const [re, le] = face.landmarks;
  // Roll: angle of the eye line in PIXEL space (subject's right eye is on the
  // image LEFT for a frontal portrait). atan2 of left-eye minus right-eye.
  const dxPx = (le[0] - re[0]) * srcW;
  const dyPx = (le[1] - re[1]) * srcH;
  const rollDeg = (Math.atan2(dyPx, dxPx) * 180) / Math.PI;

  // Eye midpoint anchors the frame.
  const eyeMidX = (re[0] + le[0]) / 2;
  const eyeMidY = (re[1] + le[1]) / 2;

  // Face box height (normalized) → crop height.
  const faceH = face.boxNorm[3] - face.boxNorm[1];
  let cropH = faceH / FACE_TO_CROP_HEIGHT;
  // 3:4 in pixel space → convert width back to normalized.
  let cropW = (cropH * srcH * PORTRAIT_ASPECT) / srcW;

  let centerX = eyeMidX;
  let centerY = eyeMidY + (0.5 - EYE_LINE_FROM_TOP) * cropH;

  if (clampTo) {
    const maxW = clampTo[2] - clampTo[0];
    const maxH = clampTo[3] - clampTo[1];
    if (cropW > maxW || cropH > maxH) {
      const shrink = Math.min(maxW / cropW, maxH / cropH);
      cropW *= shrink;
      cropH *= shrink;
    }
    centerX = Math.min(Math.max(centerX, clampTo[0] + cropW / 2), clampTo[2] - cropW / 2);
    centerY = Math.min(Math.max(centerY, clampTo[1] + cropH / 2), clampTo[3] - cropH / 2);
  }

  // Page-boundary clamp (identical shrink-then-slide policy).
  centerX = Math.min(Math.max(centerX, cropW / 2), 1 - cropW / 2);
  centerY = Math.min(Math.max(centerY, cropH / 2), 1 - cropH / 2);

  return {
    centerX,
    centerY,
    width: cropW,
    height: cropH,
    rotationDeg: -rollDeg, // rotate by the negative roll to LEVEL the eyes
  };
}
