import React, { useRef, useEffect } from 'react';
import { FieldHypothesis, FieldStatus } from '../core/types';
import { Box } from '../core/geometry';

interface FormEditorProps {
  hypotheses: FieldHypothesis[];
  selectedId: string | null;
  imageSrc: string | null;
  onSelectField: (id: string) => void;
  onUpdateValue: (id: string, value: unknown) => void;
}

export default function FormEditor({
  hypotheses,
  selectedId,
  imageSrc,
  onSelectField,
  onUpdateValue
}: FormEditorProps) {
  
  const handleInputChange = (id: string, value: string) => {
    onUpdateValue(id, value);
  };

  const handleCheckboxChange = (id: string, checked: boolean) => {
    onUpdateValue(id, checked);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      height: '100%',
      overflowY: 'auto',
      paddingRight: '6px'
    }}>
      {hypotheses.length === 0 ? (
        <div style={{
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text-tertiary)',
          fontSize: '0.9rem'
        }}>
          No form fields generated yet. Process a document to begin.
        </div>
      ) : (
        hypotheses.map(hyp => {
          const isSelected = hyp.id === selectedId;
          return (
            <div
              key={hyp.id}
              onClick={() => onSelectField(hyp.id)}
              style={{
                padding: '16px',
                border: isSelected ? '1px solid var(--border-focus)' : '1px solid var(--border-color)',
                borderRadius: '4px',
                backgroundColor: isSelected ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                transition: 'var(--transition-smooth)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: '500',
                  fontSize: '0.85rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-secondary)'
                }}>
                  {hyp.label}
                </span>
                
                {/* Status Badge */}
                <StatusBadge status={hyp.status} />
              </div>

              {/* Dynamic Value Input Control */}
              <div style={{ marginTop: '4px' }}>
                {hyp.valueType === 'checkbox' ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!hyp.value}
                      onChange={(e) => handleCheckboxChange(hyp.id, e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {hyp.value ? 'Selected' : 'Unselected'}
                    </span>
                  </label>
                ) : hyp.valueType === 'visual_asset' ? (
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <CanvasCrop imageSrc={imageSrc} boxNorm={hyp.boxNorm} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                      [Visual Asset Crop]
                    </span>
                  </div>
                ) : hyp.valueType === 'mrz' ? (
                  <MrzDisplay value={hyp.value} />
                ) : (
                  <input
                    type="text"
                    value={String(hyp.value ?? '')}
                    onChange={(e) => handleInputChange(hyp.id, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '2px',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                    onFocus={() => onSelectField(hyp.id)}
                  />
                )}
              </div>

              {/* Error messages / Reasons if review needed */}
              {hyp.status !== 'confirmed' && hyp.reasons && hyp.reasons.length > 0 && (
                <div style={{
                  fontSize: '0.75rem',
                  color: hyp.status === 'invalid' || hyp.status === 'conflict' ? 'var(--status-conflict)' : 'var(--status-review)',
                  marginTop: '4px',
                  fontWeight: '500'
                }}>
                  {hyp.reasons[0]}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/* --- SUB COMPONENTS --- */

/**
 * Read-only summary of a parsed MRZ payload (an MrzParseResult). Shows the
 * machine-verified status, the parsed fields, and the raw MRZ lines. Never
 * fabricates: only renders what the parser produced.
 */
function MrzDisplay({ value }: { value: unknown }) {
  const mrz = value as
    | {
        format?: string;
        status?: string;
        fields?: Record<string, unknown>;
        rawLines?: string[];
      }
    | null;

  if (!mrz || typeof mrz !== 'object' || !mrz.fields) {
    return (
      <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
        No MRZ payload parsed.
      </span>
    );
  }

  const fieldOrder: [string, string][] = [
    ['documentType', 'Type'],
    ['issuingCountry', 'Issuer'],
    ['documentNumber', 'Doc No.'],
    ['surname', 'Surname'],
    ['givenNames', 'Given Names'],
    ['nationality', 'Nationality'],
    ['dateOfBirth', 'Date of Birth'],
    ['sex', 'Sex'],
    ['expiryDate', 'Expiry'],
  ];
  const rows = fieldOrder.filter(([k]) => mrz.fields && mrz.fields[k] != null && mrz.fields[k] !== '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
        {(mrz.format ?? 'MRZ')} · checksum {mrz.status ?? 'unknown'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px' }}>
        {rows.map(([key, label]) => (
          <React.Fragment key={key}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{label}</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
              {String(mrz.fields![key])}
            </span>
          </React.Fragment>
        ))}
      </div>
      {Array.isArray(mrz.rawLines) && mrz.rawLines.length > 0 && (
        <pre
          style={{
            margin: 0,
            fontSize: '0.72rem',
            color: 'var(--text-secondary)',
            backgroundColor: 'var(--bg-tertiary)',
            padding: '6px 8px',
            borderRadius: '2px',
            overflowX: 'auto',
            whiteSpace: 'pre',
          }}
        >
          {mrz.rawLines.join('\n')}
        </pre>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: FieldStatus }) {
  let label = 'Needs Review';
  let dotColor = 'var(--status-review)';
  let bgColor = 'var(--status-review-bg)';

  if (status === 'confirmed') {
    label = 'Confirmed';
    dotColor = 'var(--status-confirmed)';
    bgColor = 'var(--status-confirmed-bg)';
  } else if (status === 'invalid') {
    label = 'Invalid';
    dotColor = 'var(--status-conflict)';
    bgColor = 'var(--status-conflict-bg)';
  } else if (status === 'conflict') {
    label = 'Conflict';
    dotColor = 'var(--status-conflict)';
    bgColor = 'var(--status-conflict-bg)';
  } else if (status === 'missing') {
    label = 'Missing';
    dotColor = 'var(--status-missing)';
    bgColor = 'var(--status-missing-bg)';
  }

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '2px 8px',
      borderRadius: '12px',
      backgroundColor: bgColor,
      fontSize: '0.75rem',
      fontWeight: '600',
      color: dotColor
    }}>
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        backgroundColor: dotColor
      }} />
      {label}
    </div>
  );
}

interface CanvasCropProps {
  imageSrc: string | null;
  boxNorm?: Box;
}

function CanvasCrop({ imageSrc, boxNorm }: CanvasCropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageSrc || !boxNorm) return;

    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const [x1, y1, x2, y2] = boxNorm;
      const sx = x1 * img.width;
      const sy = y1 * img.height;
      const sw = Math.max(1, (x2 - x1) * img.width);
      const sh = Math.max(1, (y2 - y1) * img.height);

      // Render at a larger size preserving the crop's aspect ratio, upscaling
      // the source region so the portrait is clearly visible.
      const maxH = 150;
      const aspect = sw / sh;
      const dh = maxH;
      const dw = Math.round(dh * aspect);
      canvas.width = dw;
      canvas.height = dh;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, dw, dh);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
    };
    img.src = imageSrc;
  }, [imageSrc, boxNorm]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        maxWidth: '100%',
        height: '150px',
        border: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-tertiary)',
        borderRadius: '4px',
      }}
    />
  );
}
