import React, { useState } from 'react';
import { Upload, FileText, CheckCircle2 } from 'lucide-react';

interface UploadManagerProps {
  onUpload: (file: File) => void;
  isProcessing: boolean;
  statusText: string;
}

export default function UploadManager({
  onUpload,
  isProcessing,
  statusText
}: UploadManagerProps) {
  const [dragActive, setDragActive] = useState<boolean>(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      width: '100%'
    }}>
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        style={{
          border: dragActive ? '2px dashed var(--border-focus)' : '1px dashed var(--border-color)',
          backgroundColor: dragActive ? 'var(--bg-secondary)' : 'var(--bg-primary)',
          borderRadius: '4px',
          padding: '40px 24px',
          textAlign: 'center',
          transition: 'var(--transition-smooth)',
          position: 'relative',
          cursor: isProcessing ? 'not-allowed' : 'pointer'
        }}
      >
        <input
          type="file"
          id="input-file-upload"
          disabled={isProcessing}
          onChange={handleChange}
          accept="image/png, image/jpeg, image/webp"
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            top: 0,
            left: 0,
            opacity: 0,
            cursor: isProcessing ? 'not-allowed' : 'pointer'
          }}
        />

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px'
        }}>
          <Upload size={32} style={{ color: 'var(--text-secondary)' }} />
          <div>
            <p style={{ fontWeight: '500', fontSize: '0.95rem' }}>
              Drag and drop document image here
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
              Supports PNG, JPEG, WebP (Max 15MB)
            </p>
          </div>
        </div>
      </div>

      {isProcessing && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          backgroundColor: 'var(--bg-secondary)'
        }}>
          <div style={{
            width: '16px',
            height: '16px',
            border: '2px solid var(--border-color)',
            borderTopColor: 'var(--text-primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>
            {statusText}
          </span>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
