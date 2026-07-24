import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
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

const wrapTitle = (title, charsPerLine = 12) => {
    if (!title || title.length <= charsPerLine) return title;
    const lines = [];
    for (let i = 0; i < title.length; i += charsPerLine) {
        lines.push(title.slice(i, i + charsPerLine));
    }
    return lines.join('\n');
};

const buildTreeData = (patents, levels, title) => {
    const wrappedTitle = wrapTitle(title || '專利類別心智圖');
    const root = { name: wrappedTitle, children: [], patents: [], isRoot: true };
    if (!patents || !Array.isArray(patents)) return root;

    const addPatentToTree = (currentNode, patent, levelsIdx) => {
        // Track patent at every level node it passes through
        if (!currentNode.patents.some(p => p["專利公開公告號"] === patent["專利公開公告號"])) {
            currentNode.patents.push(patent);
        }

        if (levelsIdx >= levels.length) return;

        const levelKey = levels[levelsIdx].key;
        let nodeValues = patent[levelKey];

        // Normalize to array
        if (!nodeValues || (Array.isArray(nodeValues) && nodeValues.length === 0)) {
            nodeValues = ['其他'];
        } else if (typeof nodeValues === 'string') {
            if (nodeValues.includes(',') || nodeValues.includes('、')) {
                nodeValues = nodeValues.split(/[,、]/).map(s => s.trim()).filter(Boolean);
            } else {
                nodeValues = [nodeValues.trim()];
            }
        } else if (!Array.isArray(nodeValues)) {
            nodeValues = [String(nodeValues)];
        }

        // Deduplicate the chosen categories for this level
        nodeValues = [...new Set(nodeValues)];

        nodeValues.forEach(val => {
            let childNode = currentNode.children.find(c => c.name === val);
            if (!childNode) {
                childNode = { name: val, children: [], patents: [] };
                currentNode.children.push(childNode);
            }
            addPatentToTree(childNode, patent, levelsIdx + 1);
        });
    };

    patents.forEach(patent => addPatentToTree(root, patent, 0));

    const updateCountsAndIds = (node, pathId) => {
        node._id = pathId;
        // Use the count of unique patents at this specific node level
        node.count = node.patents ? node.patents.length : 0;

        if (node.children && node.children.length > 0) {
            node.children.forEach((child, i) => updateCountsAndIds(child, `${pathId}-${i}`));
        }
    };
    updateCountsAndIds(root, 'root');
    return root;
};

