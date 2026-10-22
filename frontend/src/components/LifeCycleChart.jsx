import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-dist-min';
import { TrendingUp, Users, FileText, Info, Sun, Moon } from 'lucide-react';

const Plot = createPlotlyComponent(Plotly);

// Distinct vibrant color palette for yearly points (matches reference image style)
const POINT_COLORS = [
  '#e74c3c', '#e67e22', '#f39c12', '#27ae60', '#16a085',
  '#2980b9', '#8e44ad', '#2c3e50', '#d35400', '#c0392b',
  '#1abc9c', '#3498db', '#9b59b6', '#34495e', '#7f8c8d',
  '#b8860b', '#4682b4', '#008080', '#6b8e23', '#483d8b',
  '#d2691e', '#20b2aa', '#cd5c5c', '#5f9ea0', '#9932cc'
];

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
  if (!str) return null;

  // 1. Check if numeric Excel serial date
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

// Split multi-assignee string by common delimiters (e.g., semicolons, commas, Chinese ideographic commas)
const parseAssignees = (rawVal) => {
  if (!rawVal) return [];
  if (Array.isArray(rawVal)) {
    return rawVal.map(s => String(s).trim()).filter(Boolean);
  }
  const str = String(rawVal).trim();
  if (!str) return [];
  return str.split(/[;,、\n\r]+/).map(s => s.trim()).filter(Boolean);
};

const findFieldCaseInsensitive = (item, candidateKeys) => {
  if (!item) return undefined;
  const keys = Object.keys(item);
  for (const candidate of candidateKeys) {
    const candNorm = candidate.toLowerCase().trim();
    for (const k of keys) {
      if (k.toLowerCase().trim() === candNorm) {
        return item[k];
      }
    }
  }
  for (const candidate of candidateKeys) {
    const candNorm = candidate.toLowerCase().trim();
    for (const k of keys) {
      if (k.toLowerCase().trim().includes(candNorm)) {
        return item[k];
      }
    }
  }
  return undefined;
};

