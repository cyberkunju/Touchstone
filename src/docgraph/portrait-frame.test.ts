import { describe, expect, it } from 'vitest';
import { computePortraitFrame, PORTRAIT_ASPECT } from './portrait-frame';
import type { FaceDetection } from '../ai-runtime/yunet';

function face(over: Partial<FaceDetection> = {}): FaceDetection {
  return {
    boxNorm: [0.1, 0.2, 0.3, 0.5], // faceH = 0.3
    landmarks: [
      [0.15, 0.3], // right eye (image left)
      [0.25, 0.3], // left eye
      [0.2, 0.36],
      [0.16, 0.44],
      [0.24, 0.44],
    ],
    score: 0.95,
    ...over,
  };
}

describe('computePortraitFrame', () => {
  it('levels the eyes: zero roll for a level face, correct sign for tilt', () => {
    expect(computePortraitFrame(face(), 1000, 1000).rotationDeg).toBeCloseTo(0, 5);
    // Left eye LOWER than right (face tilted clockwise in image terms):
    const tilted = face({
      landmarks: [
        [0.15, 0.3],
        [0.25, 0.34], // dy = +0.04 over dx = 0.1 → +21.8°
        [0.2, 0.38],
        [0.16, 0.46],
        [0.24, 0.46],
      ],
    });
    const frame = computePortraitFrame(tilted, 1000, 1000);
    expect(frame.rotationDeg).toBeCloseTo(-21.8, 1); // rotate CCW to level
  });

  it('produces a 3:4 crop in pixel space regardless of page aspect', () => {
    const f = computePortraitFrame(face(), 2000, 1000); // wide page
    const pxW = f.width * 2000;
    const pxH = f.height * 1000;
    expect(pxW / pxH).toBeCloseTo(PORTRAIT_ASPECT, 5);
  });

  it('places the eye line at 45% from the crop top', () => {
    const f = computePortraitFrame(face(), 1000, 1000);
    const eyeY = 0.3;
    const cropTop = f.centerY - f.height / 2;
    expect((eyeY - cropTop) / f.height).toBeCloseTo(0.45, 5);
  });

  it('sizes the crop so the face box is ~55% of its height', () => {
    const f = computePortraitFrame(face(), 1000, 1000);
    expect(0.3 / f.height).toBeCloseTo(0.55, 5);
  });

  it('shrinks-to-fit and slides inside a clamp region without crossing it', () => {
    const clamp: [number, number, number, number] = [0.05, 0.15, 0.42, 0.6];
    const f = computePortraitFrame(face(), 1000, 1000, clamp);
    expect(f.centerX - f.width / 2).toBeGreaterThanOrEqual(clamp[0] - 1e-9);
    expect(f.centerX + f.width / 2).toBeLessThanOrEqual(clamp[2] + 1e-9);
    expect(f.centerY - f.height / 2).toBeGreaterThanOrEqual(clamp[1] - 1e-9);
    expect(f.centerY + f.height / 2).toBeLessThanOrEqual(clamp[3] + 1e-9);
  });

  it('never leaves the page for a face near the border', () => {
    const nearEdge = face({
      boxNorm: [0.0, 0.0, 0.18, 0.3],
      landmarks: [
        [0.04, 0.1],
        [0.14, 0.1],
        [0.09, 0.16],
        [0.05, 0.24],
        [0.13, 0.24],
      ],
    });
    const f = computePortraitFrame(nearEdge, 800, 1200);
    expect(f.centerX - f.width / 2).toBeGreaterThanOrEqual(-1e-9);
    expect(f.centerY - f.height / 2).toBeGreaterThanOrEqual(-1e-9);
    expect(f.centerX + f.width / 2).toBeLessThanOrEqual(1 + 1e-9);
    expect(f.centerY + f.height / 2).toBeLessThanOrEqual(1 + 1e-9);
  });
});
