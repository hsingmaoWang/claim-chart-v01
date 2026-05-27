import React, { useState } from 'react';
import Loader from './Loader';
import MindMapTree from './MindMapTree';
import { Upload, Plus, Trash2, RotateCcw, ArrowLeft, Check, Sparkles, Search, Layers, HelpCircle } from 'lucide-react';

const MindMapTab = () => {
  const [appState, setAppState] = useState('idle'); // idle, processing, review_stage1, processing_stage2, tree
  const [errorMessage, setErrorMessage] = useState('');
  const [fileInfo, setFileInfo] = useState(null);
  const [treeData, setTreeData] = useState(null);

  const [config, setConfig] = useState({
    app_area_count: '3~7',
    tech1_count: '3~5',
    tech2_count: '3~7',
    tech3_count: '3~5',
    efficacy_count: '3~5'
  });

  // order of levels for the tree. user can drag and drop these to reorder in MindMapTree
  const [levelHierarchy, setLevelHierarchy] = useState([
    { id: '1', name: '應用領域', key: '應用領域' },
    { id: '2', name: '技術1階', key: '技術1階' },
    { id: '3', name: '技術2階', key: '技術2階' },
    { id: '4', name: '技術3階', key: '技術3階' },
    { id: '5', name: '功效節點', key: '功效節點' }
  ]);

  const [isDragging, setIsDragging] = useState(false);
  const [captureImage, setCaptureImage] = useState(null);

  // Stage 1 Taxonomy States
  const [stage1Taxonomy, setStage1Taxonomy] = useState(null);
  const [stage1Patents, setStage1Patents] = useState([]);
  const [stage1Backup, setStage1Backup] = useState(null); // to allow resets
  const [patentSearch, setPatentSearch] = useState('');

  const processFile = async (file) => {
    if (!file) return;

    setAppState('processing');
    setErrorMessage('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/mindmap/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        let errMessage = `Server error: ${response.status}`;
        try {
          const errData = await response.json();
          if (errData && errData.detail) errMessage = errData.detail;
        } catch (e) { }
        throw new Error(errMessage);
      }

      const data = await response.json();
      setFileInfo({ file_id: data.file_id, filename: data.filename });
      setTreeData(data);

      if (data.is_stage1) {
        const taxonomy = {
          summary_title: data.summary_title || '專利分類心智圖',
          應用領域: data.應用領域 || [],
          功效節點: data.功效節點 || [],
          技術樹: data.技術樹 || []
        };
        setStage1Taxonomy(taxonomy);
        setStage1Patents(data.patents || []);
        setStage1Backup(JSON.parse(JSON.stringify({ taxonomy, patents: data.patents || [] })));
        setAppState('review_stage1');
      } else {
        setAppState('tree');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Error occurred during processing.');
      setAppState('idle');
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    await processFile(file);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleReprocess = async () => {
    if (!fileInfo) return;
    setAppState('processing');
    setErrorMessage('');

    try {
      const response = await fetch('/api/mindmap/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, file_id: fileInfo.file_id })
      });

      if (!response.ok) {
        let errMessage = `Server error: ${response.status}`;
        try {
          const errData = await response.json();
          if (errData && errData.detail) errMessage = errData.detail;
        } catch (e) { }
        throw new Error(errMessage);
      }
      const data = await response.json();
      setTreeData(data);

      if (data.is_stage1) {
        const taxonomy = {
          summary_title: data.summary_title || '專利分類心智圖',
          應用領域: data.應用領域 || [],
          功效節點: data.功效節點 || [],
          技術樹: data.技術樹 || []
        };
        setStage1Taxonomy(taxonomy);
        setStage1Patents(data.patents || []);
        setStage1Backup(JSON.parse(JSON.stringify({ taxonomy, patents: data.patents || [] })));
        setAppState('review_stage1');
      } else {
        setAppState('tree');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Error occurred during reprocessing.');
      setAppState('tree');
    }
  };

  const handleGenerateStage2 = async () => {
    if (!fileInfo) return;
    setAppState('processing_stage2');
    setErrorMessage('');

    try {
      const response = await fetch('/api/mindmap/generate_stage2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: fileInfo.file_id,
          taxonomy: stage1Taxonomy,
          patents: stage1Patents,
          config: config
        })
      });

      if (!response.ok) {
        let errMessage = `Server error: ${response.status}`;
        try {
          const errData = await response.json();
          if (errData && errData.detail) errMessage = errData.detail;
        } catch (e) { }
        throw new Error(errMessage);
      }
      const data = await response.json();
      setTreeData(data);
      setAppState('tree');
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Error occurred during Stage 2 processing.');
      setAppState('review_stage1');
    }
  };

  const handleExportExcel = async () => {
    try {
      const response = await fetch('/api/mindmap/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(treeData)
      });

      if (!response.ok) throw new Error('Failed to export Excel');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      let filename = 'mind_map_export.xlsx';
      const disposition = response.headers.get('Content-Disposition');
      if (disposition && disposition.indexOf('filename=') !== -1) {
        const matches = disposition.match(/filename="?([^"]+)"?/);
        if (matches != null && matches[1]) filename = matches[1];
      }
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Failed to export.');
    }
  };

  const handleConfigChange = (e) => {
    setConfig({ ...config, [e.target.name]: e.target.value });
  };

  const handleStartNew = () => {
    setAppState('idle');
    setTreeData(null);
    setFileInfo(null);
    setErrorMessage('');
  };

  const handleResetStage1 = () => {
    if (!stage1Backup) return;
    setStage1Taxonomy(JSON.parse(JSON.stringify(stage1Backup.taxonomy)));
    setStage1Patents(JSON.parse(JSON.stringify(stage1Backup.patents)));
  };

  // --- Category Synchronization Helper Functions ---

  const addDomain = (name) => {
    if (stage1Taxonomy.應用領域.includes(name)) return;
    setStage1Taxonomy({
      ...stage1Taxonomy,
      應用領域: [...stage1Taxonomy.應用領域, name]
    });
  };

  const deleteDomain = (index) => {
    const name = stage1Taxonomy.應用領域[index];
    const filtered = stage1Taxonomy.應用領域.filter((_, i) => i !== index);
    setStage1Taxonomy({ ...stage1Taxonomy, 應用領域: filtered });
    setStage1Patents(stage1Patents.map(p => {
      const remaining = p.應用領域.filter(d => d !== name);
      return {
        ...p,
        應用領域: remaining.length > 0 ? remaining : ['其他']
      };
    }));
  };

  const renameDomain = (index, newName) => {
    const oldName = stage1Taxonomy.應用領域[index];
    const updated = [...stage1Taxonomy.應用領域];
    updated[index] = newName;
    setStage1Taxonomy({ ...stage1Taxonomy, 應用領域: updated });
    setStage1Patents(stage1Patents.map(p => ({
      ...p,
      應用領域: p.應用領域.map(d => d === oldName ? newName : d)
    })));
  };

  const addEfficacy = (name) => {
    if (stage1Taxonomy.功效節點.includes(name)) return;
    setStage1Taxonomy({
      ...stage1Taxonomy,
      功效節點: [...stage1Taxonomy.功效節點, name]
    });
  };

  const deleteEfficacy = (index) => {
    const name = stage1Taxonomy.功效節點[index];
    const filtered = stage1Taxonomy.功效節點.filter((_, i) => i !== index);
    setStage1Taxonomy({ ...stage1Taxonomy, 功效節點: filtered });
    setStage1Patents(stage1Patents.map(p => {
      const remaining = p.功效節點.filter(e => e !== name);
      return {
        ...p,
        功效節點: remaining.length > 0 ? remaining : ['其他']
      };
    }));
  };

  const renameEfficacy = (index, newName) => {
    const oldName = stage1Taxonomy.功效節點[index];
    const updated = [...stage1Taxonomy.功效節點];
    updated[index] = newName;
    setStage1Taxonomy({ ...stage1Taxonomy, 功效節點: updated });
    setStage1Patents(stage1Patents.map(p => ({
      ...p,
      功效節點: p.功效節點.map(e => e === oldName ? newName : e)
    })));
  };

  const addT1 = (name) => {
    if (stage1Taxonomy.技術樹.some(item => item.技術1階 === name)) return;
    setStage1Taxonomy({
      ...stage1Taxonomy,
      技術樹: [...stage1Taxonomy.技術樹, { 技術1階: name, 技術2階: [] }]
    });
  };

  const deleteT1 = (t1Index) => {
    const oldName = stage1Taxonomy.技術樹[t1Index].技術1階;
    const updated = stage1Taxonomy.技術樹.filter((_, i) => i !== t1Index);
    setStage1Taxonomy({ ...stage1Taxonomy, 技術樹: updated });
    setStage1Patents(stage1Patents.map(p => {
      const remainingPaths = p.技術路徑.filter(path => path[0] !== oldName);
      return {
        ...p,
        技術路徑: remainingPaths.length > 0 ? remainingPaths : [['其他', '其他']]
      };
    }));
  };

  const renameT1 = (t1Index, newName) => {
    const oldName = stage1Taxonomy.技術樹[t1Index].技術1階;
    const updated = [...stage1Taxonomy.技術樹];
    updated[t1Index].技術1階 = newName;
    setStage1Taxonomy({ ...stage1Taxonomy, 技術樹: updated });
    setStage1Patents(stage1Patents.map(p => ({
      ...p,
      技術路徑: p.技術路徑.map(path => path[0] === oldName ? [newName, path[1]] : path)
    })));
  };

  const addT2 = (t1Index, name) => {
    if (stage1Taxonomy.技術樹[t1Index].技術2階.includes(name)) return;
    const updated = [...stage1Taxonomy.技術樹];
    updated[t1Index].技術2階 = [...updated[t1Index].技術2階, name];
    setStage1Taxonomy({ ...stage1Taxonomy, 技術樹: updated });
  };

  const handleAppendT1 = () => {
    const name = window.prompt('請輸入新的技術 1 階類別名稱：');
    if (name && name.trim()) addT1(name.trim());
  };

  const handleAppendT2 = (t1Index) => {
    const name = window.prompt(`請輸入「${stage1Taxonomy.技術樹[t1Index].技術1階}」底下新的技術 2 階名稱：`);
    if (name && name.trim()) addT2(t1Index, name.trim());
  };

  const deleteT2 = (t1Index, t2Index) => {
    const t1Name = stage1Taxonomy.技術樹[t1Index].技術1階;
    const oldT2Name = stage1Taxonomy.技術樹[t1Index].技術2階[t2Index];
    const updated = [...stage1Taxonomy.技術樹];
    updated[t1Index].技術2階 = updated[t1Index].技術2階.filter((_, i) => i !== t2Index);
    setStage1Taxonomy({ ...stage1Taxonomy, 技術樹: updated });
    setStage1Patents(stage1Patents.map(p => {
      const remainingPaths = p.技術路徑.filter(path => !(path[0] === t1Name && path[1] === oldT2Name));
      return {
        ...p,
        技術路徑: remainingPaths.length > 0 ? remainingPaths : [[t1Name, '其他']]
      };
    }));
  };

  const renameT2 = (t1Index, t2Index, newName) => {
    const t1Name = stage1Taxonomy.技術樹[t1Index].技術1階;
    const oldT2Name = stage1Taxonomy.技術樹[t1Index].技術2階[t2Index];
    const updated = [...stage1Taxonomy.技術樹];
    updated[t1Index].技術2階[t2Index] = newName;
    setStage1Taxonomy({ ...stage1Taxonomy, 技術樹: updated });
    setStage1Patents(stage1Patents.map(p => ({
      ...p,
      技術路徑: p.技術路徑.map(path => (path[0] === t1Name && path[1] === oldT2Name) ? [t1Name, newName] : path)
    })));
  };

  const filteredPatents = stage1Patents.filter(p =>
    p.專利公開公告號.toLowerCase().includes(patentSearch.toLowerCase())
  );

  return (
    <div className="mindmap-container animate-fade-in" style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>

      {appState === 'idle' && (
        <div
          className={`upload-container glass-panel ${isDragging ? 'dragging' : ''}`}
          style={{
            textAlign: 'center',
            padding: '4rem 2rem',
            borderRadius: '1.5rem',
            border: isDragging ? '2px dashed var(--color-primary)' : '1px solid var(--color-border)',
            background: isDragging ? 'rgba(34, 211, 238, 0.2)' : 'var(--color-surface)',
            transition: 'all 0.3s ease',
            cursor: 'pointer',
            marginTop: '2rem'
          }}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <Upload size={52} color={isDragging ? 'var(--color-secondary)' : 'var(--color-text)'} style={{ marginBottom: '1rem' }} />
          <h2 style={{ fontSize: '1.8rem', marginBottom: '0.8rem' }}>Upload Patent Data for Mind Map</h2>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>Drag and drop your file here, or click to browse. Excel formats are supported.</p>
          <div>
            <label className="btn-primary" style={{ cursor: 'pointer', display: 'inline-flex', padding: '0.75rem 2rem', borderRadius: '0.75rem', background: 'var(--color-primary)', color: 'white', fontWeight: 'bold' }}>
              Choose File
              <input type="file" accept=".xlsx, .xls, .pdf" style={{ display: 'none' }} onChange={handleUpload} />
            </label>
          </div>
          {errorMessage && <p style={{ color: 'var(--color-error)', marginTop: '1.5rem', fontWeight: '500' }}>{errorMessage}</p>}
        </div>
      )}

      {appState === 'processing' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="processing-section glass-panel" style={{ padding: '5rem 3rem', borderRadius: '1.5rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', textAlign: 'center', width: '100%', maxWidth: '600px' }}>
            <Loader statusMessage="AI is analyzing and modeling patent taxonomy tree (Stage 1)..." />
          </div>
        </div>
      )}

      {appState === 'processing_stage2' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="processing-section glass-panel" style={{ padding: '5rem 3rem', borderRadius: '1.5rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', textAlign: 'center', width: '100%', maxWidth: '600px' }}>
            <Loader statusMessage="AI is subdividing patents and generating technical level 3 (Stage 2 Strategy B)..." />
          </div>
        </div>
      )}

      {appState === 'review_stage1' && stage1Taxonomy && (
        <div className="taxonomy-review-workspace" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', margin: '0 auto', height: 'calc(100vh - 8rem)', maxHeight: 'calc(100vh - 8rem)', overflow: 'hidden' }}>
          {/* Header Action Bar */}
          <div className="glass-panel" style={{ padding: '1rem 1.5rem', borderRadius: '1rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: '300px' }}>
              <Layers size={24} color="var(--color-primary)" />
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>第一階段分類心智圖名稱</span>
                <input
                  value={stage1Taxonomy.summary_title}
                  onChange={(e) => setStage1Taxonomy({ ...stage1Taxonomy, summary_title: e.target.value })}
                  style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--color-border)', fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--color-text)', outline: 'none', padding: '2px 0', width: '90%' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                onClick={handleResetStage1}
                className="btn-secondary"
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}
              >
                <RotateCcw size={16} /> 重置
              </button>
              <button
                onClick={handleStartNew}
                className="btn-secondary"
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}
              >
                <ArrowLeft size={16} /> 重新上傳
              </button>
              <button
                onClick={handleGenerateStage2}
                className="btn-primary"
                style={{ padding: '0.6rem 1.5rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem', background: 'var(--color-primary)', border: 'none', color: 'white', fontWeight: 'bold', boxShadow: '0 4px 10px var(--color-primary-glow)' }}
              >
                <Sparkles size={16} /> 🚀 生成技術 3 階
              </button>
            </div>
          </div>

          {/* Grid Columns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1.1fr', gap: '1rem', flex: 1, overflow: 'hidden', height: '100%' }}>

            {/* Column 1: Domain & Efficacy */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', overflow: 'hidden' }}>
              {/* Domain Card */}
              <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-text)', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>🎯 1. 應用領域校正</span>
                  <span style={{ fontSize: '0.75rem', background: 'var(--color-primary-glow)', color: 'var(--color-primary)', padding: '2px 8px', borderRadius: '0.5rem' }}>
                    {stage1Taxonomy.應用領域.length} 個
                  </span>
                </h3>
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.2rem', marginBottom: '1rem' }}>
                  {stage1Taxonomy.應用領域.map((domain, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                      <input
                        value={domain}
                        onChange={(e) => renameDomain(index, e.target.value)}
                        style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '0.4rem', border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.4)', color: 'var(--color-text)', fontSize: '0.9rem' }}
                      />
                      <button
                        onClick={() => deleteDomain(index)}
                        style={{ border: 'none', background: 'transparent', color: 'var(--color-error)', cursor: 'pointer', padding: '0.2rem' }}
                        title="刪除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => addDomain(`新領域_${stage1Taxonomy.應用領域.length + 1}`)}
                  className="btn-secondary"
                  style={{ padding: '0.4rem 1rem', borderRadius: '0.4rem', width: '100%', fontSize: '0.85rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Plus size={14} /> 新增應用領域
                </button>
              </div>

              {/* Efficacy Card */}
              <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-text)', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>⚡ 2. 功效節點校正</span>
                  <span style={{ fontSize: '0.75rem', background: 'var(--color-primary-glow)', color: 'var(--color-primary)', padding: '2px 8px', borderRadius: '0.5rem' }}>
                    {stage1Taxonomy.功效節點.length} 個
                  </span>
                </h3>
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.2rem', marginBottom: '1rem' }}>
                  {stage1Taxonomy.功效節點.map((eff, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                      <input
                        value={eff}
                        onChange={(e) => renameEfficacy(index, e.target.value)}
                        style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '0.4rem', border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.4)', color: 'var(--color-text)', fontSize: '0.9rem' }}
                      />
                      <button
                        onClick={() => deleteEfficacy(index)}
                        style={{ border: 'none', background: 'transparent', color: 'var(--color-error)', cursor: 'pointer', padding: '0.2rem' }}
                        title="刪除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => addEfficacy(`新功效_${stage1Taxonomy.功效節點.length + 1}`)}
                  className="btn-secondary"
                  style={{ padding: '0.4rem 1rem', borderRadius: '0.4rem', width: '100%', fontSize: '0.85rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Plus size={14} /> 新增功效節點
                </button>
              </div>
            </div>

            {/* Column 2: Tech Levels 1-2 */}
            <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-text)', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🛠️ 3. 技術 1-2 階分類校正</span>
                <span style={{ fontSize: '0.75rem', background: 'var(--color-primary-glow)', color: 'var(--color-primary)', padding: '2px 8px', borderRadius: '0.5rem' }}>
                  {stage1Taxonomy.技術樹.length} 階
                </span>
              </h3>
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.2rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {stage1Taxonomy.技術樹.map((t1Item, t1Idx) => (
                  <div key={t1Idx} style={{ border: '1px solid rgba(255,255,255,0.2)', borderRadius: '0.75rem', padding: '0.8rem', background: 'rgba(255,255,255,0.15)' }}>
                    {/* T1 Header */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', background: 'var(--color-primary)', color: 'white', padding: '2px 6px', borderRadius: '0.25rem', fontWeight: 'bold' }}>1階</span>
                      <input
                        value={t1Item.技術1階}
                        onChange={(e) => renameT1(t1Idx, e.target.value)}
                        style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '0.4rem', border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.5)', color: 'var(--color-text)', fontSize: '0.9rem', fontWeight: 'bold' }}
                      />
                      <button
                        onClick={() => deleteT1(t1Idx)}
                        style={{ border: 'none', background: 'transparent', color: 'var(--color-error)', cursor: 'pointer', padding: '0.2rem' }}
                        title="刪除整條分支"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* T2 List */}
                    <div style={{ paddingLeft: '1.25rem', borderLeft: '2px dashed rgba(255,255,255,0.3)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {t1Item.技術2階.map((t2Item, t2Idx) => (
                        <div key={t2Idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.7rem', background: 'rgba(34, 211, 238, 0.8)', color: '#083344', padding: '1px 5px', borderRadius: '0.25rem', fontWeight: 'bold' }}>2階</span>
                          <input
                            value={t2Item}
                            onChange={(e) => renameT2(t1Idx, t2Idx, e.target.value)}
                            style={{ flex: 1, padding: '0.3rem 0.5rem', borderRadius: '0.3rem', border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.4)', color: 'var(--color-text)', fontSize: '0.85rem' }}
                          />
                          <button
                            onClick={() => deleteT2(t1Idx, t2Idx)}
                            style={{ border: 'none', background: 'transparent', color: 'var(--color-error)', cursor: 'pointer', padding: '0.1rem' }}
                            title="刪除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => handleAppendT2(t1Idx)}
                        className="btn-secondary"
                        style={{ padding: '0.25rem 0.6rem', borderRadius: '0.3rem', alignSelf: 'flex-start', fontSize: '0.75rem', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                      >
                        <Plus size={12} /> 新增 2 階
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={handleAppendT1}
                className="btn-secondary"
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', width: '100%', fontSize: '0.9rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem' }}
              >
                <Plus size={16} /> 新增技術 1 階類別
              </button>
            </div>

            {/* Column 3: Patents Preview */}
            <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-text)', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🔍 4. 專利映射狀態預覽</span>
                <span style={{ fontSize: '0.75rem', background: 'var(--color-primary-glow)', color: 'var(--color-primary)', padding: '2px 8px', borderRadius: '0.5rem' }}>
                  {stage1Patents.length} 件
                </span>
              </h3>

              {/* Search input */}
              <div style={{ position: 'relative', marginBottom: '1rem' }}>
                <Search size={16} color="var(--color-text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  placeholder="搜尋公開號..."
                  value={patentSearch}
                  onChange={(e) => setPatentSearch(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem 0.6rem 0.4rem 2rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.4)', color: 'var(--color-text)', outline: 'none', fontSize: '0.85rem' }}
                />
              </div>

              {/* Patent list */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {filteredPatents.map((pat, idx) => (
                  <div key={idx} style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(255, 255, 255, 0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-text)', marginBottom: '0.4rem' }}>
                      🔖 {pat.專利公開公告號}
                    </div>
                    {/* Path tags */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.75rem' }}>
                      <div>
                        <span style={{ color: 'var(--color-text-muted)', fontWeight: 'bold' }}>技術: </span>
                        {pat.技術路徑 && pat.技術路徑.map((p, pIdx) => (
                          <div key={pIdx} style={{ display: 'inline-block', background: 'rgba(8,145,178,0.15)', color: '#0891b2', padding: '1px 6px', borderRadius: '0.25rem', margin: '1px 2px' }}>
                            {p[0]} &gt; {p[1]}
                          </div>
                        ))}
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-muted)', fontWeight: 'bold' }}>領域: </span>
                        {pat.應用領域 && pat.應用領域.map((d, dIdx) => (
                          <span key={dIdx} style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '1px 6px', borderRadius: '0.25rem', margin: '1px 2px', display: 'inline-block' }}>
                            {d}
                          </span>
                        ))}
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-muted)', fontWeight: 'bold' }}>功效: </span>
                        {pat.功效節點 && pat.功效節點.map((e, eIdx) => (
                          <span key={eIdx} style={{ background: 'rgba(245,158,11,0.15)', color: '#d97706', padding: '1px 6px', borderRadius: '0.25rem', margin: '1px 2px', display: 'inline-block' }}>
                            {e}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

      {appState === 'tree' && treeData && (
        <div className="mindmap-workspace" style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '1rem', height: '100%', minWidth: '70vw', width: '100%' }}>

          <div className="mindmap-controls glass-panel" style={{ padding: '1rem', borderRadius: '1rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <label>應用領域:</label>
              <input name="app_area_count" value={config.app_area_count} onChange={handleConfigChange} style={{ width: '60px', padding: '0.25rem' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <label>技術1階:</label>
              <input name="tech1_count" value={config.tech1_count} onChange={handleConfigChange} style={{ width: '60px', padding: '0.25rem' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <label>技術2階:</label>
              <input name="tech2_count" value={config.tech2_count} onChange={handleConfigChange} style={{ width: '60px', padding: '0.25rem' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <label>技術3階:</label>
              <input name="tech3_count" value={config.tech3_count} onChange={handleConfigChange} style={{ width: '60px', padding: '0.25rem' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <label>功效節點:</label>
              <input name="efficacy_count" value={config.efficacy_count} onChange={handleConfigChange} style={{ width: '60px', padding: '0.25rem' }} />
            </div>
            <button onClick={handleReprocess} className="btn-secondary" style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: 'var(--color-border)', cursor: 'pointer' }}>重新分類</button>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => captureImage && captureImage()} className="btn-primary" style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: 'rgba(6, 182, 212, 0.8)', color: 'white', cursor: 'pointer', border: '1px solid #67e8f9' }}>下載 PNG</button>
              <button onClick={handleExportExcel} className="btn-primary" style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: 'var(--color-primary)', color: 'white', cursor: 'pointer' }}>下載 Excel</button>
            </div>
          </div>

          <div className="mindmap-tree-container glass-panel" style={{ flex: 1, position: 'relative', borderRadius: '1rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', overflow: 'hidden', minHeight: '600px' }}>
            <MindMapTree
              treeData={treeData}
              levelHierarchy={levelHierarchy}
              setLevelHierarchy={setLevelHierarchy}
              onCaptureReady={setCaptureImage}
            />

            {/* Start New Button - Bottom Left of the result panel */}
            <button
              onClick={handleStartNew}
              className="btn-secondary"
              style={{
                position: 'absolute',
                bottom: '20px',
                left: '20px',
                zIndex: 20,
                padding: '0.6rem 1.2rem',
                borderRadius: '0.5rem',
                background: 'var(--color-primary)',
                border: '1px solid var(--color-border)',
                color: 'white',
                cursor: 'pointer',
                backdropFilter: 'blur(10px)',
                fontWeight: 'bold',
                boxShadow: '0 4px 15px var(--color-primary-glow)',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => e.target.style.background = 'var(--color-primary-hover)'}
              onMouseOut={(e) => e.target.style.background = 'var(--color-primary)'}
            >
              Start New
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MindMapTab;
