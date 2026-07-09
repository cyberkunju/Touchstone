import React, { useState, useEffect } from 'react';
import { getParserWorker, getInferenceWorker } from './workers/manager';
import { DocGraphBuilder } from './docgraph/builder';
import { VerifierService } from './verifier/verifier';
import { TemplateEngine } from './template-engine/template';
import { saveDocGraph, saveTemplate, getAllTemplates, deleteTemplate } from './storage/db';
import { DocGraph, FieldHypothesis, FieldValueType, ValidationResult, TemplateGraph, GraphNode } from './core/types';
import { Box } from './core/geometry';
import { ensureFileCached, isFileCached, loadCharDictionary } from './ai-runtime/model-loader';
import { CORE_OCR_MODELS, FACE_MODEL, OCR_DET_MODEL, OCR_REC_MODEL, PPOCR_DICT } from './ai-runtime/model-registry';
import { parseMrz } from './parsers/mrz';
import { parseAamva } from './parsers/aamva';
import { decodeMrzFromLattices } from './beam/mrz-beam';
import { MRZ_ANY } from './beam/beam-search';
import type { Lattice } from './beam/lattice';
import { extractSignatureInk, rgbaToGray } from './docgraph/signature-ink';
import {
  normalizeFieldValue,
  boxOverlapFraction,
} from './docgraph/hypotheses';
import { OcrItem } from './docgraph/ocr-item';
import { detectMrzZone, mrzLineScore, isMrzLine } from './docgraph/mrz-zone';
import { computePortraitFrame } from './docgraph/portrait-frame';
import { classifyDocument } from './docgraph/document-classify';
import { extractFields } from './docgraph/field-extraction';
import { mrzToFields } from './docgraph/mrz-fields';
import { extractGenericFields } from './docgraph/generic-extraction';
import { detectPhotoRegion } from './docgraph/photo-detection';

import UploadManager from './components/UploadManager';
import DocumentViewer from './components/DocumentViewer';
import FormEditor from './components/FormEditor';
import EvidenceInspector from './components/EvidenceInspector';
import ModelLoaderOverlay, { ModelProgress } from './components/ModelLoaderOverlay';

import { FileText, Save, RefreshCw, Layers, Sparkles, CheckSquare, Trash2 } from 'lucide-react';

/** The MRZ legal alphabet as a flat string — crosses the Comlink boundary to
 *  request posterior projection in the worker (see extractProjectedLattice).
 *  Derived from the beam module's own charset so the two can never drift. */
const MRZ_PROJECT_ALPHABET = [...MRZ_ANY].join('');

/** I1 name policing: does the proven MRZ witness vouch for a VIZ name read?
 *
 *  Agreement is exact after normalization (uppercase, collapse whitespace,
 *  hyphens/apostrophes dropped — MRZ cannot encode them). `full_name`
 *  accepts either ordering of surname/given. A field the witness carries no
 *  value for is NOT vouched (unknown ≠ agreed — N1).
 *
 *  note: ICAO truncation of very long names (>39 chars) would fail equality
 *  and cost a review, never a silent — acceptable until the corpus shows it.
 */
