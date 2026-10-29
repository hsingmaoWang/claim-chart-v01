import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-dist-min';
import { Sun, Moon, AlertTriangle, Info, BarChart2, FileText, CheckSquare, Square } from 'lucide-react';

const Plot = createPlotlyComponent(Plotly);

// Country priority list based on patent-list-processing skill: US > WO > EP > TW > CN > JP > KR
const COUNTRY_PRIORITY = {
  'US': 1, 'WO': 2, 'EP': 3, 'TW': 4, 'CN': 5, 'JP': 6, 'KR': 7
};

const extractCountryCode = (pubNumber) => {
  if (!pubNumber) return '';
  const match = String(pubNumber).trim().match(/^([A-Za-z]{2})/);
  return match ? match[1].toUpperCase() : '';
};

const extract4DigitYear = (dateVal) => {
  if (dateVal === undefined || dateVal === null) return null;
  const str = String(dateVal).trim();
  if (!str || str.toLowerCase() === 'nan' || str.toLowerCase() === 'nat') return null;

  // 1. Check if numeric Excel serial date (e.g. 30000 ~ 70000)
  const num = Number(str);
  if (!isNaN(num) && num > 30000 && num < 70000) {
    try {
      const jsDate = new Date((num - 25569) * 86400 * 1000);
      const y = jsDate.getFullYear();
      if (y >= 1900 && y <= 2099) return y;
    } catch (e) { }
  }

  // 2. Match 4-digit year 19xx or 20xx
  const match = str.match(/(19\d{2}|20\d{2})/);
  if (match) return parseInt(match[1], 10);
  return null;
};

const findFieldKeyCaseInsensitive = (sampleItem, candidateKeys) => {
  if (!sampleItem) return null;
  const keys = Object.keys(sampleItem);

  // Exact normalized match
  for (const candidate of candidateKeys) {
    const candNorm = candidate.toLowerCase().replace(/[\s_\-/\.]+/g, '').trim();
    for (const k of keys) {
      const kNorm = k.toLowerCase().replace(/[\s_\-/\.]+/g, '').trim();
      if (kNorm === candNorm) return k;
    }
  }

  // Substring match
  for (const candidate of candidateKeys) {
    const candNorm = candidate.toLowerCase().replace(/[\s_\-/\.]+/g, '').trim();
    for (const k of keys) {
      const kNorm = k.toLowerCase().replace(/[\s_\-/\.]+/g, '').trim();
      if (kNorm.includes(candNorm) || candNorm.includes(kNorm)) return k;
    }
  }

  return null;
};

