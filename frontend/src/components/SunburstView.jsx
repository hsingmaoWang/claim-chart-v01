import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-dist-min';
import { Sun, Moon, Layers, Filter } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const Plot = createPlotlyComponent(Plotly);

const SortableItem = ({ id, name }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: '0.55rem 0.85rem',
    margin: '0.3rem 0',
    background: 'rgba(14, 165, 233, 0.25)',
    color: '#f8fafc',
    borderRadius: '0.5rem',
    cursor: 'grab',
    userSelect: 'none',
    boxShadow: '0 4px 10px rgba(0, 0, 0, 0.25)',
    border: '1px solid rgba(56, 189, 248, 0.4)',
    fontSize: '0.85rem',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <span>{name}</span>
      <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>::</span>
    </div>
  );
};

// Generate distinct color palette per top branch and shades for sub-branches with rich contrast
const generateHierarchicalColors = (nodes, theme) => {
  const colorMap = {};
  const isDark = theme === 'dark';

  // High-contrast vibrant base hues for top-level categories
  const baseHues = [205, 145, 25, 280, 340, 175, 45, 220, 310, 110, 15, 260];
  const topNodes = nodes.filter(n => n.parent === 'root');

  topNodes.forEach((topNode, index) => {
    const hue = baseHues[index % baseHues.length];
    const baseSat = isDark ? 80 : 70;
    const baseLight = isDark ? 50 : 46;

    colorMap[topNode.id] = `hsl(${hue}, ${baseSat}%, ${baseLight}%)`;

    const assignChildColors = (parentId, parentHue, depth) => {
      const children = nodes.filter(n => n.parent === parentId);
      const childCount = children.length;

      children.forEach((child, cIdx) => {
        // Shift hue across siblings for clear visual distinction between categories
        const hueSpread = Math.min(60, childCount * 14);
        const hueShift = childCount > 1 
          ? -hueSpread / 2 + (cIdx / (childCount - 1)) * hueSpread 
          : 0;
        const childHue = (parentHue + hueShift + 360) % 360;

        const lightStep = isDark ? (cIdx % 2 === 0 ? 6 : -6) : (cIdx % 2 === 0 ? -6 : 6);
        const satStep = isDark ? (cIdx % 2 === 0 ? -4 : 4) : (cIdx % 2 === 0 ? -4 : 4);

        const childLight = Math.max(25, Math.min(78, baseLight + depth * 5 + lightStep));
        const childSat = Math.max(40, Math.min(92, baseSat + satStep));

        colorMap[child.id] = `hsl(${Math.round(childHue)}, ${Math.round(childSat)}%, ${Math.round(childLight)}%)`;
        assignChildColors(child.id, childHue, depth + 1);
      });
    };

    assignChildColors(topNode.id, hue, 1);
  });

  // Root node rendered with container background color to form clean inner donut ring
  colorMap['root'] = isDark ? '#0f172a' : '#ffffff';

  return colorMap;
};

