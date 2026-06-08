import React from 'react';
import { OCR_DET_MODEL, OCR_REC_MODEL, PPOCR_DICT } from '../ai-runtime/model-registry';

export interface ModelProgress {
  loaded: number;
  total: number;
  progress: number;
}

interface ModelLoaderOverlayProps {
  progress: Record<string, ModelProgress>;
}

export default function ModelLoaderOverlay({ progress }: ModelLoaderOverlayProps) {
  const models = [
    { key: OCR_DET_MODEL.key, name: 'PP-OCRv5 Text Detector (DBNet)' },
    { key: OCR_REC_MODEL.key, name: 'PP-OCRv5 Text Recognizer (SVTR)' },
    { key: PPOCR_DICT.key, name: 'PP-OCRv5 Character Dictionary' },
  ];

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3 style={titleStyle}>Initializing Local AI Models</h3>
        <p style={subtitleStyle}>
          Downloading and caching lightweight neural network models. This is a one-time setup; subsequent runs will load instantly from local storage.
        </p>

        <div style={listStyle}>
          {models.map(m => {
            const prog = progress[m.key] || { loaded: 0, total: 0, progress: 0 };
            const isCompleted = prog.progress === 100;
            const isDownloading = prog.loaded > 0 && prog.progress < 100;

            return (
              <div key={m.key} style={itemStyle}>
                <div style={itemHeaderStyle}>
                  <span style={itemNameStyle}>{m.name}</span>
                  <span style={itemPercentStyle}>
                    {isCompleted ? (
                      <span style={{ color: 'var(--status-confirmed)' }}>Cached</span>
                    ) : isDownloading ? (
                      `${prog.progress}%`
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)' }}>Pending</span>
                    )}
                  </span>
                </div>
                <div style={barContainerStyle}>
                  <div
                    style={barProgressStyle(prog.progress, isCompleted ? 'var(--status-confirmed)' : 'var(--accent-blue)')}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div style={footerStyle}>
          All processing runs 100% locally on your browser's WebGPU or CPU.
        </div>
      </div>
    </div>
  );
}

/* --- STYLES --- */

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(10, 10, 12, 0.85)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000
};

const modalStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '480px',
  backgroundColor: 'var(--bg-primary)',
  border: '1px solid var(--border-color)',
  padding: '32px',
  borderRadius: '2px',
  boxShadow: 'var(--shadow-lg)',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px'
};

const titleStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  fontWeight: '600',
  fontFamily: 'var(--font-display)',
  color: 'var(--text-primary)',
  margin: 0
};

const subtitleStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  lineHeight: '1.45',
  margin: 0
};

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  marginTop: '8px'
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px'
};

const itemHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '0.8rem',
  fontWeight: '500'
};

const itemNameStyle: React.CSSProperties = {
  color: 'var(--text-primary)'
};

const itemPercentStyle: React.CSSProperties = {
  fontWeight: '600',
  fontFamily: 'monospace'
};

const barContainerStyle: React.CSSProperties = {
  height: '4px',
  width: '100%',
  backgroundColor: 'var(--border-color)',
  borderRadius: '2px',
  overflow: 'hidden'
};

const barProgressStyle = (pct: number, color: string): React.CSSProperties => ({
  height: '100%',
  width: `${pct}%`,
  backgroundColor: color,
  transition: 'width 0.15s ease-out'
});

const footerStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--text-tertiary)',
  textAlign: 'center',
  borderTop: '1px solid var(--border-color)',
  paddingTop: '16px',
  marginTop: '8px'
};
