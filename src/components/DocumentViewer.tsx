import React, { useRef, useEffect, useState } from 'react';
import { FieldHypothesis } from '../core/types';

interface DocumentViewerProps {
  imageSrc: string | null;
  hypotheses: FieldHypothesis[];
  selectedId: string | null;
  onSelectField: (id: string) => void;
}

export default function DocumentViewer({
  imageSrc,
  hypotheses,
  selectedId,
  onSelectField
}: DocumentViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [userZoom, setUserZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // The scale that fits the whole image inside the container.
  const fitScale = (() => {
    if (!imgElement || containerSize.w === 0 || containerSize.h === 0) return 1;
    return Math.min(containerSize.w / imgElement.width, containerSize.h / imgElement.height);
  })();
  // Effective zoom applied to the image = fit-to-container * user zoom factor.
  const zoom = fitScale * userZoom;

  // Track the container size so the canvas always matches its panel and the
  // image refits on layout changes (resize, stacking, orientation).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load image
  useEffect(() => {
    if (!imageSrc) {
      setImgElement(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setImgElement(img);
      // Reset zoom/pan on new document (fit-to-view by default).
      setUserZoom(1.0);
      setPan({ x: 0, y: 0 });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Redraw Canvas on updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgElement) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas dimensions to container layout
    const container = containerRef.current;
    const width = container ? container.clientWidth : 800;
    const height = container ? container.clientHeight : 600;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    // Apply pan and zoom transforms
    ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-imgElement.width / 2, -imgElement.height / 2);

    // 1. Draw page image
    ctx.drawImage(imgElement, 0, 0);

    // 2. Draw overlays for hypotheses
    hypotheses.forEach(hyp => {
      if (!hyp.boxNorm) return;

      // Scale normalized coordinates [0.0, 1.0] to image dimensions
      const [x1, y1, x2, y2] = hyp.boxNorm;
      const bx = x1 * imgElement.width;
      const by = y1 * imgElement.height;
      const bw = (x2 - x1) * imgElement.width;
      const bh = (y2 - y1) * imgElement.height;

      const isSelected = hyp.id === selectedId;
      
      // Determine stroke color from verifier status
      let strokeColor = 'var(--status-review)';
      if (hyp.status === 'confirmed') strokeColor = 'var(--status-confirmed)';
      if (hyp.status === 'invalid' || hyp.status === 'conflict') strokeColor = 'var(--status-conflict)';
      if (hyp.status === 'missing') strokeColor = 'var(--status-missing)';

      // Draw bounding box
      ctx.lineWidth = isSelected ? 4 / zoom : 2 / zoom;
      ctx.strokeStyle = strokeColor;
      ctx.strokeRect(bx, by, bw, bh);

      // Draw background tint for selected box
      if (isSelected) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
        ctx.fillRect(bx, by, bw, bh);
      }
    });

    ctx.restore();
  }, [imgElement, zoom, pan, hypotheses, selectedId, containerSize]);

  // Handle Drag & Pan events
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imgElement) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    setIsDragging(false);
    
    // Check if it was a quick click to select a field
    const dx = Math.abs(e.clientX - (dragStart.x + pan.x));
    const dy = Math.abs(e.clientY - (dragStart.y + pan.y));
    if (dx < 3 && dy < 3) {
      handleClickCanvas(e);
    }
  };

  const handleClickCanvas = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !imgElement) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert click coordinates to canvas image space
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    const imgX = (clickX - (canvasWidth / 2 + pan.x)) / zoom + imgElement.width / 2;
    const imgY = (clickY - (canvasHeight / 2 + pan.y)) / zoom + imgElement.height / 2;

    const normX = imgX / imgElement.width;
    const normY = imgY / imgElement.height;

    // Find if click hits any hypothesis box
    let foundId: string | null = null;
    let minArea = Infinity;

    hypotheses.forEach(hyp => {
      if (!hyp.boxNorm) return;
      const [x1, y1, x2, y2] = hyp.boxNorm;

      if (normX >= x1 && normX <= x2 && normY >= y1 && normY <= y2) {
        const area = (x2 - x1) * (y2 - y1);
        // Select smallest overlapping box
        if (area < minArea) {
          minArea = area;
          foundId = hyp.id;
        }
      }
    });

    if (foundId) {
      onSelectField(foundId);
    }
  };

  const zoomIn = () => setUserZoom(prev => Math.min(8.0, prev + 0.2));
  const zoomOut = () => setUserZoom(prev => Math.max(0.2, prev - 0.2));
  const resetZoom = () => {
    setUserZoom(1.0);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div ref={containerRef} style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      backgroundColor: 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
      borderRadius: '4px',
      overflow: 'hidden',
      cursor: isDragging ? 'grabbing' : 'grab'
    }}>
      {imageSrc ? (
        <>
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{ display: 'block', width: '100%', height: '100%' }}
          />
          
          {/* Minimal Controls */}
          <div style={{
            position: 'absolute',
            bottom: '16px',
            right: '16px',
            display: 'flex',
            gap: '8px',
            zIndex: 10
          }}>
            <button onClick={zoomOut} style={controlButtonStyle}>−</button>
            <button onClick={resetZoom} style={controlButtonStyle}>Fit</button>
            <button onClick={zoomIn} style={controlButtonStyle}>+</button>
          </div>
        </>
      ) : (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-tertiary)',
          fontSize: '0.9rem'
        }}>
          No document loaded. Upload a document to begin.
        </div>
      )}
    </div>
  );
}

const controlButtonStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-primary)',
  border: '1px solid var(--border-color)',
  color: 'var(--text-primary)',
  padding: '6px 12px',
  borderRadius: '2px',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: '500',
  boxShadow: 'var(--shadow-sm)',
  transition: 'var(--transition-smooth)'
};
