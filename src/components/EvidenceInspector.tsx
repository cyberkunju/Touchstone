import React, { useRef, useEffect } from 'react';
import { FieldHypothesis, GraphNode, ValidationResult } from '../core/types';

interface EvidenceInspectorProps {
  hypothesis: FieldHypothesis | null;
  nodes: GraphNode[];
  validations: ValidationResult[];
  imageSrc: string | null;
}

export default function EvidenceInspector({
  hypothesis,
  nodes,
  validations,
  imageSrc
}: EvidenceInspectorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Redraw Crop when hypothesis changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!imageSrc || !hypothesis?.boxNorm) {
      canvas.width = 1;
      canvas.height = 1;
      return;
    }

    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const [x1, y1, x2, y2] = hypothesis.boxNorm!;
      const sx = x1 * img.width;
      const sy = y1 * img.height;
      const sw = (x2 - x1) * img.width;
      const sh = (y2 - y1) * img.height;

      if (sw <= 0 || sh <= 0) return;
      const scale = Math.min(360 / sw, 160 / sh);
      const width = Math.max(1, Math.round(sw * scale));
      const height = Math.max(1, Math.round(sh * scale));
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
    };
    img.src = imageSrc;
  }, [imageSrc, hypothesis]);

  if (!hypothesis) {
    return (
      <div style={{
        padding: '24px',
        textAlign: 'center',
        color: 'var(--text-tertiary)',
        fontSize: '0.9rem',
        border: '1px dashed var(--border-color)',
        borderRadius: '4px',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        Select a form field to inspect its evidence and validation records.
      </div>
    );
  }

  // Filter validations belonging to this hypothesis
  const fieldValidations = validations.filter(v => v.targetId === hypothesis.id);
  const labelNodes = hypothesis.labelNodeIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is GraphNode => node !== undefined);
  const valueNodes = hypothesis.valueNodeIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is GraphNode => node !== undefined);
  const formatBox = (box: GraphNode['boxNorm']) =>
    box ? box.map((value) => value.toFixed(4)).join(', ') : 'none';

  return (
    <div style={{
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-sm)',
      padding: 'var(--sp-3)',
      backgroundColor: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--sp-3)',
      height: '100%',
      overflowY: 'auto'
    }}>
      <h3 style={{
        fontSize: '0.92rem',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '6px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '8px',
        minWidth: 0
      }}>
        <span>Evidence Inspector</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>ID: {hypothesis.id}</span>
      </h3>

      {/* 1. Large Image Crop */}
      <div>
        <span style={sectionHeaderStyle}>Source Document Crop</span>
        <div style={{
          marginTop: '8px',
          border: '1px solid var(--border-color)',
          borderRadius: '2px',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-tertiary)',
          display: 'inline-block'
        }}>
          <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%' }} />
        </div>
      </div>

      <div>
        <span style={sectionHeaderStyle}>Binding Trace</span>
        <div style={{ marginTop: 8, display: 'grid', gap: 8, fontSize: '0.78rem' }}>
          <div><strong>Canonical:</strong> {hypothesis.canonicalLabel ?? 'unmapped'}</div>
          <div><strong>Value box:</strong> {hypothesis.boxNorm?.map((value) => value.toFixed(4)).join(', ') ?? 'none'}</div>
          {labelNodes.map((node) => (
            <div key={`label-${node.id}`}>
              <strong>Caption OCR:</strong> {node.value ?? '(no text)'} [{formatBox(node.boxNorm)}]
            </div>
          ))}
          {valueNodes.map((node) => (
            <div key={`value-${node.id}`}>
              <strong>Value OCR:</strong> {node.value ?? '(no text)'} [{formatBox(node.boxNorm)}]
            </div>
          ))}
        </div>
      </div>

      {/* 2. Confidence Breakdown */}
      <div>
        <span style={sectionHeaderStyle}>Confidence Diagnostic</span>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginTop: '8px',
          padding: '12px',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '2px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600' }}>
            <span>Overall Score:</span>
            <span style={{ color: getScoreColor(hypothesis.confidence.overall) }}>
              {Math.round(hypothesis.confidence.overall * 100)}%
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>OCR Conf:</span>
              <span>{Math.round((hypothesis.confidence.components.ocr ?? 1.0) * 100)}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Detector Conf:</span>
              <span>{Math.round((hypothesis.confidence.components.detector ?? 1.0) * 100)}%</span>
            </div>
          </div>

          {hypothesis.confidence.penalties.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '6px', marginTop: '4px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--status-conflict)' }}>Active Penalties:</span>
              <ul style={{ paddingLeft: '16px', fontSize: '0.75rem', color: 'var(--status-conflict)', marginTop: '2px' }}>
                {hypothesis.confidence.penalties.map((p, idx) => (
                  <li key={idx}>-{Math.round(p.amount * 100)}% ({p.reason})</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* 3. Validation Rules checklist */}
      <div>
        <span style={sectionHeaderStyle}>Validator Registry Run</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          {fieldValidations.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              No validators registered for this field type.
            </div>
          ) : (
            fieldValidations.map(val => (
              <div key={val.id} style={{
                padding: '10px 12px',
                borderLeft: `3px solid ${val.status === 'pass' ? 'var(--status-confirmed)' : 'var(--status-conflict)'}`,
                backgroundColor: 'var(--bg-secondary)',
                fontSize: '0.85rem',
                borderRadius: '0 2px 2px 0'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '500' }}>
                  <span>{val.validatorId.toUpperCase()}</span>
                  <span style={{
                    color: val.status === 'pass' ? 'var(--status-confirmed)' : 'var(--status-conflict)',
                    fontWeight: '600'
                  }}>
                    {val.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '2px' }}>
                  {val.message}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const sectionHeaderStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '0.75rem',
  fontWeight: '600',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--text-tertiary)',
  display: 'block'
};

function getScoreColor(score: number): string {
  if (score >= 0.8) return 'var(--status-confirmed)';
  if (score >= 0.6) return 'var(--status-review)';
  return 'var(--status-conflict)';
}
