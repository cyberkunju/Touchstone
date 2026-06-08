import {
  DocGraph,
  PageNode,
  GraphNode,
  GraphEdge,
  EvidenceRecord,
  FieldHypothesis,
  ValidationResult,
  DocGraphMetadata,
  DocumentQualitySummary,
  GraphNodeType,
  GraphEdgeType,
  FieldStatus,
  FieldValueType,
  ExplainableConfidence,
  EvidenceSource,
  EvidenceKind
} from '../core/types';
import { Box } from '../core/geometry';

export class DocGraphBuilder {
  private graph: DocGraph;

  constructor(documentId: string, documentName: string, sourceFileType: 'image' | 'pdf' | 'unknown') {
    const timestamp = Date.now();
    
    const initialMetadata: DocGraphMetadata = {
      documentName,
      sourceFileType,
      pageCount: 0,
      processingMode: 'unknown_document',
      runtime: {
        appVersion: '1.0.0',
        executionProvider: 'unknown'
      }
    };

    const initialQuality: DocumentQualitySummary = {
      pageQuality: {},
      warnings: [],
      safeToAutoConfirm: true
    };

    this.graph = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
      documentId,
      schemaVersion: '1.0.0',
      metadata: initialMetadata,
      pages: [],
      nodes: [],
      edges: [],
      evidence: [],
      hypotheses: [],
      validations: [],
      provenance: [],
      quality: initialQuality,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  /**
   * Updates metadata values.
   */
  public updateMetadata(meta: Partial<DocGraphMetadata>): this {
    this.graph.metadata = { ...this.graph.metadata, ...meta };
    this.graph.updatedAt = Date.now();
    return this;
  }

  /**
   * Sets the template context if matching was executed.
   */
  public setTemplateContext(context: DocGraph['templateContext']): this {
    this.graph.templateContext = context;
    this.graph.updatedAt = Date.now();
    return this;
  }

  /**
   * Adds a page to the document.
   */
  public addPage(
    pageIndex: number,
    widthPx: number,
    heightPx: number,
    originalImageId?: string
  ): string {
    const pageId = `page-${pageIndex}-${Math.random().toString(36).substring(2, 6)}`;
    const pageNode: PageNode = {
      id: pageId,
      type: 'page',
      documentId: this.graph.documentId,
      pageIndex,
      original: {
        widthPx,
        heightPx,
        imageId: originalImageId
      },
      transforms: [],
      quality: {
        blur: { score: 1, level: 'good' },
        glare: { score: 1, level: 'good' },
        contrast: { score: 1, level: 'good' },
        resolution: { score: 1, level: 'good' },
        cropCompleteness: { score: 1, level: 'good' },
        perspective: { score: 1, level: 'good' },
        orientation: { score: 0, level: 'good' },
        safeToExtract: true,
        warnings: []
      },
      evidenceIds: []
    };

    this.graph.pages.push(pageNode);
    this.graph.metadata.pageCount = this.graph.pages.length;
    this.graph.updatedAt = Date.now();
    return pageId;
  }

  /**
   * Sets page normalization results.
   */
  public setPageNormalized(
    pageId: string,
    widthPx: number,
    heightPx: number,
    canonicalWidth: number,
    canonicalHeight: number,
    imageId: string
  ): this {
    const page = this.graph.pages.find(p => p.id === pageId);
    if (page) {
      page.normalized = { widthPx, heightPx, canonicalWidth, canonicalHeight, imageId };
    }
    this.graph.updatedAt = Date.now();
    return this;
  }

  /**
   * Adds a generic graph node.
   */
  public addNode(
    type: GraphNodeType,
    pageId?: string,
    boxNorm?: Box,
    value?: string,
    confidence?: number,
    metadata?: Record<string, unknown>
  ): string {
    const id = `${type}-${Math.random().toString(36).substring(2, 11)}`;
    const node: GraphNode = {
      id,
      type,
      pageId,
      boxNorm,
      value,
      confidence,
      status: 'candidate',
      evidenceIds: [],
      createdAt: Date.now()
    };
    
    if (metadata) {
      node.metadata = metadata;
    }

    this.graph.nodes.push(node);
    this.graph.updatedAt = Date.now();
    return id;
  }

  /**
   * Adds a directional edge between two nodes.
   */
  public addEdge(type: GraphEdgeType, fromId: string, toId: string, confidence?: number): string {
    const id = `edge-${Math.random().toString(36).substring(2, 11)}`;
    const edge: GraphEdge = {
      id,
      type,
      from: fromId,
      to: toId,
      confidence,
      evidenceIds: [],
      createdAt: Date.now()
    };

    this.graph.edges.push(edge);
    this.graph.updatedAt = Date.now();
    return id;
  }

  /**
   * Appends an raw EvidenceRecord to the graph audit trail.
   */
  public addEvidence(
    source: EvidenceSource,
    kind: EvidenceKind,
    payload: Record<string, unknown>,
    boxNorm?: Box,
    confidence?: number,
    pageId?: string
  ): string {
    const id = `ev-${source}-${Math.random().toString(36).substring(2, 11)}`;
    const evidenceRecord: EvidenceRecord = {
      id,
      documentId: this.graph.documentId,
      pageId,
      source,
      kind,
      boxNorm,
      confidence,
      payload,
      provenance: [
        {
          id: `prov-${Math.random().toString(36).substring(2, 6)}`,
          actor: 'system',
          action: `Evidence generated by ${source}`,
          timestamp: Date.now()
        }
      ],
      createdAt: Date.now()
    };

    this.graph.evidence.push(evidenceRecord);
    this.graph.updatedAt = Date.now();
    return id;
  }

  /**
   * Associates an evidence record ID with a node.
   */
  public linkNodeToEvidence(nodeId: string, evidenceId: string): this {
    const node = this.graph.nodes.find(n => n.id === nodeId);
    if (node && !node.evidenceIds.includes(evidenceId)) {
      node.evidenceIds.push(evidenceId);
    }
    this.graph.updatedAt = Date.now();
    return this;
  }

  /**
   * Proposes a field hypothesis inside the form presentation layer.
   */
  public addHypothesis(
    label: string,
    value: unknown,
    valueType: FieldValueType,
    boxNorm?: Box,
    pageId?: string
  ): string {
    const id = `hyp-${Math.random().toString(36).substring(2, 11)}`;
    const initialConfidence: ExplainableConfidence = {
      overall: 0.5,
      components: {},
      penalties: [],
      reasons: ['Initial hypothesis creation']
    };

    const hypothesis: FieldHypothesis = {
      id,
      documentId: this.graph.documentId,
      pageId,
      label,
      value,
      valueType,
      labelNodeIds: [],
      valueNodeIds: [],
      assetNodeIds: [],
      tableNodeIds: [],
      boxNorm,
      confidence: initialConfidence,
      status: 'needs_review',
      evidenceIds: [],
      validationIds: [],
      reasons: [],
      createdAt: Date.now()
    };

    this.graph.hypotheses.push(hypothesis);
    this.graph.updatedAt = Date.now();
    return id;
  }

  /**
   * Updates an existing hypothesis field value.
   */
  public updateHypothesisValue(hypothesisId: string, value: unknown, userEdited: boolean = false): this {
    const hyp = this.graph.hypotheses.find(h => h.id === hypothesisId);
    if (hyp) {
      hyp.value = value;
      hyp.userEdited = userEdited;
      if (userEdited) {
        hyp.confidence.overall = 1.0;
        hyp.confidence.components.userCorrection = 1.0;
        hyp.status = 'confirmed';
        
        // Add audit trail for correction
        const provId = `prov-corr-${Math.random().toString(36).substring(2, 6)}`;
        this.graph.provenance.push({
          id: provId,
          actor: 'user',
          action: `Hypothesis value corrected by user: ${String(value)}`,
          timestamp: Date.now(),
          sourceId: hypothesisId
        });
      }
      hyp.updatedAt = Date.now();
    }
    this.graph.updatedAt = Date.now();
    return this;
  }

  /**
   * Assigns verifier status directly to a hypothesis.
   */
  public setHypothesisStatus(hypothesisId: string, status: FieldStatus, reasons: string[]): this {
    const hyp = this.graph.hypotheses.find(h => h.id === hypothesisId);
    if (hyp) {
      hyp.status = status;
      hyp.reasons = reasons;
      hyp.updatedAt = Date.now();
    }
    this.graph.updatedAt = Date.now();
    return this;
  }

  /**
   * Links nodes to a hypothesis field model.
   */
  public linkHypothesisNodes(
    hypothesisId: string,
    nodes: { labelNodeId?: string; valueNodeId?: string; assetNodeId?: string; tableNodeId?: string }
  ): this {
    const hyp = this.graph.hypotheses.find(h => h.id === hypothesisId);
    if (hyp) {
      if (nodes.labelNodeId && !hyp.labelNodeIds.includes(nodes.labelNodeId)) {
        hyp.labelNodeIds.push(nodes.labelNodeId);
      }
      if (nodes.valueNodeId && !hyp.valueNodeIds.includes(nodes.valueNodeId)) {
        hyp.valueNodeIds.push(nodes.valueNodeId);
      }
      if (nodes.assetNodeId && !hyp.assetNodeIds.includes(nodes.assetNodeId)) {
        hyp.assetNodeIds.push(nodes.assetNodeId);
      }
      if (nodes.tableNodeId && !hyp.tableNodeIds.includes(nodes.tableNodeId)) {
        hyp.tableNodeIds.push(nodes.tableNodeId);
      }
      hyp.updatedAt = Date.now();
    }
    this.graph.updatedAt = Date.now();
    return this;
  }

  /**
   * Adds validation result.
   */
  public addValidation(
    targetId: string,
    validatorId: string,
    status: ValidationResult['status'],
    severity: ValidationResult['severity'],
    message: string,
    evidenceIds: string[],
    details?: Record<string, unknown>
  ): string {
    const id = `val-${validatorId}-${Math.random().toString(36).substring(2, 11)}`;
    const result: ValidationResult = {
      id,
      documentId: this.graph.documentId,
      targetId,
      validatorId,
      status,
      severity,
      message,
      details,
      evidenceIds,
      createdAt: Date.now()
    };

    this.graph.validations.push(result);

    // Link validation to target hypothesis
    const hyp = this.graph.hypotheses.find(h => h.id === targetId);
    if (hyp && !hyp.validationIds.includes(id)) {
      hyp.validationIds.push(id);
    }

    this.graph.updatedAt = Date.now();
    return id;
  }

  /**
   * Returns the constructed DocGraph object.
   */
  public build(): DocGraph {
    this.graph.updatedAt = Date.now();
    return this.graph;
  }
}
