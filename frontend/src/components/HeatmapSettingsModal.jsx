import React, { useState, useEffect, useMemo } from 'react';
import { Settings, X as XIcon, Sparkles, Filter, Layers, BarChart2, Check } from 'lucide-react';

const HeatmapSettingsModal = ({
  isOpen,
  onClose,
  onApply,
  currentConfig,
  allAvailableFields = [],
  patents = [],
  theme = 'dark'
}) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';

  // Local state for modal settings
  const [filterField, setFilterField] = useState(currentConfig?.filterField || '');
  const [filterValue, setFilterValue] = useState(currentConfig?.filterValue || '__ALL__');

  const [xAxisLevels, setXAxisLevels] = useState(currentConfig?.xAxisLevels || 1);
  const [xAxisField1, setXAxisField1] = useState(currentConfig?.xAxisFields?.[0] || '技術1階');
  const [xAxisField2, setXAxisField2] = useState(currentConfig?.xAxisFields?.[1] || '');
  const [xAxisTopN, setXAxisTopN] = useState(currentConfig?.xAxisTopN || 'all');

  const [yAxisLevels, setYAxisLevels] = useState(currentConfig?.yAxisLevels || 1);
  const [yAxisField1, setYAxisField1] = useState(currentConfig?.yAxisFields?.[0] || '功效節點');
  const [yAxisField2, setYAxisField2] = useState(currentConfig?.yAxisFields?.[1] || '');
  const [yAxisTopN, setYAxisTopN] = useState(currentConfig?.yAxisTopN || 'all');

  // Sync state when modal opens or currentConfig changes
  useEffect(() => {
    if (currentConfig) {
      setFilterField(currentConfig.filterField || '');
      setFilterValue(currentConfig.filterValue || '__ALL__');

      setXAxisLevels(currentConfig.xAxisLevels || (currentConfig.xAxisFields?.length > 1 ? 2 : 1));
      setXAxisField1(currentConfig.xAxisFields?.[0] || '技術1階');
      setXAxisField2(currentConfig.xAxisFields?.[1] || '');
      setXAxisTopN(currentConfig.xAxisTopN || 'all');

      setYAxisLevels(currentConfig.yAxisLevels || (currentConfig.yAxisFields?.length > 1 ? 2 : 1));
      setYAxisField1(currentConfig.yAxisFields?.[0] || '功效節點');
      setYAxisField2(currentConfig.yAxisFields?.[1] || '');
      setYAxisTopN(currentConfig.yAxisTopN || 'all');
    }
  }, [currentConfig, isOpen]);

  // Compute unique filter values when filterField changes
  const filterValueOptions = useMemo(() => {
    if (!filterField || filterField === '__NONE__') return [];
    const set = new Set();
    patents.forEach(p => {
      let raw = p[filterField];
      if (!raw && filterField === 'Optimized Assignee') raw = p['專利權人'] || p['權利人'] || p['申請人'];
      if (!raw && (filterField === '申請年' || filterField === '申請日')) {
        raw = p['申請年'] || (p['申請日'] ? String(p['申請日']).slice(0, 4) : null);
      }
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
        const valStr = String(raw).trim();
        if (valStr.includes(',') || valStr.includes('、')) {
          valStr.split(/[,、]/).forEach(v => set.add(v.trim()));
        } else {
          set.add(valStr);
        }
      }
    });
    return Array.from(set).sort();
  }, [filterField, patents]);

  // Handle preset templates (Requirement 4e)
  const applyPresetKeyTechVsYear = () => {
    // X-axis: All application years (1 level)
    // Y-axis: Top 5 Tech Level 1 (1 level)
    let yearField = allAvailableFields.find(f => f.id === '申請年' || f.id === '申請日')?.id || '申請年';
    let tech1Field = allAvailableFields.find(f => f.id === '技術1階')?.id || '技術1階';

    setXAxisLevels(1);
    setXAxisField1(yearField);
    setXAxisField2('');
    setXAxisTopN('all');

    setYAxisLevels(1);
    setYAxisField1(tech1Field);
    setYAxisField2('');
    setYAxisTopN(5);
  };

  const applyPresetKeyTechVsCompany = () => {
    // X-axis: Top 10 Tech Level 1 > Tech Level 2 (2 levels)
    // Y-axis: Top 10 Optimized Assignee (1 level)
    let tech1Field = allAvailableFields.find(f => f.id === '技術1階')?.id || '技術1階';
    let tech2Field = allAvailableFields.find(f => f.id === '技術2階')?.id || '技術2階';
    let companyField = allAvailableFields.find(f =>
      ['Optimized Assignee', '專利權人', '權利人', '申請人'].includes(f.id)
    )?.id || 'Optimized Assignee';

    setXAxisLevels(2);
    setXAxisField1(tech1Field);
    setXAxisField2(tech2Field);
    setXAxisTopN(10);

    setYAxisLevels(1);
    setYAxisField1(companyField);
    setYAxisField2('');
    setYAxisTopN(10);
  };

  // Check which fields are selected on X or Y for mutual exclusion (Requirement 4c)
  const isSelectedInX = (fieldId) => {
    if (!fieldId) return false;
    return xAxisField1 === fieldId || (xAxisLevels === 2 && xAxisField2 === fieldId);
  };

  const isSelectedInY = (fieldId) => {
    if (!fieldId) return false;
    return yAxisField1 === fieldId || (yAxisLevels === 2 && yAxisField2 === fieldId);
  };

  const handleApply = () => {
    const xFields = xAxisLevels === 2 && xAxisField2 ? [xAxisField1, xAxisField2] : [xAxisField1];
    const yFields = yAxisLevels === 2 && yAxisField2 ? [yAxisField1, yAxisField2] : [yAxisField1];

    onApply({
      filterField: filterField === '__NONE__' ? '' : filterField,
      filterValue: filterValue === '__ALL__' ? '' : filterValue,
      xAxisLevels,
      xAxisFields: xFields,
      xAxisTopN,
      yAxisLevels,
      yAxisFields: yFields,
      yAxisTopN
    });
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
      onClick={onClose}
    >
      {/* Outer frosted glass backdrop box ~5% larger with matching rounded corners */}
      <div
        style={{
          padding: '16px',
          borderRadius: '24px',
          backgroundColor: isDark ? 'rgba(30, 41, 59, 0.75)' : 'rgba(255, 255, 255, 0.65)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.8)'}`,
          boxShadow: isDark
            ? '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(255, 255, 255, 0.1)'
            : '0 20px 40px -10px rgba(0, 0, 0, 0.12)',
          maxWidth: '820px',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
          borderRadius: '16px',
          width: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: isDark ? '0 10px 30px rgba(0, 0, 0, 0.5)' : '0 10px 25px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          color: isDark ? '#f8fafc' : '#0f172a'
        }}>
          {/* Modal Header */}
          <div style={{
            padding: '20px 24px',
            borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
            background: isDark
              ? 'linear-gradient(135deg, rgba(30, 41, 59, 1) 0%, rgba(15, 23, 42, 1) 100%)'
              : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(14, 165, 233, 0.3)'
            }}>
              <Settings size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: isDark ? '#ffffff' : '#0f172a' }}>
                ⚙️ 熱圖與氣泡圖繪圖進階設定
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                自訂 X / Y 軸分析維度、階層深度、Top-N 統計數量與全域資料篩選
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: isDark ? '#94a3b8' : '#64748b',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <XIcon size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Preset Templates Section (4e) */}
          <div style={{
            padding: '14px 16px',
            borderRadius: '12px',
            background: isDark ? 'rgba(14, 165, 233, 0.08)' : 'rgba(14, 165, 233, 0.05)',
            border: `1px solid ${isDark ? 'rgba(14, 165, 233, 0.25)' : 'rgba(14, 165, 233, 0.15)'}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <Sparkles size={16} color={isDark ? '#38bdf8' : '#0284c7'} />
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: isDark ? '#7dd3fc' : '#0284c7' }}>
                模板快捷選項 (Presets)
              </span>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={applyPresetKeyTechVsYear}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: isDark ? 'rgba(30, 41, 59, 0.8)' : '#ffffff',
                  border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(2, 132, 199, 0.3)'}`,
                  color: isDark ? '#e2e8f0' : '#1e293b',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>📅 關鍵技術 vs. 申請年</span>
                <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>(X: 申請年 / Y: 前5大技術1階)</span>
              </button>

              <button
                type="button"
                onClick={applyPresetKeyTechVsCompany}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: isDark ? 'rgba(30, 41, 59, 0.8)' : '#ffffff',
                  border: `1px solid ${isDark ? 'rgba(168, 85, 247, 0.4)' : 'rgba(147, 51, 234, 0.3)'}`,
                  color: isDark ? '#e2e8f0' : '#1e293b',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>🏢 關鍵技術 vs. 公司</span>
                <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>(X: 前10大技術1&gt;2階 / Y: 前10大公司)</span>
              </button>
            </div>
          </div>

          {/* Global Single-Item Filter Section (4a) */}
          <div style={{
            padding: '14px 16px',
            borderRadius: '12px',
            background: isDark ? 'rgba(15, 23, 42, 0.5)' : 'rgba(241, 245, 249, 0.8)',
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <Filter size={16} color={isDark ? '#a855f7' : '#9333ea'} />
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: isDark ? '#e2e8f0' : '#1e293b' }}>
                整體資料單一項目篩選器 (Single-Item Filter)
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '4px' }}>
                  選擇篩選欄位：
                </label>
                <select
                  value={filterField || '__NONE__'}
                  onChange={e => {
                    const val = e.target.value;
                    setFilterField(val === '__NONE__' ? '' : val);
                    setFilterValue('__ALL__');
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'}`,
                    fontSize: '0.85rem'
                  }}
                >
                  <option value="__NONE__">不篩選 (包含全部資料)</option>
                  {allAvailableFields.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.emoji} {f.label} {f.isExcel ? '(Excel擴充欄位)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '4px' }}>
                  選擇篩選數值：
                </label>
                <select
                  disabled={!filterField || filterField === '__NONE__'}
                  value={filterValue}
                  onChange={e => setFilterValue(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    backgroundColor: (!filterField || filterField === '__NONE__')
                      ? (isDark ? '#1e293b' : '#f1f5f9')
                      : (isDark ? '#0f172a' : '#ffffff'),
                    color: isDark ? '#f8fafc' : '#0f172a',
                    border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'}`,
                    fontSize: '0.85rem',
                    opacity: (!filterField || filterField === '__NONE__') ? 0.5 : 1
                  }}
                >
                  <option value="__ALL__">全部數值 (不限定單一項目)</option>
                  {filterValueOptions.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* X Axis and Y Axis Cards (4b, 4c, 4d) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

            {/* X Axis Config Card */}
            <div style={{
              padding: '16px',
              borderRadius: '12px',
              background: isDark ? 'rgba(14, 165, 233, 0.05)' : 'rgba(14, 165, 233, 0.03)',
              border: `1px solid ${isDark ? 'rgba(14, 165, 233, 0.3)' : 'rgba(14, 165, 233, 0.2)'}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={16} color={isDark ? '#38bdf8' : '#0284c7'} />
                  <span style={{ fontSize: '0.92rem', fontWeight: 700, color: isDark ? '#7dd3fc' : '#0284c7' }}>
                    X 軸維度與數量設定
                  </span>
                </div>

                {/* Level Toggle (4b) */}
                <div style={{ display: 'flex', background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)', borderRadius: '6px', padding: '2px' }}>
                  <button
                    type="button"
                    onClick={() => setXAxisLevels(1)}
                    style={{
                      padding: '2px 8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '4px',
                      border: 'none',
                      background: xAxisLevels === 1 ? '#0ea5e9' : 'transparent',
                      color: xAxisLevels === 1 ? '#fff' : (isDark ? '#94a3b8' : '#64748b'),
                      cursor: 'pointer'
                    }}
                  >
                    1階
                  </button>
                  <button
                    type="button"
                    onClick={() => setXAxisLevels(2)}
                    style={{
                      padding: '2px 8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '4px',
                      border: 'none',
                      background: xAxisLevels === 2 ? '#0ea5e9' : 'transparent',
                      color: xAxisLevels === 2 ? '#fff' : (isDark ? '#94a3b8' : '#64748b'),
                      cursor: 'pointer'
                    }}
                  >
                    2階
                  </button>
                </div>
              </div>

              {/* X Field 1 (4c) */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '3px' }}>
                  X 軸第 1 階項目：
                </label>
                <select
                  value={xAxisField1}
                  onChange={e => setXAxisField1(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    border: `1px solid ${isDark ? 'rgba(14, 165, 233, 0.4)' : 'rgba(14, 165, 233, 0.3)'}`,
                    fontSize: '0.85rem'
                  }}
                >
                  {allAvailableFields.map(f => {
                    const disabledInY = isSelectedInY(f.id);
                    return (
                      <option key={f.id} value={f.id} disabled={disabledInY}>
                        {f.emoji} {f.label} {disabledInY ? '(Y軸已選)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* X Field 2 (4c) */}
              {xAxisLevels === 2 && (
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '0.76rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '3px' }}>
                    X 軸第 2 階項目：
                  </label>
                  <select
                    value={xAxisField2}
                    onChange={e => setXAxisField2(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      border: `1px solid ${isDark ? 'rgba(14, 165, 233, 0.4)' : 'rgba(14, 165, 233, 0.3)'}`,
                      fontSize: '0.85rem'
                    }}
                  >
                    <option value="">(請選擇第二階欄位)</option>
                    {allAvailableFields.map(f => {
                      const disabledInY = isSelectedInY(f.id);
                      const isSameAsX1 = f.id === xAxisField1;
                      return (
                        <option key={f.id} value={f.id} disabled={disabledInY || isSameAsX1}>
                          {f.emoji} {f.label} {isSameAsX1 ? '(X軸1階已選)' : disabledInY ? '(Y軸已選)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* X Top-N Count (4d) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '3px' }}>
                  X 軸呈現數量排序 (Top-N)：
                </label>
                <select
                  value={xAxisTopN}
                  onChange={e => {
                    const val = e.target.value;
                    setXAxisTopN(val === 'all' ? 'all' : Number(val));
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'}`,
                    fontSize: '0.85rem'
                  }}
                >
                  <option value={5}>i. 前 5 大專利件數項目</option>
                  <option value={10}>ii. 前 10 大專利件數項目</option>
                  <option value={20}>iii. 前 20 大專利件數項目</option>
                  <option value="all">iv. 全部數目</option>
                </select>
              </div>
            </div>

            {/* Y Axis Config Card */}
            <div style={{
              padding: '16px',
              borderRadius: '12px',
              background: isDark ? 'rgba(168, 85, 247, 0.05)' : 'rgba(168, 85, 247, 0.03)',
              border: `1px solid ${isDark ? 'rgba(168, 85, 247, 0.3)' : 'rgba(168, 85, 247, 0.2)'}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={16} color={isDark ? '#c084fc' : '#9333ea'} />
                  <span style={{ fontSize: '0.92rem', fontWeight: 700, color: isDark ? '#d8b4fe' : '#9333ea' }}>
                    Y 軸維度與數量設定
                  </span>
                </div>

                {/* Level Toggle (4b) */}
                <div style={{ display: 'flex', background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)', borderRadius: '6px', padding: '2px' }}>
                  <button
                    type="button"
                    onClick={() => setYAxisLevels(1)}
                    style={{
                      padding: '2px 8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '4px',
                      border: 'none',
                      background: yAxisLevels === 1 ? '#a855f7' : 'transparent',
                      color: yAxisLevels === 1 ? '#fff' : (isDark ? '#94a3b8' : '#64748b'),
                      cursor: 'pointer'
                    }}
                  >
                    1階
                  </button>
                  <button
                    type="button"
                    onClick={() => setYAxisLevels(2)}
                    style={{
                      padding: '2px 8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '4px',
                      border: 'none',
                      background: yAxisLevels === 2 ? '#a855f7' : 'transparent',
                      color: yAxisLevels === 2 ? '#fff' : (isDark ? '#94a3b8' : '#64748b'),
                      cursor: 'pointer'
                    }}
                  >
                    2階
                  </button>
                </div>
              </div>

              {/* Y Field 1 (4c) */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '3px' }}>
                  Y 軸第 1 階項目：
                </label>
                <select
                  value={yAxisField1}
                  onChange={e => setYAxisField1(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    border: `1px solid ${isDark ? 'rgba(168, 85, 247, 0.4)' : 'rgba(168, 85, 247, 0.3)'}`,
                    fontSize: '0.85rem'
                  }}
                >
                  {allAvailableFields.map(f => {
                    const disabledInX = isSelectedInX(f.id);
                    return (
                      <option key={f.id} value={f.id} disabled={disabledInX}>
                        {f.emoji} {f.label} {disabledInX ? '(X軸已選)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Y Field 2 (4c) */}
              {yAxisLevels === 2 && (
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '0.76rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '3px' }}>
                    Y 軸第 2 階項目：
                  </label>
                  <select
                    value={yAxisField2}
                    onChange={e => setYAxisField2(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      border: `1px solid ${isDark ? 'rgba(168, 85, 247, 0.4)' : 'rgba(168, 85, 247, 0.3)'}`,
                      fontSize: '0.85rem'
                    }}
                  >
                    <option value="">(請選擇第二階欄位)</option>
                    {allAvailableFields.map(f => {
                      const disabledInX = isSelectedInX(f.id);
                      const isSameAsY1 = f.id === yAxisField1;
                      return (
                        <option key={f.id} value={f.id} disabled={disabledInX || isSameAsY1}>
                          {f.emoji} {f.label} {isSameAsY1 ? '(Y軸1階已選)' : disabledInX ? '(X軸已選)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Y Top-N Count (4d) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '3px' }}>
                  Y 軸呈現數量排序 (Top-N)：
                </label>
                <select
                  value={yAxisTopN}
                  onChange={e => {
                    const val = e.target.value;
                    setYAxisTopN(val === 'all' ? 'all' : Number(val));
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'}`,
                    fontSize: '0.85rem'
                  }}
                >
                  <option value={5}>i. 前 5 大專利件數項目</option>
                  <option value={10}>ii. 前 10 大專利件數項目</option>
                  <option value={20}>iii. 前 20 大專利件數項目</option>
                  <option value="all">iv. 全部數目</option>
                </select>
              </div>
            </div>

          </div>

        </div>

        {/* Modal Footer (4f) */}
        <div style={{
          padding: '16px 24px',
          borderTop: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(248, 250, 252, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              backgroundColor: 'transparent',
              color: isDark ? '#94a3b8' : '#64748b',
              border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)'}`,
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleApply}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 20px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
              color: '#ffffff',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(14, 165, 233, 0.3)'
            }}
          >
            <Check size={16} />
            <span>確定並套用繪圖</span>
          </button>
        </div>
      </div>
    </div>
  </div>
);
};

export default HeatmapSettingsModal;
