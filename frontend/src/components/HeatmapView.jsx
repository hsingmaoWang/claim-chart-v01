import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-dist-min';
import html2canvas from 'html2canvas';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
  useDraggable
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X as XIcon, Sun, Moon } from 'lucide-react';

const Plot = createPlotlyComponent(Plotly);

// All available dimension definitions
const ALL_DIMENSIONS = [
  { id: '應用領域', label: '應用領域', emoji: '🎯' },
  { id: '技術1階', label: '技術1階', emoji: '🔧' },
  { id: '技術2階', label: '技術2階', emoji: '⚙️' },
  { id: '技術3階', label: '技術3階', emoji: '🔩' },
  { id: '功效節點', label: '功效節點', emoji: '⚡' },
];

// Normalize a dimension value to an array of trimmed, non-empty strings
const normalizeDimensionValue = (val) => {
  if (!val || (Array.isArray(val) && val.length === 0)) return ['其他'];
  if (typeof val === 'string') {
    if (val.includes(',') || val.includes('、')) {
      return [...new Set(val.split(/[,、]/).map(s => s.trim()).filter(Boolean))];
    }
    return [val.trim()];
  }
  if (Array.isArray(val)) {
    return [...new Set(val.map(s => String(s).trim()).filter(Boolean))];
  }
  return [String(val).trim()];
};

// Compute the Cartesian product of an array of arrays
const cartesianProduct = (arrays) => {
  if (arrays.length === 0) return [[]];
  return arrays.reduce((acc, curr) => {
    const res = [];
    acc.forEach(a => curr.forEach(b => res.push([...a, b])));
    return res;
  }, [[]]);
};

// Main matrix builder
function buildHeatmapMatrix(patents, xDims, yDim) {
  if (!patents || patents.length === 0 || !xDims || xDims.length === 0 || !yDim) {
    return { x: [], y: [], z: [] };
  }

  const xLabelsSet = new Set();
  patents.forEach(p => {
    const dimValues = xDims.map(d => normalizeDimensionValue(p[d]));
    cartesianProduct(dimValues).forEach(combo => xLabelsSet.add(combo.join(' > ')));
  });
  const xArr = [...xLabelsSet].sort();

  const yLabelsSet = new Set();
  patents.forEach(p => normalizeDimensionValue(p[yDim]).forEach(v => yLabelsSet.add(v)));
  const yArr = [...yLabelsSet].sort();

  const matrix = yArr.map(() => xArr.map(() => new Set()));

  patents.forEach(p => {
    const pid = p['專利公開公告號'] || String(Math.random());
    const dimValues = xDims.map(d => normalizeDimensionValue(p[d]));
    const xs = cartesianProduct(dimValues).map(combo => combo.join(' > '));
    const ys = normalizeDimensionValue(p[yDim]);
    xs.forEach(x => {
      ys.forEach(y => {
        const xi = xArr.indexOf(x);
        const yi = yArr.indexOf(y);
        if (xi >= 0 && yi >= 0) matrix[yi][xi].add(pid);
      });
    });
  });

  return { x: xArr, y: yArr, z: matrix.map(row => row.map(s => s.size)) };
}

// ─── Drag-and-drop sub-components ────────────────────────────────────────────

// A sortable chip inside X-axis list (can be reordered within the list)
const SortableXChip = ({ dim, theme }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dim.id });
  const isDark = theme === 'dark';
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.45rem 0.75rem',
        background: isDark ? 'rgba(14,165,233,0.2)' : 'rgba(14,165,233,0.1)',
        border: `1px solid ${isDark ? 'rgba(14,165,233,0.5)' : 'rgba(14,165,233,0.3)'}`,
        borderRadius: '0.5rem',
        cursor: 'grab',
        userSelect: 'none',
        fontSize: '0.85rem',
        color: isDark ? '#7dd3fc' : '#0284c7',
        fontWeight: '600',
        backdropFilter: 'blur(4px)',
        transition: 'box-shadow 0.2s'
      }}
      {...attributes}
      {...listeners}
    >
      <GripVertical size={13} style={{ opacity: 0.6 }} />
      <span>{dim.emoji}</span>
      <span>{dim.label}</span>
    </div>
  );
};

