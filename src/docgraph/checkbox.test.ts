/**
 * Checkbox primitive goldens — synthetic cells with known ink states.
 * The never-guess law is the core assertion: X-marks and checkmarks read
 * checked, clean boxes read unchecked, and smudges/faint marks land in the
 * ambiguous band instead of either confident state.
 *
 * DESTINATION: src/docgraph/checkbox.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { CHECKED_MIN, readCheckbox, readCheckboxGroup, UNCHECKED_MAX } from './checkbox';

const W = 400;
const H = 200;

function page(): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = rgba[i + 1] = rgba[i + 2] = 245; // paper
    rgba[i + 3] = 255;
  }
  return rgba;
}

function setPx(rgba: Uint8ClampedArray, x: number, y: number, v: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
}

/** Draw a checkbox outline at (x,y) size s. */
function drawBox(rgba: Uint8ClampedArray, x: number, y: number, s: number): void {
  for (let t = 0; t < 2; t++) {
    for (let i = 0; i <= s; i++) {
      setPx(rgba, x + i, y + t, 20);
      setPx(rgba, x + i, y + s - t, 20);
      setPx(rgba, x + t, y + i, 20);
      setPx(rgba, x + s - t, y + i, 20);
    }
  }
}

/** X-mark through the interior. */
function drawX(rgba: Uint8ClampedArray, x: number, y: number, s: number): void {
  for (let i = 4; i <= s - 4; i++) {
    for (let t = -1; t <= 1; t++) {
      setPx(rgba, x + i, y + i + t, 10);
      setPx(rgba, x + i, y + s - i + t, 10);
    }
  }
}

/** Checkmark (two strokes), kept inside the interior band. */
function drawCheck(rgba: Uint8ClampedArray, x: number, y: number, s: number): void {
  const midX = x + Math.floor(s * 0.4);
  const midY = y + s - Math.floor(s * 0.3);
  for (let i = 0; i < Math.floor(s * 0.25); i++) {
    for (let t = -1; t <= 1; t++) setPx(rgba, x + 8 + i, y + Math.floor(s * 0.5) + i + t, 10);
  }
  for (let i = 0; i < Math.floor(s * 0.45); i++) {
    for (let t = -1; t <= 1; t++) setPx(rgba, midX + i, midY - i + t, 10);
  }
}

/** A faint smudge: a few scattered dark-ish pixels. */
function drawSmudge(rgba: Uint8ClampedArray, x: number, y: number, s: number): void {
  let seed = 42;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  const interior = Math.floor(s * 0.6);
  const px = Math.floor(interior * interior * 0.09); // ~9% of interior
  for (let k = 0; k < px; k++) {
    setPx(rgba, x + 6 + Math.floor(rand() * interior), y + 6 + Math.floor(rand() * interior), 90);
  }
}

const S = 40;

describe('checkbox states — truth by construction', () => {
  it('clean outlined box reads unchecked', () => {
    const rgba = page();
    drawBox(rgba, 30, 30, S);
    const read = readCheckbox(rgba, W, { x: 30, y: 30, w: S, h: S });
    expect(read.state).toBe('unchecked');
    expect(read.fillRatio).toBeLessThanOrEqual(UNCHECKED_MAX);
  });

  it('X-mark reads checked', () => {
    const rgba = page();
    drawBox(rgba, 30, 30, S);
    drawX(rgba, 30, 30, S);
    const read = readCheckbox(rgba, W, { x: 30, y: 30, w: S, h: S });
    expect(read.state).toBe('checked');
    expect(read.fillRatio).toBeGreaterThanOrEqual(CHECKED_MIN);
  });

  it('checkmark reads checked', () => {
    const rgba = page();
    drawBox(rgba, 100, 30, S);
    drawCheck(rgba, 100, 30, S);
    expect(readCheckbox(rgba, W, { x: 100, y: 30, w: S, h: S }).state).toBe('checked');
  });

  it('solid-filled box reads checked', () => {
    const rgba = page();
    for (let y = 30; y < 30 + S; y++) {
      for (let x = 170; x < 170 + S; x++) setPx(rgba, x, y, 15);
    }
    expect(readCheckbox(rgba, W, { x: 170, y: 30, w: S, h: S }).state).toBe('checked');
  });

  it('THE law: a faint smudge is ambiguous — never a confident state', () => {
    const rgba = page();
    drawBox(rgba, 240, 30, S);
    drawSmudge(rgba, 240, 30, S);
    const read = readCheckbox(rgba, W, { x: 240, y: 30, w: S, h: S });
    expect(read.state).toBe('ambiguous');
  });

  it('the printed outline itself never counts as ink (border band)', () => {
    const rgba = page();
    drawBox(rgba, 30, 100, S);
    // Thicken the outline heavily — still unchecked.
    for (let t = 2; t < 5; t++) {
      for (let i = 0; i <= S; i++) {
        setPx(rgba, 30 + i, 100 + t, 20);
        setPx(rgba, 30 + i, 100 + S - t, 20);
        setPx(rgba, 30 + t, 100 + i, 20);
        setPx(rgba, 30 + S - t, 100 + i, 20);
      }
    }
    expect(readCheckbox(rgba, W, { x: 30, y: 100, w: S, h: S }).state).toBe('unchecked');
  });

  it('sub-analyzable ROI is ambiguous, never guessed', () => {
    const rgba = page();
    expect(readCheckbox(rgba, W, { x: 10, y: 10, w: 3, h: 3 }).state).toBe('ambiguous');
  });

  it('group reads preserve order and mixed states', () => {
    const rgba = page();
    drawBox(rgba, 30, 30, S);
    drawBox(rgba, 100, 30, S);
    drawX(rgba, 100, 30, S);
    drawBox(rgba, 170, 30, S);
    const group = readCheckboxGroup(rgba, W, [
      { x: 30, y: 30, w: S, h: S },
      { x: 100, y: 30, w: S, h: S },
      { x: 170, y: 30, w: S, h: S },
    ]);
    expect(group.map((g) => g.state)).toEqual(['unchecked', 'checked', 'unchecked']);
  });

  it('darkened paper (bad photocopy) does not flip clean boxes', () => {
    const rgba = page();
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = rgba[i + 1] = rgba[i + 2] = 190; // grey paper
    }
    drawBox(rgba, 30, 30, S);
    expect(readCheckbox(rgba, W, { x: 30, y: 30, w: S, h: S }).state).toBe('unchecked');
  });
});
