import React, { useState } from 'react';
import Loader from './Loader';
import MindMapTree from './MindMapTree';
import { Upload } from 'lucide-react';

const MindMapTab = () => {
  const [appState, setAppState] = useState('idle'); // idle, processing, tree
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
      setAppState('tree');
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
      setAppState('tree');
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Error occurred during reprocessing.');
      setAppState('tree');
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
      // Get filename from header or fallback
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

  return (
    <div className="mindmap-container animate-fade-in" style={{ padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {appState === 'idle' && (
        <div
          className={`upload-container glass-panel ${isDragging ? 'dragging' : ''}`}
          style={{
            textAlign: 'center',
            padding: '4rem 2rem',
            borderRadius: '1rem',
            border: isDragging ? '2px dashed var(--color-primary)' : '1px solid var(--color-border)',
            background: isDragging ? 'rgba(114, 217, 243, 0.6)' : 'var(--color-surface)',
            transition: 'all 0.3s ease',
            cursor: 'pointer'
          }}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <Upload size={48} color={isDragging ? 'var(--color-primary)' : 'var(--color-text)'} style={{ marginBottom: '1rem' }} />
          <h2>Upload Patent Data for Mind Map</h2>
          <p>Drag and drop your file here, or click to browse. Excel or PDF formats are supported.</p>
          <div style={{ marginTop: '2rem' }}>
            <label className="btn-primary" style={{ cursor: 'pointer', display: 'inline-block', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', background: 'var(--color-primary)', color: 'white' }}>
              Choose File
              <input type="file" accept=".xlsx, .xls, .pdf" style={{ display: 'none' }} onChange={handleUpload} />
            </label>
          </div>
          {errorMessage && <p style={{ color: 'var(--color-error)', marginTop: '1rem' }}>{errorMessage}</p>}
        </div>
      )}

      {appState === 'processing' && (
        <div className="processing-section glass-panel" style={{ padding: '4rem', borderRadius: '1rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', textAlign: 'center' }}>
          <Loader statusMessage="AI is analyzing and categorizing patents..." />
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
            <button onClick={handleExportExcel} className="btn-primary" style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: 'var(--color-primary)', color: 'white', cursor: 'pointer' }}>下載 Excel (AG)</button>
          </div>

          <div className="mindmap-tree-container glass-panel" style={{ flex: 1, position: 'relative', borderRadius: '1rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', overflow: 'hidden', minHeight: '600px' }}>
            <MindMapTree
              treeData={treeData}
              levelHierarchy={levelHierarchy}
              setLevelHierarchy={setLevelHierarchy}
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
