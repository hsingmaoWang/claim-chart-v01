import React, { useState, useMemo, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { Download, Sun, Moon } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';

const transformer = new Transformer();

const SortableItem = ({ id, name }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: '0.5rem 1rem',
    margin: '0.25rem 0',
    background: 'rgba(6, 182, 212, 0.8)',
    color: 'white',
    borderRadius: '0.5rem',
    cursor: 'grab',
    userSelect: 'none',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
    border: '1px solid rgba(103, 232, 249, 0.5)'
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
  
  const updateCountsAndIds = (node, pathId) => {
    node._id = pathId;
    if (node.patents && node.patents.length > 0) {
      node.count = node.patents.length;
      return node.count;
    }
    if (node.children && node.children.length > 0) {
      const sum = node.children.reduce((acc, child, i) => acc + updateCountsAndIds(child, `${pathId}-${i}`), 0);
      node.count = sum;
      return sum;
    }
    node.count = 0;
    return 0;
  };
  updateCountsAndIds(root, 'root');
  return root;
};

const generateMarkdown = (node, depth = 0) => {
    let result = '';
    const safeName = node.name ? node.name.replace(/\n/g, ' ').replace(/#/g, '') : "未命名";
    const countText = (node.count && depth > 0) ? `(${node.count})` : '';
    const idSpan = `<span data-nodeid="${node._id}" style="display:none"></span>`;
    
    if (depth === 0) {
        result += `# ${idSpan}${safeName}\n`;
        if (node.children) {
            node.children.forEach(c => {
                result += generateMarkdown(c, 1);
            });
        }
    } else {
        const indent = '  '.repeat(depth - 1);
        result += `${indent}- ${idSpan}${safeName} ${countText}\n`;
        if (node.children) {
            node.children.forEach(c => {
                result += generateMarkdown(c, depth + 1);
            });
        }
    }
    return result;
};

const MindMapTree = ({ treeData, levelHierarchy, setLevelHierarchy }) => {
  const treeContainerRef = useRef(null);
  const svgRef = useRef(null);
  const markmapRef = useRef(null);
  const [selectedPatents, setSelectedPatents] = useState(null);
  const [theme, setTheme] = useState('dark');

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
    return buildTreeData(patentsArray, levelHierarchy, treeData.mind_map_title || "專利類別心智圖");
  }, [treeData, levelHierarchy]);

  const captureImage = async () => {
    if (treeContainerRef.current) {
      const canvas = await html2canvas(treeContainerRef.current, { 
          backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
          scale: 2 // Approximates roughly 150dpi+ depending on screen size
      });
      const image = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = image;
      a.download = "markmap_cyber.png";
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

  // Setup Markmap
  useEffect(() => {
    if (svgRef.current && hierarchyData) {
      if (!markmapRef.current) {
         markmapRef.current = Markmap.create(svgRef.current, {
           autoFit: true,
           initialExpandLevel: 2, 
           style: (id) => `
              .markmap-node { 
                 cursor: pointer; 
                 font-weight: bold; 
                 padding: 4px;
                 border-radius: 4px;
                 transition: text-shadow 0.2s ease-in-out;
              }

              .markmap-node:hover {
                 text-shadow: 0 0 8px var(--glow-color, #0ea5e9), 0 0 12px var(--glow-color, #0ea5e9) !important;
              }
              
              .mindmap-theme-dark .markmap-node { color: #ffffff !important; user-select: none; }
              .mindmap-theme-light .markmap-node { color: #000000 !important; user-select: none; }

              .mindmap-theme-dark .markmap-foreign { color: white !important; font-family: inherit; }
              .mindmap-theme-light .markmap-foreign { color: black !important; font-family: inherit; }

              .mindmap-theme-dark .markmap-circle { stroke-width: 2px !important; fill: #0f172a !important; }
              .mindmap-theme-light .markmap-circle { stroke-width: 2px !important; fill: #ffffff !important; }

              path.markmap-link, .markmap-link { 
                  fill: none !important; 
                  stroke-width: 2px !important; 
              }
           `
         });
      }

      const mkd = generateMarkdown(hierarchyData, 0);
      const { root } = transformer.transform(mkd);

      markmapRef.current.setData(root);
      markmapRef.current.fit();
    }
  }, [hierarchyData]);

  // Handle Markmap Mouse Over Dynamic Glow Color
  useEffect(() => {
     const handleMouseOver = (e) => {
         const nodeG = e.target.closest('g.markmap-node');
         if (nodeG) {
             let glowColor = '#0ea5e9'; // fallback
             const underline = nodeG.querySelector('line');
             if (underline) {
                 const comp = window.getComputedStyle(underline);
                 if (comp.stroke && comp.stroke !== 'none') {
                     glowColor = comp.stroke;
                 }
             }
             nodeG.style.setProperty('--glow-color', glowColor);
         }
     };

     const svgElem = svgRef.current;
     if (svgElem) {
        svgElem.addEventListener('mouseover', handleMouseOver);
     }
     return () => {
        if (svgElem) svgElem.removeEventListener('mouseover', handleMouseOver);
     };
  }, [hierarchyData]);

  // Handle Markmap Double Click
  useEffect(() => {
     const handleDoubleClick = (e) => {
         const path = e.composedPath ? e.composedPath() : [];
         let nodeG = path.find(el => el.tagName && el.tagName.toLowerCase() === 'g' && el.classList && el.classList.contains('markmap-node'));
         
         if (!nodeG) {
            let node = e.target;
            while(node && node !== svgRef.current) {
               if (node.tagName && node.tagName.toLowerCase() === 'g') { 
                   nodeG = node; 
                   break; 
               }
               node = node.parentNode;
            }
         }

         if (nodeG && hierarchyData) {
             let clickedId = null;
             // Find the injected span for accurate node identification
             const span = nodeG.querySelector('span[data-nodeid]');
             if (span) {
                 clickedId = span.getAttribute('data-nodeid');
             } else if (nodeG.__data__ && nodeG.__data__.data && nodeG.__data__.data.content) {
                 // Fallback: markmap might store the raw content in D3 data
                 const contentMatch = nodeG.__data__.data.content.match(/data-nodeid="([^"]+)"/);
                 if (contentMatch) clickedId = contentMatch[1];
             }

             if (clickedId) {
                 const findNodeById = (node, id) => {
                     if (node._id === id) return node;
                     if (node.children) {
                         for (let c of node.children) {
                             const found = findNodeById(c, id);
                             if (found) return found;
                         }
                     }
                     return null;
                 };
                 
                 const foundNode = findNodeById(hierarchyData, clickedId);
                 if (foundNode && !foundNode.isRoot) {
                     const pats = getAllPatents(foundNode);
                     if (pats.length > 0) {
                        setSelectedPatents({
                            category: foundNode.name,
                            patents: pats
                        });
                     }
                 }
                 return; // Successfully used exact match
             }

             // --- FALLBACK LOGIC ---
             const rawText = (nodeG.textContent || "").trim();
             if (!rawText) return;
             
             // Extract all valid names from tree to match safely against rawText
             const findAllNames = (node, list = []) => {
                 list.push(node.name ? node.name.replace(/\n/g, ' ').replace(/#/g, '') : "未命名");
                 if (node.children) node.children.forEach(c => findAllNames(c, list));
                 return list;
             };
             
             // sort by descending length to match "Category A" before "Category"
             const allNames = findAllNames(hierarchyData).sort((a,b) => b.length - a.length);
             
             let matchedName = null;
             for (let n of allNames) {
                 if (rawText.includes(n)) {
                     matchedName = n;
                     break;
                 }
             }

             if (matchedName) {
                 const findNode = (node, name) => {
                     const safeName = node.name ? node.name.replace(/\n/g, ' ').replace(/#/g, '') : "未命名";
                     if (safeName === name) return node;
                     if (node.children) {
                         for(let c of node.children) {
                            const found = findNode(c, name);
                            if(found) return found;
                         }
                     }
                     return null;
                 };
                 
                 const foundNode = findNode(hierarchyData, matchedName);
                 if (foundNode && !foundNode.isRoot) {
                     const pats = getAllPatents(foundNode);
                     if (pats.length > 0) {
                        setSelectedPatents({
                            category: foundNode.name,
                            patents: pats
                        });
                     }
                 }
             }
         }
     };

     const svgElem = svgRef.current;
     if (svgElem) {
        svgElem.addEventListener('dblclick', handleDoubleClick, true);
     }
     
     // Specifically disable D3's double-click zoom on the markmap instance to prevent conflict
     if (markmapRef.current && markmapRef.current.svg) {
         markmapRef.current.svg.on('dblclick.zoom', null);
     }

     return () => {
        if (svgElem) svgElem.removeEventListener('dblclick', handleDoubleClick, true);
     };
  }, [hierarchyData]);

  return (
    <div style={{ display: 'flex', width: '100%', minHeight: '80vh' }}>
      
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
        
        <button onClick={captureImage} className="btn-primary" style={{ marginTop: '2rem', width: '100%', display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center', padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(6, 182, 212, 0.8)', color: 'white', fontWeight: 'bold', border: '1px solid #67e8f9', boxShadow: '0 0 10px rgba(6,182,212,0.3)' }}>
           <Download size={20} /> 下載 PNG
        </button>
      </div>

      {/* Main Tree Canvas using Markmap */}
      <div ref={treeContainerRef} className={`mindmap-theme-${theme}`} style={{ flex: 1, position: 'relative', background: theme === 'dark' ? '#0f172a' : '#ffffff', overflow: 'hidden' }}>
         
         <div style={{ position: 'absolute', top: '1rem', left: '1rem', zIndex: 5, background: 'rgba(0,0,0,0.5)', padding: '0.5rem', borderRadius: '2rem', display: 'flex', gap: '0.5rem' }}>
            <button title="不透明黑色" onClick={() => setTheme('dark')} style={{ background: theme === 'dark' ? '#0ea5e9' : 'transparent', border: 'none', color: '#fff', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
               <Moon size={16} />
            </button>
            <button title="不透明白色" onClick={() => setTheme('light')} style={{ background: theme === 'light' ? '#0ea5e9' : 'transparent', border: 'none', color: '#fff', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
               <Sun size={16} />
            </button>
         </div>

         <svg ref={svgRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />
      </div>

      {/* Patent List Modal / Panel */}
      {selectedPatents && (
         <div style={{ position: 'absolute', top: 0, right: 0, width: '450px', height: '100%', background: 'rgba(2, 6, 23, 0.95)', borderLeft: '1px solid rgba(6,182,212,0.5)', padding: '1.5rem', overflowY: 'auto', zIndex: 20, backdropFilter: 'blur(10px)', color: '#fff', boxShadow: '-10px 0 20px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(6,182,212,0.3)', paddingBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.2rem', color: '#22d3ee', margin: 0, textShadow: '0 0 5px rgba(34,211,238,0.5)' }}>
                  分類: {selectedPatents.category} 
                  <span style={{ fontSize: '0.9rem', color: '#94a3b8', marginLeft: '0.5rem' }}>({selectedPatents.patents.length})</span>
                </h3>
                <button onClick={() => setSelectedPatents(null)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.8rem', lineHeight: 1 }}>&times;</button>
            </div>
            {selectedPatents.patents.map((p, i) => (
                <div key={i} style={{ padding: '1rem', background: 'rgba(6,182,212,0.05)', marginBottom: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(6,182,212,0.2)' }}>
                    <h4 style={{ color: '#67e8f9', margin: '0 0 1rem 0', fontSize: '1.1rem' }}>🔖 {p["專利公開公告號"] || '無號碼'}</h4>
                    <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: '#cbd5e1' }}><strong style={{color:'#e2e8f0'}}>💡 AI 技術簡述:</strong> <br/> {p["AI技術簡述"]}</p>
                    <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: '#cbd5e1' }}><strong style={{color:'#e2e8f0'}}>⚙️ 技術特徵手段:</strong> <br/> {p["技術特徵手段"]}</p>
                    <p style={{ fontSize: '0.9rem', color: '#cbd5e1', margin: 0 }}><strong style={{color:'#e2e8f0'}}>✅ 解決問題/效益:</strong> <br/> {p["解決的技術問題或技術效益"]}</p>
                </div>
            ))}
         </div>
      )}
    </div>
  );
};

export default MindMapTree;

