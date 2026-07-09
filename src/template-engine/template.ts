import { DocGraph, TemplateGraph, TemplateField, TemplateAnchor, TemplatePage, TemplateFingerprint } from '../core/types';
import { Box, getBoxCenter } from '../core/geometry';
import {
  estimateAlignment,
  projectBox,
  type Alignment,
  type AnchorPair,
} from '../geometry/homography';
import { similarity } from '../docgraph/fuzzy';

export class TemplateEngine {
  /**
   * Learns a new TemplateGraph from a corrected DocGraph.
   */
  public static learnTemplate(graph: DocGraph, name: string, description?: string): TemplateGraph {
    console.log(`[Template Engine] Learning template from DocGraph ${graph.id}...`);
    const timestamp = Date.now();
    const familyId = `fam-${Math.random().toString(36).substring(2, 11)}`;
    const templateId = `tpl-${Math.random().toString(36).substring(2, 11)}`;

    // 1. Create canonical pages
    const canonicalPages: TemplatePage[] = graph.pages.map(p => ({
      id: p.id,
      pageIndex: p.pageIndex,
      canonicalWidth: p.normalized?.canonicalWidth ?? 1000,
      canonicalHeight: p.normalized?.canonicalHeight ?? 1000,
      aspectRatio: p.original.heightPx / p.original.widthPx,
      thumbnailId: p.normalized?.imageId
    }));

    // 2. Select stable anchors from graph nodes (static labels, identifiers)
    const anchors: TemplateAnchor[] = [];
    
    // Convert confirmed field labels to text anchors
    graph.hypotheses.forEach((hyp, idx) => {
      if (
        hyp.status === 'confirmed' &&
        hyp.label &&
        hyp.boxNorm &&
        hyp.valueType !== 'mrz' &&
        hyp.valueType !== 'table' &&
        hyp.valueType !== 'visual_asset'
      ) {
        // The anchor's TEXT is the label; its BOX must be the LABEL node's
        // box (live-caught: hyp.boxNorm is the VALUE box, so anchor probes
        // read value pixels and compared them against label text — the
        // sparse refill could never match, and alignment pairs carried a
        // systematic label→value offset).
        let anchorVal = hyp.label;
        let anchorBox = hyp.boxNorm;
        if (hyp.labelNodeIds && hyp.labelNodeIds.length > 0) {
          const labelNode = graph.nodes.find(n => n.id === hyp.labelNodeIds[0]);
          if (labelNode) {
            if (labelNode.value) anchorVal = labelNode.value;
            if (labelNode.boxNorm) anchorBox = labelNode.boxNorm;
          }
        }

        anchors.push({
          id: `anchor-${idx}-${Math.random().toString(36).substring(2, 6)}`,
          pageIndex: 0, // baseline single page
          type: 'text',
          label: hyp.label,
          boxNorm: anchorBox,
          value: anchorVal, // the text of the label acts as the anchor key
          importance: 0.8,
          stability: 0.9,
          requiredForMatch: idx < 3, // require first few anchors for match
          createdFromNodeIds: hyp.labelNodeIds,
          createdFromEvidenceIds: hyp.evidenceIds
        });
      }
    });

    // 3. Create template field ROIs
    const fields: TemplateField[] = graph.hypotheses.map(hyp => ({
      id: `tpl-field-${Math.random().toString(36).substring(2, 11)}`,
      pageIndex: 0,
      label: hyp.label,
      canonicalLabel: hyp.canonicalLabel,
      aliases: [hyp.label.toLowerCase()],
      valueType: hyp.valueType,
      valueBoxNorm: hyp.boxNorm ?? [0, 0, 0, 0],
      required: hyp.required ?? false,
      extraction: {
        preferredMode: hyp.valueType === 'table' ? 'table' : hyp.valueType === 'visual_asset' ? 'asset_crop' : 'roi_ocr',
        roiExpansion: 0.05
      },
      validators: [],
      relationships: [],
      anchorIds: anchors.map(a => a.id),
      createdFromHypothesisId: hyp.id,
      createdFromCorrectionIds: []
    }));

    // 4. Build Layout Fingerprint
    const stableTokens = anchors.map(a => a.value ?? '');
    
    const fingerprint: TemplateFingerprint = {
      textSignature: {
        stableTokens,
        tokenHashes: stableTokens.map(t => this.simpleHash(t))
      },
      layoutSignature: {
        textBlockHistogram: [graph.nodes.filter(n => n.type === 'text_block').length],
        objectClassHistogram: {}
      },
      specialZones: {
        hasMRZ: graph.hypotheses.some(h => h.valueType === 'mrz'),
        hasQRCode: graph.nodes.some(n => n.type === 'visual_asset' && n.value?.includes('QR')),
        hasBarcode: graph.nodes.some(n => n.type === 'visual_asset' && n.value?.includes('BARCODE')),
        hasPhoto: graph.hypotheses.some(h => h.valueType === 'visual_asset'),
        hasTable: graph.hypotheses.some(h => h.valueType === 'table'),
        hasCheckboxes: graph.nodes.some(n => n.type === 'checkbox')
      },
      pageGeometry: {
        aspectRatio: canonicalPages[0]?.aspectRatio ?? 1.414,
        pageCount: canonicalPages.length
      }
    };

    return {
      id: templateId,
      familyId,
      version: 1,
      schemaVersion: '1.0.0',
      name,
      description,
      docType: this.inferDocType(graph),
      pageCount: canonicalPages.length,
      canonicalPages,
      fingerprint,
      anchors,
      fields,
      assets: [],
      tables: [],
      codes: [],
      mrzZones: [],
      checkboxes: [],
      sections: [],
      aliases: {},
      validators: [],
      relationships: [],
      matching: {
        requiredAnchorIds: anchors.filter(a => a.requiredForMatch).map(a => a.id),
        weights: { textAnchor: 0.5, visualAnchor: 0.1, geometry: 0.2, keypoint: 0.1, specialZone: 0.1, requiredRegion: 0.0 },
        thresholds: { sameTemplate: 0.75, sameFamilyNewVersion: 0.5, unknown: 0.3, ambiguousMargin: 0.1 }
      },
      extraction: {
        defaultRoiExpansion: 0.05,
        localSearch: { enabled: true, maxShiftNorm: 0.08, maxRetries: 3 },
        ocr: { batchRois: true, highResSmallFields: true }
      },
      versioning: {
        versionReason: 'initial',
        compatibleWithVersions: []
      },
      provenance: [
        {
          id: `prov-tpl-${Math.random().toString(36).substring(2, 6)}`,
          actor: 'user',
          action: 'Template created from corrected DocGraph',
          sourceDocGraphId: graph.id,
          timestamp
        }
      ],
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  /**
   * Scores and matches a new DocGraph layout fingerprint against registered TemplateGraphs.
   */
  public static matchTemplate(graph: DocGraph, templates: TemplateGraph[]): { template: TemplateGraph; score: number } | null {
    if (templates.length === 0) return null;

    let bestMatch: TemplateGraph | null = null;
    let maxScore = -1;

    // Gather stable tokens present in the current DocGraph nodes
    const graphTexts = new Set(
      graph.nodes
        .filter(n => n.type === 'text_word' || n.type === 'text_line')
        .map(n => (n.value ?? '').toLowerCase().trim())
    );

    for (const tpl of templates) {
      // 1. Text Anchor Score: calculate fraction of template anchors found in graph
      let matchedAnchors = 0;
      tpl.anchors.forEach(anchor => {
        if (anchor.value && graphTexts.has(anchor.value.toLowerCase().trim())) {
          matchedAnchors++;
        }
      });

      const textScore = tpl.anchors.length > 0 ? matchedAnchors / tpl.anchors.length : 0.0;

      // 2. Special Zone Score: match checkboxes, MRZs, tables presence
      const tplZones = tpl.fingerprint.specialZones;
      const graphHasMRZ = graph.hypotheses.some(h => h.valueType === 'mrz');
      const graphHasTable = graph.hypotheses.some(h => h.valueType === 'table');
      
      let zoneMatches = 0;
      const zoneCount = 2;
      if (tplZones.hasMRZ === graphHasMRZ) zoneMatches++;
      if (tplZones.hasTable === graphHasTable) zoneMatches++;
      
      const zoneScore = zoneMatches / zoneCount;

      // 3. Combine scores using weights
      const weights = tpl.matching.weights;
      const activeWeights = weights.textAnchor + weights.specialZone;
      const score = (textScore * weights.textAnchor + zoneScore * weights.specialZone) / (activeWeights || 1);

      console.log(`[Template Matcher] Scored template '${tpl.name}': ${(score * 100).toFixed(1)}%`);

      if (score > maxScore && score >= tpl.matching.thresholds.sameTemplate) {
        maxScore = score;
        bestMatch = tpl;
      }
    }

    if (bestMatch) {
      return { template: bestMatch, score: maxScore };
    }
    return null;
  }

  /**
   * Builds anchor↔page correspondences and estimates the template→page
   * transform through the frozen ladder (Documentation/09 §4): RANSAC+DLT
   * homography ≥6 inliers → affine 3–5 → similarity 2 → failed.
   *
   * Matching: exact string equality first; fuzzy ≥0.9 for long tokens (≥6
   * chars) — OCR noise must not cost the alignment its anchors. Each anchor
   * matches at most one page node (best similarity wins).
   */
  public static computeAlignment(pageNodes: any[], template: TemplateGraph): Alignment {
    const pairs: AnchorPair[] = [];
    const textNodes = pageNodes.filter(
      (n: any) => (n.type === 'text_word' || n.type === 'text_line') && n.value && n.boxNorm,
    );

    for (const anchor of template.anchors) {
      if (!anchor.boxNorm || !anchor.value) continue;
      const a = String(anchor.value).toLowerCase().trim();
      let best: { node: any; sim: number } | null = null;
      for (const n of textNodes) {
        const t = String(n.value).toLowerCase().trim();
        const sim = t === a ? 1 : a.length >= 6 && t.length >= 6 ? similarity(a, t) : 0;
        if (sim >= 0.9 && (!best || sim > best.sim)) best = { node: n, sim };
      }
      if (best) {
        pairs.push({
          tpl: getBoxCenter(anchor.boxNorm),
          page: getBoxCenter(best.node.boxNorm),
        });
      }
    }

    const alignment = estimateAlignment(pairs);
    console.log(
      `[Template Engine] Alignment: ${alignment.kind} (${alignment.inliers}/${alignment.total} anchors, mean err ${alignment.meanError === Infinity ? '∞' : alignment.meanError.toFixed(4)})`,
    );
    return alignment;
  }

  /**
   * Projects one template field ROI onto the page through a precomputed
   * alignment (compute it ONCE per document with {@link computeAlignment}).
   * A failed alignment returns the template box unchanged — the caller sees
   * `kind === 'failed'` and must treat the document as unknown flow.
   */
  public static alignAndProject(
    pageNodes: any[],
    template: TemplateGraph,
    field: TemplateField,
    precomputed?: Alignment,
  ): Box {
    const alignment = precomputed ?? this.computeAlignment(pageNodes, template);
    return projectBox(alignment, field.valueBoxNorm);
  }

  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  private static inferDocType(graph: DocGraph): any {
    if (graph.hypotheses.some(h => h.valueType === 'mrz')) return 'passport';
    if (graph.hypotheses.some(h => h.label.toLowerCase().includes('invoice') || h.label.toLowerCase().includes('bill'))) return 'invoice';
    return 'generic_form';
  }
}
