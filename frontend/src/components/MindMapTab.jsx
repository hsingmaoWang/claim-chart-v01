import React, { useState } from 'react';
import Loader from './Loader';
import MindMapTree from './MindMapTree';
import { Upload, Plus, Trash2, RotateCcw, ArrowLeft, Check, Sparkles, Search, Layers, HelpCircle, Edit2, X } from 'lucide-react';

const MindMapTab = () => {
  const [appState, setAppState] = useState('idle'); // idle, processing, review_stage1, processing_stage2, tree
  const [errorMessage, setErrorMessage] = useState('');
  const [fileInfo, setFileInfo] = useState(null);
  const [treeData, setTreeData] = useState(null);
  const [loaderMessage, setLoaderMessage] = useState('AI is analyzing and modeling patent taxonomy tree (Stage 1)...');

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

  // Definition Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('view'); // 'view', 'edit', 'add'
  const [modalData, setModalData] = useState({
    type: '', // '應用領域', '功效節點', '技術1階', '技術2階'
    index: -1,
    parentIndex: -1,
    name: '',
    definition: ''
  });
  const [tempName, setTempName] = useState('');
  const [tempDef, setTempDef] = useState('');

  // Resume / Restart dialog state
  const [resumeDialog, setResumeDialog] = useState(null); // null = 尚未顯示; { s1Count, s2Count } = 顯示中

  // Preprocessing States
  const [enableScreening, setEnableScreening] = useState(false);
  const [screeningCriteria, setScreeningCriteria] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [preprocessResult, setPreprocessResult] = useState(null);
  const [proceedToClassification, setProceedToClassification] = useState(true);

  const templates = [
    {
      id: 'packaging',
      name: '半導體先進封裝技術',
      text: '與半導體先進封裝結構、TSV、矽中介板、CoWoS 等封裝工藝設計相關的專利'
    },
    {
      id: 'ai_vision',
      name: 'AI 影像辨識與處理',
      text: '與人工智慧影像辨識、目標偵測、深度學習模型應用於圖像分析相關的專利'
    },
    {
      id: 'cooling',
      name: '晶片散熱結構與材料',
      text: '與晶片散熱鰭片、液冷管道、高熱導率散熱材料及結構設計相關的專利'
    }
  ];

  const handleTemplateChange = (e) => {
    const val = e.target.value;
    setSelectedTemplate(val);
    const found = templates.find(t => t.id === val);
    if (found) {
      setScreeningCriteria(found.text);
    } else {
      setScreeningCriteria('');
    }
  };

  const processFile = async (file) => {
    if (!file) return;

    setAppState('preprocessing');
    setLoaderMessage('AI 正在啟動專利讀取與預處理任務...');
    setErrorMessage('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('enable_screening', enableScreening);
    formData.append('screening_criteria', screeningCriteria);

    try {
      const response = await fetch('/api/mindmap/preprocess', {
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
      const taskId = data.task_id;
      const fileId = data.file_id;
      setFileInfo({ file_id: fileId, filename: file.name });

      const pollInterval = setInterval(async () => {
        try {
          const statusResp = await fetch(`/api/mindmap/preprocess_status?task_id=${taskId}`);
          if (!statusResp.ok) return;
          const statusData = await statusResp.json();

          if (statusData.status === 'processing') {
            const pct = statusData.total_count > 0
              ? Math.min(100, Math.round((statusData.completed_count / statusData.total_count) * 100))
              : 0;
            setLoaderMessage(`AI 正在進行專利資料讀取與 AI 預處理 (${pct}%)...`);
          } else if (statusData.status === 'completed') {
            clearInterval(pollInterval);
            setPreprocessResult(statusData.result);
            setAppState('review_preprocess');
          } else if (statusData.status === 'failed') {
            clearInterval(pollInterval);
            setErrorMessage(`預處理失敗: ${statusData.error}`);
            setAppState('idle');
          }
        } catch (pollErr) {
          console.error("Preprocessing polling error:", pollErr);
        }
      }, 2000);

    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Error occurred during preprocessing.');
      setAppState('idle');
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    await processFile(file);
  };

  const handleExportPreprocessExcel = async () => {
    if (!fileInfo) return;
    try {
      const response = await fetch(`/api/mindmap/export_preprocessed?file_id=${fileInfo.file_id}`);
      if (!response.ok) throw new Error('Failed to export preprocessed Excel');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `preprocessed_${fileInfo.filename}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('匯出預處理 Excel 失敗。');
    }
  };

  const handleProceedNext = async () => {
    if (!proceedToClassification) {
      handleStartNew();
      return;
    }

    setAppState('processing');
    setLoaderMessage('AI 正在依據初篩落入專利分析並建模全域分類樹 (Stage 1)...');
    setErrorMessage('');

    try {
      const response = await fetch('/api/mindmap/start_from_preprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: fileInfo.file_id,
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

      if (data.is_stage1) {
        const taxonomy = {
          summary_title: data.summary_title || '專利分類心智圖',
          應用領域: data.應用領域 || [],
          功效節點: data.功效節點 || [],
          技術樹: data.技術樹 || [],
          定義說明: data.定義說明 || {}
        };
        setStage1Taxonomy(taxonomy);
        setStage1Patents([]);
        setStage1Backup(JSON.parse(JSON.stringify({ taxonomy, patents: [] })));
        setAppState('review_stage1');
      } else {
        setAppState('tree');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || '無法接續生成專利分類心智圖。');
      setAppState('review_preprocess');
    }
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
    setLoaderMessage('AI is analyzing and modeling patent taxonomy tree (Stage 1)...');
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
          技術樹: data.技術樹 || [],
          定義說明: data.定義說明 || {}
        };
        setStage1Taxonomy(taxonomy);
        setStage1Patents([]);
        setStage1Backup(JSON.parse(JSON.stringify({ taxonomy, patents: [] })));
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
    setErrorMessage('');

    // Step 0: 先查詢是否有未完成的 checkpoint
    try {
      const cpResp = await fetch(`/api/mindmap/check_checkpoint?file_id=${fileInfo.file_id}`);
      if (cpResp.ok) {
        const cpData = await cpResp.json();
        if (cpData.has_checkpoint && (cpData.stage1_completed_count > 0 || cpData.stage2_completed_count > 0)) {
          // 顯示接續/重新執行對話框
          setResumeDialog({
            s1Count: cpData.stage1_completed_count,
            s2Count: cpData.stage2_completed_count,
          });
          return;
        }
      }
    } catch (e) {
      // check_checkpoint 失敗就跟沒有 checkpoint 一樣，直接開始
    }

    await doLaunchStage2(true);
  };

  const doLaunchStage2 = async (resume) => {
    if (!fileInfo) return;
    setResumeDialog(null);
    setAppState('processing_stage2');
    setLoaderMessage('AI 正在啟動專利分類與映射任務 (已完成 0%)...');
    setErrorMessage('');

    try {
      // Step 1: 呼叫 map_stage1 啟動背景任務
      const mapResponse = await fetch('/api/mindmap/map_stage1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: fileInfo.file_id,
          taxonomy: stage1Taxonomy,
          resume: resume
        })
      });

      if (!mapResponse.ok) {
        throw new Error('無法啟動專利分類背景任務。');
      }

      const initData = await mapResponse.json();
      const taskId = initData.task_id;

      // Step 2: 開始每 2 秒輪詢一次任務狀態
      const pollInterval = setInterval(async () => {
        try {
          const statusResp = await fetch(`/api/mindmap/task_status?task_id=${taskId}`);
          if (!statusResp.ok) return;
          const statusData = await statusResp.json();

          if (statusData.status === 'processing') {
            const pct = statusData.total_count > 0
              ? Math.min(100, Math.round((statusData.completed_count / statusData.total_count) * 100))
              : 0;
            const stageLabel = statusData.stage === 2
              ? `階段 2/2 技術3階細分映射`
              : `階段 1/2 全域分類標籤映射`;
            setLoaderMessage(`AI 正在進行${stageLabel} (已完成 ${pct}%)...`);
          } else if (statusData.status === 'completed') {
            clearInterval(pollInterval);

            // 任務完成！向後端拿取最終結果
            setLoaderMessage('正在載入最終心智圖結構...');
            const finalResp = await fetch('/api/mindmap/generate_stage2', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ file_id: fileInfo.file_id })
            });

            if (!finalResp.ok) throw new Error('無法載入最終專利映射結果。');

            const finalData = await finalResp.json();
            setTreeData(finalData);
            setAppState('tree');
          } else if (statusData.status === 'failed') {
            clearInterval(pollInterval);
            setErrorMessage(`背景任務執行失敗: ${statusData.error}`);
            setAppState('review_stage1');
          }
        } catch (pollErr) {
          console.error("Polling error:", pollErr);
        }
      }, 2000);

    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || '執行階段 2 時發生錯誤。');
      setAppState('review_stage1');
    }
  };

  const handleExportExcel = async () => {
    try {
      // Merge stage1Taxonomy definitions or treeData for complete export
      const payload = {
        ...treeData,
        stage1_taxonomy: stage1Taxonomy
      };

      const response = await fetch('/api/mindmap/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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

  const addDomain = (name, def = '') => {
    if (stage1Taxonomy.應用領域.includes(name)) return;
    const updatedDefs = { ...stage1Taxonomy.定義說明, [name]: def };
    setStage1Taxonomy({
      ...stage1Taxonomy,
      應用領域: [...stage1Taxonomy.應用領域, name],
      定義說明: updatedDefs
    });
  };

  const deleteDomain = (index) => {
    const name = stage1Taxonomy.應用領域[index];
    const filtered = stage1Taxonomy.應用領域.filter((_, i) => i !== index);
    const updatedDefs = { ...stage1Taxonomy.定義說明 };
    delete updatedDefs[name];
    setStage1Taxonomy({ ...stage1Taxonomy, 應用領域: filtered, 定義說明: updatedDefs });
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
    if (oldName === newName) return;
    const updated = [...stage1Taxonomy.應用領域];
    updated[index] = newName;

    const updatedDefs = { ...stage1Taxonomy.定義說明 };
    if (updatedDefs[oldName] !== undefined) {
      updatedDefs[newName] = updatedDefs[oldName];
      delete updatedDefs[oldName];
    }

    setStage1Taxonomy({ ...stage1Taxonomy, 應用領域: updated, 定義說明: updatedDefs });
    setStage1Patents(stage1Patents.map(p => ({
      ...p,
      應用領域: p.應用領域.map(d => d === oldName ? newName : d)
    })));
  };

  const addEfficacy = (name, def = '') => {
    if (stage1Taxonomy.功效節點.includes(name)) return;
    const updatedDefs = { ...stage1Taxonomy.定義說明, [name]: def };
    setStage1Taxonomy({
      ...stage1Taxonomy,
      功效節點: [...stage1Taxonomy.功效節點, name],
      定義說明: updatedDefs
    });
  };

  const deleteEfficacy = (index) => {
    const name = stage1Taxonomy.功效節點[index];
    const filtered = stage1Taxonomy.功效節點.filter((_, i) => i !== index);
    const updatedDefs = { ...stage1Taxonomy.定義說明 };
    delete updatedDefs[name];
    setStage1Taxonomy({ ...stage1Taxonomy, 功效節點: filtered, 定義說明: updatedDefs });
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
    if (oldName === newName) return;
    const updated = [...stage1Taxonomy.功效節點];
    updated[index] = newName;

    const updatedDefs = { ...stage1Taxonomy.定義說明 };
    if (updatedDefs[oldName] !== undefined) {
      updatedDefs[newName] = updatedDefs[oldName];
      delete updatedDefs[oldName];
    }

    setStage1Taxonomy({ ...stage1Taxonomy, 功效節點: updated, 定義說明: updatedDefs });
    setStage1Patents(stage1Patents.map(p => ({
      ...p,
      功效節點: p.功效節點.map(e => e === oldName ? newName : e)
    })));
  };

  const addT1 = (name, def = '') => {
    if (stage1Taxonomy.技術樹.some(item => item.技術1階 === name)) return;
    const updatedDefs = { ...stage1Taxonomy.定義說明, [name]: def };
    setStage1Taxonomy({
      ...stage1Taxonomy,
      技術樹: [...stage1Taxonomy.技術樹, { 技術1階: name, 技術2階: [] }],
      定義說明: updatedDefs
    });
  };

  const deleteT1 = (t1Index) => {
    const oldName = stage1Taxonomy.技術樹[t1Index].技術1階;
    const updated = stage1Taxonomy.技術樹.filter((_, i) => i !== t1Index);
    const updatedDefs = { ...stage1Taxonomy.定義說明 };
    delete updatedDefs[oldName];
    // Also clean up nested T2 definitions
    stage1Taxonomy.技術樹[t1Index].技術2階.forEach(t2Name => {
      delete updatedDefs[t2Name];
    });

    setStage1Taxonomy({ ...stage1Taxonomy, 技術樹: updated, 定義說明: updatedDefs });
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
    if (oldName === newName) return;
    const updated = [...stage1Taxonomy.技術樹];
    updated[t1Index].技術1階 = newName;

    const updatedDefs = { ...stage1Taxonomy.定義說明 };
    if (updatedDefs[oldName] !== undefined) {
      updatedDefs[newName] = updatedDefs[oldName];
      delete updatedDefs[oldName];
    }

    setStage1Taxonomy({ ...stage1Taxonomy, 技術樹: updated, 定義說明: updatedDefs });
    setStage1Patents(stage1Patents.map(p => ({
      ...p,
      技術路徑: p.技術路徑.map(path => path[0] === oldName ? [newName, path[1]] : path)
    })));
  };

  const addT2 = (t1Index, name, def = '') => {
    if (stage1Taxonomy.技術樹[t1Index].技術2階.includes(name)) return;
    const updated = [...stage1Taxonomy.技術樹];
    updated[t1Index].技術2階 = [...updated[t1Index].技術2階, name];
    const updatedDefs = { ...stage1Taxonomy.定義說明, [name]: def };
    setStage1Taxonomy({ ...stage1Taxonomy, 技術樹: updated, 定義說明: updatedDefs });
  };

  const deleteT2 = (t1Index, t2Index) => {
    const t1Name = stage1Taxonomy.技術樹[t1Index].技術1階;
    const oldT2Name = stage1Taxonomy.技術樹[t1Index].技術2階[t2Index];
    const updated = [...stage1Taxonomy.技術樹];
    updated[t1Index].技術2階 = updated[t1Index].技術2階.filter((_, i) => i !== t2Index);
    const updatedDefs = { ...stage1Taxonomy.定義說明 };
    delete updatedDefs[oldT2Name];

    setStage1Taxonomy({ ...stage1Taxonomy, 技術樹: updated, 定義說明: updatedDefs });
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
    if (oldT2Name === newName) return;
    const updated = [...stage1Taxonomy.技術樹];
    updated[t1Index].技術2階[t2Index] = newName;

    const updatedDefs = { ...stage1Taxonomy.定義說明 };
    if (updatedDefs[oldT2Name] !== undefined) {
      updatedDefs[newName] = updatedDefs[oldT2Name];
      delete updatedDefs[oldT2Name];
    }

    setStage1Taxonomy({ ...stage1Taxonomy, 技術樹: updated, 定義說明: updatedDefs });
    setStage1Patents(stage1Patents.map(p => ({
      ...p,
      技術路徑: p.技術路徑.map(path => (path[0] === t1Name && path[1] === oldT2Name) ? [t1Name, newName] : path)
    })));
  };

  // --- Modal Open Helper Functions ---
  const openViewModal = (type, name) => {
    const def = stage1Taxonomy.定義說明[name] || '';
    setModalData({ type, index: -1, parentIndex: -1, name, definition: def });
    setTempName(name);
    setTempDef(def);
    setModalMode('view');
    setIsModalOpen(true);
  };

  const openEditModal = (type, name, index, parentIndex = -1) => {
    const def = stage1Taxonomy.定義說明[name] || '';
    setModalData({ type, index, parentIndex, name, definition: def });
    setTempName(name);
    setTempDef(def);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const openAddModal = (type, parentIndex = -1) => {
    setModalData({ type, index: -1, parentIndex, name: '', definition: '' });
    setTempName('');
    setTempDef('');
    setModalMode('add');
    setIsModalOpen(true);
  };

  const handleSaveModal = () => {
    const cleanName = tempName.trim();
    const cleanDef = tempDef.trim();
    if (!cleanName) return;

    if (modalMode === 'add') {
      if (modalData.type === '應用領域') {
        addDomain(cleanName, cleanDef);
      } else if (modalData.type === '功效節點') {
        addEfficacy(cleanName, cleanDef);
      } else if (modalData.type === '技術1階') {
        addT1(cleanName, cleanDef);
      } else if (modalData.type === '技術2階') {
        addT2(modalData.parentIndex, cleanName, cleanDef);
      }
    } else if (modalMode === 'edit') {
      if (modalData.type === '應用領域') {
        renameDomain(modalData.index, cleanName);
        // update definition
        setStage1Taxonomy(prev => ({
          ...prev,
          定義說明: { ...prev.定義說明, [cleanName]: cleanDef }
        }));
      } else if (modalData.type === '功效節點') {
        renameEfficacy(modalData.index, cleanName);
        setStage1Taxonomy(prev => ({
          ...prev,
          定義說明: { ...prev.定義說明, [cleanName]: cleanDef }
        }));
      } else if (modalData.type === '技術1階') {
        renameT1(modalData.index, cleanName);
        setStage1Taxonomy(prev => ({
          ...prev,
          定義說明: { ...prev.定義說明, [cleanName]: cleanDef }
        }));
      } else if (modalData.type === '技術2階') {
        renameT2(modalData.parentIndex, modalData.index, cleanName);
        setStage1Taxonomy(prev => ({
          ...prev,
          定義說明: { ...prev.定義說明, [cleanName]: cleanDef }
        }));
      }
    }
    setIsModalOpen(false);
  };

  return (
    <div className="mindmap-container animate-fade-in" style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>

      {appState === 'idle' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '800px', margin: '2rem auto', width: '100%' }}>
          <div
            className={`upload-container glass-panel ${isDragging ? 'dragging' : ''}`}
            style={{
              textAlign: 'center',
              padding: '4rem 2rem',
              borderRadius: '1.5rem',
              border: isDragging ? '2px dashed var(--color-primary)' : '1px solid var(--color-border)',
              background: isDragging ? 'rgba(34, 211, 238, 0.2)' : 'var(--color-surface)',
              transition: 'all 0.3s ease',
              cursor: 'pointer'
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

          <div className="glass-panel" style={{ padding: '1.5rem 2rem', borderRadius: '1.5rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                🔍 落入範圍初篩設定 (Scope Screening Settings)
              </h3>
              <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={enableScreening}
                  onChange={(e) => setEnableScreening(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>啟用初篩作業</span>
              </label>
            </div>

            {enableScreening && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--color-text-muted)', marginBottom: '0.4rem' }}>
                    選擇初篩準則範本 (Select Preset Template)
                  </label>
                  <select
                    value={selectedTemplate}
                    onChange={handleTemplateChange}
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--color-border)',
                      background: 'rgba(255,255,255,0.08)',
                      color: 'PaleTurquoise',
                      outline: 'none',
                      fontSize: '0.9rem'
                    }}
                  >
                    <option value="" style={{ background: '#011331ff' }}>-- 請選擇範本或自行輸入 --</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id} style={{ background: '#011331ff' }}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--color-text-muted)', marginBottom: '0.4rem' }}>
                    篩選準則內容 (Screening Criteria)
                  </label>
                  <textarea
                    rows={3}
                    value={screeningCriteria}
                    onChange={(e) => setScreeningCriteria(e.target.value)}
                    placeholder="請輸入初篩判定準則，例如：與半導體封裝或材料相關的專利..."
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      borderRadius: '0.5rem',
                      border: '1px solid var(--color-border)',
                      background: 'rgba(255,255,255,0.08)',
                      color: 'var(--color-text)',
                      outline: 'none',
                      fontSize: '0.9rem',
                      resize: 'none'
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {appState === 'preprocessing' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="processing-section glass-panel" style={{ padding: '5rem 3rem', borderRadius: '1.5rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', textAlign: 'center', width: '100%', maxWidth: '600px' }}>
            <Loader statusMessage={loaderMessage} />
          </div>
        </div>
      )}

      {appState === 'review_preprocess' && preprocessResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', height: 'calc(100vh - 8rem)', overflow: 'hidden' }}>
          <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexWrap: 'wrap', gap: '2rem', justifyItems: 'center', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📊 預處理與初篩結果統計
              </h2>
              <p style={{ color: 'var(--color-text-muted)', margin: 0, fontSize: '0.9rem' }}>
                檔案名稱: <strong style={{ color: 'var(--color-text)' }}>{preprocessResult.filename}</strong>
              </p>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem 1.5rem', borderRadius: '0.75rem', textAlign: 'center', minWidth: '100px', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>總專利件數</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--color-text)' }}>{preprocessResult.patents.length}</div>
              </div>
              <div style={{ background: 'rgba(17, 88, 165, 0.1)', padding: '0.75rem 1.5rem', borderRadius: '0.75rem', textAlign: 'center', minWidth: '100px', border: '1px solid rgba(27, 102, 181, 0.3)' }}>
                <div style={{ fontSize: '0.85rem', color: '#42e2f0ff' }}>落入專利件數 (Y)</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#00ffffff' }}>{preprocessResult.y_count}</div>
              </div>
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem 1.5rem', borderRadius: '0.75rem', textAlign: 'center', minWidth: '100px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                <div style={{ fontSize: '0.85rem', color: '#fca5a5' }}>不落入專利件數 (N)</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#ef4444' }}>{preprocessResult.n_count}</div>
              </div>
              <div style={{ background: 'rgba(168, 85, 247, 0.1)', padding: '0.75rem 1.5rem', borderRadius: '0.75rem', textAlign: 'center', minWidth: '100px', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                <div style={{ fontSize: '0.85rem', color: '#9f45d6ff' }}>篩選命中率</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#bc55f7ff' }}>{preprocessResult.hit_rate}</div>
              </div>
            </div>
          </div>

          <div className="glass-panel" style={{ flex: 1, padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <h3 style={{ fontSize: '1.1rem', margin: '0 0 1rem 0', color: 'var(--color-text)', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
              📋 預處理明細預覽 (顯示前 50 件)
            </h3>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>專利號</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>標題</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>AI技術簡述</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>技術特徵手段</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>解決的技術問題/效益</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>初篩結果</th>
                  </tr>
                </thead>
                <tbody>
                  {preprocessResult.patents.slice(0, 50).map((p, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: '500', color: 'LightCyan', whiteSpace: 'nowrap' }}>{p.專利公開公告號}</td>
                      <td style={{ padding: '0.75rem 0.5rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.標題}>{p.標題}</td>
                      <td style={{ padding: '0.75rem 0.5rem', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.AI技術簡述}>{p.AI技術簡述}</td>
                      <td style={{ padding: '0.75rem 0.5rem', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.技術特徵手段}>{p.技術特徵手段}</td>
                      <td style={{ padding: '0.75rem 0.5rem', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.解決的技術問題或技術效益}>{p.解決的技術問題或技術效益}</td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                        <span style={{
                          background: p.初篩結果 === 'Y' ? 'rgba(56, 206, 252, 0.86)' : 'rgba(239, 68, 68, 0.2)',
                          color: p.初篩結果 === 'Y' ? '#eee722ff' : '#ef4444',
                          border: p.初篩結果 === 'Y' ? '1px solid rgba(42, 168, 247, 1)' : '1px solid rgba(239, 68, 68, 0.4)',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '0.5rem',
                          fontSize: '0.8rem',
                          fontWeight: 'bold'
                        }}>
                          {p.初篩結果}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
              <div>
                <button onClick={handleStartNew} className="btn-secondary" style={{ padding: '0.6rem 1.5rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem' }}>
                  <ArrowLeft size={16} /> 重新上傳
                </button>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '0.5rem', marginRight: '1rem' }}>
                  <input
                    type="checkbox"
                    checked={proceedToClassification}
                    onChange={(e) => setProceedToClassification(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: 'var(--color-text)' }}>接續進行專利分類心智圖</span>
                </label>

                <button
                  onClick={handleExportPreprocessExcel}
                  className="btn-secondary"
                  style={{ padding: '0.6rem 1.5rem', borderRadius: '0.5rem', fontSize: '0.95rem', fontWeight: 'bold' }}
                >
                  📥 匯出預處理 Excel
                </button>

                <button
                  onClick={handleProceedNext}
                  disabled={proceedToClassification && preprocessResult.y_count === 0}
                  className="btn-primary"
                  style={{
                    padding: '0.6rem 2rem',
                    borderRadius: '0.5rem',
                    fontSize: '0.95rem',
                    background: (proceedToClassification && preprocessResult.y_count === 0) ? 'var(--color-text-muted)' : 'var(--color-primary)',
                    border: 'none',
                    color: 'white',
                    fontWeight: 'bold',
                    boxShadow: (proceedToClassification && preprocessResult.y_count === 0) ? 'none' : '0 4px 10px var(--color-primary-glow)',
                    cursor: (proceedToClassification && preprocessResult.y_count === 0) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {proceedToClassification ? '🚀 開始心智圖分類' : '完成結束'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {appState === 'processing' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="processing-section glass-panel" style={{ padding: '5rem 3rem', borderRadius: '1.5rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', textAlign: 'center', width: '100%', maxWidth: '600px' }}>
            <Loader statusMessage={loaderMessage} />
          </div>
        </div>
      )}

      {appState === 'processing_stage2' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="processing-section glass-panel" style={{ padding: '5rem 3rem', borderRadius: '1.5rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', textAlign: 'center', width: '100%', maxWidth: '600px' }}>
            <Loader statusMessage={loaderMessage} />
          </div>
        </div>
      )}

      {/* Resume / Restart 確認對話框 (Overlay) */}
      {resumeDialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="glass-panel" style={{
            padding: '2.5rem 2rem', borderRadius: '1.5rem',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            maxWidth: '480px', width: '90%',
            textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚡</div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold', marginBottom: '0.5rem', color: 'var(--color-text)' }}>
              偵測到上次未完成的進度
            </h3>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              Stage 1（全域映射）已完成 <strong style={{ color: 'var(--color-primary)' }}>{resumeDialog.s1Count}</strong> 件
              {resumeDialog.s2Count > 0 && <>，Stage 2（技術3階）已完成 <strong style={{ color: 'var(--color-secondary)' }}>{resumeDialog.s2Count}</strong> 件</>}。
              <br />要從中斷處繼續，還是全部重新開始？
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={() => doLaunchStage2(true)}
                className="btn-primary"
                style={{ padding: '0.75rem 1.75rem', borderRadius: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                🔄 接續上次進度
              </button>
              <button
                onClick={() => doLaunchStage2(false)}
                className="btn-secondary"
                style={{ padding: '0.75rem 1.75rem', borderRadius: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                ♻️ 全部重新執行
              </button>
            </div>
            <button
              onClick={() => setResumeDialog(null)}
              style={{ marginTop: '1rem', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              取消
            </button>
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

          {/* Grid Columns - Two Columns instead of Three */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '1rem', flex: 1, overflow: 'hidden', height: '100%' }}>

            {/* Column 1: Domain & Efficacy */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', overflow: 'hidden' }}>
              {/* Domain Card */}
              <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--color-border)', background: 'var(--color-surface)', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-text)', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>🎯 1. 應用領域校正</span>
                  <span style={{ fontSize: '0.75rem', background: 'Plum', color: 'var(--color-primary)', padding: '2px 8px', borderRadius: '0.5rem' }}>
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
                        onClick={() => openViewModal('應用領域', domain)}
                        style={{ border: 'none', background: 'transparent', color: 'var(--color-secondary)', cursor: 'pointer', padding: '0.2rem' }}
                        title="查看/編輯定義"
                      >
                        <HelpCircle size={16} />
                      </button>
                      <button
                        onClick={() => openEditModal('應用領域', domain, index)}
                        style={{ border: 'none', background: 'transparent', color: 'Aquamarine', cursor: 'pointer', padding: '0.2rem' }}
                        title="詳細修改"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => deleteDomain(index)}
                        style={{ border: 'none', background: 'transparent', color: 'IndianRed', cursor: 'pointer', padding: '0.2rem' }}
                        title="刪除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => openAddModal('應用領域')}
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
                  <span style={{ fontSize: '0.75rem', background: 'Plum', color: 'var(--color-primary)', padding: '2px 8px', borderRadius: '0.5rem' }}>
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
                        onClick={() => openViewModal('功效節點', eff)}
                        style={{ border: 'none', background: 'transparent', color: 'var(--color-secondary)', cursor: 'pointer', padding: '0.2rem' }}
                        title="查看/編輯定義"
                      >
                        <HelpCircle size={16} />
                      </button>
                      <button
                        onClick={() => openEditModal('功效節點', eff, index)}
                        style={{ border: 'none', background: 'transparent', color: 'Aquamarine', cursor: 'pointer', padding: '0.2rem' }}
                        title="詳細修改"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => deleteEfficacy(index)}
                        style={{ border: 'none', background: 'transparent', color: 'IndianRed', cursor: 'pointer', padding: '0.2rem' }}
                        title="刪除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => openAddModal('功效節點')}
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
                <span style={{ fontSize: '0.75rem', background: 'Plum', color: 'var(--color-primary)', padding: '2px 8px', borderRadius: '0.5rem' }}>
                  {stage1Taxonomy.技術樹.length} 個
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
                        onClick={() => openViewModal('技術1階', t1Item.技術1階)}
                        style={{ border: 'none', background: 'transparent', color: 'var(--color-primary)', cursor: 'pointer', padding: '0.2rem' }}
                        title="查看/編輯定義"
                      >
                        <HelpCircle size={16} />
                      </button>
                      <button
                        onClick={() => openEditModal('技術1階', t1Item.技術1階, t1Idx)}
                        style={{ border: 'none', background: 'transparent', color: 'MediumSpringGreen', cursor: 'pointer', padding: '0.2rem' }}
                        title="詳細修改"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => deleteT1(t1Idx)}
                        style={{ border: 'none', background: 'transparent', color: 'IndianRed', cursor: 'pointer', padding: '0.2rem' }}
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
                            onClick={() => openViewModal('技術2階', t2Item)}
                            style={{ border: 'none', background: 'transparent', color: 'var(--color-primary)', cursor: 'pointer', padding: '0.2rem' }}
                            title="查看/編輯定義"
                          >
                            <HelpCircle size={14} />
                          </button>
                          <button
                            onClick={() => openEditModal('技術2階', t2Item, t2Idx, t1Idx)}
                            style={{ border: 'none', background: 'transparent', color: 'MediumSpringGreen', cursor: 'pointer', padding: '0.1rem' }}
                            title="詳細修改"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => deleteT2(t1Idx, t2Idx)}
                            style={{ border: 'none', background: 'transparent', color: 'IndianRed', cursor: 'pointer', padding: '0.1rem' }}
                            title="刪除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => openAddModal('技術2階', t1Idx)}
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
                onClick={() => openAddModal('技術1階')}
                className="btn-secondary"
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', width: '100%', fontSize: '0.9rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem' }}
              >
                <Plus size={16} /> 新增技術 1 階類別
              </button>
            </div>

          </div>
        </div>
      )
      }

      {
        appState === 'tree' && treeData && (
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
        )
      }

      {/* --- Definition Modal --- */}
      {
        isModalOpen && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div className="glass-panel" style={{
              width: '90%',
              maxWidth: '500px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '1.25rem',
              padding: '2rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
              position: 'relative'
            }}>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  position: 'absolute',
                  top: '1.25rem',
                  right: '1.25rem',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer'
                }}
              >
                <X size={20} />
              </button>

              <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {modalMode === 'view' ? '📖 ' : modalMode === 'edit' ? '✍️ ' : '➕ '}
                {modalMode === 'view' ? '定義說明' : modalMode === 'edit' ? '修改分類標籤' : `新增${modalData.type}`}
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-text-muted)', marginBottom: '0.4rem' }}>
                    分類標籤名稱
                  </label>
                  {modalMode === 'view' ? (
                    <div style={{ padding: '0.6rem 0.8rem', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.2)', border: '1px solid var(--color-border)', fontSize: '0.95rem', fontWeight: '500' }}>
                      {modalData.name}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      placeholder="請輸入名稱"
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.8rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--color-border)',
                        background: 'rgba(255,255,255,0.4)',
                        color: 'var(--color-text)',
                        outline: 'none',
                        fontSize: '0.95rem'
                      }}
                    />
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--color-text-muted)', marginBottom: '0.4rem' }}>
                    定義說明 (約 60 字繁中)
                  </label>
                  {modalMode === 'view' ? (
                    <div style={{
                      padding: '0.8rem 1rem',
                      borderRadius: '0.5rem',
                      background: 'rgba(255,255,255,0.2)',
                      border: '1px solid var(--color-border)',
                      fontSize: '0.95rem',
                      lineHeight: '1.6',
                      minHeight: '100px',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {tempDef || '尚無定義說明。'}
                    </div>
                  ) : (
                    <textarea
                      rows={4}
                      value={tempDef}
                      onChange={(e) => setTempDef(e.target.value)}
                      placeholder="請輸入該分類標籤的繁體中文定義說明 (約 60 字)..."
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.8rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--color-border)',
                        background: 'rgba(255,255,255,0.4)',
                        color: 'var(--color-text)',
                        outline: 'none',
                        fontSize: '0.95rem',
                        resize: 'none',
                        lineHeight: '1.5'
                      }}
                    />
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem' }}>
                {modalMode === 'view' ? (
                  <>
                    <button
                      onClick={() => {
                        setModalMode('edit');
                      }}
                      className="btn-secondary"
                      style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem' }}
                    >
                      編輯
                    </button>
                    <button
                      onClick={() => setIsModalOpen(false)}
                      className="btn-primary"
                      style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem' }}
                    >
                      關閉
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setIsModalOpen(false)}
                      className="btn-secondary"
                      style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem' }}
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveModal}
                      className="btn-primary"
                      style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem' }}
                    >
                      儲存
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default MindMapTab;
