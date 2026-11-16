import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, CheckCircle2, Search, X, FileSpreadsheet, ArrowRight, Edit3, Sparkles } from 'lucide-react';

const getTwValue = (item) => {
  if (!item) return '';
  if (item.val_tw !== undefined && item.val_tw !== null) return String(item.val_tw).trim();
  if (item.tw_value !== undefined && item.tw_value !== null) return String(item.tw_value).trim();
  return '';
};

const getEnValue = (item) => {
  if (!item) return '';
  if (item.val_en !== undefined && item.val_en !== null) return String(item.val_en).trim();
  if (item.en_value !== undefined && item.en_value !== null) return String(item.en_value).trim();
  return '';
};

const PublicationConflictModal = ({ isOpen, data, onConfirm, onCancel, isDark = false }) => {
  if (!isOpen || !data) return null;

  const {
    conflicts = [],
    auto_filled_count = 0,
    file_id = '',
    filename = ''
  } = data;

  // 儲存每列使用者的最終選擇或手動輸入: { [row]: string }
  const [resolutions, setResolutions] = useState({});
  const [searchTerm, setSearchTerm] = useState('');

  // 初始化每列的預設值（預設先以中文「專利公開公告號」為準，若無則以英文，使用者可隨時切換或手動編輯）
  useEffect(() => {
    if (conflicts && conflicts.length > 0) {
      const initial = {};
      conflicts.forEach(c => {
        const tw = getTwValue(c);
        const en = getEnValue(c);
        initial[c.row] = tw || en || '';
      });
      setResolutions(initial);
    } else {
      setResolutions({});
    }
  }, [conflicts]);

  // 全部以中文「專利公開公告號」為準
  const handleSelectAllTw = () => {
    const updated = {};
    conflicts.forEach(c => {
      updated[c.row] = getTwValue(c);
    });
    setResolutions(updated);
  };

  // 全部以英文「Publication Number」為準
  const handleSelectAllEn = () => {
    const updated = {};
    conflicts.forEach(c => {
      updated[c.row] = getEnValue(c);
    });
    setResolutions(updated);
  };

  // 單列手動更新
  const handleValueChange = (row, val) => {
    setResolutions(prev => ({
      ...prev,
      [row]: val
    }));
  };

  // 搜尋過濾
  const filteredConflicts = useMemo(() => {
    if (!searchTerm.trim()) return conflicts;
    const term = searchTerm.trim().toLowerCase();
    return conflicts.filter(c => {
      const rowStr = String(c.row);
      const tw = getTwValue(c).toLowerCase();
      const en = getEnValue(c).toLowerCase();
      const title = String(c.title || '').toLowerCase();
      const applicant = String(c.applicant || '').toLowerCase();
      const appNum = String(c.app_num || '').toLowerCase();
      return (
        rowStr.includes(term) ||
        tw.includes(term) ||
        en.includes(term) ||
        title.includes(term) ||
        applicant.includes(term) ||
        appNum.includes(term)
      );
    });
  }, [conflicts, searchTerm]);

  // 檢查是否所有列皆有填寫
  const isAllFilled = useMemo(() => {
    return conflicts.every(c => {
      const val = resolutions[c.row];
      return val !== undefined && String(val).trim() !== '';
    });
  }, [conflicts, resolutions]);

  // 點擊確認
  const handleConfirm = () => {
    const payload = conflicts.map(c => {
      const defaultVal = getTwValue(c) || getEnValue(c) || '';
      return {
        row: c.row,
        final_value: String(resolutions[c.row] !== undefined ? resolutions[c.row] : defaultVal).trim()
      };
    });
    onConfirm(payload);
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(5px)',
        padding: '1.5rem'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1050px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '1rem',
          background: isDark ? '#0f172a' : '#ffffff',
          color: isDark ? '#f8fafc' : '#1e293b',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : '#e2e8f0'}`,
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.75rem',
            borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: isDark ? 'rgba(30, 41, 59, 0.5)' : '#f8fafc'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '0.6rem',
                background: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444'
              }}
            >
              <AlertTriangle size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                  專利公開公告號比對與校正
                </h3>
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '9999px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#ef4444',
                    fontWeight: 600,
                    border: '1px solid rgba(239, 68, 68, 0.3)'
                  }}
                >
                  {conflicts.length} 筆資料不一致
                </span>
                {auto_filled_count > 0 && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '9999px',
                      background: 'rgba(59, 130, 246, 0.15)',
                      color: '#3b82f6',
                      fontWeight: 600,
                      border: '1px solid rgba(59, 130, 246, 0.3)'
                    }}
                  >
                    已自動互補 {auto_filled_count} 筆空白儲存格
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.83rem', color: isDark ? '#94a3b8' : '#64748b', marginTop: '0.25rem' }}>
                檔案：<span style={{ fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>{filename}</span> — 系統檢測到同時存在「專利公開公告號」與「Publication Number」兩欄位，且下列資料內容不完全一致，請檢視並確認最終數值。
              </div>
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              color: isDark ? '#94a3b8' : '#64748b',
              cursor: 'pointer',
              padding: '0.5rem',
              borderRadius: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
            title="關閉"
          >
            <X size={20} />
          </button>
        </div>

        {/* 批次操作與搜尋工具列 */}
        <div
          style={{
            padding: '0.85rem 1.75rem',
            background: isDark ? 'rgba(15, 23, 42, 0.8)' : '#ffffff',
            borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}
        >
          {/* 一鍵批次設定按鈕 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b' }}>
              快速批次設定：
            </span>
            <button
              onClick={handleSelectAllTw}
              style={{
                padding: '0.35rem 0.85rem',
                borderRadius: '0.4rem',
                border: `1px solid ${isDark ? 'rgba(59, 130, 246, 0.4)' : '#bfdbfe'}`,
                background: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff',
                color: isDark ? '#60a5fa' : '#2563eb',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.2s'
              }}
            >
              <Sparkles size={14} />
              全部以「專利公開公告號」為準
            </button>
            <button
              onClick={handleSelectAllEn}
              style={{
                padding: '0.35rem 0.85rem',
                borderRadius: '0.4rem',
                border: `1px solid ${isDark ? 'rgba(168, 85, 247, 0.4)' : '#e9d5ff'}`,
                background: isDark ? 'rgba(168, 85, 247, 0.15)' : '#faf5ff',
                color: isDark ? '#c084fc' : '#9333ea',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.2s'
              }}
            >
              <Sparkles size={14} />
              全部以「Publication Number」為準
            </button>
          </div>

          {/* 搜尋過濾 */}
          <div style={{ position: 'relative', width: '280px' }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '0.65rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: isDark ? '#64748b' : '#94a3b8'
              }}
            />
            <input
              type="text"
              placeholder="搜尋列號、專利號、申請人..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.38rem 0.65rem 0.38rem 2rem',
                fontSize: '0.82rem',
                borderRadius: '0.4rem',
                border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : '#cbd5e1'}`,
                background: isDark ? 'rgba(30, 41, 59, 0.5)' : '#ffffff',
                color: isDark ? '#f8fafc' : '#0f172a',
                outline: 'none'
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: isDark ? '#94a3b8' : '#64748b',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* 表格清單主體 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 1.75rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.83rem' }}>
            <thead>
              <tr
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                  background: isDark ? '#0f172a' : '#ffffff',
                  borderBottom: `2px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'}`,
                  color: isDark ? '#94a3b8' : '#64748b'
                }}
              >
                <th style={{ padding: '0.75rem 0.5rem', width: '60px' }}>行號</th>
                <th style={{ padding: '0.75rem 0.5rem', width: '220px' }}>專利基本資訊</th>
                <th style={{ padding: '0.75rem 0.5rem', width: '210px' }}>專利公開公告號 (中文)</th>
                <th style={{ padding: '0.75rem 0.5rem', width: '210px' }}>Publication Number (英文)</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>最終確認值 (手動修改)</th>
              </tr>
            </thead>
            <tbody>
              {filteredConflicts.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: isDark ? '#64748b' : '#94a3b8' }}>
                    查無符合搜尋條件之衝突專利資料
                  </td>
                </tr>
              ) : (
                filteredConflicts.map(item => {
                  const valTw = getTwValue(item);
                  const valEn = getEnValue(item);
                  const currentValue = resolutions[item.row] !== undefined ? resolutions[item.row] : (valTw || valEn || '');
                  const isMatchingTw = currentValue === valTw && valTw !== '';
                  const isMatchingEn = currentValue === valEn && valEn !== '';

                  return (
                    <tr
                      key={item.row}
                      style={{
                        borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9'}`,
                        transition: 'background 0.15s',
                        background: isDark ? 'transparent' : 'transparent'
                      }}
                    >
                      {/* 行號 */}
                      <td style={{ padding: '0.75rem 0.5rem', verticalAlign: 'top', color: isDark ? '#64748b' : '#94a3b8', fontWeight: 600 }}>
                        第 {item.row} 列
                      </td>

                      {/* 專利基本資訊 */}
                      <td style={{ padding: '0.75rem 0.5rem', verticalAlign: 'top' }}>
                        <div
                          style={{
                            fontWeight: 600,
                            color: isDark ? '#e2e8f0' : '#1e293b',
                            marginBottom: '0.2rem',
                            lineHeight: 1.35,
                            wordBreak: 'break-all'
                          }}
                        >
                          {item.title || '(無專利名稱)'}
                        </div>
                        {item.applicant && (
                          <div style={{ fontSize: '0.78rem', color: isDark ? '#94a3b8' : '#64748b' }}>
                            申請人: {item.applicant}
                          </div>
                        )}
                        {item.app_num && (
                          <div style={{ fontSize: '0.75rem', color: isDark ? '#64748b' : '#94a3b8' }}>
                            申請號: {item.app_num}
                          </div>
                        )}
                      </td>

                      {/* 專利公開公告號 (中文) */}
                      <td style={{ padding: '0.75rem 0.5rem', verticalAlign: 'top' }}>
                        <div
                          onClick={() => handleValueChange(item.row, valTw)}
                          style={{
                            padding: '0.4rem 0.6rem',
                            borderRadius: '0.375rem',
                            border: `1px solid ${isMatchingTw ? '#3b82f6' : (isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0')}`,
                            background: isMatchingTw ? (isDark ? 'rgba(59, 130, 246, 0.18)' : '#eff6ff') : (isDark ? 'rgba(30, 41, 59, 0.4)' : '#f8fafc'),
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            transition: 'all 0.15s'
                          }}
                          title="點擊套用此值"
                        >
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 600,
                              color: isMatchingTw ? (isDark ? '#60a5fa' : '#2563eb') : (isDark ? '#cbd5e1' : '#334155'),
                              wordBreak: 'break-all'
                            }}
                          >
                            {valTw || '<空白>'}
                          </span>
                          {isMatchingTw && <Check size={14} color={isDark ? '#60a5fa' : '#2563eb'} />}
                        </div>
                      </td>

                      {/* Publication Number (英文) */}
                      <td style={{ padding: '0.75rem 0.5rem', verticalAlign: 'top' }}>
                        <div
                          onClick={() => handleValueChange(item.row, valEn)}
                          style={{
                            padding: '0.4rem 0.6rem',
                            borderRadius: '0.375rem',
                            border: `1px solid ${isMatchingEn ? '#a855f7' : (isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0')}`,
                            background: isMatchingEn ? (isDark ? 'rgba(168, 85, 247, 0.18)' : '#faf5ff') : (isDark ? 'rgba(30, 41, 59, 0.4)' : '#f8fafc'),
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            transition: 'all 0.15s'
                          }}
                          title="點擊套用此值"
                        >
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 600,
                              color: isMatchingEn ? (isDark ? '#c084fc' : '#9333ea') : (isDark ? '#cbd5e1' : '#334155'),
                              wordBreak: 'break-all'
                            }}
                          >
                            {valEn || '<空白>'}
                          </span>
                          {isMatchingEn && <Check size={14} color={isDark ? '#c084fc' : '#9333ea'} />}
                        </div>
                      </td>

                      {/* 最終確認值 (手動修改輸入框) */}
                      <td style={{ padding: '0.75rem 0.5rem', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <input
                            type="text"
                            value={currentValue}
                            onChange={e => handleValueChange(item.row, e.target.value)}
                            placeholder="請確認或手動輸入公開號..."
                            style={{
                              flex: 1,
                              padding: '0.4rem 0.65rem',
                              fontFamily: 'monospace',
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              borderRadius: '0.375rem',
                              border: `1px solid ${!currentValue.trim() ? '#ef4444' : (isDark ? 'rgba(255, 255, 255, 0.2)' : '#cbd5e1')}`,
                              background: isDark ? '#1e293b' : '#ffffff',
                              color: isDark ? '#f8fafc' : '#0f172a',
                              outline: 'none'
                            }}
                          />
                          <div
                            style={{
                              width: '24px',
                              height: '24px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: isDark ? '#64748b' : '#94a3b8'
                            }}
                          >
                            <Edit3 size={14} />
                          </div>
                        </div>
                        {!currentValue.trim() && (
                          <div style={{ color: '#ef4444', fontSize: '0.72rem', marginTop: '0.2rem' }}>
                            此欄位不可為空白
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 底部說明與操作按鈕 */}
        <div
          style={{
            padding: '1rem 1.75rem',
            borderTop: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}`,
            background: isDark ? 'rgba(15, 23, 42, 0.7)' : '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}
        >
          <div style={{ fontSize: '0.82rem', color: isDark ? '#94a3b8' : '#64748b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileSpreadsheet size={16} color="#3b82f6" />
            <span>
              確認後，此兩欄位將同步填入最終確認值，並以
              <strong style={{ color: '#3b82f6', marginLeft: '0.25rem' }}>藍色字體 (Font color: 0000FF)</strong>
              寫入 Excel 檔案中。
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={onCancel}
              style={{
                padding: '0.5rem 1.15rem',
                borderRadius: '0.45rem',
                border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.15)' : '#cbd5e1'}`,
                background: isDark ? 'rgba(30, 41, 59, 0.6)' : '#ffffff',
                color: isDark ? '#f8fafc' : '#475569',
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              取消上傳
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isAllFilled}
              style={{
                padding: '0.5rem 1.35rem',
                borderRadius: '0.45rem',
                border: 'none',
                background: isAllFilled
                  ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                  : (isDark ? '#334155' : '#cbd5e1'),
                color: 'white',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: isAllFilled ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                boxShadow: isAllFilled ? '0 4px 12px rgba(37, 99, 235, 0.3)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <Check size={16} />
              <span>確認並套用修改 ({conflicts.length} 筆)</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PublicationConflictModal;

