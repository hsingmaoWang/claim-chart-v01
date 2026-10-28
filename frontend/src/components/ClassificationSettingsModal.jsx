import React, { useState, useEffect } from 'react';
import { Settings, X, RotateCcw, Check, Sliders, Layers } from 'lucide-react';

const DEFAULT_CONFIG = {
  app_area_count: '3~7',
  tech1_count: '3~5',
  tech2_count: '3~7',
  tech3_count: '3~5',
  efficacy_count: '3~5'
};

const HIERARCHY_FIELDS = [
  { key: 'app_area_count', label: '應用領域', placeholder: '3~7', desc: '宏觀應用情境或產業場景數量' },
  { key: 'tech1_count', label: '技術1階', placeholder: '3~5', desc: '頂層核心技術領域或主系統類別' },
  { key: 'tech2_count', label: '技術2階', placeholder: '3~7', desc: '次級模組、子系統或關鍵技術分支' },
  { key: 'tech3_count', label: '技術3階', placeholder: '3~5', desc: '細部元件、特定演算法或執行手段' },
  { key: 'efficacy_count', label: '功效節點', placeholder: '3~5', desc: '解決問題帶來的功效、性能改善與優點' },
];

const ClassificationSettingsModal = ({ isOpen, onClose, onConfirm, currentConfig }) => {
  const [localConfig, setLocalConfig] = useState(DEFAULT_CONFIG);

  useEffect(() => {
    if (currentConfig) {
      setLocalConfig({
        app_area_count: currentConfig.app_area_count || DEFAULT_CONFIG.app_area_count,
        tech1_count: currentConfig.tech1_count || DEFAULT_CONFIG.tech1_count,
        tech2_count: currentConfig.tech2_count || DEFAULT_CONFIG.tech2_count,
        tech3_count: currentConfig.tech3_count || DEFAULT_CONFIG.tech3_count,
        efficacy_count: currentConfig.efficacy_count || DEFAULT_CONFIG.efficacy_count,
      });
    }
  }, [currentConfig, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLocalConfig(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleReset = () => {
    setLocalConfig(DEFAULT_CONFIG);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(localConfig);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 70,
      left: 80,
      right: 0,
      bottom: 0,
      backgroundColor: 'transparent',
      backdropFilter: 'blur(1px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }}>
      <div style={{
        background: 'linear-gradient(145deg, rgba(144, 231, 223, 0.98), rgba(122, 207, 215, 1))',
        borderRadius: '1rem',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 25px rgba(56, 189, 248, 0.15)',
        width: '100%',
        maxWidth: '520px',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(181, 211, 252, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(90deg, rgba(56, 114, 248, 0.74), rgba(59, 184, 246, 0.91))'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              padding: '0.5rem',
              borderRadius: '0.6rem',
              background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.3), rgba(2, 132, 199, 0.3))',
              color: '#7cd5fbff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Settings size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600, color: '#ffffffff' }}>
                重新分類階層設定
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: '#fffdd1ff' }}>
                設定分類各階層的節點數量區間（如 3~5 或 3~7）
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffffff',
              cursor: 'pointer',
              padding: '0.4rem',
              borderRadius: '0.4rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#067bf9ff'; e.currentTarget.style.backgroundColor = 'rgba(166, 246, 247, 0.92)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#fefefeff'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              background: 'rgba(56, 189, 248, 0.2)',
              border: '1px solid rgba(56, 189, 248, 0.18)',
              borderRadius: '0.6rem',
              padding: '0.75rem 1rem',
              fontSize: '0.9rem',
              color: '#173eb1ff',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem'
            }}>
              <Sliders size={16} style={{ flexShrink: 0, color: '#ccff01ff' }} />
              <span>請輸入期望生成的節點數量範圍（例如「3~5」或「4」），AI 將根據設定重新建構分類體系。</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '0.5rem' }}>
              {HIERARCHY_FIELDS.map(field => (
                <div
                  key={field.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.65rem 0.85rem',
                    background: 'rgba(30, 41, 59, 0.08)',
                    borderRadius: '0.6rem',
                    border: '1px solid rgba(148, 163, 184, 0.12)'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <label style={{ fontSize: '1rem', fontWeight: 600, color: '#0612fd8f' }}>
                      {field.label}
                    </label>
                    <span style={{ fontSize: '0.8rem', color: '#ffffffff' }}>
                      {field.desc}
                    </span>
                  </div>
                  <input
                    type="text"
                    name={field.key}
                    value={localConfig[field.key] || ''}
                    onChange={handleChange}
                    placeholder={field.placeholder}
                    style={{
                      width: '85px',
                      padding: '0.45rem 0.6rem',
                      background: 'rgba(255, 255, 255, 1)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      borderRadius: '0.4rem',
                      color: '#38bdf8',
                      fontWeight: 600,
                      fontSize: '1rem',
                      textAlign: 'center',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#38bdf8';
                      e.target.style.boxShadow = '0 0 0 2px rgba(56, 189, 248, 0.2)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(56, 189, 248, 0.3)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid rgba(148, 163, 184, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, rgba(59, 184, 246, 0.91), rgba(56, 114, 248, 0.74))'
          }}>
            <button
              type="button"
              onClick={handleReset}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'transparent',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                color: '#ffffffff',
                padding: '0.5rem 0.85rem',
                borderRadius: '0.5rem',
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#067bf9ff'; e.currentTarget.style.backgroundColor = 'rgba(166, 246, 247, 0.92)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#fefefeff'; e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <RotateCcw size={14} />
              重置預設值
            </button>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'rgba(148, 163, 184, 0.1)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  color: '#cbd5e1',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(53, 134, 248, 0.42)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(148, 163, 184, 0.1)'; }}
              >
                取消
              </button>
              <button
                type="submit"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: 'linear-gradient(135deg, #0284c7, #0ea5e9)',
                  border: 'none',
                  color: '#ffffff',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  boxShadow: '0 4px 12px rgba(14, 165, 233, 0.3)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(51, 72, 232, 0.5)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(14, 165, 233, 0.3)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <Check size={16} />
                確認並重新分類
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ClassificationSettingsModal;
