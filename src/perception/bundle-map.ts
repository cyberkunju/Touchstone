/**
 * Bundle → browser-pipeline evidence mapping (P3.5 integration).
 *
 * Pure: an EvidenceBundle page (service shape, Documentation/05 §3) maps to
 * the exact `recognizedNodes` / `decodedCodes` shapes the browser ladder
 * produces, so the brain cannot tell which perception ran (THE invariant).
 *
 * Returns null whenever the bundle cannot stand in for the vision ladder —
 * no pages, a native (rasterless) page, missing lattices. Null routes the
 * caller to the browser path; it is an ANSWER, not an error.
 */

import type { Lattice } from '../beam/lattice';

type Box = [number, number, number, number];

export interface ServiceOcrLine {
  poly: number[][];
  top1: string;
  conf: number;
  rot?: number;
  lattice: [string, number][][];
}

export interface ServiceCode {
  format: string;
  payload: string;
  box: number[];
}

export interface ServicePage {
  index: number;
  geometry?: { wPx: number; hPx: number };
  ocr?: ServiceOcrLine[];
  codes?: ServiceCode[];
  native?: unknown;
}

export interface ServiceBundle {
  bundleVersion: number;
  source?: { kind?: string; pages?: number };
  pages: ServicePage[];
}

export interface MappedEvidence {
  nodes: { text: string; confidence: number; boxNorm: Box; lattice: Lattice }[];
  codes: { text: string; format: string; boxNorm: Box; isValid: boolean }[];
}

function polyToBox(poly: number[][]): Box | null {
  if (!Array.isArray(poly) || poly.length < 3) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of poly) {
    if (!Array.isArray(p) || p.length < 2) return null;
    x1 = Math.min(x1, p[0]); y1 = Math.min(y1, p[1]);
    x2 = Math.max(x2, p[0]); y2 = Math.max(y2, p[1]);
  }
  if (!(x2 > x1) || !(y2 > y1)) return null;
  return [x1, y1, x2, y2];
}

/**
 * Maps page 1 of a service bundle to browser-ladder evidence.
 * (Continuation pages keep their own service story once the service route
 * carries multi-page; the browser continuation pass covers them today.)
 */
export function bundleToEvidence(bundle: ServiceBundle | null | undefined): MappedEvidence | null {
  if (!bundle || bundle.bundleVersion !== 1 || !Array.isArray(bundle.pages)) return null;
  const page = bundle.pages[0];
  if (!page) return null;
  // Native (rasterless) pages have no vision evidence to map — geometry is
  // nominal 1×1 and OCR is empty by construction.
  if (page.native !== undefined || !page.geometry || page.geometry.wPx <= 1) return null;
  if (!Array.isArray(page.ocr)) return null;

  const nodes: MappedEvidence['nodes'] = [];
  for (const line of page.ocr) {
    const boxNorm = polyToBox(line.poly);
    if (!boxNorm) return null; // malformed geometry poisons the page — refuse it whole
    if (!Array.isArray(line.lattice) || line.lattice.length === 0) return null; // lattice is the contract
    nodes.push({
      text: line.top1,
      confidence: line.conf,
      boxNorm,
      lattice: line.lattice as Lattice,
    });
  }
  if (nodes.length === 0) return null; // an empty read teaches nothing — let the browser try

  const codes: MappedEvidence['codes'] = [];
  for (const c of page.codes ?? []) {
    const b = c.box;
    if (!Array.isArray(b) || b.length !== 4) continue;
    codes.push({
      text: c.payload,
      format: c.format,
      boxNorm: [b[0], b[1], b[2], b[3]],
      isValid: true, // zxing payloads are checksum-verified at the source
    });
  }
  return { nodes, codes };
}
