import React, { useState, useMemo, useRef } from 'react';
import Tree from 'react-d3-tree';
import html2canvas from 'html2canvas';
import { Download } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SortableItem = ({ id, name }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: '0.5rem 1rem',
    margin: '0.25rem 0',
    background: 'var(--color-primary)',
    color: 'white',
    borderRadius: '0.5rem',
    cursor: 'grab',
    userSelect: 'none',
    boxShadow: 'var(--shadow-sm)'
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {name}
    </div>
  );
};

const buildTreeData = (patents, levels, title) => {
  const root = { name: title || '專利類別心智圖', children: [], isRoot: true };
  if (!patents || !Array.isArray(patents)) return root;
  
  patents.forEach(patent => {
    let currentNode = root;
    
    levels.forEach((lvl, idx) => {
      const levelKey = lvl.key;
      const nodeValue = patent[levelKey] || `未分類 (${levelKey})`;
      
      let childNode = currentNode.children.find(c => c.name === nodeValue);
      if (!childNode) {
        childNode = { name: nodeValue, children: [], patents: [] };
        currentNode.children.push(childNode);
      }
      
      if (idx === levels.length - 1) {
        childNode.patents.push(patent);
      }
      
      currentNode = childNode;
    });
  });
  
  const updateCounts = (node) => {
    if (node.patents && node.patents.length > 0) {
      node.count = node.patents.length;
      return node.count;
    }
    if (node.children && node.children.length > 0) {
      const sum = node.children.reduce((acc, child) => acc + updateCounts(child), 0);
      node.count = sum;
      return sum;
    }
    node.count = 0;
    return 0;
  };
  updateCounts(root);
  return root;
};

const CustomNodeProps = ({ nodeDatum, toggleNode, onDoubleClick }) => {
  return (
    <g>
      <circle r={15} fill="#0d9488" stroke="#ffffff" onClick={toggleNode} />
      <text fill="#ffffff" strokeWidth="1" x="20" dy="5" style={{ fontSize: '14px', fill: '#ffffff', fontWeight: 'bold' }}>
        {nodeDatum.name} {nodeDatum.count !== undefined && !nodeDatum.isRoot ? `(${nodeDatum.count}件)` : ''}
      </text>
      <rect x="-15" y="-15" width="200" height="30" fill="transparent" cursor="pointer" onDoubleClick={() => onDoubleClick(nodeDatum)} onClick={toggleNode} />
    </g>
  );
};

const MindMapTree = ({ treeData, levelHierarchy, setLevelHierarchy }) => {
  const treeContainerRef = useRef(null);
  const [selectedPatents, setSelectedPatents] = useState(null);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLevelHierarchy((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const hierarchyData = useMemo(() => {
    if (!treeData) return null;
    
    // AI might generate JSON with unpredictable keys. Let's find the array.
    let patentsArray = treeData.patents;
    if (!patentsArray || !Array.isArray(patentsArray)) {
        // Search top-level keys for an array
        for (const key in treeData) {
            if (Array.isArray(treeData[key])) {
                patentsArray = treeData[key];
                break;
            }
        }
    }
    
    if (!patentsArray || !Array.isArray(patentsArray)) {
        patentsArray = []; // Fallback to empty array to at least render root node
    }
    
    return buildTreeData(patentsArray, levelHierarchy, treeData.mind_map_title || "專利類別心智圖");
  }, [treeData, levelHierarchy]);

  const captureImage = async () => {
    if (treeContainerRef.current) {
      const canvas = await html2canvas(treeContainerRef.current, { backgroundColor: '#06b6d4' });
      const image = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = image;
      a.download = "mindmap.png";
      a.click();
    }
  };

  const getAllPatents = (node) => {
      let pats = [];
      if (node.patents) pats = pats.concat(node.patents);
      if (node.children) {
          node.children.forEach(c => {
             pats = pats.concat(getAllPatents(c));
          });
      }
      return pats;
  };

  const handleNodeDoubleClick = (nodeDatum) => {
    if (nodeDatum.isRoot) return;
    const pats = getAllPatents(nodeDatum);
    if (pats.length > 0) {
        setSelectedPatents({
            category: nodeDatum.name,
            patents: pats
        });
    }
  };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', minHeight: '600px' }}>
      
      {/* Sidebar for hierarchy Drag & Drop */}
      <div style={{ width: '250px', padding: '1rem', borderRight: '1px solid rgba(255, 255, 255, 0.2)', background: 'rgba(255,255,255,0.05)', zIndex: 10 }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: '#fff' }}>拖曳改變階層順序</h3>
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={levelHierarchy.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {levelHierarchy.map((lvl) => (
              <SortableItem key={lvl.id} id={lvl.id} name={lvl.name} />
            ))}
          </SortableContext>
        </DndContext>
        
        <button onClick={captureImage} className="btn-primary" style={{ marginTop: '2rem', width: '100%', display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center', padding: '0.75rem', borderRadius: '0.5rem', background: '#0d9488', color: 'white', fontWeight: 'bold' }}>
           <Download size={20} /> 下載 PNG
        </button>
      </div>

      {/* Main Tree Canvas */}
      <div ref={treeContainerRef} style={{ flex: 1, position: 'relative', background: 'transparent' }}>
         <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            {hierarchyData && (
              <Tree 
                data={hierarchyData} 
                orientation="horizontal"
                pathFunc="step"
                initialDepth={1}
                translate={{ x: 50, y: 300 }}
                nodeSize={{ x: 250, y: 50 }}
                renderCustomNodeElement={(rd3tProps) => (
                   <CustomNodeProps {...rd3tProps} onDoubleClick={handleNodeDoubleClick} />
                )}
                styles={{
                    links: { stroke: 'rgba(255,255,255,0.5)', strokeWidth: 2 },
                }}
              />
            )}
         </div>
      </div>

      {/* Patent List Modal / Panel */}
      {selectedPatents && (
         <div style={{ position: 'absolute', top: 0, right: 0, width: '400px', height: '100%', background: 'rgba(10, 25, 47, 0.95)', borderLeft: '1px solid rgba(255,255,255,0.2)', padding: '1rem', overflowY: 'auto', zIndex: 20, backdropFilter: 'blur(10px)', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.2rem', color: '#38bdf8' }}>分類: {selectedPatents.category} ({selectedPatents.patents.length}件)</h3>
                <button onClick={() => setSelectedPatents(null)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
            </div>
            {selectedPatents.patents.map((p, i) => (
                <div key={i} style={{ padding: '1rem', background: 'rgba(255,255,255,0.1)', marginBottom: '1rem', borderRadius: '0.5rem' }}>
                    <h4 style={{ color: '#0d9488' }}>{p["專利公開公告號"] || '無號碼'}</h4>
                    <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: '#cbd5e1' }}><strong>💡 AI 技術簡述:</strong> <br/> {p["AI技術簡述"]}</p>
                    <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: '#cbd5e1' }}><strong>⚙️ 技術特徵手段:</strong> <br/> {p["技術特徵手段"]}</p>
                    <p style={{ fontSize: '0.9rem', color: '#cbd5e1' }}><strong>✅ 解決問題/效益:</strong> <br/> {p["解決的技術問題或技術效益"]}</p>
                </div>
            ))}
         </div>
      )}
    </div>
  );
};

export default MindMapTree;

