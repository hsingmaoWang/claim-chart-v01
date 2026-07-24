import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, Minus, Maximize2, Minimize2, Trash2, RefreshCw, Filter, Search, ChevronRight } from 'lucide-react';

const AdminConsoleModal = ({ authState, getAuthHeaders, isOpen, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [filterLevel, setFilterLevel] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const lastIdRef = useRef(0);
  const terminalEndRef = useRef(null);

  // Poll real-time logs every 1.5 seconds if active and logged in as admin
  useEffect(() => {
    if (!authState || authState.role !== 'admin' || !isLive) return;

    let isSubscribed = true;

    const fetchLogs = async () => {
      try {
        const headers = getAuthHeaders ? getAuthHeaders() : {};
        const res = await fetch(`/api/admin/live-logs?after_id=${lastIdRef.current}`, { headers });
        if (!res.ok) return;

        const data = await res.json();
        if (isSubscribed && data.logs && data.logs.length > 0) {
          setLogs(prev => {
            const existingIds = new Set(prev.map(l => l.id));
            const newEntries = data.logs.filter(l => !existingIds.has(l.id));
            if (newEntries.length === 0) return prev;
            return [...prev, ...newEntries].slice(-500); // Keep last 500 lines
          });
          lastIdRef.current = data.logs[data.logs.length - 1].id;
        }
      } catch (err) {
        console.error("Error fetching live logs:", err);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 1500);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [authState, getAuthHeaders, isLive]);

  // Auto scroll to bottom when new logs arrive if autoScroll is enabled
  useEffect(() => {
    if (autoScroll && !isMinimized && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll, isMinimized]);

  if (!isOpen || !authState || authState.role !== 'admin') return null;

  // Filter logs based on level and search term
  const filteredLogs = logs.filter(log => {
    const matchesLevel = filterLevel === 'ALL' || log.level.toUpperCase() === filterLevel.toUpperCase();
    const matchesSearch = !searchTerm || log.message.toLowerCase().includes(searchTerm.toLowerCase()) || log.logger.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const getLevelColor = (level, message = '') => {
    const msg = message.toLowerCase();
    if (level === 'ERROR' || msg.includes('fail') || msg.includes('error') || msg.includes('exception')) return '#f87171'; // Red
    if (level === 'WARNING' || msg.includes('retry') || msg.includes('warn')) return '#facc15'; // Amber
    if (msg.includes('success') || msg.includes('generated') || msg.includes('completed') || msg.includes('done')) return '#4ade80'; // Green
    if (msg.includes('ai') || msg.includes('gemini') || msg.includes('stage') || msg.includes('api')) return '#38bdf8'; // Cyan
    return '#94a3b8'; // Slate
  };

  const handleClear = () => {
    setLogs([]);
  };

  // Render Minimized Floating Dock Badge
  if (isMinimized) {
    return (
      <div 
        onClick={() => setIsMinimized(false)}
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          borderRadius: '2rem',
          padding: '0.6rem 1.2rem',
          color: '#38bdf8',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          cursor: 'pointer',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5), 0 0 15px rgba(56,189,248,0.3)',
          transition: 'all 0.3s ease'
        }}
        title="點擊展開管理者執行控制台"
      >
        <Terminal size={18} className="animate-pulse" />
        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>管理者執行控制台 ({logs.length})</span>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80' }} />
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      inset: isMaximized ? 0 : 'auto',
      bottom: isMaximized ? 0 : '1.5rem',
      right: isMaximized ? 0 : '1.5rem',
      top: isMaximized ? 0 : 'auto',
      left: isMaximized ? 0 : 'auto',
      width: isMaximized ? '100vw' : '750px',
      height: isMaximized ? '100vh' : '480px',
      maxWidth: isMaximized ? '100vw' : 'calc(100vw - 3rem)',
      maxHeight: isMaximized ? '100vh' : 'calc(100vh - 3rem)',
      zIndex: 9999,
      background: 'rgba(9, 13, 22, 0.96)',
      backdropFilter: 'blur(16px)',
      border: isMaximized ? 'none' : '1px solid rgba(56, 189, 248, 0.3)',
      borderRadius: isMaximized ? 0 : '1rem',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 25px rgba(8, 145, 178, 0.2)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: "'Outfit', var(--font-family)",
      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
    }}>
      {/* Header Bar */}
      <div style={{
        padding: '0.6rem 1rem',
        background: 'linear-gradient(90deg, rgba(15, 23, 42, 0.95), rgba(8, 145, 178, 0.2))',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        userSelect: 'none'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Terminal size={18} color="#38bdf8" />
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc', letterSpacing: '0.02em' }}>
            管理者即時執行控制台 <span style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 400 }}>(Terminal Stream)</span>
          </span>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.15rem 0.5rem',
            borderRadius: '1rem',
            background: isLive ? 'rgba(74, 222, 128, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${isLive ? 'rgba(74, 222, 128, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            color: isLive ? '#4ade80' : '#ef4444',
            fontSize: '0.7rem',
            fontWeight: 600
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isLive ? '#4ade80' : '#ef4444' }} />
            {isLive ? '🟢 監控中' : '🔴 已關閉'}
          </span>
        </div>

        {/* Header Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            onClick={() => setIsLive(!isLive)}
            title={isLive ? "暫停即時接收" : "恢復即時接收"}
            style={{ background: 'transparent', border: 'none', color: isLive ? '#38bdf8' : '#94a3b8', cursor: 'pointer', padding: '4px' }}
          >
            <RefreshCw size={15} className={isLive ? "animate-spin" : ""} style={{ animationDuration: '3s' }} />
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            title="最小化"
            style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '4px' }}
          >
            <Minus size={16} />
          </button>
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            title={isMaximized ? "還原視窗" : "最大化視窗"}
            style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '4px' }}
          >
            {isMaximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            onClick={onClose}
            title="關閉控制台"
            style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: '4px', marginLeft: '0.2rem' }}
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {/* Filter / Actions Bar */}
      <div style={{
        padding: '0.5rem 1rem',
        background: 'rgba(15, 23, 42, 0.6)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        flexWrap: 'wrap',
        fontSize: '0.8rem'
      }}>
        {/* Log Level Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Filter size={14} color="#94a3b8" />
          {['ALL', 'INFO', 'WARNING', 'ERROR'].map(lvl => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              style={{
                padding: '0.2rem 0.5rem',
                borderRadius: '0.35rem',
                border: filterLevel === lvl ? '1px solid #0891b2' : '1px solid rgba(255,255,255,0.1)',
                background: filterLevel === lvl ? 'rgba(8, 145, 178, 0.3)' : 'rgba(255,255,255,0.03)',
                color: filterLevel === lvl ? '#67e8f9' : '#94a3b8',
                fontSize: '0.75rem',
                fontWeight: filterLevel === lvl ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {lvl}
            </button>
          ))}
        </div>

        {/* Search & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={13} style={{ position: 'absolute', left: '0.5rem', color: '#64748b' }} />
            <input
              type="text"
              placeholder="搜尋關鍵字 / AI..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '0.2rem 0.5rem 0.2rem 1.8rem',
                borderRadius: '0.35rem',
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(0,0,0,0.3)',
                color: '#f1f5f9',
                fontSize: '0.75rem',
                outline: 'none',
                width: '140px'
              }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              style={{ accentColor: '#0891b2' }}
            />
            自動捲動
          </label>

          <button
            onClick={handleClear}
            title="清空日誌紀錄"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.2rem',
              padding: '0.2rem 0.5rem',
              borderRadius: '0.35rem',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#f87171',
              fontSize: '0.75rem',
              cursor: 'pointer'
            }}
          >
            <Trash2 size={13} />
            清空
          </button>
        </div>
      </div>

      {/* Terminal Output Area */}
      <div style={{
        flex: 1,
        padding: '0.8rem 1rem',
        background: '#040711',
        overflowY: 'auto',
        fontFamily: "'Consolas', 'Fira Code', 'Courier New', monospace",
        fontSize: '0.82rem',
        lineHeight: 1.5,
        color: '#e2e8f0',
        userSelect: 'text'
      }}>
        {filteredLogs.length === 0 ? (
          <div style={{ color: '#475569', fontStyle: 'italic', padding: '2rem 0', textAlign: 'center' }}>
            {searchTerm || filterLevel !== 'ALL' ? '沒有符合篩選條件的 Log 日誌...' : '🟢 控制台就緒，等待後端執行訊息與 AI API 呼叫...'}
          </div>
        ) : (
          filteredLogs.map(log => {
            const timeStr = log.timestamp ? log.timestamp.split('T')[1]?.slice(0, 8) : '';
            const color = getLevelColor(log.level, log.message);
            return (
              <div key={log.id} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.25rem', wordBreak: 'break-word' }}>
                <span style={{ color: '#475569', fontSize: '0.75rem', minWidth: '40px' }}>#{log.id}</span>
                <span style={{ color: '#64748b', fontSize: '0.75rem', minWidth: '60px' }}>{timeStr}</span>
                <span style={{
                  color: log.level === 'ERROR' ? '#ef4444' : log.level === 'WARNING' ? '#eab308' : '#38bdf8',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  minWidth: '55px'
                }}>
                  [{log.level}]
                </span>
                <span style={{ color: '#0ea5e9', opacity: 0.8, fontSize: '0.75rem', minWidth: '90px' }}>
                  [{log.logger}]
                </span>
                <span style={{ color, flex: 1 }}>
                  {log.message}
                </span>
              </div>
            );
          })
        )}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
};

export default AdminConsoleModal;
