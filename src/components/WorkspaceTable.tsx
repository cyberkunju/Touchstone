/**
 * Virtualized workspace table (P2.4, 12 §4) — 200 rows smooth on the lite
 * profile. THIN: all math in workspace/ui/windowing.ts (gap-free coverage
 * proven by tests); this renders exactly the computed slice.
 */

import React, { useRef, useState } from 'react';
import { computeWindow } from '../workspace/ui/windowing';

export interface WorkspaceRow {
  id: string;
  cells: string[];
}

interface WorkspaceTableProps {
  columns: string[];
  rows: WorkspaceRow[];
  rowHeight?: number;
  height?: number;
  onRowClick?: (id: string) => void;
}

export default function WorkspaceTable({
  columns,
  rows,
  rowHeight = 32,
  height = 480,
  onRowClick,
}: WorkspaceTableProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const win = computeWindow(scrollTop, height, rowHeight, rows.length);

  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 4 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
          fontSize: '0.7rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--text-secondary)',
          padding: '6px 10px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        {columns.map((c) => (
          <div key={c}>{c}</div>
        ))}
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
        style={{ height, overflowY: 'auto', position: 'relative' }}
        role="grid"
        aria-rowcount={rows.length}
      >
        <div style={{ height: win.totalHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: win.offsetY, left: 0, right: 0 }}>
            {rows.slice(win.start, win.end).map((row) => (
              <div
                key={row.id}
                role="row"
                onClick={() => onRowClick?.(row.id)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
                  height: rowHeight,
                  alignItems: 'center',
                  padding: '0 10px',
                  fontSize: '0.85rem',
                  borderBottom: '1px solid var(--border-color)',
                  cursor: onRowClick ? 'pointer' : 'default',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
              >
                {row.cells.map((cell, i) => (
                  <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cell}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
