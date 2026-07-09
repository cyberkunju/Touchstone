/**
 * bundle-map laws: the service bundle must map to EXACTLY the browser
 * evidence shapes, and everything unfit for stand-in returns null (an
 * answer that routes to the browser ladder, never an error).
 */
import { describe, expect, it } from 'vitest';

import { bundleToEvidence, type ServiceBundle, type ServiceOcrLine } from './bundle-map';

const line = (over: Partial<ServiceOcrLine> = {}): ServiceOcrLine => ({
  poly: [[0.1, 0.2], [0.5, 0.2], [0.5, 0.25], [0.1, 0.25]],
  top1: 'HELLO',
  conf: 0.97,
  lattice: [[['H', 0.99]], [['E', 0.98]], [['L', 0.97]], [['L', 0.96]], [['O', 0.95]]] as [string, number][][],
  ...over,
});

const bundle = (pageOver: Record<string, unknown> = {}): ServiceBundle => ({
  bundleVersion: 1,
  pages: [
    {
      index: 0,
      geometry: { wPx: 2000, hPx: 1400 },
      ocr: [line()],
      codes: [{ format: 'qrcode', payload: 'PAYLOAD', box: [0.7, 0.7, 0.9, 0.9] }],
      ...pageOver,
    },
  ],
});

describe('bundleToEvidence', () => {
  it('maps ocr lines: poly → boxNorm, top1/conf/lattice verbatim', () => {
    const ev = bundleToEvidence(bundle())!;
    expect(ev.nodes).toHaveLength(1);
    expect(ev.nodes[0]).toMatchObject({
      text: 'HELLO',
      confidence: 0.97,
      boxNorm: [0.1, 0.2, 0.5, 0.25],
    });
    expect(ev.nodes[0].lattice[0][0]).toEqual(['H', 0.99]);
  });

  it('maps codes with isValid: true (zxing payloads are checksummed at source)', () => {
    const ev = bundleToEvidence(bundle())!;
    expect(ev.codes).toEqual([
      { text: 'PAYLOAD', format: 'qrcode', boxNorm: [0.7, 0.7, 0.9, 0.9], isValid: true },
    ]);
  });

  it('refuses (null) on: no bundle, wrong version, no pages', () => {
    expect(bundleToEvidence(null)).toBeNull();
    expect(bundleToEvidence({ bundleVersion: 2, pages: [] } as ServiceBundle)).toBeNull();
    expect(bundleToEvidence({ bundleVersion: 1, pages: [] })).toBeNull();
  });

  it('refuses native/rasterless pages (nominal 1×1 geometry)', () => {
    expect(bundleToEvidence(bundle({ geometry: { wPx: 1, hPx: 1 } }))).toBeNull();
    expect(bundleToEvidence(bundle({ native: { cells: [] } }))).toBeNull();
  });

  it('refuses a page whole when any line is malformed (bad poly / missing lattice)', () => {
    expect(bundleToEvidence(bundle({ ocr: [line({ poly: [[0.5, 0.5]] })] }))).toBeNull();
    expect(bundleToEvidence(bundle({ ocr: [line({ lattice: [] })] }))).toBeNull();
  });

  it('refuses empty reads (browser ladder should try instead)', () => {
    expect(bundleToEvidence(bundle({ ocr: [] }))).toBeNull();
  });
});