const LifeCycleChart = ({ treeData, onCaptureReady, authState }) => {
  const plotRef = useRef(null);
  // Theme state: 'light' or 'dark'
  const [theme, setTheme] = useState('light');

  // Extract raw patents from treeData
  const rawPatents = useMemo(() => {
    if (!treeData) return [];
    if (Array.isArray(treeData.patents)) return treeData.patents;
    for (const key in treeData) {
      if (Array.isArray(treeData[key])) return treeData[key];
    }
    return [];
  }, [treeData]);

  // Consolidate into Representative Patents by Patent Family (Rule a: 專利家族案數為統計母體)
  const familyRepresentativePatents = useMemo(() => {
    if (!rawPatents || rawPatents.length === 0) return [];

    // Find family ID key
    const sample = rawPatents[0] || {};
    const familyKeyCandidate = Object.keys(sample).find(k => {
      const lower = k.toLowerCase().trim();
      return lower.includes('family') || lower.includes('家族');
    });

    // Find publication number key for country code priority
    const pubNumKeyCandidate = Object.keys(sample).find(k => {
      const lower = k.toLowerCase().trim();
      return lower.includes('publication number') || lower.includes('公開號') || lower.includes('專利號') || lower.includes('pub_no');
    });

    // Find publication date key for tie-breaking
    const pubDateKeyCandidate = Object.keys(sample).find(k => {
      const lower = k.toLowerCase().trim();
      return lower.includes('publication date') || lower.includes('公開日') || lower.includes('公告日') || lower.includes('pub_date');
    });

    if (!familyKeyCandidate) {
      // If no family ID column in dataset, each item represents 1 case
      return rawPatents;
    }

    const familyGroups = new Map();
    const noFamilyList = [];

    rawPatents.forEach((p) => {
      const rawFam = p[familyKeyCandidate];
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

      // Sort by country priority (US > WO > EP > TW > CN > JP > KR), then by publication date desc
      const sorted = [...group].sort((a, b) => {
        const pubA = pubNumKeyCandidate ? String(a[pubNumKeyCandidate] || '') : '';
        const pubB = pubNumKeyCandidate ? String(b[pubNumKeyCandidate] || '') : '';
        const ccA = extractCountryCode(pubA);
        const ccB = extractCountryCode(pubB);

        const rankA = COUNTRY_PRIORITY[ccA] || 99;
        const rankB = COUNTRY_PRIORITY[ccB] || 99;
        if (rankA !== rankB) return rankA - rankB;

        // Tie-breaker: latest publication date
        const dateA = pubDateKeyCandidate ? (extract4DigitYear(a[pubDateKeyCandidate]) || 0) : 0;
        const dateB = pubDateKeyCandidate ? (extract4DigitYear(b[pubDateKeyCandidate]) || 0) : 0;
        return dateB - dateA;
      });

      representatives.push(sorted[0]);
    });

    return representatives;
  }, [rawPatents]);

  // Step 1 & Step 2: Compute Life Cycle Coordinates with Requirement 4 (Math.ceil to integer)
  const lifeCycleData = useMemo(() => {
    if (!familyRepresentativePatents || familyRepresentativePatents.length === 0) {
      return { yearlyList: [], totalCases: 0, totalAssignees: 0 };
    }

    // Step 1: Group by Application Year
    const appDateCandidates = ['Application Date', 'application date', '申請日', '申請年', '申請日期', 'app_date', 'application_date'];
    const assigneeCandidates = ['Assignee/Applicant', 'assignee/applicant', 'Optimized Assignee', 'optimized assignee', '專利權人', '申請人', '權利人', 'assignee', 'applicant'];

    const yearMap = new Map();
    let validPatentCount = 0;
    const allDistinctAssignees = new Set();

    familyRepresentativePatents.forEach(p => {
      const appDateVal = findFieldCaseInsensitive(p, appDateCandidates);
      const year = extract4DigitYear(appDateVal);
      if (!year || year < 1900 || year > 2100) return;

      const rawAssignee = findFieldCaseInsensitive(p, assigneeCandidates);
      const parsedAssignees = parseAssignees(rawAssignee);

      if (!yearMap.has(year)) {
        yearMap.set(year, {
          assignees: new Set(),
          caseCount: 0
        });
      }

      const entry = yearMap.get(year);
      entry.caseCount += 1;
      parsedAssignees.forEach(a => {
        entry.assignees.add(a);
        allDistinctAssignees.add(a);
      });
      validPatentCount += 1;
    });

    // Sort by Year ascending
    const sortedYears = Array.from(yearMap.keys()).sort((a, b) => a - b);
    const n = sortedYears.length;

    if (n === 0) {
      return { yearlyList: [], totalCases: 0, totalAssignees: 0 };
    }

    // Raw points (x1, y1)
    const rawPoints = sortedYears.map(year => {
      const entry = yearMap.get(year);
      return {
        year,
        x1: entry.assignees.size, // 專利權人數
        y1: entry.caseCount       // 專利案數
      };
    });

    // Step 2: Moving Average Calculation according to exact requirements:
    // - Except first and last years, middle years x,y = 3-year moving average of (previous, current, next) x1, y1
    // - First year x,y = 2-year moving average of (first year, closest next year) x1, y1
    // - Last year x,y = 2-year moving average of (last year, closest previous year) x1, y1
    // Requirement 4: X值和Y值的移動平均，以現在的計算方式，最後無條件進位到整數 (Math.ceil)
    const smoothedPoints = rawPoints.map((pt, i) => {
      let xSmooth = pt.x1;
      let ySmooth = pt.y1;

      if (n === 1) {
        xSmooth = pt.x1;
        ySmooth = pt.y1;
      } else if (n === 2) {
        xSmooth = (rawPoints[0].x1 + rawPoints[1].x1) / 2;
        ySmooth = (rawPoints[0].y1 + rawPoints[1].y1) / 2;
      } else {
        if (i === 0) {
          // 第一申請年: 第一年與最接近後一年 x1, y1 之二年移動平均
          xSmooth = (rawPoints[0].x1 + rawPoints[1].x1) / 2;
          ySmooth = (rawPoints[0].y1 + rawPoints[1].y1) / 2;
        } else if (i === n - 1) {
          // 最後申請年: 最後一年與最接近前一年 x1, y1 之二年移動平均
          xSmooth = (rawPoints[n - 2].x1 + rawPoints[n - 1].x1) / 2;
          ySmooth = (rawPoints[n - 2].y1 + rawPoints[n - 1].y1) / 2;
        } else {
          // 中間申請年: 最接近前一年、當年與最接近後一年 x1, y1 之三年移動平均
          xSmooth = (rawPoints[i - 1].x1 + rawPoints[i].x1 + rawPoints[i + 1].x1) / 3;
          ySmooth = (rawPoints[i - 1].y1 + rawPoints[i].y1 + rawPoints[i + 1].y1) / 3;
        }
      }

      return {
        year: pt.year,
        x1: pt.x1,
        y1: pt.y1,
        x: Math.ceil(xSmooth), // 無條件進位至整數
        y: Math.ceil(ySmooth)  // 無條件進位至整數
      };
    });

    return {
      yearlyList: smoothedPoints,
      totalCases: validPatentCount,
      totalAssignees: allDistinctAssignees.size
    };
  }, [familyRepresentativePatents]);

  // Capture Image handler for PNG download (supports dark and light background)
  const captureImage = useCallback(async () => {
    try {
      const container = plotRef.current;
      if (!container) return;

      const plotDiv = container.querySelector('.js-plotly-plot') || container;
      const w = plotDiv.offsetWidth || 1200;
      // Requirement 3: Height increased to 150% (750 * 1.5 = 1125)
      const h = plotDiv.offsetHeight || 1125;

      const dataUrl = await Plotly.toImage(plotDiv, {
        format: 'png',
        scale: 2,
        width: w,
        height: h
      });

      const now = new Date();
      const timestamp = now.toISOString().replace(/[-:.]/g, '').replace('T', '_').slice(0, 15);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `technology_lifecycle_${timestamp}.png`;
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
      console.error('Failed to capture lifecycle chart image', err);
    }
  }, [authState]);

  useEffect(() => {
    if (onCaptureReady) {
      onCaptureReady(() => captureImage);
    }
  }, [captureImage, onCaptureReady]);

  const { yearlyList, totalCases, totalAssignees } = lifeCycleData;

  // Prepare Plotly data traces based on theme
  const plotlyData = useMemo(() => {
    if (!yearlyList || yearlyList.length === 0) return [];

    const xCoords = yearlyList.map(pt => pt.x);
    const yCoords = yearlyList.map(pt => pt.y);
    const labels = yearlyList.map(pt => String(pt.year));
    const colors = yearlyList.map((pt, idx) => POINT_COLORS[idx % POINT_COLORS.length]);
    const customData = yearlyList.map(pt => [pt.x1, pt.y1]);

    const isDark = theme === 'dark';

    // Trace 1: The smooth spline line connecting points in order of application year
    const lineTrace = {
      type: 'scatter',
      mode: 'lines',
      x: xCoords,
      y: yCoords,
      line: {
        shape: 'spline',
        smoothing: 1.15,
        color: isDark ? '#38bdf8' : '#5B9BD5',
        width: 2.4
      },
      hoverinfo: 'skip',
      showlegend: false
    };

    // Trace 2: The distinct colored markers with year labels
    const markerTrace = {
      type: 'scatter',
      mode: 'markers+text',
      x: xCoords,
      y: yCoords,
      text: labels,
      textposition: 'top center',
      textfont: {
        family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        size: 12,
        color: isDark ? '#f8fafc' : '#334155'
      },
      marker: {
        size: 10,
        color: colors,
        line: {
          color: isDark ? '#0f172a' : '#ffffff',
          width: 1.8
        }
      },
      customdata: customData,
      hovertemplate:
        '<b>申請年：%{text}</b><br>' +
        '專利權人數 (移動平均): <b>%{x}</b> (原始: %{customdata[0]})<br>' +
        '專利案數 (移動平均): <b>%{y}</b> (原始: %{customdata[1]})' +
        '<extra></extra>',
      showlegend: false
    };

    return [lineTrace, markerTrace];
  }, [yearlyList, theme]);

  // Max bounds for axis layout with reasonable margin
  const maxX = useMemo(() => {
    if (!yearlyList.length) return 100;
    const maxVal = Math.max(...yearlyList.map(p => Math.max(p.x, p.x1)));
    return Math.ceil(maxVal * 1.1 / 10) * 10;
  }, [yearlyList]);

  const maxY = useMemo(() => {
    if (!yearlyList.length) return 100;
    const maxVal = Math.max(...yearlyList.map(p => Math.max(p.y, p.y1)));
    return Math.ceil(maxVal * 1.1 / 10) * 10;
  }, [yearlyList]);

  // Requirement 3: Y-axis height increased to 150% (height: 780px)
  const isDark = theme === 'dark';
  const layout = useMemo(() => ({
    title: {
      text: '<b>專利技術生命週期圖</b>',
      font: {
        family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang TC", "Microsoft JhengHei", sans-serif',
        size: 20,
        color: isDark ? '#f8fafc' : '#1e293b'
      },
      x: 0.5,
      y: 0.96
    },
    autosize: true,
    height: 780, // Requirement 3: 150% of original height (520px -> 780px)
    margin: { l: 85, r: 60, t: 80, b: 65 },
    paper_bgcolor: isDark ? '#0f172a' : '#ffffff',
    plot_bgcolor: isDark ? '#0f172a' : '#ffffff',
    xaxis: {
      title: {
        text: '<b>專利權人數</b>',
        font: { size: 16, color: isDark ? '#f1f5f9' : '#334155' }
      },
      range: [0, maxX],
      zeroline: true,
      zerolinecolor: isDark ? 'rgba(255,255,255,0.25)' : '#cbd5e1',
      zerolinewidth: 1.5,
      gridcolor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
      gridwidth: 1,
      linecolor: isDark ? 'rgba(255,255,255,0.25)' : '#94a3b8',
      linewidth: 1,
      tickfont: { size: 11, color: isDark ? '#94a3b8' : '#475569' }
    },
    yaxis: {
      title: {
        text: '<b>專利案數</b>',
        font: { size: 15, color: isDark ? '#f1f5f9' : '#334155' }
      },
      range: [0, maxY],
      zeroline: true,
      zerolinecolor: isDark ? 'rgba(255,255,255,0.25)' : '#cbd5e1',
      zerolinewidth: 1.5,
      gridcolor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
      gridwidth: 1,
      linecolor: isDark ? 'rgba(255,255,255,0.25)' : '#94a3b8',
      linewidth: 1,
      tickfont: { size: 11, color: isDark ? '#94a3b8' : '#475569' }
    },
    hoverlabel: {
      bgcolor: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(15, 23, 42, 0.92)',
      bordercolor: 'rgba(56, 189, 248, 0.5)',
      font: { color: '#ffffff', size: 12 }
    }
  }), [maxX, maxY, isDark]);

  if (!yearlyList || yearlyList.length === 0) {
    return (
      <div style={{
        height: '100%',
        minHeight: '780px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: isDark ? '#0f172a' : '#ffffff',
        borderRadius: '1rem',
        padding: '2rem',
        color: isDark ? '#94a3b8' : '#64748b',
        gap: '1rem'
      }}>
        <Info size={40} style={{ color: '#0ea5e9' }} />
        <h3 style={{ margin: 0, color: isDark ? '#f8fafc' : '#1e293b' }}>無有效申請年或專利權人資料</h3>
        <p style={{ margin: 0, fontSize: '0.9rem', maxWidth: '420px', textAlign: 'center' }}>
          技術生命週期圖需讀取專利清單中的「申請日 (Application Date)」與「專利權人 (Assignee/Applicant)」欄位。請確認上傳檔案是否包含對應欄位資訊。
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
      {/* Top Meta Summary Pill with Requirement 2 Theme Toggle Button */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: isDark ? '#38bdf8' : '#0369a1', fontSize: '0.88rem', fontWeight: 600 }}>
            <FileText size={16} />
            <span>統計母體：{totalCases} 專利家族案</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: isDark ? '#34d399' : '#047857', fontSize: '0.88rem', fontWeight: 600 }}>
            <Users size={16} />
            <span>涵蓋專利權人：{totalAssignees} 家</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: isDark ? '#a78bfa' : '#6366f1', fontSize: '0.88rem', fontWeight: 600 }}>
            <TrendingUp size={16} />
            <span>申請年份區間：{yearlyList[0]?.year} ~ {yearlyList[yearlyList.length - 1]?.year}（共 {yearlyList.length} 個年份）</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ fontSize: '0.84rem', color: isDark ? '#94a3b8' : '#576476ff' }}>
            * 座標採移動平均平滑後無條件進位至整數（端點 2 年平均、中間 3 年平均）
          </div>

          {/* Requirement 2: Exactly matching Day/Night Theme toggle button as other charts */}
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

      {/* Plotly Canvas Container - Requirement 3: Y-axis height increased to 150% (780px) */}
      <div style={{ minHeight: '780px', height: '780px', width: '100%', position: 'relative' }}>
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
      </div>

      {/* Collapsible/Compact Yearly Data Breakdown Accordion */}
      <details style={{
        padding: '0.6rem 1.5rem',
        background: isDark ? '#1e293b' : '#f8fafc',
        borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`,
        fontSize: '0.95rem',
        color: isDark ? '#cbd5e1' : '#475569'
      }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: isDark ? '#f1f5f9' : '#334155', userSelect: 'none' }}>
          檢視各申請年數據明細表（原始值 vs 移動平均值，整數進位）
        </summary>
        <div style={{ overflowX: 'auto', marginTop: '0.6rem', maxHeight: '200px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.9rem' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr style={{ color: isDark ? '#f8fafc' : '#1e293b' }}>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, background: isDark ? '#334155' : '#b3d1f8ff', padding: '0.45rem 0.6rem', border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`, boxShadow: isDark ? '0 1px 2px rgba(0,0,0,0.4)' : '0 1px 2px rgba(0,0,0,0.08)' }}>申請年</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, background: isDark ? '#334155' : '#b3d1f8ff', padding: '0.45rem 0.6rem', border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`, boxShadow: isDark ? '0 1px 2px rgba(0,0,0,0.4)' : '0 1px 2px rgba(0,0,0,0.08)' }}>原始專利權人數 (x1)</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, background: isDark ? '#334155' : '#b3d1f8ff', padding: '0.45rem 0.6rem', border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`, boxShadow: isDark ? '0 1px 2px rgba(0,0,0,0.4)' : '0 1px 2px rgba(0,0,0,0.08)' }}>原始專利案數 (y1)</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, background: isDark ? '#334155' : '#b3d1f8ff', padding: '0.45rem 0.6rem', border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`, boxShadow: isDark ? '0 1px 2px rgba(0,0,0,0.4)' : '0 1px 2px rgba(0,0,0,0.08)' }}>X 座標 (移動平均整數)</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, background: isDark ? '#334155' : '#b3d1f8ff', padding: '0.45rem 0.6rem', border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`, boxShadow: isDark ? '0 1px 2px rgba(0,0,0,0.4)' : '0 1px 2px rgba(0,0,0,0.08)' }}>Y 座標 (移動平均整數)</th>
              </tr>
            </thead>
            <tbody>
              {yearlyList.map(pt => (
                <tr key={pt.year} style={{ borderBottom: `1px solid ${isDark ? '#334155' : '#e2e8f0'}` }}>
                  <td style={{ padding: '0.35rem 0.6rem', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, fontWeight: 600 }}>{pt.year}</td>
                  <td style={{ padding: '0.35rem 0.6rem', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}` }}>{pt.x1}</td>
                  <td style={{ padding: '0.35rem 0.6rem', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}` }}>{pt.y1}</td>
                  <td style={{ padding: '0.35rem 0.6rem', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, color: isDark ? '#38bdf8' : '#0284c7', fontWeight: 600 }}>{pt.x}</td>
                  <td style={{ padding: '0.35rem 0.6rem', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, color: isDark ? '#38bdf8' : '#0284c7', fontWeight: 600 }}>{pt.y}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
};

export default LifeCycleChart;