const PatentTrendChart = ({ treeData, onCaptureReady, authState }) => {
  const plotRef = useRef(null);
  // Theme state: 'light' or 'dark'
  const [theme, setTheme] = useState('light');
  // Metric state: 'case' (專利案數) or 'piece' (專利件數), default 'case'
  const [metric, setMetric] = useState('case');
  // Selected year dimensions state: priority, application, publication (default priority + application)
  const [selectedYears, setSelectedYears] = useState({
    priority: true,
    application: true,
    publication: false
  });

  // Extract raw patents from treeData
  const rawPatents = useMemo(() => {
    if (!treeData) return [];
    if (Array.isArray(treeData.patents)) return treeData.patents;
    for (const key in treeData) {
      if (Array.isArray(treeData[key])) return treeData[key];
    }
    return [];
  }, [treeData]);

  // Identify column keys in dataset
  const columnKeys = useMemo(() => {
    if (!rawPatents || rawPatents.length === 0) {
      return {
        priority: null,
        application: null,
        publication: null,
        appNum: null,
        pubNum: null,
        familyId: null
      };
    }
    const sample = rawPatents[0] || {};

    const priorityKey = findFieldKeyCaseInsensitive(sample, [
      'Earliest Priority Year', 'Priority Date', 'priority_date', 'priority date',
      '優先權日', '優先權年', '最早優先權日', '最早優先權年', 'Earliest Priority Date'
    ]);

    const appDateKey = findFieldKeyCaseInsensitive(sample, [
      'Application Date', 'application date', '申請日', '申請年', '申請日期', 'app_date', 'application_date'
    ]);

    const pubDateKey = findFieldKeyCaseInsensitive(sample, [
      'Publication Date', 'publication date', '公開日', '公告日', '公開公告日', 'pub_date', 'publication_date', '發證日'
    ]);

    const appNumKey = findFieldKeyCaseInsensitive(sample, [
      'Application Number', 'application number', '申請號', 'app no', 'app_no', 'appl. no.', '申請案號'
    ]);

    const pubNumKey = findFieldKeyCaseInsensitive(sample, [
      'Publication Number', 'publication number', '公開號', '公告號', '專利公開公告號', '專利號', 'pub no', 'pub_no'
    ]);

    const familyIdKey = findFieldKeyCaseInsensitive(sample, [
      'INPADOC Family ID', 'Family ID', 'family id', '專利家族號', '家族編號', 'inpadoc family', 'inpadoc'
    ]);

    return {
      priority: priorityKey,
      application: appDateKey,
      publication: pubDateKey,
      appNum: appNumKey,
      pubNum: pubNumKey,
      familyId: familyIdKey
    };
  }, [rawPatents]);

  // Step 1: 公開公告合併 (Publication/Grant Merge) -> 專利件數母體 (Pieces)
  // Rule 1: 同 Application Number 僅保留 Publication Date 最新的一件，計為 1 件。無申請號者獨立保留。
  const mergedPatents = useMemo(() => {
    if (!rawPatents || rawPatents.length === 0) return [];
    const { appNum: appNumKey, pubDate: pubDateKey } = {
      appNum: columnKeys.appNum,
      pubDate: columnKeys.publication
    };

    if (!appNumKey) {
      // 若無申請號欄位，各專利視為獨立件
      return rawPatents;
    }

    const appMap = new Map();
    const noAppNumList = [];

    rawPatents.forEach((p) => {
      const rawApp = p[appNumKey];
      const appNum = rawApp !== undefined && rawApp !== null ? String(rawApp).trim() : '';
      if (!appNum || appNum.toLowerCase() === 'nan' || appNum === '-') {
        noAppNumList.push(p);
      } else {
        if (!appMap.has(appNum)) {
          appMap.set(appNum, []);
        }
        appMap.get(appNum).push(p);
      }
    });

    const result = [...noAppNumList];
    appMap.forEach((group) => {
      if (group.length === 1) {
        result.push(group[0]);
        return;
      }
      // 取 Publication Date 最新的一件
      const sorted = [...group].sort((a, b) => {
        const dateA = pubDateKey ? (extract4DigitYear(a[pubDateKey]) || 0) : 0;
        const dateB = pubDateKey ? (extract4DigitYear(b[pubDateKey]) || 0) : 0;
        return dateB - dateA;
      });
      result.push(sorted[0]);
    });

    return result;
  }, [rawPatents, columnKeys]);

  // Step 2 & 3: 專利家族計數與合併 (Patent Family Consolidation) -> 專利案數母體 (Cases)
  // Rule 2 & 3: 以公開公告合併後的結果為基礎，同 INPADOC Family ID 歸為同家族 (1案)。
  // 同家族依國別優先順序 US > WO > EP > TW > CN > JP > KR 挑選一件代表專利。
  const familyRepresentativePatents = useMemo(() => {
    if (!mergedPatents || mergedPatents.length === 0) return [];
    const { familyId: familyKey, pubNum: pubNumKey, publication: pubDateKey } = columnKeys;

    if (!familyKey) {
      // 若無家族號欄位，每件獨立為一案
      return mergedPatents;
    }

    const familyGroups = new Map();
    const noFamilyList = [];

    mergedPatents.forEach((p) => {
      const rawFam = p[familyKey];
      const famId = rawFam !== undefined && rawFam !== null ? String(rawFam).trim() : '';
      if (!famId || famId.toLowerCase() === 'nan' || famId === '-') {
        noFamilyList.push(p);
      } else {
        if (!familyGroups.has(famId)) {
          familyGroups.set(famId, []);
        }
        familyGroups.get(famId).push(p);
      }
    });

    const representatives = [...noFamilyList];

    familyGroups.forEach((group) => {
      if (group.length === 1) {
        representatives.push(group[0]);
        return;
      }

      // 依國別優先順序 (US > WO > EP > TW > CN > JP > KR)，同國別取公開日最新
      const sorted = [...group].sort((a, b) => {
        const pubA = pubNumKey ? String(a[pubNumKey] || '') : '';
        const pubB = pubNumKey ? String(b[pubNumKey] || '') : '';
        const ccA = extractCountryCode(pubA);
        const ccB = extractCountryCode(pubB);

        const rankA = COUNTRY_PRIORITY[ccA] || 99;
        const rankB = COUNTRY_PRIORITY[ccB] || 99;
        if (rankA !== rankB) return rankA - rankB;

        const dateA = pubDateKey ? (extract4DigitYear(a[pubDateKey]) || 0) : 0;
        const dateB = pubDateKey ? (extract4DigitYear(b[pubDateKey]) || 0) : 0;
        return dateB - dateA;
      });

      representatives.push(sorted[0]);
    });

    return representatives;
  }, [mergedPatents, columnKeys]);

  // Capture Image handler for PNG download
  const captureImage = useCallback(async () => {
    try {
      const container = plotRef.current;
      if (!container) return;

      const plotDiv = container.querySelector('.js-plotly-plot') || container;
      const w = plotDiv.offsetWidth || 1200;
      const h = plotDiv.offsetHeight || 750;

      const isCurrentDark = theme === 'dark';
      const bgColor = isCurrentDark ? '#0f172a' : '#ffffff';

      const dataUrl = await Plotly.toImage(plotDiv, {
        format: 'png',
        scale: 2,
        width: w,
        height: h,
        setBackground: bgColor
      });

      const now = new Date();
      const timestamp = now.toISOString().replace(/[-:.]/g, '').replace('T', '_').slice(0, 15);
      const a = document.createElement('a');
      a.href = dataUrl;
      const metricText = metric === 'case' ? '案數' : '件數';
      a.download = `patent_trend_${metricText}_${timestamp}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      if (authState?.session_id) {
        const base64Data = dataUrl.split(',')[1] || '';
        const padding = (base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0);
        const fileSizeBytes = Math.floor((base64Data.length * 3) / 4) - padding;
        fetch('/api/usage/log-png', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: authState.session_id, file_size_bytes: fileSizeBytes })
        }).catch(err => console.error('Failed to log PNG download', err));
      }
    } catch (err) {
      console.error('Failed to capture patent trend chart image', err);
    }
  }, [authState, metric, theme]);

  useEffect(() => {
    if (onCaptureReady) {
      onCaptureReady(() => captureImage);
    }
  }, [captureImage, onCaptureReady]);

  // Determine active patent list based on metric (case = family representatives, piece = merged patents)
  const activePatents = useMemo(() => {
    return metric === 'case' ? familyRepresentativePatents : mergedPatents;
  }, [metric, familyRepresentativePatents, mergedPatents]);

  // Aggregate yearly stats for selected dimensions
  const trendData = useMemo(() => {
    if (!activePatents || activePatents.length === 0) {
      return {
        allYears: [],
        priorityCounts: {},
        appCounts: {},
        pubCounts: {},
        maxY: 0,
        missingFields: []
      };
    }

    const priorityKey = columnKeys.priority;
    const appKey = columnKeys.application;
    const pubKey = columnKeys.publication;

    const missingFields = [];
    if (selectedYears.priority && !priorityKey) {
      missingFields.push('優先權年 (Earliest Priority Year / Priority Date)');
    }
    if (selectedYears.application && !appKey) {
      missingFields.push('申請年 (Application Date)');
    }
    if (selectedYears.publication && !pubKey) {
      missingFields.push('公開公告年 (Publication Date)');
    }

    const priorityCounts = {};
    const appCounts = {};
    const pubCounts = {};
    const yearsSet = new Set();

    activePatents.forEach((p) => {
      // 1. Priority Year
      if (selectedYears.priority && priorityKey) {
        const y = extract4DigitYear(p[priorityKey]);
        if (y && y >= 1900 && y <= 2099) {
          priorityCounts[y] = (priorityCounts[y] || 0) + 1;
          yearsSet.add(y);
        }
      }

      // 2. Application Year
      if (selectedYears.application && appKey) {
        const y = extract4DigitYear(p[appKey]);
        if (y && y >= 1900 && y <= 2099) {
          appCounts[y] = (appCounts[y] || 0) + 1;
          yearsSet.add(y);
        }
      }

      // 3. Publication Year
      if (selectedYears.publication && pubKey) {
        const y = extract4DigitYear(p[pubKey]);
        if (y && y >= 1900 && y <= 2099) {
          pubCounts[y] = (pubCounts[y] || 0) + 1;
          yearsSet.add(y);
        }
      }
    });

    const allYears = Array.from(yearsSet).sort((a, b) => a - b);

    let maxY = 0;
    allYears.forEach(y => {
      if (selectedYears.priority) maxY = Math.max(maxY, priorityCounts[y] || 0);
      if (selectedYears.application) maxY = Math.max(maxY, appCounts[y] || 0);
      if (selectedYears.publication) maxY = Math.max(maxY, pubCounts[y] || 0);
    });

    return {
      allYears,
      priorityCounts,
      appCounts,
      pubCounts,
      maxY,
      missingFields
    };
  }, [activePatents, selectedYears, columnKeys]);

  const isDark = theme === 'dark';

  // Build Plotly data traces
  const plotlyData = useMemo(() => {
    const { allYears, priorityCounts, appCounts, pubCounts } = trendData;
    if (!allYears || allYears.length === 0) return [];

    const traces = [];
    const unitLabel = metric === 'case' ? '案' : '件';

    // 1. 優先權年 (Warm golden/amber, matching Reference Image 1)
    if (selectedYears.priority && columnKeys.priority) {
      const yValues = allYears.map(y => priorityCounts[y] || 0);
      traces.push({
        name: '優先權年',
        type: 'bar',
        x: allYears.map(String),
        y: yValues,
        text: yValues.map(v => (v > 0 ? String(v) : '')),
        textposition: 'outside',
        cliponaxis: false,
        textfont: {
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          size: 13,
          color: isDark ? '#e2e8f0' : '#475569'
        },
        marker: {
          color: isDark ? '#fbbf24' : '#F5BD47',
          line: {
            color: isDark ? '#d97706' : '#d97706',
            width: 0.5
          }
        },
        hovertemplate: `<b>%{x} 年 優先權年</b><br>專利數量：<b>%{y}</b> ${unitLabel}<extra></extra>`
      });
    }

    // 2. 申請年 (Soft light blue, matching Reference Image 1)
    if (selectedYears.application && columnKeys.application) {
      const yValues = allYears.map(y => appCounts[y] || 0);
      traces.push({
        name: '申請年',
        type: 'bar',
        x: allYears.map(String),
        y: yValues,
        text: yValues.map(v => (v > 0 ? String(v) : '')),
        textposition: 'outside',
        cliponaxis: false,
        textfont: {
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          size: 13,
          color: isDark ? '#e2e8f0' : '#475569'
        },
        marker: {
          color: isDark ? '#38bdf8' : '#85BBEA',
          line: {
            color: isDark ? '#0284c7' : '#0284c7',
            width: 0.5
          }
        },
        hovertemplate: `<b>%{x} 年 申請年</b><br>專利數量：<b>%{y}</b> ${unitLabel}<extra></extra>`
      });
    }

    // 3. 公開公告年 (Bright vibrant pink, matching Reference Image 2)
    if (selectedYears.publication && columnKeys.publication) {
      const yValues = allYears.map(y => pubCounts[y] || 0);
      traces.push({
        name: '公開公告年',
        type: 'bar',
        x: allYears.map(String),
        y: yValues,
        text: yValues.map(v => (v > 0 ? String(v) : '')),
        textposition: 'outside',
        cliponaxis: false,
        textfont: {
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          size: 13,
          color: isDark ? '#e2e8f0' : '#475569'
        },
        marker: {
          color: isDark ? '#f472b6' : '#F794B8',
          line: {
            color: isDark ? '#db2777' : '#db2777',
            width: 0.5
          }
        },
        hovertemplate: `<b>%{x} 年 公開公告年</b><br>專利數量：<b>%{y}</b> ${unitLabel}<extra></extra>`
      });
    }

    return traces;
  }, [trendData, selectedYears, columnKeys, metric, isDark]);

  // Construct dynamic title based on selections
  const chartTitle = useMemo(() => {
    const parts = [];
    if (selectedYears.priority && columnKeys.priority) parts.push('優先權年');
    if (selectedYears.application && columnKeys.application) parts.push('申請年');
    if (selectedYears.publication && columnKeys.publication) parts.push('公開公告年');

    const subTitle = parts.length > 0 ? `-${parts.join('/')}` : '';
    const metricText = metric === 'case' ? '案數' : '件數';
    return `專利${metricText}歷年趨勢分析${subTitle}`;
  }, [selectedYears, columnKeys, metric]);

  // Plotly layout configuration
  const layout = useMemo(() => {
    const { maxY } = trendData;
    const yTop = Math.max(10, Math.ceil(maxY * 1.15));

    return {
      title: {
        text: `<b>${chartTitle}</b>`,
        font: {
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          size: 24,
          color: isDark ? '#f8fafc' : '#1e293b'
        },
        x: 0.5,
        xanchor: 'center',
        y: 0.95
      },
      barmode: 'group',
      bargap: 0.25,
      bargroupgap: 0.05,
      paper_bgcolor: isDark ? '#0f172a' : '#ffffff',
      plot_bgcolor: isDark ? '#0f172a' : '#ffffff',
      margin: { t: 95, r: 40, b: 70, l: 70 },
      legend: {
        orientation: 'h',
        x: 0.98,
        y: 1.07,
        xanchor: 'right',
        yanchor: 'top',
        font: {
          size: 16,
          color: isDark ? '#cbd5e1' : '#475569'
        }
      },
      xaxis: {
        title: {
          text: '<b>年份</b>',
          font: { size: 18, color: isDark ? '#94a3b8' : '#64748b' }
        },
        type: 'category',
        tickangle: 0,
        zeroline: false,
        gridcolor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
        gridwidth: 1,
        linecolor: isDark ? 'rgba(255,255,255,0.25)' : '#94a3b8',
        linewidth: 1,
        tickfont: { size: 12, color: isDark ? '#cbd5e1' : '#475569' }
      },
      yaxis: {
        title: {
          text: `<b>專利${metric === 'case' ? '案數' : '件數'}</b>`,
          font: { size: 18, color: isDark ? '#94a3b8' : '#64748b' }
        },
        range: [0, yTop],
        zeroline: true,
        zerolinecolor: isDark ? 'rgba(255,255,255,0.25)' : '#cbd5e1',
        zerolinewidth: 1.5,
        gridcolor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
        gridwidth: 1,
        linecolor: isDark ? 'rgba(255,255,255,0.25)' : '#94a3b8',
        linewidth: 1,
        tickfont: { size: 12, color: isDark ? '#cbd5e1' : '#475569' }
      },
      hoverlabel: {
        bgcolor: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(15, 23, 42, 0.92)',
        bordercolor: 'rgba(56, 189, 248, 0.5)',
        font: { color: '#ffffff', size: 12 }
      }
    };
  }, [trendData, chartTitle, metric, isDark]);

  // Handle toggling year dimension checkbox
  const handleToggleYear = (dimKey) => {
    setSelectedYears(prev => {
      const next = { ...prev, [dimKey]: !prev[dimKey] };
      // Ensure at least one dimension is checked
      if (!next.priority && !next.application && !next.publication) {
        return prev;
      }
      return next;
    });
  };

  const totalCases = familyRepresentativePatents.length;
  const totalPieces = mergedPatents.length;
  const hasNoData = !rawPatents || rawPatents.length === 0;

  if (hasNoData) {
    return (
      <div style={{
        height: '100%',
        minHeight: '750px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: isDark ? '#0f172a' : '#ffffff',
        borderRadius: '1rem',
        padding: '2rem',
        color: isDark ? '#94a3b8' : '#64748b',
        gap: '1rem',
        border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(226, 232, 240, 0.8)'}`
      }}>
        <Info size={40} style={{ color: '#0ea5e9' }} />
        <h3 style={{ margin: 0, color: isDark ? '#f8fafc' : '#1e293b' }}>尚未載入專利清單資料</h3>
        <p style={{ margin: 0, fontSize: '0.9rem', maxWidth: '420px', textAlign: 'center' }}>
          請先上傳專利 Excel 清單以進行歷年趨勢分析。
        </p>
      </div>
    );
  }

  return (
    <div
      ref={plotRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        background: isDark ? '#0f172a' : '#ffffff',
        borderRadius: '1rem',
        overflow: 'hidden',
        boxShadow: isDark ? '0 10px 30px rgba(0, 0, 0, 0.5)' : '0 4px 20px rgba(0, 0, 0, 0.05)',
        border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(226, 232, 240, 0.8)'}`,
        transition: 'background 0.25s ease'
      }}
    >
      {/* Top Meta Summary Bar: Format & position exactly matching LifeCycleChart */}
      <div style={{
        padding: '0.75rem 1.5rem',
        background: isDark
          ? 'linear-gradient(90deg, #1e293b, #0f172a)'
          : 'linear-gradient(90deg, #ecd8fcff, #c6e8fcff)',
        borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        {/* Left Side: Stats info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: isDark ? '#38bdf8' : '#0369a1', fontSize: '0.88rem', fontWeight: 600 }}>
            <FileText size={16} />
            <span>統計母體：{totalCases} 專利家族案 (INPADOC Family) / {totalPieces} 專利件數 (公開公告合併後)</span>
          </div>
          {trendData.allYears.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: isDark ? '#a78bfa' : '#6366f1', fontSize: '0.88rem', fontWeight: 600 }}>
              <BarChart2 size={16} />
              <span>趨勢跨越年份：{trendData.allYears[0]} ~ {trendData.allYears[trendData.allYears.length - 1]}（共 {trendData.allYears.length} 個年份）</span>
            </div>
          )}
        </div>

        {/* Right Side: Day/Night Theme Toggle (exact same format as LifeCycleChart) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            background: isDark ? 'rgba(30, 41, 59, 0.85)' : 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            borderRadius: '2rem',
            padding: '3px',
            display: 'inline-flex',
            gap: '2px',
            border: '1px solid rgba(255,255,255,0.12)'
          }}>
            <button
              title="夜間模式"
              onClick={() => setTheme('dark')}
              style={{
                background: theme === 'dark' ? '#0ea5e9' : 'transparent',
                border: 'none',
                color: theme === 'dark' ? '#fcef7aff' : '#ffffffff',
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
              title="日間模式"
              onClick={() => setTheme('light')}
              style={{
                background: theme === 'light' ? '#0ea5e9' : 'transparent',
                border: 'none',
                color: theme === 'light' ? '#fcef7aff' : '#ffffffff',
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
        </div>
      </div>

      {/* Control Bar: X-axis Checkboxes, Y-axis Metric Toggle, and Download Button */}
      <div style={{
        padding: '0.65rem 1.5rem',
        background: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(248, 250, 252, 0.9)',
        borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem'
      }}>
        {/* Left Side: X-axis Checkboxes & Y-axis Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          {/* Y-axis Metric Toggle: 專利案數 vs 專利件數 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: isDark ? '#94a3b8' : '#475569' }}>
              統計指標 (Y軸)：
            </span>
            <div style={{
              display: 'inline-flex',
              background: isDark ? 'rgba(30, 41, 59, 0.9)' : 'rgba(226, 232, 240, 0.7)',
              borderRadius: '0.45rem',
              padding: '2px',
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}`
            }}>
              <button
                onClick={() => setMetric('case')}
                style={{
                  padding: '0.35rem 0.85rem',
                  borderRadius: '0.35rem',
                  background: metric === 'case' ? '#0ea5e9' : 'transparent',
                  border: 'none',
                  color: metric === 'case' ? '#ffffff' : (isDark ? '#cbd5e1' : '#64748b'),
                  fontWeight: metric === 'case' ? 700 : 500,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                專利案數 (預設)
              </button>
              <button
                onClick={() => setMetric('piece')}
                style={{
                  padding: '0.35rem 0.85rem',
                  borderRadius: '0.35rem',
                  background: metric === 'piece' ? '#0ea5e9' : 'transparent',
                  border: 'none',
                  color: metric === 'piece' ? '#ffffff' : (isDark ? '#cbd5e1' : '#64748b'),
                  fontWeight: metric === 'piece' ? 700 : 500,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                專利件數
              </button>
            </div>
          </div>

          <div style={{ width: '1px', height: '24px', background: isDark ? 'rgba(255,255,255,0.1)' : '#cbd5e1' }} />

          {/* X-axis Checkboxes: 優先權年, 申請年, 公開公告年 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: isDark ? '#94a3b8' : '#475569' }}>
              年份維度 (X軸)：
            </span>

            {/* 優先權年 */}
            <label
              onClick={() => handleToggleYear('priority')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: isDark ? '#f1f5f9' : '#334155',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.35rem',
                background: selectedYears.priority ? (isDark ? 'rgba(245, 189, 71, 0.15)' : 'rgba(245, 189, 71, 0.15)') : 'transparent',
                border: `1px solid ${selectedYears.priority ? '#F5BD47' : 'transparent'}`,
                userSelect: 'none',
                transition: 'all 0.15s ease'
              }}
            >
              {selectedYears.priority ? <CheckSquare size={16} color="#F5BD47" /> : <Square size={16} color="#94a3b8" />}
              <span style={{ fontWeight: selectedYears.priority ? 600 : 400 }}>優先權年</span>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F5BD47', display: 'inline-block' }} />
            </label>

            {/* 申請年 */}
            <label
              onClick={() => handleToggleYear('application')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: isDark ? '#f1f5f9' : '#334155',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.35rem',
                background: selectedYears.application ? (isDark ? 'rgba(133, 187, 234, 0.15)' : 'rgba(133, 187, 234, 0.15)') : 'transparent',
                border: `1px solid ${selectedYears.application ? '#85BBEA' : 'transparent'}`,
                userSelect: 'none',
                transition: 'all 0.15s ease'
              }}
            >
              {selectedYears.application ? <CheckSquare size={16} color="#85BBEA" /> : <Square size={16} color="#94a3b8" />}
              <span style={{ fontWeight: selectedYears.application ? 600 : 400 }}>申請年</span>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#85BBEA', display: 'inline-block' }} />
            </label>

            {/* 公開公告年 */}
            <label
              onClick={() => handleToggleYear('publication')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: isDark ? '#f1f5f9' : '#334155',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.35rem',
                background: selectedYears.publication ? (isDark ? 'rgba(247, 148, 184, 0.15)' : 'rgba(247, 148, 184, 0.15)') : 'transparent',
                border: `1px solid ${selectedYears.publication ? '#F794B8' : 'transparent'}`,
                userSelect: 'none',
                transition: 'all 0.15s ease'
              }}
            >
              {selectedYears.publication ? <CheckSquare size={16} color="#F794B8" /> : <Square size={16} color="#94a3b8" />}
              <span style={{ fontWeight: selectedYears.publication ? 600 : 400 }}>公開公告年</span>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F794B8', display: 'inline-block' }} />
            </label>
          </div>
        </div>
      </div>

      {/* Missing Columns Warning Banner if any checked dimension is not found in file */}
      {trendData.missingFields.length > 0 && (
        <div style={{
          padding: '0.65rem 1.5rem',
          background: isDark ? 'rgba(245, 158, 11, 0.12)' : '#fffbeb',
          borderBottom: `1px solid ${isDark ? 'rgba(245, 158, 11, 0.3)' : '#fef3c7'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          fontSize: '0.85rem',
          color: isDark ? '#fbbf24' : '#b45309'
        }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>
            <strong>欄位缺漏提醒：</strong> 上傳的專利清單中缺少 {trendData.missingFields.join('、')}，該維度目前無法產生趨勢柱狀圖。請確認上傳清單是否包含對應欄位。
          </span>
        </div>
      )}

      {/* Plotly Canvas Container */}
      <div style={{ minHeight: '750px', height: '750px', width: '100%', position: 'relative' }}>
        {plotlyData.length > 0 ? (
          <Plot
            data={plotlyData}
            layout={layout}
            useResizeHandler={true}
            style={{ width: '100%', height: '100%' }}
            config={{
              responsive: true,
              displayModeBar: true,
              displaylogo: false,
              modeBarButtonsToRemove: ['lasso2d', 'select2d']
            }}
          />
        ) : (
          <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            color: isDark ? '#94a3b8' : '#64748b'
          }}>
            <AlertTriangle size={36} style={{ color: '#f59e0b' }} />
            <h4 style={{ margin: 0, color: isDark ? '#f8fafc' : '#1e293b' }}>無法顯示趨勢圖</h4>
            <p style={{ margin: 0, fontSize: '0.88rem' }}>
              資料清單中缺乏有效日期資料或缺少對應欄位。
            </p>
          </div>
        )}
      </div>

      {/* Collapsible Yearly Breakdown Table */}
      {trendData.allYears.length > 0 && (
        <details style={{
          padding: '0.6rem 1.5rem',
          background: isDark ? '#1e293b' : '#f8fafc',
          borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`,
          fontSize: '0.95rem',
          color: isDark ? '#cbd5e1' : '#475569'
        }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, color: isDark ? '#f1f5f9' : '#334155', userSelect: 'none' }}>
            檢視各年份專利{metric === 'case' ? '案數' : '件數'}數據明細表
          </summary>
          <div style={{ overflowX: 'auto', marginTop: '0.6rem', maxHeight: '220px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '1.0rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                <tr style={{ color: isDark ? '#f8fafc' : '#1e293b' }}>
                  <th style={{ position: 'sticky', top: 0, zIndex: 2, background: isDark ? '#334155' : '#b3d1f8ff', padding: '0.45rem 0.6rem', border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}` }}>年份</th>
                  {selectedYears.priority && (
                    <th style={{ position: 'sticky', top: 0, zIndex: 2, background: isDark ? '#334155' : '#b3d1f8ff', padding: '0.45rem 0.6rem', border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}` }}>優先權年 ({metric === 'case' ? '案' : '件'})</th>
                  )}
                  {selectedYears.application && (
                    <th style={{ position: 'sticky', top: 0, zIndex: 2, background: isDark ? '#334155' : '#b3d1f8ff', padding: '0.45rem 0.6rem', border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}` }}>申請年 ({metric === 'case' ? '案' : '件'})</th>
                  )}
                  {selectedYears.publication && (
                    <th style={{ position: 'sticky', top: 0, zIndex: 2, background: isDark ? '#334155' : '#b3d1f8ff', padding: '0.45rem 0.6rem', border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}` }}>公開公告年 ({metric === 'case' ? '案' : '件'})</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {trendData.allYears.map(y => (
                  <tr key={y} style={{ borderBottom: `1px solid ${isDark ? '#334155' : '#e2e8f0'}` }}>
                    <td style={{ padding: '0.35rem 0.6rem', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, fontWeight: 600 }}>{y}</td>
                    {selectedYears.priority && (
                      <td style={{ padding: '0.35rem 0.6rem', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, color: isDark ? '#fbbf24' : '#b45309', fontWeight: 600 }}>
                        {trendData.priorityCounts[y] || 0}
                      </td>
                    )}
                    {selectedYears.application && (
                      <td style={{ padding: '0.35rem 0.6rem', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, color: isDark ? '#38bdf8' : '#0284c7', fontWeight: 600 }}>
                        {trendData.appCounts[y] || 0}
                      </td>
                    )}
                    {selectedYears.publication && (
                      <td style={{ padding: '0.35rem 0.6rem', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, color: isDark ? '#f472b6' : '#db2777', fontWeight: 600 }}>
                        {trendData.pubCounts[y] || 0}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
};

export default PatentTrendChart;
