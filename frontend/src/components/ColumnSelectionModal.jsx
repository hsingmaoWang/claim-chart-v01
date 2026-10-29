import React, { useState, useEffect } from 'react';
import { Lock, CheckSquare, Square, Sparkles, FileSpreadsheet, Check, Info, Layers, RefreshCw } from 'lucide-react';

const ColumnSelectionModal = ({ isOpen, onClose, onConfirm, columnData }) => {
  if (!isOpen || !columnData) return null;

  const {
    filename = '',
    required_columns = [],
    selectable_columns = [],
    recommended_columns = [],
    ai_generated_columns = [],
    patent_processing = null
  } = columnData;

  // State for user checked selectable columns
  const [selectedCols, setSelectedCols] = useState([]);
  const [enableScreening, setEnableScreening] = useState(false);

  // Initialize selected columns with recommended columns
  useEffect(() => {
    if (selectable_columns && selectable_columns.length > 0) {
      // Default select recommended columns, or select all if none specified
      if (recommended_columns && recommended_columns.length > 0) {
        setSelectedCols([...recommended_columns]);
      } else {
        setSelectedCols([...selectable_columns]);
      }
    } else {
      setSelectedCols([]);
    }
  }, [columnData]);

  const toggleColumn = (col) => {
    if (selectedCols.includes(col)) {
      setSelectedCols(selectedCols.filter(c => c !== col));
    } else {
      setSelectedCols([...selectedCols, col]);
    }
  };

  const handleSelectAll = () => {
    setSelectedCols([...selectable_columns]);
  };

  const handleDeselectAll = () => {
    setSelectedCols([]);
  };

  const handleSelectRecommended = () => {
    if (recommended_columns && recommended_columns.length > 0) {
      setSelectedCols([...recommended_columns]);
    }
  };

  const handleConfirm = () => {
    // Combine required columns and user selected columns
    const finalSelected = Array.from(new Set([...required_columns, ...selectedCols]));
    onConfirm(finalSelected, enableScreening);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'transparent',
      backdropFilter: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#80bce1ff',
        border: '1px solid rgba(5, 100, 177, 0.1)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '950px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(16, 16, 16, 0.5), 0 0 30px rgba(59, 130, 246, 0.15)',
        overflow: 'hidden',
        color: '#f8fafc',
        animation: 'modalSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 28px 18px 28px',
          borderBottom: '1px solid rgba(3, 82, 131, 0.08)',
          background: 'linear-gradient(135deg, rgba(109, 187, 197, 1) 0%, rgba(50, 108, 243, 1) 100%)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '16px'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
          }}>
            <FileSpreadsheet size={24} color="#ffffff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#ffffff' }}>
                選取讀取與圖表分析欄位
              </h3>
              <span style={{
                fontSize: '0.75rem',
                padding: '2px 8px',
                borderRadius: '12px',
                backgroundColor: 'rgba(11, 34, 71, 0.2)',
                color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                fontWeight: 500
              }}>
                預處理設定
              </span>
            </div>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.875rem', color: '#111a276e' }}>
              檔案：<span style={{ color: '#cbd5e1', fontWeight: 500 }}>{filename}</span>
            </p>

            {/* 依據 patent-list-processing Skill 顯示自動處理項目與計數結果 */}
            {patent_processing && (
              <div style={{
                marginTop: '10px',
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 14px',
                borderRadius: '10px',
                backgroundColor: 'rgba(67, 106, 164, 0.45)',
                border: '1px solid rgba(255, 255, 255, 0.22)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
              }}>
                {/* 第一列：統計計數結果徽章 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#93c5fd',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    計數結果：
                  </span>
                  <span style={{
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    backgroundColor: 'rgba(59, 130, 246, 0.35)',
                    padding: '3px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(147, 197, 253, 0.5)',
                    letterSpacing: '0.3px'
                  }}>
                    {patent_processing.family_cases != null
                      ? `${patent_processing.family_cases.toLocaleString()} 案 / ${patent_processing.family_pieces.toLocaleString()} 件`
                      : `${patent_processing.merged_count.toLocaleString()} 件`}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#e2e8f0' }}>
                    {patent_processing.pub_merge_performed && patent_processing.dedup_count > 0
                      ? `(原始 ${patent_processing.raw_count.toLocaleString()} 件，公開公告合併去重 ${patent_processing.dedup_count.toLocaleString()} 件)`
                      : `(原始共 ${patent_processing.raw_count.toLocaleString()} 件)`}
                  </span>
                </div>

                {/* 第二列：已進行處理項目 與 未進行處理項目 (缺少欄位說明) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem' }}>
                  {/* 已進行處理項目 */}
                  {patent_processing.processed_items && patent_processing.processed_items.map((item, idx) => (
                    <div key={`proc-${idx}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#f1f5f9' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(34, 197, 94, 0.3)',
                        color: '#4ade80',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        flexShrink: 0,
                        marginTop: '1px'
                      }}>✓</span>
                      <span>
                        <strong style={{ color: '#86efac', marginRight: '6px' }}>[已完成]</strong>
                        {item.message}
                      </span>
                    </div>
                  ))}

                  {/* 未進行處理項目 (缺少相關欄位資訊) */}
                  {patent_processing.unprocessed_items && patent_processing.unprocessed_items.map((item, idx) => (
                    <div key={`unproc-${idx}`} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#fef3c7' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(245, 158, 11, 0.3)',
                        color: '#fbbf24',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        flexShrink: 0,
                        marginTop: '1px'
                      }}>!</span>
                      <span>
                        <strong style={{ color: '#fcd34d', marginRight: '6px' }}>[未進行]</strong>
                        {item.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div style={{
          padding: '24px 28px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          {/* Required Fields Section */}
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px'
            }}>
              <Lock size={16} color="#198bc0ff" />
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#2c4467ff' }}>
                核心必要欄位 <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#64748b' }}>(強制載入 / 無需變更)</span>
              </h4>
            </div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              padding: '12px 14px',
              backgroundColor: '#88c1e4ff',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
              {required_columns && required_columns.length > 0 ? (
                required_columns.map((col, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(53, 119, 154, 0.77)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    color: '#cbd5e1',
                    fontSize: '0.85rem',
                    fontWeight: 500
                  }}>
                    <Lock size={12} color="#adc3e1ff" />
                    <span>{col}</span>
                  </div>
                ))
              ) : (
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>已自動識別基本專利檢索欄位</span>
              )}
            </div>
          </div>

          {/* Selectable Fields Section */}
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} color="#198bc0ff" />
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#2c4467ff' }}>
                  可選圖表與統計分析欄位
                </h4>
                <span style={{
                  fontSize: '0.75rem',
                  color: '#64748b',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  padding: '2px 8px',
                  borderRadius: '10px'
                }}>
                  已選取 {selectedCols.length} / {selectable_columns.length} 個
                </span>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    color: '#2c6cb9ff',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    cursor: 'pointer',
                    fontWeight: 500,
                    transition: 'all 0.15s ease'
                  }}
                >
                  全選
                </button>
                {recommended_columns && recommended_columns.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectRecommended}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(92, 189, 157, 0.63)',
                      color: '#147f58ff',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      cursor: 'pointer',
                      fontWeight: 500,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    常用推薦
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    color: '#6c7a8fff',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    cursor: 'pointer',
                    fontWeight: 500,
                    transition: 'all 0.15s ease'
                  }}
                >
                  清空
                </button>
              </div>
            </div>

            {/* Field Grid */}
            {selectable_columns && selectable_columns.length > 0 ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '10px',
                maxHeight: '220px',
                overflowY: 'auto',
                padding: '4px'
              }}>
                {selectable_columns.map((col, idx) => {
                  const isChecked = selectedCols.includes(col);
                  const isRecommended = recommended_columns.includes(col);
                  return (
                    <div
                      key={idx}
                      onClick={() => toggleColumn(col)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        backgroundColor: isChecked ? 'rgba(43, 93, 174, 0.3)' : 'rgba(132, 153, 189, 0.3)',
                        border: isChecked ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
                        color: isChecked ? '#ffffffff' : '#5d6672ff',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        userSelect: 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <div style={{ color: isChecked ? '#ece0bbff' : '#64748b' }}>
                          {isChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                        </div>
                        <span style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontWeight: isChecked ? 600 : 400
                        }}>
                          {col}
                        </span>
                      </div>

                      {isRecommended && (
                        <span style={{
                          fontSize: '0.68rem',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(16, 185, 129, 0.2)',
                          color: '#b6e7d6ff',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}>
                          推薦
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: '#64748b',
                fontSize: '0.875rem',
                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                borderRadius: '8px'
              }}>
                此 Excel 無其他額外可供分析之自訂欄位
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 28px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'linear-gradient(135deg, rgba(50, 108, 243, 1) 0%, rgba(100, 141, 236, 1) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: '8px', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={enableScreening}
              onChange={(e) => setEnableScreening(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#3b82f6' }}
            />
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: enableScreening ? '#85f1ffff' : '#bec7d5ff' }}>
              🔍 接續進行落入範圍初篩設定 (Scope Screening)
            </span>
          </label>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginLeft: 'auto' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                backgroundColor: 'transparent',
                color: '#c1c9d3ff',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              取消
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 22px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                border: 'none',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
                transition: 'all 0.15s ease'
              }}
            >
              <Sparkles size={16} />
              <span>{enableScreening ? '下一步：初篩設定' : '確定並開始預處理'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColumnSelectionModal;
