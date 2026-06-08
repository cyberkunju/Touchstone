import { DocGraph, TemplateGraph, TemplateField, TemplateAnchor, FieldHypothesis, TemplatePage, TemplateFingerprint } from '../core/types';
import { Box, getBoxCenter } from '../core/geometry';

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
        const anchorVal = (() => {
          if (hyp.labelNodeIds && hyp.labelNodeIds.length > 0) {
            const labelNode = graph.nodes.find(n => n.id === hyp.labelNodeIds[0]);
            if (labelNode && labelNode.value) {
              return labelNode.value;
            }
          }
          return hyp.label;
        })();

        anchors.push({
          id: `anchor-${idx}-${Math.random().toString(36).substring(2, 6)}`,
          pageIndex: 0, // baseline single page
          type: 'text',
          label: hyp.label,
          boxNorm: hyp.boxNorm,
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
      let zoneCount = 2;
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
   * Calculates a 2D Affine Alignment (Translation + Scale) to project
   * template ROI bounding boxes onto the coordinates of a newly uploaded page.
   */
  public static alignAndProject(
    pageNodes: any[], // current page nodes
    template: TemplateGraph,
    field: TemplateField
  ): Box {
    // 1. Find matched anchors
    const matchedPairs: { tpl: Box; page: Box }[] = [];

    template.anchors.forEach(anchor => {
      if (anchor.boxNorm && anchor.value) {
        // Find matching text node in current page
        const matchNode = pageNodes.find(
          (n: any) =>
            (n.type === 'text_word' || n.type === 'text_line') &&
            n.value &&
            n.value.toLowerCase().trim() === anchor.value!.toLowerCase().trim()
        );

        if (matchNode && matchNode.boxNorm) {
          matchedPairs.push({
            tpl: anchor.boxNorm,
            page: matchNode.boxNorm
          });
        }
      }
    });

    const defaultBox = field.valueBoxNorm;

    // If we have fewer than 2 pairs, fallback to static template projection (no scaling, translation only if single)
    if (matchedPairs.length === 0) {
      return defaultBox;
    }

    // 2. Compute translation offset (Shift ΔX, ΔY) based on centers
    let sumDx = 0;
    let sumDy = 0;

    matchedPairs.forEach(pair => {
      const tplCenter = getBoxCenter(pair.tpl);
      const pageCenter = getBoxCenter(pair.page);
      sumDx += pageCenter[0] - tplCenter[0];
      sumDy += pageCenter[1] - tplCenter[1];
    });

    const dx = sumDx / matchedPairs.length;
    const dy = sumDy / matchedPairs.length;

    // 3. Compute scale factors (Sx, Sy) if we have 2 or more pairs
    let sx = 1.0;
    let sy = 1.0;

    if (matchedPairs.length >= 2) {
      // Calculate distances between anchors in template vs page
      let tplDistSum = 0;
      let pageDistSum = 0;

      for (let i = 0; i < matchedPairs.length; i++) {
        for (let j = i + 1; j < matchedPairs.length; j++) {
          const tplC1 = getBoxCenter(matchedPairs[i].tpl);
          const tplC2 = getBoxCenter(matchedPairs[j].tpl);
          const pageC1 = getBoxCenter(matchedPairs[i].page);
          const pageC2 = getBoxCenter(matchedPairs[j].page);

          tplDistSum += Math.abs(tplC1[0] - tplC2[0]) + Math.abs(tplC1[1] - tplC2[1]);
          pageDistSum += Math.abs(pageC1[0] - pageC2[0]) + Math.abs(pageC1[1] - pageC2[1]);
        }
      }

      if (tplDistSum > 0) {
        const ratio = pageDistSum / tplDistSum;
        // Clamp scale to prevent extreme warping errors
        sx = Math.min(1.2, Math.max(0.8, ratio));
        sy = sx;
      }
    }

    // 4. Project bounding box: scale and translate corners
    const [tx1, ty1, tx2, ty2] = defaultBox;
    const tCenter = getBoxCenter(defaultBox);

    // Apply scale relative to center of box, then apply translation shift
    const halfW = ((tx2 - tx1) / 2) * sx;
    const halfH = ((ty2 - ty1) / 2) * sy;

    const pxCenter = tCenter[0] + dx;
    const pyCenter = tCenter[1] + dy;

    const px1 = Math.max(0.0, Math.min(1.0, pxCenter - halfW));
    const py1 = Math.max(0.0, Math.min(1.0, pyCenter - halfH));
    const px2 = Math.max(0.0, Math.min(1.0, pxCenter + halfW));
    const py2 = Math.max(0.0, Math.min(1.0, pyCenter + halfH));

    return [px1, py1, px2, py2];
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
