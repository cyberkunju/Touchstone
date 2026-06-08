import React, { useState, useEffect } from 'react';
import { getParserWorker, getInferenceWorker } from './workers/manager';
import { DocGraphBuilder } from './docgraph/builder';
import { VerifierService } from './verifier/verifier';
import { TemplateEngine } from './template-engine/template';
import { saveDocGraph, saveTemplate, getAllTemplates, deleteTemplate } from './storage/db';
import { DocGraph, FieldHypothesis, ValidationResult, TemplateGraph, GraphNode } from './core/types';
import { Box } from './core/geometry';
import { ensureFileCached, isFileCached, loadCharDictionary } from './ai-runtime/model-loader';
import { CORE_OCR_MODELS, OCR_DET_MODEL, OCR_REC_MODEL, PPOCR_DICT } from './ai-runtime/model-registry';
import { parseMrz } from './parsers/mrz';
import {
  normalizeFieldValue,
  boxOverlapFraction,
} from './docgraph/hypotheses';
import { OcrItem } from './docgraph/ocr-item';
import { detectMrzZone, mrzLineScore, isMrzLine } from './docgraph/mrz-zone';
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
      const bitmap = await createImageBitmap(file);

      // Create Object URL for canvas background rendering
      const objectUrl = URL.createObjectURL(file);
      setImageSrc(objectUrl);

      // 2. Preprocess page in parser worker (blur, glare, canonical resize)
      setStatusText('Normalizing page & analyzing image quality...');
      const parserWorker = getParserWorker();
      const prepResult = await parserWorker.preprocessPage(bitmap, 0);
      
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
      } finally {
        if (needsSetup) setIsDownloading(false);
      }

      // Run real PP-OCRv5 DBNet text detection on the page.
      setStatusText('Running local PP-OCRv5 text detector (DBNet)...');
      const detBoxes = await inferenceWorker.detectText(OCR_DET_MODEL.key, bitmap);
      console.log(`[App] DBNet found ${detBoxes.length} text lines.`);

      // Run real PP-OCRv5 recognition on each detected line crop.
      setStatusText(`Recognizing characters on ${detBoxes.length} text lines (PP-OCRv5)...`);
      const recognizedNodes: { text: string; confidence: number; boxNorm: Box }[] = [];

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

      // Update metadata execution provider
      builder.updateMetadata({
        runtime: {
          appVersion: '1.0.0',
          executionProvider: 'webgpu'
        }
      });

      // Build actual OCR nodes into graph
      const graphNodes: GraphNode[] = [];
      const nodeMap = new Map<string, string>(); // maps box coordinate string to node ID

      recognizedNodes.forEach((rn, idx) => {
        const nodeId = builder.addNode('text_line', pageId, rn.boxNorm, rn.text, rn.confidence);
        nodeMap.set(rn.boxNorm.join(','), nodeId);
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
      }));
      let mrzZone = detectMrzZone(ocrItems);
      console.log(`[DIAG] ocrItems=${ocrItems.length} mrzZoneDetected=${!!mrzZone}`);

      // High-resolution MRZ re-OCR. The full-page pass downscales to <=960px,
      // so the small MRZ band at the bottom reads poorly. Re-read it directly
      // from the ORIGINAL image at high resolution for accurate doc number /
      // name / dates, then the check-digit-validated parse can trust it.
      if (mrzZone) {
        try {
          const [bx1, by1, bx2, by2] = mrzZone.boxNorm;
          const padX = (bx2 - bx1) * 0.02;
          const padY = (by2 - by1) * 0.25;
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
                inferenceWorker.ocrRegionLines(OCR_DET_MODEL.key, OCR_REC_MODEL.key, bandBitmap),
                timeout,
              ]);
              bandBitmap.close();
              if (lines) {
                console.log(`[DIAG] ocrRegionLines returned ${lines.length} lines`);
                const hiResLines = lines
                  .map((l) => l.text.toUpperCase().replace(/\s+/g, ''))
                  .filter((t) => t.length >= 10);
                console.log(`[DIAG] MRZ hi-res lines: ${JSON.stringify(hiResLines)}`);
                if (hiResLines.length >= 1) {
                  mrzZone = { ...mrzZone, lines: hiResLines };
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
        
        // Find anchors on the current page to run alignment homography
        const pageNodes = recognizedNodes.map(rn => ({
          type: 'text_line',
          value: rn.text,
          boxNorm: rn.boxNorm
        }));

        tpl.fields.forEach(field => {
          // Project bounding box using actual aligned anchors
          const projectedBox = TemplateEngine.alignAndProject(pageNodes, tpl, field);
          
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

      } else {
        setStatusText(`Extracting ${docType} fields...`);

        // Track which OCR nodes and which canonical fields are already claimed,
        // so each layer adds only NEW information and nothing is double-counted.
        const usedNodeIds = new Set<string>();
        const addedCanonical = new Set<string>();

        // 1. MRZ is the AUTHORITATIVE source for passports/IDs: machine-readable
        //    and checksum-protected, so it is immune to visual smudges/blur. We
        //    parse it with check-digit-guided OCR self-correction, then derive
        //    checksum-verified fields that OVERRIDE noisy visual OCR.
        if (mrzZone) {
          const parsedMRZ = parseMrz(mrzZone.lines.join('\n'), { autoCorrect: true });
          console.log(`[DIAG] MRZ zone=${mrzZone.lines.length}L format=${parsedMRZ.format} status=${parsedMRZ.status} checks=${parsedMRZ.checkDigits.map((c) => c.field + ':' + (c.passed ? 'Y' : 'N')).join(',')} lines=${JSON.stringify(mrzZone.lines)}`);
          // Always exclude the MRZ line items from visual/generic extraction so
          // the raw MRZ string never leaks into a visible field.
          mrzZone.itemIds.forEach((id) => usedNodeIds.add(id));

          // Only surface/trust the MRZ when it is FULLY valid (every check digit
          // passes). A partial/invalid MRZ has unreliable field positions — fake
          // or non-ICAO specimen MRZ can pass a single check by coincidence, so
          // per-field gating is not enough. Visual fields win otherwise.
          if (parsedMRZ.format !== 'unknown' && parsedMRZ.status === 'valid') {
            const hMRZ = builder.addHypothesis('MRZ Payload', parsedMRZ, 'mrz', mrzZone.boxNorm, pageId);
            mrzZone.itemIds.forEach((id) => builder.linkHypothesisNodes(hMRZ, { valueNodeId: id }));

            for (const mf of mrzToFields(parsedMRZ)) {
              if (mf.checksumPassed !== true) continue;
              addedCanonical.add(mf.canonicalLabel);
              const mrzNodeId = builder.addNode('field', pageId, mrzZone.boxNorm, mf.value, mf.confidence);
              const h = builder.addHypothesis(mf.label, mf.value, mf.valueType, mrzZone.boxNorm, pageId);
              builder.linkHypothesisNodes(h, { valueNodeId: mrzNodeId });
            }
          }
        }

        // 2. Known typed fields via the type-aware extractor (MRZ already won
        //    for any field it provided; MRZ line items are excluded).
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
          usedNodeIds.add(f.valueItem.nodeId);
          if (f.labelItem) usedNodeIds.add(f.labelItem.nodeId);
        }

        // 3. UNIVERSAL layer — ONLY for unclassified documents. For known doc
        //    types the curated registry is authoritative; running the heuristic
        //    generic layer there only adds noise (title/label mis-pairings).
        if (docType === 'generic') {
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
            usedNodeIds.add(g.valueItem.nodeId);
            usedNodeIds.add(g.labelItem.nodeId);
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
          if (photo) {
            // Pad the crop slightly so the full portrait is visible.
            const [px1, py1, px2, py2] = photo.boxNorm;
            const padX = (px2 - px1) * 0.08;
            const padY = (py2 - py1) * 0.08;
            const photoBox: Box = [
              Math.max(0, px1 - padX),
              Math.max(0, py1 - padY),
              Math.min(1, px2 + padX),
              Math.min(1, py2 + padY),
            ];
            const photoNodeId = builder.addNode('visual_asset', pageId, photoBox, 'PHOTO', 0.6);
            const hPhoto = builder.addHypothesis('Photo', '', 'visual_asset', photoBox, pageId);
            builder.linkHypothesisNodes(hPhoto, { assetNodeId: photoNodeId });
          }
        }
      } catch (photoErr) {
        console.error('[App] Photo detection failed:', photoErr);
      }

      // 5. Run Verifier Engine to resolve statuses
      setStatusText('Running local verification & cross-field checks...');
      const graph = builder.build();
      
      // Inject page quality properties into final graph page node
      graph.pages[0].quality = prepResult.quality;
      
      const verifiedGraph = VerifierService.verify(graph);

      // Save raw graph to IndexedDB
      await saveDocGraph(verifiedGraph);
      setActiveGraph(verifiedGraph);
      
      console.log('[App] DocGraph successfully verified and cached:', verifiedGraph);
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