// A simple draggable chip (for available pool and Y-axis slot)
const DraggableChip = ({ dim, zone, color = 'cyan', theme }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${zone}:${dim.id}`,
    data: { dimId: dim.id, zone }
  });

  const isDark = theme === 'dark';
  const colors = {
    cyan: {
      bg: isDark ? 'rgba(14,165,233,0.15)' : 'rgba(14,165,233,0.08)',
      border: isDark ? 'rgba(14,165,233,0.4)' : 'rgba(14,165,233,0.25)',
      text: isDark ? '#7dd3fc' : '#0284c7'
    },
    purple: {
      bg: isDark ? 'rgba(168,85,247,0.15)' : 'rgba(168,85,247,0.08)',
      border: isDark ? 'rgba(168,85,247,0.4)' : 'rgba(168,85,247,0.25)',
      text: isDark ? '#d8b4fe' : '#9333ea'
    },
    slate: {
      bg: isDark ? 'rgba(100,116,139,0.15)' : 'rgba(100,116,139,0.08)',
      border: isDark ? 'rgba(100,116,139,0.4)' : 'rgba(100,116,139,0.25)',
      text: isDark ? '#cbd5e1' : '#64748b'
    },
  };
  const c = colors[color] || colors.cyan;

  return (
    <div
      ref={setNodeRef}
      style={{
        opacity: isDragging ? 0.3 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: '0.4rem 0.7rem',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: '0.5rem',
        cursor: 'grab',
        userSelect: 'none',
        fontSize: '0.85rem',
        color: c.text,
        fontWeight: '600',
        backdropFilter: 'blur(4px)',
        whiteSpace: 'nowrap'
      }}
      {...attributes}
      {...listeners}
    >
      <GripVertical size={13} style={{ opacity: 0.6 }} />
      <span>{dim.emoji}</span>
      <span>{dim.label}</span>
    </div>
  );
};

// Droppable zone wrapper
const DroppableZone = ({ id, children, label, hint, isEmpty, accent = 'cyan', theme }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  const isDark = theme === 'dark';
  const accents = {
    cyan: { over: 'rgba(14,165,233,0.15)', border: 'rgba(14,165,233,0.5)', label: isDark ? '#7dd3fc' : '#0284c7' },
    purple: { over: 'rgba(168,85,247,0.15)', border: 'rgba(168,85,247,0.5)', label: isDark ? '#d8b4fe' : '#9333ea' },
    slate: { over: 'rgba(100,116,139,0.15)', border: 'rgba(100,116,139,0.4)', label: isDark ? '#cbd5e1' : '#64748b' },
  };
  const a = accents[accent] || accents.cyan;

  return (
    <div
      ref={setNodeRef}
      style={{
        padding: '0.75rem',
        borderRadius: '0.6rem',
        border: `1px dashed ${isOver ? a.border : isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
        background: isOver ? a.over : isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
        transition: 'all 0.2s ease',
        minHeight: '64px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem'
      }}
    >
      <div style={{ fontSize: '0.7rem', fontWeight: '700', color: a.label, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.1rem' }}>
        {label}
      </div>
      {isEmpty && (
        <div style={{ fontSize: '0.75rem', color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.45)', fontStyle: 'italic', padding: '0.25rem 0' }}>
          {hint}
        </div>
      )}
      {children}
    </div>
  );
};

// ─── Sparse matrix filter utility ──────────────────────────────────────────────
function filterSparseMatrix({ x, y, z }) {
  if (!z || z.length === 0) return { x, y, z, removedCols: 0, removedRows: 0 };

  // Find non-zero column indices
  const activeColIdx = x.reduce((acc, _, ci) => {
    if (z.some(row => row[ci] > 0)) acc.push(ci);
    return acc;
  }, []);

  // Find non-zero row indices
  const activeRowIdx = z.reduce((acc, row, ri) => {
    if (row.some(v => v > 0)) acc.push(ri);
    return acc;
  }, []);

  const filteredX = activeColIdx.map(ci => x[ci]);
  const filteredY = activeRowIdx.map(ri => y[ri]);
  const filteredZ = activeRowIdx.map(ri => activeColIdx.map(ci => z[ri][ci]));

  return {
    x: filteredX,
    y: filteredY,
    z: filteredZ,
    removedCols: x.length - filteredX.length,
    removedRows: y.length - filteredY.length
  };
}

// Custom modifier to center the drag overlay ghost directly under the cursor
const snapCenterToCursor = ({ activatorEvent, activeNodeRect, transform }) => {
  if (activeNodeRect && activatorEvent) {
    const clientX = activatorEvent.clientX !== undefined
      ? activatorEvent.clientX
      : (activatorEvent.touches && activatorEvent.touches[0] ? activatorEvent.touches[0].clientX : null);
    const clientY = activatorEvent.clientY !== undefined
      ? activatorEvent.clientY
      : (activatorEvent.touches && activatorEvent.touches[0] ? activatorEvent.touches[0].clientY : null);

    if (clientX !== null && clientY !== null) {
      return {
        ...transform,
        x: transform.x - (clientX - activeNodeRect.left - activeNodeRect.width / 2),
        y: transform.y - (clientY - activeNodeRect.top - activeNodeRect.height / 2),
      };
    }
  }
  return transform;
};

// ─── Main HeatmapView component ───────────────────────────────────────────────
const HeatmapView = ({ treeData, onCaptureReady, authState }) => {
  const [theme, setTheme] = useState('dark');
  const heatmapContainerRef = useRef(null);

  // Extract patents from treeData
  const patents = useMemo(() => {
    if (!treeData) return [];
    let arr = treeData.patents;
    if (!arr || !Array.isArray(arr)) {
      for (const key in treeData) {
        if (Array.isArray(treeData[key])) { arr = treeData[key]; break; }
      }
    }
    return Array.isArray(arr) ? arr : [];
  }, [treeData]);

  // Dimension zone state
  const [zones, setZones] = useState({
    available: ['應用領域', '技術3階'],
    xAxis: ['技術1階', '技術2階'],
    yAxis: ['功效節點']
  });

  // Derive readable state
  const xAxisDims = zones.xAxis;
  const yAxisDim = zones.yAxis[0] || null;

  // Sparse matrix filter toggle (default: filter out all-zero rows/cols)
  const [showEmpty, setShowEmpty] = useState(false);

  // Active drag tracking
  const [activeDrag, setActiveDrag] = useState(null);

  // State for double-clicked cell patents viewer
  const [selectedCellPatents, setSelectedCellPatents] = useState(null);
  const lastClickRef = useRef({ time: 0, x: null, y: null });

  const handlePlotClick = useCallback((eventData) => {
    if (!eventData || !eventData.points || eventData.points.length === 0) return;
    const point = eventData.points[0];
    const now = Date.now();
    const lastClick = lastClickRef.current;

    // Detect double click (less than 300ms) on the same cell
    if (now - lastClick.time < 300 && lastClick.x === point.x && lastClick.y === point.y) {
      const targetX = point.x;
      const targetY = point.y;

      // Find matching patents
      const matchedPatents = patents.filter(p => {
        const dimValues = xAxisDims.map(d => normalizeDimensionValue(p[d]));
        const xs = cartesianProduct(dimValues).map(combo => combo.join(' > '));
        const ys = normalizeDimensionValue(p[yAxisDim]);
        return xs.includes(targetX) && ys.includes(targetY);
      });

      // Deduplicate by patent publication number
      const uniquePatents = Array.from(
        new Map(matchedPatents.map(p => [p["專利公開公告號"], p])).values()
      );

      if (uniquePatents.length > 0) {
        setSelectedCellPatents({
          xLabel: targetX,
          yLabel: targetY,
          patents: uniquePatents
        });
      }
    }

    lastClickRef.current = {
      time: now,
      x: point.x,
      y: point.y
    };
  }, [patents, xAxisDims, yAxisDim]);

  const captureImage = useCallback(async () => {
    if (heatmapContainerRef.current) {
      try {
        const canvas = await html2canvas(heatmapContainerRef.current, {
          backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
          scale: 2,
          useCORS: true,
          ignoreElements: (el) => el.classList && el.classList.contains('app-bg')
        });
        const image = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = image;

        const now = new Date();
        const timestamp = now.toISOString().replace(/[-:.]/g, '').replace('T', '_').slice(0, 15);
        a.download = `heatmap_${timestamp}.png`;
        a.click();

        // Log PNG download usage event (including estimated file size)
        if (authState?.session_id) {
          // Estimate PNG size from base64 data URL
          const base64Data = image.split(',')[1] || '';
          const padding = (base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0);
          const fileSizeBytes = Math.floor((base64Data.length * 3) / 4) - padding;
          fetch('/api/usage/log-png', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: authState.session_id, file_size_bytes: fileSizeBytes })
          }).catch(err => console.error("Failed to log PNG download", err));
        }
      } catch (err) {
        console.error("Failed to capture heatmap image", err);
      }
    }
  }, [theme, authState]);

  // Expose captureImage to parent via callback
  useEffect(() => {
    if (onCaptureReady) {
      onCaptureReady(() => captureImage);
    }
  }, [captureImage, onCaptureReady]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Compute raw matrix
  const rawMatrix = useMemo(() => {
    if (!yAxisDim || xAxisDims.length === 0) return { x: [], y: [], z: [] };
    return buildHeatmapMatrix(patents, xAxisDims, yAxisDim);
  }, [patents, xAxisDims, yAxisDim]);

  // Apply sparse filtering
  const { matrixData, removedCols, removedRows } = useMemo(() => {
    if (showEmpty || rawMatrix.z.length === 0) {
      return { matrixData: rawMatrix, removedCols: 0, removedRows: 0 };
    }
    const filtered = filterSparseMatrix(rawMatrix);
    return { matrixData: { x: filtered.x, y: filtered.y, z: filtered.z }, removedCols: filtered.removedCols, removedRows: filtered.removedRows };
  }, [rawMatrix, showEmpty]);

  // Coolwarm colorscale
  const coolwarmScale = [
    [0.0, '#3b4cc0'],
    [0.25, '#7faef0'],
    [0.5, '#f7f7f7'],
    [0.75, '#f4a582'],
    [1.0, '#b2182b']
  ];

  // Annotations (per-cell count labels)
  const cellAnnotations = useMemo(() => {
    if (!matrixData?.z?.length) return [];
    const maxVal = Math.max(...matrixData.z.map(row => Math.max(...row)), 1);
    const list = [];
    matrixData.z.forEach((row, yi) => {
      row.forEach((val, xi) => {
        const vNorm = val / maxVal;
        const textColor = (vNorm >= 0.35 && vNorm <= 0.65) ? '#0f172a' : '#ffffff';
        list.push({
          x: matrixData.x[xi],
          y: matrixData.y[yi],
          text: val > 0 ? String(val) : '',
          showarrow: false,
          font: { size: 13, family: 'Outfit, Inter, system-ui, sans-serif', color: textColor }
        });
      });
    });
    return list;
  }, [matrixData]);

  // DnD handlers
  const handleDragStart = useCallback((event) => {
    const { active } = event;
    let zone, dimId;
    if (String(active.id).includes(':')) {
      [zone, dimId] = active.id.split(':');
    } else {
      zone = 'xAxis';
      dimId = active.id;
    }
    const dim = ALL_DIMENSIONS.find(d => d.id === dimId);
    setActiveDrag({ zone, dim });
  }, []);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over) return;

    let srcZone, dimId;
    if (String(active.id).includes(':')) {
      [srcZone, dimId] = active.id.split(':');
    } else {
      srcZone = 'xAxis';
      dimId = active.id;
    }

    let destZone = over.id;
    if (destZone !== 'available' && destZone !== 'xAxis' && destZone !== 'yAxis') {
      destZone = 'xAxis';
    }

    if (srcZone === destZone) {
      // Reorder within X-axis list
      if (srcZone === 'xAxis') {
        setZones(prev => {
          const oldIdx = prev.xAxis.indexOf(dimId);
          // over.id may be 'xAxis' (zone) or a specific dimId when sorting
          const newIdx = prev.xAxis.indexOf(over.id);
          if (oldIdx !== -1 && newIdx !== -1) {
            return { ...prev, xAxis: arrayMove(prev.xAxis, oldIdx, newIdx) };
          }
          return prev;
        });
      }
      return;
    }

    setZones(prev => {
      const next = {
        available: [...prev.available],
        xAxis: [...prev.xAxis],
        yAxis: [...prev.yAxis]
      };

      // Remove from source zone
      next[srcZone] = next[srcZone].filter(id => id !== dimId);

      // Add to destination
      if (destZone === 'yAxis') {
        // Y-axis only holds one item: swap it out to available
        if (next.yAxis.length > 0) {
          const displaced = next.yAxis[0];
          next.available = [...next.available.filter(id => id !== dimId), displaced];
        }
        next.yAxis = [dimId];
      } else if (destZone === 'xAxis') {
        if (!next.xAxis.includes(dimId)) {
          next.xAxis = [...next.xAxis, dimId];
        }
      } else if (destZone === 'available') {
        if (!next.available.includes(dimId)) {
          next.available = [...next.available, dimId];
        }
      }

      return next;
    });
  }, []);

  // Remove a dimension from X-axis back to available
  const removeFromX = useCallback((dimId) => {
    setZones(prev => ({
      ...prev,
      xAxis: prev.xAxis.filter(id => id !== dimId),
      available: [...prev.available, dimId]
    }));
  }, []);

  // Remove Y-axis dimension back to available
  const removeFromY = useCallback(() => {
    setZones(prev => ({
      ...prev,
      yAxis: [],
      available: [...prev.available, ...prev.yAxis]
    }));
  }, []);

  const getDim = (id) => ALL_DIMENSIONS.find(d => d.id === id);

  const hasData = xAxisDims.length > 0 && !!yAxisDim && matrixData.z.length > 0;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        minHeight: '80vh',
        overflow: 'hidden',
        background: theme === 'dark' ? '#0f172a' : '#ffffff',
        color: theme === 'dark' ? '#cbd5e1' : '#1e293b',
        transition: 'all 0.3s ease',
        position: 'relative'
      }}>

        {/* ── Left Sidebar: Axis Configuration ── */}
        <div style={{
          width: '230px',
          flexShrink: 0,
          padding: '1.25rem 1rem 80px 1rem', // Bottom padding of 80px to avoid Start New button overlap
          borderRight: theme === 'dark' ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
          background: theme === 'dark' ? 'rgba(70, 198, 245, 0.6)' : 'rgba(70, 198, 245, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          overflowY: 'auto'
        }}>
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: '700', color: theme === 'dark' ? '#e2e8f0' : '#1e293b', letterSpacing: '0.02em' }}>
              📊 軸維度配置
            </h3>
            <p style={{ margin: 0, fontSize: '0.72rem', color: theme === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.6)', lineHeight: 1.5 }}>
              拖曳維度標籤到 X 軸或 Y 軸
            </p>
          </div>

          {/* Available pool */}
          <DroppableZone
            id="available"
            label="可用維度"
            hint="（此處無維度）"
            isEmpty={zones.available.length === 0}
            accent="slate"
            theme={theme}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {zones.available.map(id => {
                const dim = getDim(id);
                if (!dim) return null;
                return (
                  <DraggableChip key={id} dim={dim} zone="available" color="slate" theme={theme} />
                );
              })}
            </div>
          </DroppableZone>

          {/* X Axis drop zone */}
          <DroppableZone
            id="xAxis"
            label="X 軸維度（可多層，串接顯示）"
            hint="拖曳維度到此處"
            isEmpty={zones.xAxis.length === 0}
            accent="cyan"
            theme={theme}
          >
            <SortableContext items={zones.xAxis} strategy={verticalListSortingStrategy}>
              {zones.xAxis.map(id => {
                const dim = getDim(id);
                if (!dim) return null;
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ flex: 1 }}>
                      <SortableXChip dim={dim} theme={theme} />
                    </div>
                    <button
                      onClick={() => removeFromX(id)}
                      title="移回可用維度"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: theme === 'dark' ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0,0,0,0.4)',
                        cursor: 'pointer',
                        padding: '0.2rem',
                        display: 'flex',
                        alignItems: 'center',
                        borderRadius: '50%',
                        transition: 'color 0.2s'
                      }}
                      onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseOut={e => e.currentTarget.style.color = theme === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)'}
                    >
                      <XIcon size={13} />
                    </button>
                  </div>
                );
              })}
            </SortableContext>
          </DroppableZone>

          {/* Y Axis drop zone */}
          <DroppableZone
            id="yAxis"
            label="Y 軸維度（單一維度）"
            hint="拖曳一個維度到此處"
            isEmpty={zones.yAxis.length === 0}
            accent="purple"
            theme={theme}
          >
            {zones.yAxis.map(id => {
              const dim = getDim(id);
              if (!dim) return null;
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <div style={{ flex: 1 }}>
                    <DraggableChip dim={dim} zone="yAxis" color="purple" theme={theme} />
                  </div>
                  <button
                    onClick={removeFromY}
                    title="移回可用維度"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)',
                      cursor: 'pointer',
                      padding: '0.2rem',
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: '50%',
                      transition: 'color 0.2s'
                    }}
                    onMouseOver={e => e.currentTarget.style.color = '#ef4444'}
                    onMouseOut={e => e.currentTarget.style.color = theme === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)'}
                  >
                    <XIcon size={13} />
                  </button>
                </div>
              );
            })}
          </DroppableZone>

          {/* Sparse filter toggle */}
          <div style={{
            padding: '0.75rem',
            background: showEmpty
              ? theme === 'dark' ? 'rgba(168,85,247,0.08)' : 'rgba(168,85,247,0.05)'
              : theme === 'dark' ? 'rgba(14,165,233,0.08)' : 'rgba(14,165,233,0.05)',
            borderRadius: '0.6rem',
            border: `1px solid ${showEmpty
              ? theme === 'dark' ? 'rgba(168,85,247,0.25)' : 'rgba(168,85,247,0.2)'
              : theme === 'dark' ? 'rgba(14,165,233,0.25)' : 'rgba(14,165,233,0.2)'}`,
            transition: 'all 0.3s ease'
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none' }}>
              <div
                onClick={() => setShowEmpty(v => !v)}
                style={{
                  width: '36px',
                  height: '20px',
                  borderRadius: '999px',
                  background: showEmpty
                    ? theme === 'dark' ? 'rgba(169, 85, 247, 0.7)' : 'rgba(168,85,247,0.8)'
                    : theme === 'dark' ? 'rgba(14,165,233,0.7)' : 'rgba(14,165,233,0.8)',
                  position: 'relative',
                  transition: 'background 0.3s ease',
                  flexShrink: 0,
                  cursor: 'pointer',
                  boxShadow: showEmpty ? '0 0 8px rgba(168,85,247,0.5)' : '0 0 8px rgba(14,165,233,0.5)'
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '3px',
                  left: showEmpty ? '19px' : '3px',
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.25s ease',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
                }} />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: '700', color: showEmpty ? (theme === 'dark' ? '#d8b4fe' : '#9333ea') : (theme === 'dark' ? '#7dd3fc' : '#0284c7') }}>
                  {showEmpty ? '顯示全部' : '過濾空行/列'}
                </div>
                <div style={{ fontSize: '0.66rem', color: theme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.65)', marginTop: '1px' }}>
                  {showEmpty ? '顯示所有零值行列' : '已隱藏全為零的行/列'}
                </div>
              </div>
            </label>
          </div>

          {/* Summary info */}
          <div style={{
            marginTop: 'auto',
            padding: '0.75rem',
            background: theme === 'dark' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
            borderRadius: '0.5rem',
            border: theme === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
            fontSize: '0.75rem',
            color: theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.7)',
            lineHeight: 1.6
          }}>
            <div>📄 <strong style={{ color: theme === 'dark' ? '#94a3b8' : '#475569' }}>專利分類總數：</strong>{patents.length}</div>
            <div>📐 <strong style={{ color: theme === 'dark' ? '#94a3b8' : '#475569' }}>全矩陣：</strong>{rawMatrix.x.length} × {rawMatrix.y.length}</div>
            {!showEmpty && (removedCols > 0 || removedRows > 0) && (
              <div style={{ color: 'rgba(251,191,36,0.7)', fontSize: '0.68rem' }}>
                ✂️ 已過濾 {removedCols > 0 ? `${removedCols} 欄` : ''}{removedCols > 0 && removedRows > 0 ? '、' : ''}{removedRows > 0 ? `${removedRows} 列` : ''}
              </div>
            )}
            <div>📐 <strong style={{ color: theme === 'dark' ? '#94a3b8' : '#475569' }}>顯示矩陣：</strong>{matrixData.x.length} × {matrixData.y.length}</div>
            <div style={{ marginTop: '0.4rem', fontSize: '0.68rem', color: theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.45)' }}>
              ✱ 每格為相異專利件數，同一件可計入多格
            </div>
          </div>
        </div>

        {/* ── Main Heatmap Area ── */}
        <div ref={heatmapContainerRef} className={`heatmap-theme-${theme}`} style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          padding: '1.25rem',
          background: theme === 'dark' ? '#0f172a' : '#ffffff',
          position: 'relative',
          transition: 'all 0.3s ease'
        }}>

          {/* Theme switcher */}
          <div style={{
            position: 'absolute',
            top: '1rem',
            right: '1.25rem',
            zIndex: 10,
            background: 'rgba(0,0,0,0.5)',
            padding: '0.4rem',
            borderRadius: '2rem',
            display: 'flex',
            gap: '0.4rem',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <button
              title="不透明黑色"
              onClick={() => setTheme('dark')}
              style={{
                background: theme === 'dark' ? '#0ea5e9' : 'transparent',
                border: 'none',
                color: '#fff',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Moon size={14} />
            </button>
            <button
              title="不透明白色"
              onClick={() => setTheme('light')}
              style={{
                background: theme === 'light' ? '#0ea5e9' : 'transparent',
                border: 'none',
                color: '#fff',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Sun size={14} />
            </button>
          </div>

          {/* Chart title bar */}
          <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: theme === 'dark' ? '#f1f5f9' : '#0f172a' }}>
                🔥 專利相關性Heatmap
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: theme === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.55)' }}>
                {hasData
                  ? `Y: ${yAxisDim}  &  X: ${xAxisDims.join(' > ')}`
                  : '請在左側配置 X 軸與 Y 軸維度'}
              </p>
            </div>
            {hasData && !showEmpty && (removedCols > 0 || removedRows > 0) && (
              <div style={{
                fontSize: '0.72rem',
                color: 'rgba(251,191,36,0.8)',
                background: 'rgba(251,191,36,0.08)',
                border: '1px solid rgba(251,191,36,0.2)',
                borderRadius: '0.4rem',
                padding: '0.3rem 0.65rem',
                whiteSpace: 'nowrap'
              }}>
                ✂️ 已過濾 {removedCols + removedRows} 個空行/列
              </div>
            )}
          </div>

          {/* Heatmap or empty state */}
          <div style={{
            flex: 1,
            background: theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
            borderRadius: '1rem',
            border: theme === 'dark' ? '1px solid rgba(255,255,255,0.07)' : '1px solid rgba(0,0,0,0.05)',
            minHeight: '450px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden'
          }}>
            {!hasData ? (
              <div style={{ textAlign: 'center', color: theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.45)' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📊</div>
                <div style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.4rem', color: theme === 'dark' ? '#e2e8f0' : '#1e293b' }}>尚未選擇維度</div>
                <div style={{ fontSize: '0.85rem' }}>請將至少一個維度拖曳到 X 軸，<br />並選擇一個維度作為 Y 軸。</div>
              </div>
            ) : (
              <Plot
                data={[{
                  z: matrixData.z,
                  x: matrixData.x,
                  y: matrixData.y,
                  type: 'heatmap',
                  colorscale: coolwarmScale,
                  showscale: true,
                  colorbar: {
                    tickfont: { color: theme === 'dark' ? '#cbd5e1' : '#334155', family: 'Outfit, Inter, sans-serif', size: 10 },
                    thickness: 14,
                    len: 0.8
                  },
                  hovertemplate:
                    '<b>X 軸 (技術)</b>: %{x}<br>' +
                    '<b>Y 軸 (功效)</b>: %{y}<br>' +
                    '<b>專利件數</b>: %{z} 件<extra></extra>'
                }]}
                layout={{
                  title: {
                    text: `${yAxisDim} vs ${xAxisDims.join(' > ')}`,
                    font: { family: 'Outfit, Inter, system-ui, sans-serif', size: 16, color: theme === 'dark' ? '#cbd5e1' : '#1e293b' }
                  },
                  autosize: true,
                  paper_bgcolor: 'rgba(0,0,0,0)',
                  plot_bgcolor: 'rgba(0,0,0,0)',
                  margin: { l: 160, r: 40, t: 60, b: 160 },
                  xaxis: {
                    tickangle: -45,
                    tickfont: { family: 'Outfit, Inter, system-ui, sans-serif', size: 11, color: theme === 'dark' ? '#94a3b8' : '#334155' },
                    gridcolor: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                    zeroline: false
                  },
                  yaxis: {
                    tickfont: { family: 'Outfit, Inter, system-ui, sans-serif', size: 12, color: theme === 'dark' ? '#94a3b8' : '#334155' },
                    gridcolor: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                    zeroline: false
                  },
                  annotations: cellAnnotations
                }}
                config={{ responsive: true, displayModeBar: false, doubleClick: false }}
                onClick={handlePlotClick}
                useResizeHandler={true}
                style={{ width: '100%', height: '100%' }}
              />
            )}
          </div>
        </div>

        {/* Patent details slide-out panel */}
        {selectedCellPatents && (
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '450px',
            height: '100%',
            background: theme === 'dark' ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)',
            borderLeft: `1px solid ${theme === 'dark' ? 'rgba(14, 165, 233, 0.3)' : 'rgba(14, 165, 233, 0.2)'}`,
            zIndex: 20,
            backdropFilter: 'blur(10px)',
            color: theme === 'dark' ? '#f1f5f9' : '#1e293b',
            boxShadow: theme === 'dark' ? '-10px 0 20px rgba(0,0,0,0.5)' : '-10px 0 20px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'all 0.3s ease'
          }}>

            {/* Sticky Header Section */}
            <div style={{
              background: theme === 'dark' ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)',
              zIndex: 30,
              padding: '1.5rem 1.5rem 0.5rem 1.5rem',
              borderBottom: `1px solid ${theme === 'dark' ? 'rgba(14, 165, 233, 0.2)' : 'rgba(14, 165, 233, 0.1)'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
                <h3 style={{
                  fontSize: '1.2rem',
                  color: theme === 'dark' ? '#38bdf8' : '#0284c7',
                  margin: 0,
                  fontWeight: '700'
                }}>
                  📊 專利分類詳情
                </h3>
                <button
                  onClick={() => setSelectedCellPatents(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: '1.5rem',
                    lineHeight: 1,
                    padding: '0.2rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%'
                  }}
                >
                  &times;
                </button>
              </div>

              {/* Labels and Patent Count */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.8rem' }}>
                <div style={{ fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: '600', color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>X軸分類標籤：</span>
                  <span style={{
                    fontSize: '0.8rem',
                    background: theme === 'dark' ? 'rgba(14, 165, 233, 0.15)' : 'rgba(14, 165, 233, 0.08)',
                    color: theme === 'dark' ? '#38bdf8' : '#0284c7',
                    borderRadius: '0.3rem',
                    padding: '0.15rem 0.4rem',
                    display: 'inline-block',
                    marginTop: '0.2rem',
                    border: `1px solid ${theme === 'dark' ? 'rgba(14, 165, 233, 0.3)' : 'rgba(14, 165, 233, 0.15)'}`
                  }}>
                    {selectedCellPatents.xLabel}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: '600', color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>Y軸分類標籤：</span>
                  <span style={{
                    fontSize: '0.8rem',
                    background: theme === 'dark' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(168, 85, 247, 0.08)',
                    color: theme === 'dark' ? '#c084fc' : '#9333ea',
                    borderRadius: '0.3rem',
                    padding: '0.15rem 0.4rem',
                    display: 'inline-block',
                    marginTop: '0.2rem',
                    border: `1px solid ${theme === 'dark' ? 'rgba(168, 85, 247, 0.3)' : 'rgba(168, 85, 247, 0.15)'}`
                  }}>
                    {selectedCellPatents.yLabel}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                  <span style={{ fontWeight: '600', color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>專利數量：</span>
                  <span style={{
                    fontWeight: '700',
                    color: theme === 'dark' ? '#10b981' : '#059669',
                    background: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.08)',
                    borderRadius: '0.3rem',
                    padding: '0.15rem 0.5rem',
                    fontSize: '0.8rem'
                  }}>
                    {selectedCellPatents.patents.length} 件
                  </span>
                </div>
              </div>
            </div>

            {/* Scrollable Patent Content Section */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
              {selectedCellPatents.patents.map((p, i) => (
                <div
                  key={i}
                  style={{
                    padding: '1.2rem',
                    background: theme === 'dark' ? 'rgba(14, 165, 233, 0.03)' : 'rgba(14, 165, 233, 0.01)',
                    marginBottom: '1rem',
                    borderRadius: '0.6rem',
                    border: `1px solid ${theme === 'dark' ? 'rgba(14, 165, 233, 0.12)' : 'rgba(14, 165, 233, 0.08)'}`,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                  }}
                >
                  <h4 style={{
                    color: theme === 'dark' ? '#38bdf8' : '#0284c7',
                    margin: '0 0 0.8rem 0',
                    fontSize: '1.05rem',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}>
                    🔖 {p['專利公開公告號'] || '無號碼'}
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    <p style={{ fontSize: '0.88rem', margin: 0, color: theme === 'dark' ? '#cbd5e1' : '#475569', lineHeight: '1.6' }}>
                      <strong style={{ color: theme === 'dark' ? '#f1f5f9' : '#0f172a', display: 'block', marginBottom: '0.2rem' }}>💡 AI 技術簡述:</strong>
                      {p['AI技術簡述']}
                    </p>
                    <p style={{ fontSize: '0.88rem', margin: 0, color: theme === 'dark' ? '#cbd5e1' : '#475569', lineHeight: '1.6' }}>
                      <strong style={{ color: theme === 'dark' ? '#f1f5f9' : '#0f172a', display: 'block', marginBottom: '0.2rem' }}>⚙️ 技術特徵手段:</strong>
                      {p['技術特徵手段']}
                    </p>
                    <p style={{ fontSize: '0.88rem', margin: 0, color: theme === 'dark' ? '#cbd5e1' : '#475569', lineHeight: '1.6' }}>
                      <strong style={{ color: theme === 'dark' ? '#f1f5f9' : '#0f172a', display: 'block', marginBottom: '0.2rem' }}>✅ 解決問題/效益:</strong>
                      {p['解決的技術問題或技術效益']}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Drag overlay ghost chip */}
      {createPortal(
        <DragOverlay modifiers={[snapCenterToCursor]}>
          {activeDrag?.dim && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.75rem',
              background: theme === 'dark' ? 'rgba(14,165,233,0.35)' : 'rgba(14,165,233,0.2)',
              border: theme === 'dark' ? '1px solid rgba(14,165,233,0.7)' : '1px solid rgba(14,165,233,0.5)',
              borderRadius: '0.5rem',
              fontSize: '0.85rem',
              color: theme === 'dark' ? '#7dd3fc' : '#0369a1',
              fontWeight: '600',
              boxShadow: theme === 'dark' ? '0 8px 20px rgba(14,165,233,0.3)' : '0 8px 20px rgba(14,165,233,0.1)',
              cursor: 'grabbing'
            }}>
              <GripVertical size={13} style={{ opacity: 0.6 }} />
              <span>{activeDrag.dim.emoji}</span>
              <span>{activeDrag.dim.label}</span>
            </div>
          )}
        </DragOverlay>,
        document.body
      )}
    </DndContext >
  );
};

export default HeatmapView;