const generateMarkdown = (node, depth = 0) => {
    let result = '';
    // For root node (depth=0), preserve \n for multi-line rendering
    const safeName = (depth === 0)
        ? (node.name ? node.name.replace(/#/g, '') : '未命名')
        : (node.name ? node.name.replace(/\n/g, ' ').replace(/#/g, '') : '未命名');
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

const MindMapTree = ({ treeData, levelHierarchy, setLevelHierarchy, onCaptureReady, authState }) => {
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
        return buildTreeData(patentsArray, levelHierarchy, treeData.summary_title || treeData.mind_map_title || "專利類別心智圖");
    }, [treeData, levelHierarchy]);

    const captureImage = useCallback(async () => {
        if (treeContainerRef.current) {
            try {
                const canvas = await html2canvas(treeContainerRef.current, {
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
                a.download = `markmap_cyber_${timestamp}.png`;
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
                console.error("Failed to capture image", err);
            }
        }
    }, [theme, authState]);

    // Expose captureImage to parent via callback
    useEffect(() => {
        if (onCaptureReady) {
            onCaptureReady(() => captureImage);
        }
    }, [captureImage, onCaptureReady]);

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
                while (node && node !== svgRef.current) {
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
                    const findNodeById = (node, id, currentPath = []) => {
                        const newPath = node.isRoot ? [] : [...currentPath, node.name];
                        if (node._id === id) return { node, path: newPath };
                        if (node.children) {
                            for (let c of node.children) {
                                const found = findNodeById(c, id, newPath);
                                if (found) return found;
                            }
                        }
                        return null;
                    };

                    const res = findNodeById(hierarchyData, clickedId);
                    if (res && res.node && !res.node.isRoot) {
                        const foundNode = res.node;
                        const pats = getAllPatents(foundNode);
                        // Deduplicate by Pub Number
                        const uniquePats = Array.from(new Map(pats.map(p => [p["專利公開公告號"], p])).values());
                        if (uniquePats.length > 0) {
                            setSelectedPatents({
                                category: foundNode.name,
                                path: res.path,
                                patents: uniquePats
                            });
                        }
                    }
                    return; // Successfully used exact match
                }

                // --- FALLBACK LOGIC ---
                const rawText = (nodeG.textContent || "").trim();
                if (!rawText) return;

                // Extract all valid names from tree
                const findAllNames = (node, list = []) => {
                    list.push(node.name ? node.name.replace(/\n/g, ' ').replace(/#/g, '') : "未命名");
                    if (node.children) node.children.forEach(c => findAllNames(c, list));
                    return list;
                };

                const allNames = findAllNames(hierarchyData).sort((a, b) => b.length - a.length);

                let matchedName = null;
                for (let n of allNames) {
                    if (rawText.includes(n)) {
                        matchedName = n;
                        break;
                    }
                }

                if (matchedName) {
                    const findNode = (node, name, currentPath = []) => {
                        const newPath = node.isRoot ? [] : [...currentPath, node.name];
                        const safeName = node.name ? node.name.replace(/\n/g, ' ').replace(/#/g, '') : "未命名";
                        if (safeName === name) return { node, path: newPath };
                        if (node.children) {
                            for (let c of node.children) {
                                const found = findNode(c, name, newPath);
                                if (found) return found;
                            }
                        }
                        return null;
                    };

                    const res = findNode(hierarchyData, matchedName);
                    if (res && res.node && !res.node.isRoot) {
                        const foundNode = res.node;
                        const pats = getAllPatents(foundNode);
                        const uniquePats = Array.from(new Map(pats.map(p => [p["專利公開公告號"], p])).values());
                        if (uniquePats.length > 0) {
                            setSelectedPatents({
                                category: foundNode.name,
                                path: res.path,
                                patents: uniquePats
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
                <div style={{ position: 'absolute', top: 0, right: 0, width: '450px', height: '100%', background: 'rgba(2, 6, 23, 0.95)', borderLeft: '1px solid rgba(6,182,212,0.5)', zIndex: 20, backdropFilter: 'blur(10px)', color: '#fff', boxShadow: '-10px 0 20px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                    {/* Sticky Header Section */}
                    <div style={{ background: 'rgba(2, 6, 23, 0.98)', zIndex: 30, padding: '1.5rem 1.5rem 0 1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                            <h3 style={{ fontSize: '1.2rem', color: '#22d3ee', margin: 0, textShadow: '0 0 5px rgba(34,211,238,0.5)' }}>
                                分類: {selectedPatents.category}
                                <span style={{ fontSize: '0.9rem', color: '#94a3b8', marginLeft: '0.5rem' }}>({selectedPatents.patents.length})</span>
                            </h3>
                            <button onClick={() => setSelectedPatents(null)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.8rem', lineHeight: 1 }}>&times;</button>
                        </div>

                        {/* Global Hierarchy Path Tags - Color Coded By Level */}
                        <div style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', borderBottom: '1px solid rgba(6,182,212,0.3)', paddingBottom: '1.2rem' }}>
                            {selectedPatents.path && selectedPatents.path.map((step, si) => {
                                const levelColors = [
                                    { bg: 'rgba(14,165,233,0.15)', text: '#38bdf8', border: 'rgba(14,165,233,0.3)' },
                                    { bg: 'rgba(99,102,241,0.15)', text: '#818cf8', border: 'rgba(99,102,241,0.3)' },
                                    { bg: 'rgba(16,185,129,0.15)', text: '#34d399', border: 'rgba(16,185,129,0.3)' },
                                    { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
                                    { bg: 'rgba(236,72,153,0.15)', text: '#f472b6', border: 'rgba(236,72,153,0.3)' }
                                ];
                                const currentColor = levelColors[si] || levelColors[levelColors.length - 1];
                                const nextColor = levelColors[si + 1] || levelColors[levelColors.length - 1];

                                return (
                                    <React.Fragment key={si}>
                                        <span style={{ fontSize: '0.75rem', background: currentColor.bg, color: currentColor.text, border: `1px solid ${currentColor.border}`, borderRadius: '0.3rem', padding: '0.15rem 0.5rem' }}>
                                            {step}
                                        </span>
                                        {si < selectedPatents.path.length - 1 && (
                                            <span style={{ color: nextColor.text, fontSize: '0.8rem', fontWeight: 'bold', margin: '0 0.1rem' }}>&gt;</span>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>

                    {/* Scrollable Patent content Section */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                        {selectedPatents.patents.map((p, i) => {
                            return (
                                <div key={i} style={{ padding: '1rem', background: 'rgba(6,182,212,0.05)', marginBottom: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(6,182,212,0.1)' }}>
                                    <h4 style={{ color: '#67e8f9', margin: '0 0 0.8rem 0', fontSize: '1.1rem' }}>🔖 {p['專利公開公告號'] || '無號碼'}</h4>
                                    <p style={{ fontSize: '0.9rem', marginBottom: '0.6rem', color: '#cbd5e1', lineHeight: '1.5' }}><strong style={{ color: '#e2e8f0' }}>💡 AI 技術簡述:</strong> <br /> {p['AI技術簡述']}</p>
                                    <p style={{ fontSize: '0.9rem', marginBottom: '0.6rem', color: '#cbd5e1', lineHeight: '1.5' }}><strong style={{ color: '#e2e8f0' }}>⚙️ 技術特徵手段:</strong> <br /> {p['技術特徵手段']}</p>
                                    <p style={{ fontSize: '0.9rem', color: '#cbd5e1', margin: 0, lineHeight: '1.5' }}><strong style={{ color: '#e2e8f0' }}>✅ 解決問題/效益:</strong> <br /> {p['解決的技術問題或技術效益']}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MindMapTree;