const SunburstView = ({
  treeData,
  levelHierarchy,
  showOtherCategories = true,
  setShowOtherCategories,
  onCaptureReady,
  authState
}) => {
  const [theme, setTheme] = useState('dark');
  const [selectedNodePatents, setSelectedNodePatents] = useState(null);
  const [maxDepth, setMaxDepth] = useState(0); // 0 means show all levels
  const containerRef = useRef(null);

  // Local hierarchy state for Sunburst (initialized with parent levelHierarchy)
  const [sunburstHierarchy, setSunburstHierarchy] = useState(levelHierarchy);
  const [isCustomized, setIsCustomized] = useState(false);

  // Keep synced with parent levelHierarchy if not user-customized
  useEffect(() => {
    if (!isCustomized) {
      setSunburstHierarchy(levelHierarchy);
    }
  }, [levelHierarchy, isCustomized]);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setIsCustomized(true);
      setSunburstHierarchy((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleResetHierarchy = () => {
    setIsCustomized(false);
    setSunburstHierarchy(levelHierarchy);
  };

  // Build hierarchical structure for Plotly Sunburst
  const sunburstData = useMemo(() => {
    if (!treeData) return null;

    let patentsArray = treeData.patents;
    if (!patentsArray || !Array.isArray(patentsArray)) {
      for (const key in treeData) {
        if (Array.isArray(treeData[key])) {
          patentsArray = treeData[key];
          break;
        }
      }
    }
    if (!patentsArray || !Array.isArray(patentsArray)) patentsArray = [];

    const title = treeData.summary_title || treeData.mind_map_title || '專利類別旭日圖';

    // Map to accumulate nodes
    const nodeMap = new Map();

    // Root node
    nodeMap.set('root', {
      id: 'root',
      name: title,
      parent: '',
      patentsMap: new Map(),
      path: [],
      depth: 0,
      realCount: patentsArray.length,
      visualValue: 100.0
    });

    // Helper to recursively traverse and attach patents to sub-tree
    const addPatentToSunburst = (currentParentId, currentPath, patent, levelIdx, pubNo) => {
      if (levelIdx >= sunburstHierarchy.length) return;

      const levelKey = sunburstHierarchy[levelIdx].key;
      let values = patent[levelKey];

      if (!values || (Array.isArray(values) && values.length === 0)) {
        values = ['其他'];
      } else if (typeof values === 'string') {
        if (values.includes(',') || values.includes('、')) {
          values = values.split(/[,、]/).map(s => s.trim()).filter(Boolean);
        } else {
          values = [values.trim()];
        }
      } else if (!Array.isArray(values)) {
        values = [String(values)];
      }

      values = [...new Set(values)];

      if (!showOtherCategories) {
        values = values.filter(v => v !== '其他');
      }

      values.forEach(val => {
        const nodeId = `${currentParentId} >>> ${val}`;
        const nodePath = [...currentPath, val];

        if (!nodeMap.has(nodeId)) {
          nodeMap.set(nodeId, {
            id: nodeId,
            name: val,
            parent: currentParentId,
            patentsMap: new Map(),
            path: nodePath,
            depth: levelIdx + 1,
            realCount: 0,
            visualValue: 0
          });
        }

        nodeMap.get(nodeId).patentsMap.set(pubNo, patent);

        // Recursively navigate down to next level
        addPatentToSunburst(nodeId, nodePath, patent, levelIdx + 1, pubNo);
      });
    };

    // Populate all patents into tree
    patentsArray.forEach(patent => {
      const pubNo = patent['專利公開公告號'] || Math.random().toString();
      nodeMap.get('root').patentsMap.set(pubNo, patent);
      addPatentToSunburst('root', [], patent, 0, pubNo);
    });

    const nodesList = Array.from(nodeMap.values());
    nodesList.forEach(node => {
      node.realCount = node.patentsMap.size;
    });

    // Requirement 1: Recursively compute normalized visual values top-down for exact parent-child boundary alignment
    const computeVisualValues = (parentId, parentVisualValue) => {
      const children = nodesList.filter(n => n.parent === parentId && (n.realCount > 0 || n.id === 'root'));
      if (children.length === 0) return;

      const totalChildRealCount = children.reduce((sum, child) => sum + child.realCount, 0);

      children.forEach(child => {
        if (totalChildRealCount > 0) {
          child.visualValue = parentVisualValue * (child.realCount / totalChildRealCount);
        } else {
          child.visualValue = 0;
        }
        computeVisualValues(child.id, child.visualValue);
      });
    };

    computeVisualValues('root', 100.0);

    const ids = [];
    const labels = [];
    const parents = [];
    const values = [];
    const customdata = [];
    const patentsListPerNode = [];
    const nodeObjects = [];

    nodesList.forEach(node => {
      if (node.realCount === 0 && node.id !== 'root') return;

      ids.push(node.id);
      parents.push(node.parent);
      values.push(node.visualValue);
      customdata.push({ name: node.name, count: node.realCount });

      // Requirement 2: Place count on the second line (multi-line label with <br>)
      const formattedLabel = node.id === 'root' ? `${node.name}<br>${node.realCount} 件` : `${node.name}<br>${node.realCount} 件`;
      labels.push(formattedLabel);

      patentsListPerNode.push(Array.from(node.patentsMap.values()));
      nodeObjects.push(node);
    });

    const colorMap = generateHierarchicalColors(nodeObjects, theme);
    const colors = ids.map(id => colorMap[id] || '#38bdf8');

    return {
      ids,
      labels,
      parents,
      values,
      customdata,
      colors,
      patentsListPerNode,
      nodeObjects,
      totalPatents: patentsArray.length
    };
  }, [treeData, sunburstHierarchy, showOtherCategories, theme]);

  // Requirement 1f: Double-click detection for Plotly Sunburst
  const lastClickRef = useRef({ time: 0, id: null });

  const handleSunburstClick = useCallback((event) => {
    if (!event || !event.points || event.points.length === 0) return;
    const pt = event.points[0];
    const clickedId = pt.id || pt.pointNumber;
    const now = Date.now();
    const timeDiff = now - lastClickRef.current.time;

    if (timeDiff < 350 && lastClickRef.current.id === clickedId) {
      // Double click detected! Find node patents
      if (sunburstData) {
        const nodeIdx = sunburstData.ids.indexOf(clickedId);
        if (nodeIdx !== -1 && clickedId !== 'root') {
          const targetNode = sunburstData.nodeObjects[nodeIdx];
          const patents = sunburstData.patentsListPerNode[nodeIdx];
          if (patents && patents.length > 0) {
            setSelectedNodePatents({
              name: targetNode.name,
              path: targetNode.path,
              patents: patents
            });
          }
        }
      }
    }

    lastClickRef.current = { time: now, id: clickedId };
  }, [sunburstData]);

  // Capture Image logic for PNG download
  const captureImage = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    try {
      const bgColor = theme === 'dark' ? '#0f172a' : '#ffffff';
      const plotDiv = container.querySelector('.js-plotly-plot');

      let image;
      if (plotDiv) {
        const w = plotDiv.offsetWidth || container.offsetWidth || 1200;
        const h = plotDiv.offsetHeight || container.offsetHeight || 800;

        const dataUrl = await Plotly.toImage(plotDiv, {
          format: 'png',
          scale: 2,
          width: w,
          height: h,
        });

        image = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = reject;
          img.src = dataUrl;
        });
      } else {
        const rect = container.getBoundingClientRect();
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(rect.width * 2);
        canvas.height = Math.round(rect.height * 2);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        image = canvas.toDataURL('image/png');
      }

      const now = new Date();
      const timestamp = now.toISOString().replace(/[-:.]/g, '').replace('T', '_').slice(0, 15);
      const a = document.createElement('a');
      a.href = image;
      a.download = `sunburst_${timestamp}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      if (authState?.session_id) {
        const base64Data = image.split(',')[1] || '';
        const padding = (base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0);
        const fileSizeBytes = Math.floor((base64Data.length * 3) / 4) - padding;
        fetch('/api/usage/log-png', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: authState.session_id, file_size_bytes: fileSizeBytes })
        }).catch(err => console.error('Failed to log PNG download', err));
      }
    } catch (err) {
      console.error('Failed to capture sunburst image', err);
    }
  }, [theme, authState]);

  useEffect(() => {
    if (onCaptureReady) {
      onCaptureReady(() => captureImage);
    }
  }, [onCaptureReady, captureImage]);

  return (
    <div style={{ display: 'flex', width: '100%', minHeight: '80vh', height: '100%', position: 'relative' }}>
      {/* Sidebar for Sunburst Hierarchy Drag & Drop */}
      <div style={{
        width: '260px',
        padding: '1.25rem 1.25rem 4.5rem 1.25rem', // Issue 3 Fix: Bottom padding 4.5rem to ensure Tip box is raised above Start New button
        borderRight: theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
        background: theme === 'dark' ? 'rgba(15, 23, 42, 0.6)' : 'rgba(248, 250, 252, 0.8)',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        overflowY: 'auto'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: theme === 'dark' ? '#f1f5f9' : '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Layers size={16} color={theme === 'dark' ? '#38bdf8' : '#0284c7'} /> 旭日圖階層順序
            </h3>
            {isCustomized && (
              <button
                onClick={handleResetHierarchy}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  textDecoration: 'underline'
                }}
                title="恢復與心智圖連動"
              >
                連動復原
              </button>
            )}
          </div>
          <p style={{ fontSize: '0.72rem', color: theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.6)', margin: 0 }}>
            {isCustomized ? '⚡ 目前為旭日圖獨立階層順序' : '🔗 目前階層順序與心智圖連動中（拖曳即可獨立調整）'}
          </p>
        </div>

        {/* Drag and Drop context */}
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sunburstHierarchy.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {sunburstHierarchy.map((lvl) => (
              <SortableItem key={lvl.id} id={lvl.id} name={lvl.name} />
            ))}
          </SortableContext>
        </DndContext>

        {/* Show/Hide "Other" Category Checkbox (Requirement 2) */}
        <div style={{
          marginTop: '0.2rem',
          padding: '0.75rem',
          borderRadius: '0.6rem',
          background: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
          border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={showOtherCategories}
              onChange={(e) => setShowOtherCategories(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#0ea5e9' }}
            />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: '700', color: theme === 'dark' ? '#e2e8f0' : '#1e293b' }}>
                顯示「其他」類別
              </div>
              <div style={{ fontSize: '0.68rem', color: theme === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.55)', marginTop: '2px' }}>
                {showOtherCategories ? '顯示未分類之「其他」節點' : '已隱藏未分類之「其他」節點'}
              </div>
            </div>
          </label>
        </div>

        {/* Level Expansion/Collapse Depth Filter (Requirement 1f) */}
        <div style={{
          padding: '0.75rem',
          borderRadius: '0.6rem',
          background: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
          border: `1px solid ${theme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`
        }}>
          <div style={{ fontSize: '0.82rem', fontWeight: '700', color: theme === 'dark' ? '#e2e8f0' : '#1e293b', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Filter size={14} color="#0ea5e9" /> 顯現展開層級
          </div>
          <select
            value={maxDepth}
            onChange={(e) => setMaxDepth(Number(e.target.value))}
            style={{
              width: '100%',
              padding: '0.4rem 0.6rem',
              borderRadius: '0.4rem',
              fontSize: '0.8rem',
              border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`,
              background: theme === 'dark' ? '#0f172a' : '#ffffff',
              color: theme === 'dark' ? '#f8fafc' : '#0f172a',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value={0}>展開全部階層 (默認)</option>
            <option value={1}>僅顯示 Level 1 分支</option>
            <option value={2}>顯示至 Level 2 分支</option>
            <option value={3}>顯示至 Level 3 分支</option>
            <option value={4}>顯示至 Level 4 分支</option>
          </select>
        </div>

        {/* Usage hint (Raised up above Start New button) */}
        <div style={{
          marginTop: 'auto',
          marginBottom: '0.5rem',
          padding: '0.75rem',
          borderRadius: '0.6rem',
          background: theme === 'dark' ? 'rgba(56, 189, 248, 0.08)' : 'rgba(2, 132, 199, 0.06)',
          border: `1px solid ${theme === 'dark' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(2, 132, 199, 0.2)'}`,
          fontSize: '0.72rem',
          color: theme === 'dark' ? '#7dd3fc' : '#0284c7',
          lineHeight: 1.5
        }}>
          💡 <strong>操作提示：</strong><br />
          • 單擊類別：展開/聚焦該分支 (Zoom In)<br />
          • 單擊圓心：返回上一層 (Zoom Out)<br />
          • <strong>雙擊類別</strong>：開啟專利詳情面板
        </div>
      </div>

      {/* Main Chart Canvas */}
      <div ref={containerRef} style={{
        flex: 1,
        position: 'relative',
        background: theme === 'dark' ? '#0f172a' : '#ffffff',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {/* Theme Switcher */}
        <div style={{
          position: 'absolute',
          top: '1rem',
          left: '1rem',
          zIndex: 5,
          background: theme === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.06)',
          padding: '2px',
          borderRadius: '2rem',
          display: 'flex',
          gap: '0.2rem',
          border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`
        }}>
          <button
            title="夜間模式"
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
              cursor: 'pointer'
            }}
          >
            <Moon size={14} />
          </button>
          <button
            title="日間模式"
            onClick={() => setTheme('light')}
            style={{
              background: theme === 'light' ? '#0ea5e9' : 'transparent',
              border: 'none',
              color: theme === 'light' ? '#fff' : '#475569',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <Sun size={14} />
          </button>
        </div>

        {/* Requirement 4: Total Patent Count Stat Card at Top-Left */}
        <div style={{
          position: 'absolute',
          top: '3.6rem',
          left: '1rem',
          zIndex: 5,
          background: theme === 'dark' ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(10px)',
          padding: '0.55rem 0.85rem',
          borderRadius: '0.75rem',
          border: `1px solid ${theme === 'dark' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(2, 132, 199, 0.2)'}`,
          boxShadow: theme === 'dark' ? '0 4px 15px rgba(0,0,0,0.4)' : '0 4px 15px rgba(0,0,0,0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          pointerEvents: 'none',
          userSelect: 'none'
        }}>
          <div style={{ fontSize: '1.0rem', color: theme === 'dark' ? '#94a3b8' : '#64748b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            📊 專利分類總件次
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: theme === 'dark' ? '#38bdf8' : '#0284c7', lineHeight: 1.1 }}>
            {sunburstData?.totalPatents || 0} <span style={{ fontSize: '1.0rem', fontWeight: '500', color: theme === 'dark' ? '#cbd5e1' : '#475569' }}>件次</span>
          </div>
        </div>

        {/* Plotly Sunburst Render */}
        {sunburstData && (
          <Plot
            data={[{
              type: 'sunburst',
              ids: sunburstData.ids,
              labels: sunburstData.labels,
              parents: sunburstData.parents,
              values: sunburstData.values,
              customdata: sunburstData.customdata,
              branchvalues: 'total',
              maxdepth: maxDepth > 0 ? maxDepth + 1 : undefined,
              hovertemplate: '<b>%{customdata.name}</b><br>專利件數: %{customdata.count} 件<extra></extra>',
              textinfo: 'label',
              insidetextorientation: 'auto',
              insidetextfont: {
                family: 'Outfit, Inter, system-ui, sans-serif',
                size: 13,
                color: '#ffffff'
              },
              outsidetextfont: {
                family: 'Outfit, Inter, system-ui, sans-serif',
                size: 15,
                color: theme === 'dark' ? '#cbd5e1' : '#334155'
              },
              marker: {
                colors: sunburstData.colors,
                line: {
                  color: theme === 'dark' ? '#0f172a' : '#ffffff',
                  width: 1.5
                }
              }
            }]}
            layout={{
              autosize: true,
              margin: { l: 20, r: 20, t: 50, b: 10 },
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor: 'rgba(0,0,0,0)',
              sunburstcolorway: sunburstData.colors,
              title: {
                text: `${treeData?.summary_title || '專利分類旭日圖'}`,
                font: {
                  family: 'Outfit, Inter, system-ui, sans-serif',
                  size: 20,
                  color: theme === 'dark' ? '#f1f5f9' : '#0f172a'
                }
              }
            }}
            config={{
              responsive: true,
              displayModeBar: false,
              doubleClick: false
            }}
            onClick={handleSunburstClick}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </div>

      {/* Patent Details Slide-out Panel (Requirement 1f) */}
      {selectedNodePatents && (
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '450px',
          height: '100%',
          background: theme === 'dark' ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.98)',
          borderLeft: `1px solid ${theme === 'dark' ? 'rgba(56, 189, 248, 0.35)' : 'rgba(2, 132, 199, 0.25)'}`,
          zIndex: 30,
          backdropFilter: 'blur(12px)',
          color: theme === 'dark' ? '#f1f5f9' : '#1e293b',
          boxShadow: theme === 'dark' ? '-10px 0 25px rgba(0,0,0,0.6)' : '-10px 0 20px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            background: theme === 'dark' ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)',
            zIndex: 35,
            padding: '1.25rem 1.25rem 0.5rem 1.25rem',
            borderBottom: `1px solid ${theme === 'dark' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(2, 132, 199, 0.15)'}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <h3 style={{ fontSize: '1.15rem', color: theme === 'dark' ? '#38bdf8' : '#0284c7', margin: 0, fontWeight: '700' }}>
                🍩 分類專利詳情
              </h3>
              <button
                onClick={() => setSelectedNodePatents(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontSize: '1.5rem',
                  lineHeight: 1,
                  padding: '0.2rem'
                }}
              >
                &times;
              </button>
            </div>

            {/* Path and count */}
            <div style={{ marginBottom: '0.8rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
              {selectedNodePatents.path.map((step, si) => (
                <React.Fragment key={si}>
                  <span style={{
                    fontSize: '0.75rem',
                    background: theme === 'dark' ? 'rgba(14, 165, 233, 0.18)' : 'rgba(14, 165, 233, 0.1)',
                    color: theme === 'dark' ? '#38bdf8' : '#0284c7',
                    border: `1px solid ${theme === 'dark' ? 'rgba(14, 165, 233, 0.35)' : 'rgba(14, 165, 233, 0.2)'}`,
                    borderRadius: '0.3rem',
                    padding: '0.15rem 0.45rem',
                    fontWeight: '600'
                  }}>
                    {step}
                  </span>
                  {si < selectedNodePatents.path.length - 1 && (
                    <span style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: '0.75rem' }}>&gt;</span>
                  )}
                </React.Fragment>
              ))}
              <span style={{
                fontSize: '0.75rem',
                fontWeight: '700',
                color: '#10b981',
                background: 'rgba(16, 185, 129, 0.15)',
                padding: '0.15rem 0.5rem',
                borderRadius: '0.3rem',
                marginLeft: 'auto'
              }}>
                共 {selectedNodePatents.patents.length} 件
              </span>
            </div>
          </div>

          {/* Patent items list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
            {selectedNodePatents.patents.map((p, i) => (
              <div
                key={i}
                style={{
                  padding: '1.1rem',
                  background: theme === 'dark' ? 'rgba(14, 165, 233, 0.04)' : 'rgba(14, 165, 233, 0.02)',
                  marginBottom: '1rem',
                  borderRadius: '0.6rem',
                  border: `1px solid ${theme === 'dark' ? 'rgba(14, 165, 233, 0.15)' : 'rgba(14, 165, 233, 0.1)'}`,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.05)'
                }}
              >
                <h4 style={{
                  color: theme === 'dark' ? '#38bdf8' : '#0284c7',
                  margin: '0 0 0.75rem 0',
                  fontSize: '1rem',
                  fontWeight: '700'
                }}>
                  🔖 {i + 1}. {p['專利公開公告號'] || '無號碼'}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <p style={{ fontSize: '0.85rem', margin: 0, color: theme === 'dark' ? '#cbd5e1' : '#475569', lineHeight: '1.5' }}>
                    <strong style={{ color: theme === 'dark' ? '#f1f5f9' : '#0f172a', display: 'block', marginBottom: '0.15rem' }}>💡 AI 技術簡述:</strong>
                    {p['AI技術簡述']}
                  </p>
                  <p style={{ fontSize: '0.85rem', margin: 0, color: theme === 'dark' ? '#cbd5e1' : '#475569', lineHeight: '1.5' }}>
                    <strong style={{ color: theme === 'dark' ? '#f1f5f9' : '#0f172a', display: 'block', marginBottom: '0.15rem' }}>⚙️ 技術特徵手段:</strong>
                    {p['技術特徵手段']}
                  </p>
                  <p style={{ fontSize: '0.85rem', margin: 0, color: theme === 'dark' ? '#cbd5e1' : '#475569', lineHeight: '1.5' }}>
                    <strong style={{ color: theme === 'dark' ? '#f1f5f9' : '#0f172a', display: 'block', marginBottom: '0.15rem' }}>✅ 解決問題/效益:</strong>
                    {p['解決的技術問題或技術效益']}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SunburstView;