function mrzWitnessAgrees(
  field: { canonicalLabel: string; valueType: string },
  value: string,
  witness: { surname?: string; givenNames?: string } | null,
): boolean {
  if (field.valueType !== 'name' || witness === null) return false;
  const norm = (s: string) => s.toUpperCase().replace(/['’-]/g, ' ').replace(/\s+/g, ' ').trim();
  const v = norm(value);
  const sur = witness.surname !== undefined ? norm(witness.surname) : undefined;
  const giv = witness.givenNames !== undefined ? norm(witness.givenNames) : undefined;

  switch (field.canonicalLabel) {
    case 'surname':
      return sur !== undefined && v === sur;
    case 'given_names':
    case 'given_name':
      return giv !== undefined && v === giv;
    case 'full_name':
      return (
        sur !== undefined && giv !== undefined &&
        (v === `${giv} ${sur}` || v === `${sur} ${giv}`)
      );
    default:
      return false;
  }
}

export default function App() {
  // App States
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('');
  const [templates, setTemplates] = useState<TemplateGraph[]>([]);
  
  // Model loading states
  const [downloadProgress, setDownloadProgress] = useState<Record<string, ModelProgress>>({});
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  
  // Active DocGraph States
  const [activeGraph, setActiveGraph] = useState<DocGraph | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  
  // Active document metadata
  const [docName, setDocName] = useState<string>('');
  const [qualityScore, setQualityScore] = useState<number>(100);

  // Load saved templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const list = await getAllTemplates();
      setTemplates(list);
    } catch (e) {
      console.error('Failed to load templates from IndexedDB:', e);
    }
  };

  /**
   * Processes a document image through the engine pipelines.
   */
  const handleDocumentUpload = async (file: File) => {
    setIsProcessing(true);
    setDocName(file.name);
    setSelectedFieldId(null);
    setActiveGraph(null);
    
    try {
      // 1. Create ImageBitmap from raw file
      setStatusText('Decoding document image...');
      let bitmap = await createImageBitmap(file);

      // Create Object URL for canvas background rendering
      const objectUrl = URL.createObjectURL(file);
      setImageSrc(objectUrl);

      // 2. Preprocess page in parser worker (blur, glare, canonical resize)
      setStatusText('Normalizing page & analyzing image quality...');
      const parserWorker = getParserWorker();
      const prepResult = await parserWorker.preprocessPage(bitmap, 0);

      // 2.1 Deskew (P1.8a): rotate the WORKING bitmap so the whole pipeline
      // (detection, recognition, MRZ band, template anchors) sees level text.
      // The viewer image is regenerated too — overlays must match what was
      // actually processed. Estimation is conservative (0 when unsure), so a
      // straight page never rotates.
      if (Math.abs(prepResult.skewDeg) >= 1.5) {
        const rad = (-prepResult.skewDeg * Math.PI) / 180;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        const rw = Math.round(bitmap.width * cos + bitmap.height * sin);
        const rh = Math.round(bitmap.width * sin + bitmap.height * cos);
        const rc = new OffscreenCanvas(rw, rh);
        const rctx = rc.getContext('2d');
        if (rctx) {
          rctx.fillStyle = '#ffffff';
          rctx.fillRect(0, 0, rw, rh);
          rctx.translate(rw / 2, rh / 2);
          rctx.rotate(rad);
          rctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
          bitmap.close();
          bitmap = rc.transferToImageBitmap();
          const viewCanvas = new OffscreenCanvas(rw, rh);
          viewCanvas.getContext('2d')!.drawImage(bitmap, 0, 0);
          const blob = await viewCanvas.convertToBlob({ type: 'image/png' });
          setImageSrc(URL.createObjectURL(blob));
          console.log(`[DIAG] deskew applied: ${prepResult.skewDeg}°`);
        }
      }
      
      // Compute score
      const qualityScore = Math.round(
        (prepResult.quality.blur.score +
          prepResult.quality.glare.score +
          prepResult.quality.contrast.score +
          prepResult.quality.resolution.score) *
          25
      );
      setQualityScore(qualityScore);

      // 2.5 Caching, downloading & loading the real PP-OCRv5 models + dictionary.
      const inferenceWorker = getInferenceWorker();

      // Determine whether anything still needs to be fetched or loaded.
      let needsSetup = false;
      for (const m of CORE_OCR_MODELS) {
        const cached = await isFileCached(m.fileName);
        const loaded = await inferenceWorker.isModelLoaded(m.key);
        if (!cached || !loaded) needsSetup = true;
      }
      if (!(await isFileCached(PPOCR_DICT.fileName))) needsSetup = true;

      if (needsSetup) {
        setIsDownloading(true);
        setStatusText('Downloading local PP-OCRv5 models (one-time setup)...');
      }
      try {
        // ONNX models.
        for (const m of CORE_OCR_MODELS) {
          if (await inferenceWorker.isModelLoaded(m.key)) continue;
          const buffer = await ensureFileCached(m.fileName, m.url, (p) => {
            setDownloadProgress((prev) => ({ ...prev, [m.key]: p }));
          });
          setStatusText(`Loading ${m.key} into worker session...`);
          await inferenceWorker.loadModel(m.key, buffer, m.executionProvider);
        }
        // Character dictionary → recognition vocabulary.
        setStatusText('Loading PP-OCRv5 character dictionary...');
        const vocab = await loadCharDictionary(PPOCR_DICT, (p) => {
          setDownloadProgress((prev) => ({ ...prev, [PPOCR_DICT.key]: p }));
        });
        await inferenceWorker.setRecognitionVocab(vocab);
        // YuNet face detector (P1.7): tiny (0.2 MB) and OPTIONAL — a fetch/
        // load failure only disables portrait framing, never the pipeline.
        try {
          if (!(await inferenceWorker.isModelLoaded(FACE_MODEL.key))) {
            const fb = await ensureFileCached(FACE_MODEL.fileName, FACE_MODEL.url, () => {});
            await inferenceWorker.loadModel(FACE_MODEL.key, fb, FACE_MODEL.executionProvider, {
              inputSize: FACE_MODEL.inputSize,
            });
          }
        } catch (faceErr) {
          console.warn('[App] YuNet unavailable — portrait framing disabled:', faceErr);
        }
      } finally {
        if (needsSetup) setIsDownloading(false);
      }

      // Run real PP-OCRv5 DBNet text detection on the page.
      setStatusText('Running local PP-OCRv5 text detector (DBNet)...');
      const detBoxes = await inferenceWorker.detectText(OCR_DET_MODEL.key, bitmap);
      console.log(`[App] DBNet found ${detBoxes.length} text lines.`);

      // Run real PP-OCRv5 recognition on each detected line crop.
      setStatusText(`Recognizing characters on ${detBoxes.length} text lines (PP-OCRv5)...`);
      const recognizedNodes: { text: string; confidence: number; boxNorm: Box; lattice: Lattice }[] = [];

      for (let i = 0; i < detBoxes.length; i++) {
        const box = detBoxes[i];
        const [bx1, by1, bx2, by2] = box;

        const w = bitmap.width;
        const h = bitmap.height;
        const origX1 = Math.round(bx1 * w);
        const origY1 = Math.round(by1 * h);
        const origW = Math.round((bx2 - bx1) * w);
        const origH = Math.round((by2 - by1) * h);

        // Add padding proportional to the text box height
        const px = Math.round(origH * 0.25); // 25% horizontal padding on each side
        const py = Math.round(origH * 0.08); // 8% vertical padding on each side

        const x1 = Math.max(0, origX1 - px);
        const y1 = Math.max(0, origY1 - py);
        const x2 = Math.min(w, origX1 + origW + px);
        const y2 = Math.min(h, origY1 + origH + py);

        const cropW = x2 - x1;
        const cropH = y2 - y1;

        if (cropW <= 0 || cropH <= 0) continue;

        const cropCanvas = new OffscreenCanvas(cropW, cropH);
        const cropCtx = cropCanvas.getContext('2d')!;
        cropCtx.drawImage(bitmap, x1, y1, cropW, cropH, 0, 0, cropW, cropH);

        const cropBitmap = await createImageBitmap(cropCanvas);
        try {
          const recResult = await inferenceWorker.recognizeText(OCR_REC_MODEL.key, cropBitmap);

          if (recResult.text.trim()) {
            recognizedNodes.push({
              text: recResult.text,
              confidence: recResult.confidence,
              boxNorm: box,
              lattice: recResult.lattice,
            });
          }
        } catch (recErr) {
          console.error(`Failed to recognize text line ${i}:`, recErr);
        }
      }

      console.log('[App] PP-OCRv5 recognized texts:', recognizedNodes.map(n => `${n.text} (${(n.confidence * 100).toFixed(0)}%)`).join(' | '));

      // Decode any 1D/2D codes (QR, PDF417, DataMatrix, barcodes) locally.
      setStatusText('Decoding barcodes & QR codes (zxing)...');
      let decodedCodes: { text: string; format: string; boxNorm: Box; isValid: boolean }[] = [];
      try {
        decodedCodes = await parserWorker.decodeCodes(bitmap);
        console.log(`[App] Decoded ${decodedCodes.length} valid code(s).`);
      } catch (codeErr) {
        console.error('[App] Code decoding failed:', codeErr);
      }

      // 3. Initialize DocGraphBuilder
      setStatusText('Constructing property DocGraph...');
      const builder = new DocGraphBuilder(
        `doc-${Math.random().toString(36).substring(2, 11)}`,
        file.name,
        'image'
      );
      
      const pageId = builder.addPage(0, bitmap.width, bitmap.height, prepResult.normalizedBitmap.width.toString());
      builder.setPageNormalized(
        pageId,
        bitmap.width,
        bitmap.height,
        prepResult.width,
        prepResult.height,
        'page-normalized-image'
      );

      // Update metadata execution provider — the ACTUAL one the recognizer
      // landed on, not the requested one (a WebGPU request can fall back).
      const actualEp = (await inferenceWorker.getEp(OCR_REC_MODEL.key)) ?? 'wasm';
      builder.updateMetadata({
        runtime: {
          appVersion: '1.0.0',
          executionProvider: actualEp
        }
      });

      // Build actual OCR nodes into graph
      const graphNodes: GraphNode[] = [];
      const nodeMap = new Map<string, string>(); // maps box coordinate string to node ID
      const nodeIdToLattice = new Map<string, Lattice>(); // beam-decoder fallback source
      // Hypotheses that must never auto-confirm (N1): hypId → reason, plus
      // display labels capped document-wide (checksum-invisible ambiguities
      // taint EVERY source of that field — two OCR reads of the same
      // destroyed glyph are correlated, not independent evidence).
      const hypReviewCaps = new Map<string, string>();
      const labelReviewCaps = new Map<string, string>();

      recognizedNodes.forEach((rn, idx) => {
        const nodeId = builder.addNode('text_line', pageId, rn.boxNorm, rn.text, rn.confidence);
        nodeMap.set(rn.boxNorm.join(','), nodeId);
        nodeIdToLattice.set(nodeId, rn.lattice);
        graphNodes.push({
          id: nodeId,
          type: 'text_line',
          pageId,
          boxNorm: rn.boxNorm,
          value: rn.text,
          confidence: rn.confidence,
          evidenceIds: [],
          createdAt: Date.now()
        });
      });

      // Construct a SEPARATE temporary graph (shallow clone) for layout matching
      // so the structural fingerprint hypotheses below never pollute the real
      // builder graph that becomes the form.
      const tempGraphForMatch: DocGraph = {
        ...builder.build(),
        nodes: graphNodes,
        hypotheses: [] as FieldHypothesis[],
      };

      // Build normalized OCR items, detect the MRZ zone, and classify the doc.
      const ocrItems: OcrItem[] = recognizedNodes.map((rn, idx) => ({
        text: rn.text,
        boxNorm: rn.boxNorm,
        nodeId: nodeMap.get(rn.boxNorm.join(',')) || `node-${idx}`,
        confidence: rn.confidence,
        lattice: rn.lattice,
      }));
      let mrzZone = detectMrzZone(ocrItems);
      console.log(`[DIAG] ocrItems=${ocrItems.length} mrzZoneDetected=${!!mrzZone}`);
      // Per-line lattices for the checksum-guided beam decoder (I2). Hi-res
      // re-OCR replaces these with sharper ones when it succeeds.
      let mrzLineLattices: Lattice[] | null = mrzZone
        ? (mrzZone.itemIds
            .map((id) => nodeIdToLattice.get(id))
            .filter((l): l is Lattice => !!l))
        : null;
      // The bottom-band fallback already reads at high resolution — re-running
      // the hi-res pass over it would be wasted inference.
      let mrzFromBandFallback = false;

      // Bottom-band fallback (foveation-lite): MRZ zone detection above relies
      // on the downscaled FULL-PAGE OCR reading MRZ-ish lines — on small or
      // tightly-set MRZs DBNet merges/butchers them and the zone is missed
      // entirely. Passports carry the MRZ in the bottom band by construction,
      // so when no zone was found probe that band at high resolution before
      // giving up. A failed probe changes nothing (evidence-only).
      if (!mrzZone) {
        try {
          const bandTop = 0.74;
          const sw = bitmap.width;
          const sh = Math.round(bitmap.height * (1 - bandTop));
          const sy = Math.round(bitmap.height * bandTop);
          const targetW = Math.min(2200, Math.max(sw, 1600));
          const scale = targetW / sw;
          const bc = new OffscreenCanvas(Math.round(sw * scale), Math.round(sh * scale));
          const bctx = bc.getContext('2d');
          if (bctx) {
            bctx.imageSmoothingQuality = 'high';
            bctx.drawImage(bitmap, 0, sy, sw, sh, 0, 0, bc.width, bc.height);
            const bandBitmap = await createImageBitmap(bc);
            const probe = await inferenceWorker.ocrRegionLines(
              OCR_DET_MODEL.key, OCR_REC_MODEL.key, bandBitmap,
              { projectAlphabet: MRZ_PROJECT_ALPHABET, unifyLineWidths: true },
            );
            bandBitmap.close();
            const mrzish = probe
              .map((l) => ({ ...l, clean: (l.projectedText ?? l.text).toUpperCase().replace(/\s+/g, '') }))
              .filter((l) => isMrzLine(l.clean))
              // One physical line can detect as two stacked components under
              // blur (each rectifies to the full text). Identical MRZ lines
              // are impossible on a real document — dedupe is provably safe.
              .filter((l, i, a) => a.findIndex((x) => x.clean === l.clean) === i);
            console.log(
              `[DIAG] MRZ band probe: ${probe.length} lines, ${mrzish.length} MRZ-ish → ${JSON.stringify(probe.map((l) => ({ t: l.text.slice(0, 48), c: +l.confidence.toFixed(2), y: +l.boxNorm[1].toFixed(2), h: +(l.boxNorm[3] - l.boxNorm[1]).toFixed(2) })))}`,
            );
            if (mrzish.length >= 2) {
              mrzZone = {
                lines: mrzish.map((l) => l.clean),
                itemIds: [],
                boxNorm: [0.02, bandTop, 0.98, 1.0],
              };
              mrzLineLattices = mrzish.map((l) => l.projectedLattice ?? l.lattice);
              mrzFromBandFallback = true;
              console.log(`[DIAG] MRZ bottom-band fallback found ${mrzish.length} lines`);
            }
          }
        } catch (e) {
          console.warn('[DIAG] MRZ bottom-band fallback failed:', e);
        }
      }

      // High-resolution MRZ re-OCR. The full-page pass downscales to <=960px,
      // so the small MRZ band at the bottom reads poorly. Re-read it directly
      // from the ORIGINAL image at high resolution for accurate doc number /
      // name / dates, then the check-digit-validated parse can trust it.
      if (mrzZone && !mrzFromBandFallback) {
        try {
          const [bx1, by1, bx2, by2] = mrzZone.boxNorm;
          const padX = (bx2 - bx1) * 0.02;
          // Generous vertical margin: on small originals the detected zone is
          // often ONE of the MRZ lines — a tight crop then cuts its sibling
          // off and a 1-line re-read replaces a 2-line zone (live-caught).
          // MRZ lines are adjacent and equal-height, so 1.6× the zone height
          // above and below always covers the full block.
          const padY = Math.max((by2 - by1) * 1.6, 0.02);
          const rx1 = Math.max(0, bx1 - padX);
          const ry1 = Math.max(0, by1 - padY);
          const rx2 = Math.min(1, bx2 + padX);
          const ry2 = Math.min(1, by2 + padY);
          const sx = Math.round(rx1 * bitmap.width);
          const sy = Math.round(ry1 * bitmap.height);
          const sw = Math.round((rx2 - rx1) * bitmap.width);
          const sh = Math.round((ry2 - ry1) * bitmap.height);
          if (sw > 0 && sh > 0) {
            const targetW = Math.min(2000, Math.max(sw, 1600));
            const scale = targetW / sw;
            const cw = Math.round(sw * scale);
            const ch = Math.round(sh * scale);
            const bandCanvas = new OffscreenCanvas(cw, ch);
            const bctx = bandCanvas.getContext('2d');
            if (bctx) {
              bctx.imageSmoothingQuality = 'high';
              bctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, cw, ch);
              const bandBitmap = await createImageBitmap(bandCanvas);
              console.log(`[DIAG] MRZ band ${cw}x${ch}, calling ocrRegionLines...`);
              // Best-effort, time-boxed: hi-res re-OCR must never stall the
              // whole pipeline. If it is slow/unavailable we keep the
              // full-page MRZ lines.
              const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 25000));
              const lines = await Promise.race([
                inferenceWorker.ocrRegionLines(
                  OCR_DET_MODEL.key, OCR_REC_MODEL.key, bandBitmap,
                  { projectAlphabet: MRZ_PROJECT_ALPHABET, unifyLineWidths: true },
                ),
                timeout,
              ]);
              bandBitmap.close();
              if (lines) {
                console.log(`[DIAG] ocrRegionLines returned ${lines.length} lines`);
                // The widened crop can catch VIZ text above the MRZ — keep
                // only MRZ-shaped lines. Never DOWNGRADE the zone: replacing
                // 2 detected lines with a 1-line re-read starves the beam.
                const hiRes = lines
                  .map((l) => ({
                    text: (l.projectedText ?? l.text).toUpperCase().replace(/\s+/g, ''),
                    lattice: l.projectedLattice ?? l.lattice,
                  }))
                  .filter((l) => l.text.length >= 10 && isMrzLine(l.text))
                  // Blur can split one physical line into two stacked quads
                  // that BOTH read the full text (live-caught: duplicated
                  // line 1 made a 2-line TD3 look like 3-line TD1 → refusal).
                  // Two identical MRZ lines cannot exist on a real document.
                  .filter((l, i, a) => a.findIndex((x) => x.text === l.text) === i);
                console.log(`[DIAG] MRZ hi-res lines: ${JSON.stringify(hiRes.map((l) => l.text))}`);
                if (hiRes.length >= Math.min(2, mrzZone.lines.length)) {
                  mrzZone = { ...mrzZone, lines: hiRes.map((l) => l.text) };
                  mrzLineLattices = hiRes.map((l) => l.lattice);
                }
              } else {
                console.warn('[DIAG] MRZ hi-res re-OCR timed out; keeping full-page lines.');
              }
            }
          }
        } catch (e) {
          console.error('[App] MRZ hi-res re-OCR failed:', e);
        }
      }
      const bottomItems = ocrItems.filter((it) => (it.boxNorm[1] + it.boxNorm[3]) / 2 > 0.62);
      console.log(
        '[DIAG] bottom-region items:',
        bottomItems
          .map((it) => `"${it.text}" mrz=${mrzLineScore(it.text).toFixed(2)} isMrz=${isMrzLine(it.text)}`)
          .join(' || '),
      );
      const classification = classifyDocument({
        texts: ocrItems.map((i) => i.text),
        hasMrz: !!mrzZone,
        hasBarcode: decodedCodes.length > 0,
      });
      const docType = classification.type;
      const isIdentityDoc = docType === 'passport' || docType === 'id_card';
      const isCommerceDoc = docType === 'invoice' || docType === 'receipt';
      console.log(`[DIAG] mrzZone=${mrzZone ? 'YES' : 'NO'} docType=${docType} ocrItems=${ocrItems.length}`);
      console.log(
        `[App] Classified as ${docType} (${(classification.confidence * 100).toFixed(0)}%):`,
        classification.reasons.join(' '),
      );

      // Seed temp graph with structural fingerprint hypotheses for layout
      // matching. These carry NO values — they only record which special zones
      // (MRZ, table) are present so the template matcher can score layout.
      if (isIdentityDoc) {
        tempGraphForMatch.hypotheses = [
          {
            id: 'fingerprint-mrz',
            documentId: tempGraphForMatch.documentId,
            label: 'MRZ Zone',
            value: null,
            valueType: 'mrz',
            boxNorm: [0.05, 0.8, 0.95, 0.98],
            pageId: pageId,
            status: 'needs_review',
            confidence: { overall: 0, components: {}, penalties: [], reasons: [] },
            validationIds: [],
            assetNodeIds: [],
            valueNodeIds: [],
            labelNodeIds: [],
            tableNodeIds: [],
            evidenceIds: [],
            reasons: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ];
      } else if (isCommerceDoc) {
        tempGraphForMatch.hypotheses = [
          {
            id: 'fingerprint-table',
            documentId: tempGraphForMatch.documentId,
            label: 'Table Zone',
            value: null,
            valueType: 'table',
            boxNorm: [0.05, 0.4, 0.95, 0.85],
            pageId: pageId,
            status: 'needs_review',
            confidence: { overall: 0, components: {}, penalties: [], reasons: [] },
            validationIds: [],
            assetNodeIds: [],
            valueNodeIds: [],
            labelNodeIds: [],
            tableNodeIds: [],
            evidenceIds: [],
            reasons: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
        ];
      }

      // 4. Run Template Matching Pre-check
      setStatusText('Matching layouts against template fingerprint registry...');
      const allSavedTemplates = await getAllTemplates();
      const templateMatch = TemplateEngine.matchTemplate(tempGraphForMatch, allSavedTemplates);

      if (templateMatch) {
        setStatusText(`Template matched: '${templateMatch.template.name}'! Projecting ROIs...`);
        const tpl = templateMatch.template;
        const refillStart = performance.now();

        // Find anchors on the current page to run alignment homography
        const pageNodes = recognizedNodes.map(rn => ({
          type: 'text_line',
          value: rn.text,
          boxNorm: rn.boxNorm
        }));

        // JIT-lite (I8): alignment estimated ONCE through the frozen ladder
        // (homography → affine → similarity), then every ROI projects through
        // the same transform. A failed alignment falls back to template boxes
        // and is recorded — the template_consistency attestation thresholds
        // on the ladder rung.
        const alignment = TemplateEngine.computeAlignment(pageNodes, tpl);

        tpl.fields.forEach(field => {
          // Project bounding box using actual aligned anchors
          const projectedBox = TemplateEngine.alignAndProject(pageNodes, tpl, field, alignment);
          
          // Match text lines within projected box
          const overlappingLines = recognizedNodes.filter(rn => {
            const overlap = boxOverlapFraction(projectedBox, rn.boxNorm);
            return overlap > 0.4;
          });

          let extractedValue: unknown = '';
          if (overlappingLines.length > 0) {
            overlappingLines.sort((a, b) => a.boxNorm[1] - b.boxNorm[1] || a.boxNorm[0] - b.boxNorm[0]);
            extractedValue = overlappingLines.map(l => l.text).join(' ');
          }

          if (field.valueType === 'mrz') {
            const mrzTextCombined = overlappingLines.map(l => l.text).join('\n');
            extractedValue = parseMrz(mrzTextCombined);
          }

          // Honest normalization only — never substitute a "known" answer.
          const cleanedValue =
            typeof extractedValue === 'string'
              ? normalizeFieldValue(field.valueType, extractedValue).value
              : extractedValue;
          const hypId = builder.addHypothesis(field.label, cleanedValue, field.valueType, projectedBox, pageId);
          
          // Link nodes to hypothesis
          overlappingLines.forEach(l => {
            const realNodeId = nodeMap.get(l.boxNorm.join(','));
            if (realNodeId) {
              builder.linkHypothesisNodes(hypId, { valueNodeId: realNodeId });
            }
          });
        });
        
        builder.setTemplateContext({
          templateId: tpl.id,
          familyId: tpl.familyId,
          version: tpl.version,
          matchScore: templateMatch.score,
          decision: 'same_template',
          projectedRoiIds: [],
          alignmentTransformIds: []
        });
        console.log(
          `[DIAG] template refill: ${tpl.fields.length} fields via ${alignment.kind} in ${(performance.now() - refillStart).toFixed(0)}ms`,
        );

      } else {
        setStatusText(`Extracting ${docType} fields...`);

        // Track which OCR nodes and which canonical fields are already claimed,
        // so each layer adds only NEW information and nothing is double-counted.
        const usedNodeIds = new Set<string>();
        const addedCanonical = new Set<string>();
        // MRZ-derived fields that lack proof — added AFTER visual extraction
        // so an unproven MRZ read never blocks a clean visual one.
        const mrzGapFill: ReturnType<typeof mrzToFields> = [];
        // True ONLY when the checksum-guided beam decoded a fully valid MRZ
        // — the sole event that licenses identity-name auto-confirmation.
        let mrzProven = false;
        // The proven MRZ's name fields — the I1 witness that POLICES visual
        // name reads. "The MRZ polices names" was an assumption until a
        // knife-edge blur read confirmed "L" for "LI" beside a proven MRZ
        // that knew better (live-caught, cloud run): policing must compare.
        let mrzNameWitness: { surname?: string; givenNames?: string } | null = null;

        // 1. MRZ decode. Order (I2): checksum-guided BEAM SEARCH over the raw
        //    CTC lattices first — check digits drive the read, so ambiguous
        //    glyphs (0/O, 8/B…) resolve to the only provable string. The
        //    legacy parse-then-autocorrect path remains as fallback, BUT
        //    (live-caught silent errors): only the beam constitutes PROOF.
        //    Legacy 'valid' can be minted — a U→0 misread passes every check
        //    digit (mod-10 blind spot), and autoCorrect mutates lines until
        //    checks pass. Legacy-sourced fields are therefore review-capped.
        if (mrzZone) {
          let parsedMRZ = null as ReturnType<typeof parseMrz> | null;
          let beamResult =
            mrzLineLattices && mrzLineLattices.length >= 2
              ? decodeMrzFromLattices(mrzLineLattices, {
                  trace: (m) => console.log(`[DIAG] mrz-beam: ${m}`),
                })
              : null;

          // FOVEATED RETRY: a beam refusal on a detected zone usually means
          // CTC glyph merges — blur collapsed adjacent chars into shared
          // activations and the truth left the lattice entirely. More pixels
          // per glyph re-separates them: re-read the band at ~2× magnification
          // (once; time-boxed; evidence-only — a failed retry changes nothing).
          if (!beamResult && mrzLineLattices && mrzLineLattices.length >= 2) {
            try {
              const [bx1, by1, bx2, by2] = mrzZone.boxNorm;
              const padY = Math.max((by2 - by1) * 1.6, 0.02);
              const sx = Math.round(Math.max(0, bx1 - 0.02) * bitmap.width);
              const sy = Math.round(Math.max(0, by1 - padY) * bitmap.height);
              const sw = Math.round((Math.min(1, bx2 + 0.02) - Math.max(0, bx1 - 0.02)) * bitmap.width);
              const sh = Math.round((Math.min(1, by2 + padY) - Math.max(0, by1 - padY)) * bitmap.height);
              if (sw > 0 && sh > 0) {
                const scale = Math.min(3600, Math.max(sw * 2, 3000)) / sw;
                const fc = new OffscreenCanvas(Math.round(sw * scale), Math.round(sh * scale));
                const fctx = fc.getContext('2d');
                if (fctx) {
                  // Nearest-neighbor upscale: smooth interpolation preserves
                  // the very blur we are fighting; hard pixel edges give the
                  // recognizer's convolutions gradient energy to separate
                  // merged glyphs (the per-crop unsharp mask then bites).
                  fctx.imageSmoothingEnabled = false;
                  fctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, fc.width, fc.height);
                  const fbm = await createImageBitmap(fc);
                  const timeout = new Promise<null>((res) => setTimeout(() => res(null), 25000));
                  const lines = await Promise.race([
                    inferenceWorker.ocrRegionLines(
                      OCR_DET_MODEL.key, OCR_REC_MODEL.key, fbm,
                      { projectAlphabet: MRZ_PROJECT_ALPHABET, unifyLineWidths: true },
                    ),
                    timeout,
                  ]);
                  fbm.close();
                  if (lines) {
                    const fov = lines
                      .map((l) => ({
                        text: (l.projectedText ?? l.text).toUpperCase().replace(/\s+/g, ''),
                        lattice: l.projectedLattice ?? l.lattice,
                      }))
                      .filter((l) => l.text.length >= 10 && isMrzLine(l.text))
                      .filter((l, i, a) => a.findIndex((x) => x.text === l.text) === i);
                    if (fov.length >= 2) {
                      beamResult = decodeMrzFromLattices(fov.map((l) => l.lattice), {
                        trace: (m) => console.log(`[DIAG] mrz-beam(fov): ${m}`),
                      });
                      if (beamResult) {
                        mrzZone = { ...mrzZone, lines: fov.map((l) => l.text) };
                        console.log(`[DIAG] foveated retry SUCCEEDED at ${fc.width}px band width`);
                      }
                    }
                  }
                }
              }
            } catch (fovErr) {
              console.warn('[DIAG] foveated retry failed:', fovErr);
            }
          }
          if (beamResult) {
            parsedMRZ = beamResult.parse;
            console.log(
              `[DIAG] MRZ beam decode: ${beamResult.format} logProb=${beamResult.pathProb.toFixed(2)} lines=${JSON.stringify(beamResult.lines)}`,
            );
          } else {
            parsedMRZ = parseMrz(mrzZone.lines.join('\n'), { autoCorrect: true });
            console.log(
              `[DIAG] MRZ beam decode unavailable/refused (lattices=${mrzLineLattices?.length ?? 0}) — legacy parser path`,
            );
          }
          console.log(`[DIAG] MRZ zone=${mrzZone.lines.length}L format=${parsedMRZ.format} status=${parsedMRZ.status} checks=${parsedMRZ.checkDigits.map((c) => c.field + ':' + (c.passed ? 'Y' : 'N')).join(',')} lines=${JSON.stringify(mrzZone.lines)}`);
          // Always exclude the MRZ line items from visual/generic extraction so
          // the raw MRZ string never leaks into a visible field.
          mrzZone.itemIds.forEach((id) => usedNodeIds.add(id));

          // Only surface/trust the MRZ when it is FULLY valid (every check digit
          // passes). A partial/invalid MRZ has unreliable field positions — fake
          // or non-ICAO specimen MRZ can pass a single check by coincidence, so
          // per-field gating is not enough. Visual fields win otherwise.
          if (parsedMRZ.format !== 'unknown' && parsedMRZ.status === 'valid') {
            mrzProven = beamResult !== null;
            if (mrzProven) {
              mrzNameWitness = {
                surname: parsedMRZ.fields.surname,
                givenNames: parsedMRZ.fields.givenNames,
              };
            }
            const hMRZ = builder.addHypothesis('MRZ Payload', parsedMRZ, 'mrz', mrzZone.boxNorm, pageId);
            mrzZone.itemIds.forEach((id) => builder.linkHypothesisNodes(hMRZ, { valueNodeId: id }));

            // Checksum blind-spot guard (I2): fields whose winning path holds
            // a same-value-class near-tie or a low-posterior class-ambiguous
            // char ({0,A,K,U,<} are mutually invisible to ICAO check digits)
            // passed every check WITHOUT being proven by it. Those fields are
            // review-capped across ALL sources (N1: no proof, no override).
            const ambiguousCanonicals = new Set<string>();
            if (beamResult) {
              for (const amb of beamResult.ambiguities) {
                if (amb.field === 'documentNumber') ambiguousCanonicals.add('passport_number');
                if (amb.field === 'dateOfBirth') ambiguousCanonicals.add('date_of_birth');
                if (amb.field === 'expiryDate') ambiguousCanonicals.add('date_of_expiry');
                // optionalData has no canonical promotion today; listed for logs.
              }
              if (beamResult.ambiguities.length > 0) {
                console.warn(
                  `[DIAG] MRZ invisible-class ambiguities — withholding authoritative promotion:`,
                  beamResult.ambiguities
                    .map((a) => `${a.field}@${a.position} ${a.chosen}~${a.alternative} r=${a.probRatio.toFixed(2)} (${a.kind})`)
                    .join(', '),
                );
              }
            }
            const AMBIGUOUS_LABELS: Record<string, string> = {
              passport_number: 'Passport Number',
              date_of_birth: 'Date of Birth',
              date_of_expiry: 'Date of Expiry',
            };
            for (const canonical of ambiguousCanonicals) {
              labelReviewCaps.set(
                AMBIGUOUS_LABELS[canonical],
                'MRZ position carries a checksum-invisible ambiguity — value cannot be proven automatically.',
              );
            }

            // PROOF-GRADED promotion: a field is authoritative ONLY when the
            // checksum-guided beam decoded it, its dedicated check digit
            // passed, and no invisible-class ambiguity taints it. Everything
            // else (legacy-path reads, positions no check digit covers —
            // names, nationality, sex, issuing state) is deferred: visual
            // extraction gets first claim, and the MRZ read only gap-fills
            // with a review cap.
            for (const mf of mrzToFields(parsedMRZ)) {
              const proven =
                beamResult !== null &&
                mf.checksumPassed === true &&
                !ambiguousCanonicals.has(mf.canonicalLabel);
              if (!proven) {
                mrzGapFill.push(mf);
                continue;
              }
              addedCanonical.add(mf.canonicalLabel);
              const mrzNodeId = builder.addNode('field', pageId, mrzZone.boxNorm, mf.value, mf.confidence);
              const h = builder.addHypothesis(mf.label, mf.value, mf.valueType, mrzZone.boxNorm, pageId);
              builder.linkHypothesisNodes(h, { valueNodeId: mrzNodeId });
            }
          }
        }

        // 1b. AAMVA license barcode (Tier-1 anchor): a PDF417 decode is
        //     Reed-Solomon proven — bit-exact or nothing — and the DL standard
        //     duplicates the printed data inside it. Parsed fields are
        //     therefore AUTHORITATIVE, claimed before visual extraction the
        //     same way a beam-proven MRZ is (N5: same primitive, new family).
        for (const code of decodedCodes) {
          if (!/pdf417/i.test(code.format)) continue;
          const aamva = parseAamva(code.text);
          if (!aamva.isAamva) continue;
          const f = aamva.fields;
          const promote: { canonical: string; label: string; value: string | undefined; type: FieldValueType }[] = [
            { canonical: 'passport_number', label: 'License Number', value: f.documentNumber, type: 'id_number' },
            { canonical: 'surname', label: 'Surname', value: f.surname, type: 'name' },
            { canonical: 'given_names', label: 'Given Names', value: f.givenNames, type: 'name' },
            { canonical: 'date_of_birth', label: 'Date of Birth', value: f.dateOfBirth, type: 'date' },
            { canonical: 'date_of_expiry', label: 'Date of Expiry', value: f.expiryDate, type: 'date' },
            { canonical: 'sex', label: 'Sex', value: f.sex, type: 'text' },
            { canonical: 'address', label: 'Address', value: f.address, type: 'text' },
            { canonical: 'city', label: 'City', value: f.city, type: 'text' },
            { canonical: 'state', label: 'State', value: f.state, type: 'text' },
          ];
          let promoted = 0;
          for (const p of promote) {
            if (!p.value || addedCanonical.has(p.canonical)) continue;
            addedCanonical.add(p.canonical);
            const nodeId = builder.addNode('field', pageId, code.boxNorm, p.value, 1.0);
            const h = builder.addHypothesis(p.label, p.value, p.type, code.boxNorm, pageId);
            builder.linkHypothesisNodes(h, { valueNodeId: nodeId });
            promoted++;
          }
          console.log(
            `[DIAG] AAMVA barcode: issuer=${aamva.issuerId} v${aamva.aamvaVersion} — ${promoted} fields promoted (RS-proven)`,
          );
        }

        // 2. Known typed fields via the type-aware extractor (beam-proven MRZ
        //    fields already won; MRZ line items are excluded).
        const knownFields = extractFields(
          ocrItems.filter((it) => !usedNodeIds.has(it.nodeId)),
          docType,
          isIdentityDoc ? { dateLocale: 'dmy' } : undefined,
        );
        console.log(`[DIAG] known fields (${knownFields.length}): ${knownFields.map((f) => f.canonicalLabel + '=' + JSON.stringify(f.value)).join(', ')}`);
        for (const f of knownFields) {
          if (addedCanonical.has(f.canonicalLabel)) continue;
          addedCanonical.add(f.canonicalLabel);
          const cleanVal = normalizeFieldValue(f.valueType, f.value).value;
          const h = builder.addHypothesis(f.label, cleanVal, f.valueType, f.valueItem.boxNorm, pageId);
          builder.linkHypothesisNodes(h, {
            valueNodeId: f.valueItem.nodeId,
            labelNodeId: f.labelItem ? f.labelItem.nodeId : undefined,
          });
          // N1: an IDENTIFIER read from pixels alone has no attestor — no
          // checksum, no cross-source agreement, nothing that can prove it.
          // CTC drops doubled digits on clean scans (live-caught: INV-2024-
          // 7745 confirmed as "INV-2024-745"). Identifiers auto-confirm only
          // through an attested path (beam-proven MRZ, template pattern,
          // future cross-channel consensus) — never from a single OCR read.
          // NAMES on non-identity documents share the law (live-caught:
          // truncated "Sofia" confirmed as the account holder "Sofia
          // Dimitrov") — identity docs keep confirming names because the MRZ
          // cross-check polices them; commerce docs have no name attestor.
          if (
            f.valueType === 'id_number' ||
            ((f.valueType === 'name' || f.canonicalLabel === 'vendor') &&
              (!isIdentityDoc || !mrzProven || !mrzWitnessAgrees(f, cleanVal, mrzNameWitness)))
          ) {
            hypReviewCaps.set(
              h,
              f.valueType === 'id_number'
                ? 'Identifier read from pixels alone — no checksum or cross-source proof; review required.'
                : !isIdentityDoc
                  ? 'Name read from pixels alone on a non-identity document — no attestor; review required.'
                  : !mrzProven
                    // A detected-but-REFUSED zone is no police at all (live-
                    // caught: AI fakes with refused MRZs got "DE ALMEIDA"/
                    // "FJELLSTRM" confirmed). Refusal kills the exemption.
                    ? 'Name on an identity-classified page without a beam-proven MRZ to cross-check — review required.'
                    // I1 is a COMPARISON, not a vibe: the proven MRZ witness
                    // disagreed with (or could not vouch for) this read.
                    : 'Name disagrees with the proven MRZ witness — review required.',
            );
          }
          usedNodeIds.add(f.valueItem.nodeId);
          if (f.labelItem) usedNodeIds.add(f.labelItem.nodeId);
        }

        // 2a-closure. Arithmetic attestation for closure families (N1): these
        //   documents PUBLISH their own math. Amounts auto-confirm only when
        //   the closure equation verifies to the cent over the extracted
        //   values — a CTC-dropped digit breaks closure by construction
        //   (live-caught: "1,055.1" confirmed for credits of 1055.11). Broken
        //   or unevaluable closure review-caps every amount in the family;
        //   correct values still count as extraction hits downstream.
        {
          const cents = (v: unknown): number | null => {
            if (typeof v !== 'string') return null;
            const n = parseFloat(v.replace(/[^\d.-]/g, ''));
            return Number.isFinite(n) ? Math.round(n * 100) : null;
          };
          const byCanonical = new Map(knownFields.map((f) => [f.canonicalLabel, f]));
          const closureFamilies: { terms: string[]; holds: (t: (number | null)[]) => boolean }[] =
            docType === 'bank_statement'
              ? [{
                  terms: ['opening_balance', 'total_credits', 'total_debits', 'closing_balance'],
                  holds: ([o, c, d, cl]) =>
                    o !== null && c !== null && d !== null && cl !== null && o + c - d === cl,
                }]
              : docType === 'payslip'
                ? [{
                    terms: ['gross_pay', 'total_deductions', 'net_pay'],
                    holds: ([g, d, n]) => g !== null && d !== null && n !== null && g - d === n,
                  }]
                : docType === 'invoice'
                  ? [{
                      // Invoices/POs publish subtotal + tax = total — and the
                      // equation is the ONLY attestor. Two surviving terms
                      // have no checkable relation (live-caught: subtotal
                      // "5456.18" + total, tax unread → the wrong subtotal
                      // confirmed); partial closures prove nothing, exactly
                      // like partial checksums. Confirm ONLY on the full
                      // equation verifying to the cent.
                      terms: ['subtotal', 'tax', 'total'],
                      holds: ([s, t, tot]) =>
                        s !== null && t !== null && tot !== null && s + t === tot,
                    }]
                  : [];
          for (const fam of closureFamilies) {
            const values = fam.terms.map((t) => cents(byCanonical.get(t)?.value));
            if (fam.holds(values)) {
              console.log(`[DIAG] closure attested (${fam.terms.join('+')}) — amounts confirmable`);
              continue;
            }
            for (const term of fam.terms) {
              const f = byCanonical.get(term);
              if (!f) continue;
              labelReviewCaps.set(
                f.label,
                "Amount not attested: the document's closure equation does not verify over the extracted values — review required.",
              );
            }
            console.log(
              `[DIAG] closure NOT attested (${fam.terms.map((t, i) => `${t}=${values[i]}`).join(', ')}) — amounts review-capped`,
            );
          }
        }

        // 2b. MRZ gap-fill: unproven MRZ reads surface fields the visual pass
        //     missed — better than silence, but never auto-confirmed (N1).
        for (const mf of mrzGapFill) {
          if (addedCanonical.has(mf.canonicalLabel)) continue;
          if (mrzZone === null) break;
          addedCanonical.add(mf.canonicalLabel);
          const mrzNodeId = builder.addNode('field', pageId, mrzZone.boxNorm, mf.value, Math.min(mf.confidence, 0.8));
          const h = builder.addHypothesis(mf.label, mf.value, mf.valueType, mrzZone.boxNorm, pageId);
          builder.linkHypothesisNodes(h, { valueNodeId: mrzNodeId });
          hypReviewCaps.set(
            h,
            mf.checksumPassed === true
              ? 'MRZ value read without checksum-guided beam proof — review required.'
              : 'MRZ position not covered by any check digit — review required.',
          );
        }

        // 3. UNIVERSAL layer — ONLY for unclassified documents. For known doc
        //    types the curated registry is authoritative; running the heuristic
        //    generic layer there only adds noise (title/label mis-pairings).
        if (docType === 'generic') {
          const genericAmounts: { id: string; slug: string; value: string }[] = [];
          for (const g of extractGenericFields(ocrItems, usedNodeIds)) {
            if (addedCanonical.has(g.canonicalLabel)) continue;
            addedCanonical.add(g.canonicalLabel);
            const cleanVal = normalizeFieldValue(g.valueType, g.value).value;
            const genConfidence = Math.min(g.score, 0.6);
            const genNodeId = builder.addNode('field', pageId, g.valueItem.boxNorm, cleanVal, genConfidence);
            const h = builder.addHypothesis(g.label, cleanVal, g.valueType, g.valueItem.boxNorm, pageId);
            builder.linkHypothesisNodes(h, {
              valueNodeId: genNodeId,
              labelNodeId: g.labelItem.nodeId,
            });
            // N1: names/identifiers read by the GENERIC layer have no attestor
            // whatsoever (live-caught: "KENJINAKAMURA" — OCR-merged, missing
            // its space — confirmed as full_name on a tax form; the registry
            // path carried this law, the generic path did not).
            if (
              g.valueType === 'id_number' ||
              g.valueType === 'name' ||
              g.canonicalLabel === 'vendor' ||
              g.canonicalLabel === 'full_name'
            ) {
              hypReviewCaps.set(
                h,
                'Read from pixels alone by the generic layer — no attestor; review required.',
              );
            }
            usedNodeIds.add(g.valueItem.nodeId);
            usedNodeIds.add(g.labelItem.nodeId);
            if (g.valueType === 'amount') {
              genericAmounts.push({ id: h, slug: g.canonicalLabel, value: cleanVal });
            }
          }

          // 3b. Generic-layer AMOUNT closure (N1): on unclassified pages the
          //   subtotal/tax/total trio must attest each other exactly like the
          //   registry path — a LONE surviving amount has no attestor (live-
          //   caught: composite scenes ate the partner amounts and "$80.26"
          //   confirmed for a total of 880.26 through THIS layer, after the
          //   registry-path closure law was already in force).
          {
            const cents = (v: string): number | null => {
              const n = parseFloat(v.replace(/[^\d.-]/g, ''));
              return Number.isFinite(n) ? Math.round(n * 100) : null;
            };
            const CLOSURE_SLUGS = new Set(['subtotal', 'tax', 'total', 'amount_due', 'total_due', 'sub_total']);
            const closureAmounts = genericAmounts.filter((a) => CLOSURE_SLUGS.has(a.slug));
            if (closureAmounts.length > 0) {
              const val = (slug: string): number | null => {
                const hit = closureAmounts.find((a) => a.slug === slug);
                return hit ? cents(hit.value) : null;
              };
              const s = val('subtotal') ?? val('sub_total');
              const t = val('tax');
              const tot = val('total') ?? val('amount_due') ?? val('total_due');
              const closes = s !== null && t !== null && tot !== null && s + t === tot;
              if (!closes) {
                for (const a of closureAmounts) {
                  hypReviewCaps.set(
                    a.id,
                    'Amount not attested: the closure equation is incomplete or does not verify — review required.',
                  );
                }
                console.log(
                  `[DIAG] generic amount closure NOT attested — ${closureAmounts.length} amount(s) review-capped`,
                );
              }
            }
          }
        }
      }

      // Add decoded codes as evidence-backed barcode hypotheses. The payload is
      // checksum-verified by zxing, so the producing node carries full
      // confidence; the Verifier still owns the final trust decision.
      for (const code of decodedCodes) {
        const isQR = /qr/i.test(code.format);
        const nodeValue = `${isQR ? 'QR' : 'BARCODE'}:${code.format}:${code.text}`;
        const codeNodeId = builder.addNode('visual_asset', pageId, code.boxNorm, nodeValue, 1.0);
        const label = isQR ? 'QR Code' : `Barcode (${code.format})`;
        const hCode = builder.addHypothesis(label, code.text, 'barcode', code.boxNorm, pageId);
        builder.linkHypothesisNodes(hCode, { valueNodeId: codeNodeId });
      }

      // Detect the document's main photo/portrait (model-free: the largest
      // high-variance, non-text region that isn't the textured background) and
      // surface it as a cropped visual-asset field.
      try {
        const gridW = 80;
        const gridH = Math.max(1, Math.round((gridW * bitmap.height) / bitmap.width));
        const pcanvas = new OffscreenCanvas(gridW, gridH);
        const pctx = pcanvas.getContext('2d');
        if (pctx) {
          pctx.drawImage(bitmap, 0, 0, gridW, gridH);
          const pdata = pctx.getImageData(0, 0, gridW, gridH).data;
          const luma = new Uint8Array(gridW * gridH);
          for (let i = 0; i < gridW * gridH; i++) {
            luma[i] = Math.round(
              0.299 * pdata[i * 4] + 0.587 * pdata[i * 4 + 1] + 0.114 * pdata[i * 4 + 2],
            );
          }
          const textMask = new Uint8Array(gridW * gridH);
          for (const it of ocrItems) {
            const [x1, y1, x2, y2] = it.boxNorm;
            const cx1 = Math.max(0, Math.floor(x1 * gridW));
            const cx2 = Math.min(gridW, Math.ceil(x2 * gridW));
            const cy1 = Math.max(0, Math.floor(y1 * gridH));
            const cy2 = Math.min(gridH, Math.ceil(y2 * gridH));
            for (let yy = cy1; yy < cy2; yy++) {
              for (let xx = cx1; xx < cx2; xx++) textMask[yy * gridW + xx] = 1;
            }
          }
          const photo = detectPhotoRegion(luma, gridW, gridH, textMask);

          // P1.7: face-driven portrait framing. The face detector gives
          // eyes-level geometry and a standardized 3:4 frame — strictly
          // better evidence than the luma heuristic, which stays as the
          // no-face fallback (documents without portraits, or YuNet absent).
          let portraitBox: Box | null = null;
          let portraitConfidence = 0.6;
          let portraitLabel = 'Photo';
          try {
            if (await inferenceWorker.isModelLoaded(FACE_MODEL.key)) {
              const faces = await inferenceWorker.detectFaces(FACE_MODEL.key, bitmap, 0.7, 0.3);
              // Largest face wins; ambiguity (2+ near-equal faces) → keep the
              // heuristic box and let review decide (N1 applies to pixels).
              faces.sort(
                (a, b) =>
                  (b.boxNorm[2] - b.boxNorm[0]) * (b.boxNorm[3] - b.boxNorm[1]) -
                  (a.boxNorm[2] - a.boxNorm[0]) * (a.boxNorm[3] - a.boxNorm[1]),
              );
              if (faces.length >= 1) {
                const frame = computePortraitFrame(
                  faces[0],
                  bitmap.width,
                  bitmap.height,
                  photo ? photo.boxNorm : undefined,
                );
                portraitBox = [
                  frame.centerX - frame.width / 2,
                  frame.centerY - frame.height / 2,
                  frame.centerX + frame.width / 2,
                  frame.centerY + frame.height / 2,
                ];
                portraitConfidence = faces[0].score;
                portraitLabel = 'Portrait Photo';
                console.log(
                  `[DIAG] portrait: face score=${faces[0].score.toFixed(2)} roll=${frame.rotationDeg.toFixed(1)}° faces=${faces.length}`,
                );
              }
            }
          } catch (faceErr) {
            console.warn('[App] Face detection failed — heuristic photo box only:', faceErr);
          }

          if (!portraitBox && photo) {
            // Pad the heuristic crop slightly so the full portrait is visible.
            const [px1, py1, px2, py2] = photo.boxNorm;
            const padX = (px2 - px1) * 0.08;
            const padY = (py2 - py1) * 0.08;
            portraitBox = [
              Math.max(0, px1 - padX),
              Math.max(0, py1 - padY),
              Math.min(1, px2 + padX),
              Math.min(1, py2 + padY),
            ];
          }

          if (portraitBox) {
            const photoNodeId = builder.addNode('visual_asset', pageId, portraitBox, 'PHOTO', portraitConfidence);
            const hPhoto = builder.addHypothesis(portraitLabel, '', 'visual_asset', portraitBox, pageId);
            builder.linkHypothesisNodes(hPhoto, { assetNodeId: photoNodeId });
          }
        }
      } catch (photoErr) {
        console.error('[App] Photo detection failed:', photoErr);
      }

      // P1.7: signature ink extraction (Documentation/10 §2). Lexical HINT
      // (never a doc-type rule, N5): an OCR line containing a signature
      // keyword anchors the search region — the text-free zone beside/below
      // the keyword. Ink isolation is deterministic (Sauvola + stroke-width
      // variability); presence + clean crop only, never identity.
      try {
        const sigKeyword = ocrItems.find((it) => /\bsign(ature|ed)?\b/i.test(it.text));
        if (sigKeyword) {
          const [kx1, ky1, kx2, ky2] = sigKeyword.boxNorm;
          const kh = ky2 - ky1;
          // Region: to the right of and below the keyword (typical layouts),
          // clamped to the page.
          const region: Box = [
            Math.max(0, kx1 - 0.02),
            Math.max(0, ky1 - kh * 2.5),
            Math.min(1, kx2 + 0.28),
            Math.min(1, ky2 + kh * 2.5),
          ];
          const sx = Math.round(region[0] * bitmap.width);
          const sy = Math.round(region[1] * bitmap.height);
          const sw = Math.round((region[2] - region[0]) * bitmap.width);
          const sh = Math.round((region[3] - region[1]) * bitmap.height);
          if (sw >= 24 && sh >= 12) {
            const sc = new OffscreenCanvas(sw, sh);
            const sctx = sc.getContext('2d');
            if (sctx) {
              sctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
              // Spec: "text-free zones" — mask every OCR'd text line that
              // intersects the region (incl. the keyword itself) so printed
              // captions can never masquerade as ink. Calligraphic scripts
              // that OCR missed remain a known residual — the hypothesis is
              // review-capped for exactly that reason.
              sctx.fillStyle = '#fff';
              for (const it of ocrItems) {
                const [tx1, ty1, tx2, ty2] = it.boxNorm;
                const ix1 = Math.max(region[0], tx1);
                const iy1 = Math.max(region[1], ty1);
                const ix2 = Math.min(region[2], tx2);
                const iy2 = Math.min(region[3], ty2);
                if (ix2 <= ix1 || iy2 <= iy1) continue;
                const pad = 2;
                sctx.fillRect(
                  ix1 * bitmap.width - sx - pad,
                  iy1 * bitmap.height - sy - pad,
                  (ix2 - ix1) * bitmap.width + 2 * pad,
                  (iy2 - iy1) * bitmap.height + 2 * pad,
                );
              }
              const sdata = sctx.getImageData(0, 0, sw, sh);
              const gray = rgbaToGray(sdata.data, sw, sh);
              const ink = extractSignatureInk(gray, sw, sh);
              if (ink.bbox && ink.inkPixels >= 60) {
                const [ix1, iy1, ix2, iy2] = ink.bbox;
                const sigBox: Box = [
                  region[0] + (ix1 / sw) * (region[2] - region[0]),
                  region[1] + (iy1 / sh) * (region[3] - region[1]),
                  region[0] + (ix2 / sw) * (region[2] - region[0]),
                  region[1] + (iy2 / sh) * (region[3] - region[1]),
                ];
                const sigNodeId = builder.addNode('visual_asset', pageId, sigBox, 'SIGNATURE', 0.7);
                const hSig = builder.addHypothesis('Signature', '', 'visual_asset', sigBox, pageId);
                builder.linkHypothesisNodes(hSig, { assetNodeId: sigNodeId });
                // Pixels are fields too (N1): ink presence is evidence, but a
                // stroke-width discriminator can be fooled by calligraphic
                // print — a human confirms the crop, never the machine.
                hypReviewCaps.set(
                  hSig,
                  'Signature ink detected by stroke analysis — visual confirmation required.',
                );
                console.log(
                  `[DIAG] signature ink: ${ink.inkPixels}px strokeCV=${ink.strokeWidthCV.toFixed(2)} near "${sigKeyword.text.slice(0, 24)}"`,
                );
              }
            }
          }
        }
      } catch (sigErr) {
        console.warn('[App] Signature extraction failed:', sigErr);
      }

      // 5. Run Verifier Engine to resolve statuses
      setStatusText('Running local verification & cross-field checks...');
      const graph = builder.build();
      
      // Inject page quality properties into final graph page node
      graph.pages[0].quality = prepResult.quality;

      // Apply review caps (N1): unproven-source hypotheses and fields tainted
      // by checksum-invisible ambiguities never auto-confirm.
      for (const h of graph.hypotheses) {
        const byId = hypReviewCaps.get(h.id);
        const byLabel = labelReviewCaps.get(h.label);
        if (byId || byLabel) h.reviewCap = byId ?? byLabel;
      }

      const verifiedGraph = VerifierService.verify(graph);

      // Save raw graph to IndexedDB
      await saveDocGraph(verifiedGraph);
      setActiveGraph(verifiedGraph);
      
      console.log('[App] DocGraph successfully verified and cached:', verifiedGraph);
      // Machine-readable line for the bench gate runner (bench/gate.mjs):
      // compact field summary scored against the corpus ground-truth manifest.
      console.log(
        '[GATE] ' +
          JSON.stringify({
            fields: verifiedGraph.hypotheses
              .filter((h) => h.valueType !== 'mrz')
              .map((h) => ({
                label: h.label,
                value: typeof h.value === 'string' ? h.value : null,
                type: h.valueType,
                status: h.status,
                // Visual assets are judged by GEOMETRY (goldens harness).
                ...(h.valueType === 'visual_asset' && h.boxNorm ? { box: h.boxNorm } : {}),
              })),
            mrzValid: verifiedGraph.hypotheses.some((h) => h.valueType === 'mrz'),
          }),
      );
    } catch (e) {
      console.error('Processing failed:', e);
      alert('Failed to process document image. See console for details.');
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Captures manual correction events, updates graph and verification statuses.
   */
  const handleUpdateFieldValue = (hypothesisId: string, value: unknown) => {
    if (!activeGraph) return;

    // Use builder to mutate active graph value cleanly
    const builder = new DocGraphBuilder(activeGraph.documentId, docName, activeGraph.metadata.sourceFileType);
    
    // Copy current state
    const currentGraph = { ...activeGraph };
    
    // Find hyp index
    const idx = currentGraph.hypotheses.findIndex(h => h.id === hypothesisId);
    if (idx !== -1) {
      const hyp = { ...currentGraph.hypotheses[idx] };
      hyp.value = value;
      hyp.userEdited = true;
      hyp.status = 'confirmed';
      hyp.reasons = ['User corrected and approved value.'];
      hyp.confidence.overall = 1.0;
      hyp.confidence.components.userCorrection = 1.0;
      
      currentGraph.hypotheses[idx] = hyp;
    }

    // Re-verify after correction
    const updatedGraph = VerifierService.verify(currentGraph);
    setActiveGraph(updatedGraph);
    saveDocGraph(updatedGraph);
  };

  /**
   * Learns and compiles active graph fields into a TemplateGraph model.
   */
  const handleSaveTemplate = async () => {
    if (!activeGraph) return;
    
    const templateName = prompt('Enter a name for this layout template:', 'Passport US Type A');
    if (!templateName) return;

    try {
      const template = TemplateEngine.learnTemplate(activeGraph, templateName);
      await saveTemplate(template);
      alert(`Template '${templateName}' successfully saved to IndexedDB.`);
      loadTemplates();
    } catch (e) {
      console.error(e);
      alert('Failed to save template.');
    }
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete template '${name}'?`)) {
      await deleteTemplate(id);
      loadTemplates();
    }
  };

  // Select field to highlight in canvas
  const handleSelectField = (id: string) => {
    setSelectedFieldId(id);
  };

  const getSelectedHypothesis = (): FieldHypothesis | null => {
    if (!activeGraph || !selectedFieldId) return null;
    return activeGraph.hypotheses.find(h => h.id === selectedFieldId) ?? null;
  };

  return (
    <div className="app-shell">
      
      {/* 1. Header Navigation */}
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={20} style={{ color: 'var(--accent-blue)' }} />
          <h1 style={{ fontSize: '1.25rem', fontWeight: '700', fontFamily: 'var(--font-display)' }}>
            Edge DocGraph Engine
          </h1>
        </div>

        {activeGraph && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {activeGraph.templateContext ? (
              <span style={badgeStyle('var(--status-confirmed)', 'var(--status-confirmed-bg)')}>
                Aligned to Matched Template
              </span>
            ) : (
              <span style={badgeStyle('var(--status-review)', 'var(--status-review-bg)')}>
                Unknown Document Layout
              </span>
            )}
            
            <button onClick={handleSaveTemplate} style={primaryButtonStyle}>
              <Save size={14} />
              Save Template
            </button>
          </div>
        )}
      </header>

      {/* 2. Main Workspace Layout */}
      <main className="app-main">
        
        {/* Left Side: Upload & Canvas Document Viewer */}
        <section className="app-panel app-panel--viewer">
          {!imageSrc ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              width: '100%',
              padding: '40px',
              maxWidth: '500px',
              margin: '0 auto',
              overflowY: 'auto'
            }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', fontFamily: 'var(--font-display)', fontWeight: '600' }}>
                Upload Document
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px', textAlign: 'center' }}>
                Upload an ID card, passport page, or receipt image. Everything is processed locally on your device's GPU/CPU.
              </p>
              
              <UploadManager
                onUpload={handleDocumentUpload}
                isProcessing={isProcessing}
                statusText={statusText}
              />

              {templates.length > 0 && (
                <div style={{ width: '100%', marginTop: '32px', borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', display: 'block', marginBottom: '12px' }}>
                    Learned Layout Profiles ({templates.length})
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {templates.map(t => (
                      <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '2px', backgroundColor: 'var(--bg-secondary)', fontSize: '0.85rem' }}>
                        <div>
                          <div style={{ fontWeight: '500' }}>{t.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Type: {t.docType} • Fields: {t.fields.length}</div>
                        </div>
                        <button onClick={() => handleDeleteTemplate(t.id, t.name)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--status-conflict)' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: '0 0 auto' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '500', color: 'var(--text-secondary)' }}>
                  File: <strong style={{ color: 'var(--text-primary)' }}>{docName}</strong>
                </span>
                <button
                  onClick={() => {
                    setImageSrc(null);
                    setActiveGraph(null);
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    padding: '4px 10px',
                    borderRadius: '2px',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  Clear Document
                </button>
              </div>

              <div style={{ flex: 1, minHeight: 0 }}>
                <DocumentViewer
                  imageSrc={imageSrc}
                  hypotheses={activeGraph?.hypotheses ?? []}
                  nodes={activeGraph?.nodes ?? []}
                  selectedId={selectedFieldId}
                  onSelectField={handleSelectField}
                />
              </div>
            </div>
          )}
        </section>

        {/* Right Side: Form Editor + Evidence Inspector stacked in a sidebar */}
        {activeGraph && (
          <aside className="app-sidebar">
            <section className="app-panel app-panel--form">
              <div className="panel-fill">
                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: '600', fontFamily: 'var(--font-display)' }}>
                    Extracted Form Fields
                  </h2>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Verification rating: <strong style={{ color: qualityScore > 75 ? 'var(--status-confirmed)' : 'var(--status-review)' }}>{qualityScore}%</strong>
                  </p>
                </div>

                <div className="panel-scroll">
                  <FormEditor
                    hypotheses={activeGraph.hypotheses}
                    selectedId={selectedFieldId}
                    imageSrc={imageSrc}
                    onSelectField={handleSelectField}
                    onUpdateValue={handleUpdateFieldValue}
                  />
                </div>
              </div>
            </section>

            {/* Evidence Auditor Inspector */}
            <section className="app-panel app-panel--evidence">
              <EvidenceInspector
                hypothesis={getSelectedHypothesis()}
                validations={activeGraph.validations}
                imageSrc={imageSrc}
              />
            </section>
          </aside>
        )}

      </main>

      {isDownloading && (
        <ModelLoaderOverlay progress={downloadProgress} />
      )}

      {isProcessing && !isDownloading && (
        <ProcessingOverlay statusText={statusText} />
      )}
    </div>
  );
}

/** Full-screen overlay shown while the document is being processed locally. */
function ProcessingOverlay({ statusText }: { statusText: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 11, 13, 0.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '18px',
        zIndex: 900,
      }}
    >
      <div className="spinner" />
      <div
        style={{
          color: '#fff',
          fontSize: '0.95rem',
          fontWeight: 500,
          maxWidth: '420px',
          textAlign: 'center',
          padding: '0 24px',
        }}
      >
        {statusText || 'Processing document locally…'}
      </div>
    </div>
  );
}

/* --- LAYOUT STYLE CONSTANTS --- */

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 24px',
  borderBottom: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-primary)',
  zIndex: 100
};

const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  backgroundColor: 'var(--accent-primary)',
  color: 'var(--bg-primary)',
  border: 'none',
  padding: '8px 16px',
  borderRadius: '2px',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: '600',
  transition: 'var(--transition-smooth)',
  boxShadow: 'var(--shadow-sm)'
};

const badgeStyle = (color: string, bg: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '4px 10px',
  borderRadius: '12px',
  backgroundColor: bg,
  color,
  fontSize: '0.75rem',
  fontWeight: '600'
});
