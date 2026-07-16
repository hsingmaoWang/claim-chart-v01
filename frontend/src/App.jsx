import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'
import LoginView from './components/LoginView'
import UploadZone from './components/UploadZone'
import UrlInput from './components/UrlInput'
import Loader from './components/Loader'
import ResultCard from './components/ResultCard'
import MindMapTab from './components/MindMapTab'
import ChangePasswordModal from './components/ChangePasswordModal'

const API_BASE = '';
const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds

function App() {
  // ── Auth state ──────────────────────────────────────────────
  const [authState, setAuthState] = useState(() => {
    const token = localStorage.getItem('ag_token');
    const session_id = localStorage.getItem('ag_session_id');
    const username = localStorage.getItem('ag_username');
    const role = localStorage.getItem('ag_role');
    if (token && session_id && username && role) {
      return { token, session_id, username, role };
    }
    return null;
  });

  const authRef = useRef(authState);
  useEffect(() => { authRef.current = authState; }, [authState]);

  // ── Admin panel ─────────────────────────────────────────────
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // ── Change password modal ────────────────────────────────────
  const [showChangePassword, setShowChangePassword] = useState(false);

  // ── Main app state ──────────────────────────────────────────
  const [appState, setAppState] = useState('idle'); // idle, processing, complete, error
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState('claimChart');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // ── Helper: get auth headers ────────────────────────────────
  const getAuthHeaders = useCallback(() => {
    if (!authRef.current) return {};
    return {
      'Authorization': `Bearer ${authRef.current.token}`,
      'X-Session-ID': authRef.current.session_id,
    };
  }, []);

  // ── Heartbeat ───────────────────────────────────────────────
  useEffect(() => {
    if (!authState) return;

    const sendHeartbeat = async () => {
      try {
        await fetch(`${API_BASE}/api/auth/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: authState.session_id }),
        });
      } catch (_) { /* silent */ }
    };

    // Send one immediately on login
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [authState]);

  // ── BeforeUnload beacon ─────────────────────────────────────
  useEffect(() => {
    if (!authState) return;

    const handleUnload = () => {
      const data = JSON.stringify({ session_id: authState.session_id });
      navigator.sendBeacon(`${API_BASE}/api/auth/unload`, new Blob([data], { type: 'application/json' }));
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [authState]);

  // ── Login success callback ──────────────────────────────────
  const handleLoginSuccess = (info) => {
    setAuthState(info);
  };

  // ── Logout ──────────────────────────────────────────────────
  const handleLogout = async () => {
    if (!authState) return;
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authState.token}` },
      });
    } catch (_) { /* silent */ }
    localStorage.removeItem('ag_token');
    localStorage.removeItem('ag_session_id');
    localStorage.removeItem('ag_username');
    localStorage.removeItem('ag_role');
    setAuthState(null);
    setShowAdminPanel(false);
    setShowChangePassword(false);
    setAppState('idle');
    setErrorMessage('');
  };

  // ── Floating nav drag ───────────────────────────────────────
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };
    const handleMouseUp = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart]);

  // ── Browser extension import ────────────────────────────────
  useEffect(() => {
    const handleImport = () => {
      const dataStr = localStorage.getItem('antigravity_imported_patent');
      if (dataStr) {
        try {
          const data = JSON.parse(dataStr);
          localStorage.removeItem('antigravity_imported_patent');
          handleProcessStart('extension', data);
        } catch (e) {
          console.error("Error parsing imported data", e);
        }
      }
    };
    handleImport();
    window.addEventListener('antigravity_patent_imported', handleImport);
    return () => window.removeEventListener('antigravity_patent_imported', handleImport);
  }, []); // eslint-disable-line

  // ── Process start ───────────────────────────────────────────
  const handleProcessStart = async (sourceType, data) => {
    setAppState('processing');
    setErrorMessage('');

    try {
      let response;
      const sessionId = authRef.current?.session_id || '';

      if (sourceType === 'file') {
        const formData = new FormData();
        formData.append('file', data);
        response = await fetch(`${API_BASE}/api/process/pdf`, {
          method: 'POST',
          headers: {
            ...getAuthHeaders(),
            'X-Session-ID': sessionId,
          },
          body: formData,
        });
      } else if (sourceType === 'url') {
        response = await fetch(`${API_BASE}/api/process/url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ url: data }),
        });
      } else if (sourceType === 'extension') {
        response = await fetch(`${API_BASE}/api/process/extension`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(data),
        });
      }

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }

      const blob = await response.blob();
      let filename = 'claim_chart.pptx';
      const disposition = response.headers.get('Content-Disposition');
      if (disposition && disposition.indexOf('filename=') !== -1) {
        const matches = disposition.match(/filename="?([^"]+)"?/);
        if (matches?.[1]) filename = matches[1];
      }

      window.downloadUrl = window.URL.createObjectURL(blob);
      window.downloadFilename = filename;
      setAppState('complete');
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'An error occurred during processing.');
      setAppState('error');
    }
  };

  const handleReset = () => {
    setAppState('idle');
    setErrorMessage('');
    if (window.downloadUrl) {
      window.URL.revokeObjectURL(window.downloadUrl);
      window.downloadUrl = null;
    }
  };

  // ── Render: login gate ──────────────────────────────────────
  if (!authState) {
    return (
      <>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          #login-username:focus, #login-password:focus {
            border-color: rgba(34,211,238,0.7) !important;
            box-shadow: 0 0 0 3px rgba(34,211,238,0.2), 0 0 12px rgba(34,211,238,0.15) !important;
            background: rgba(255,255,255,0.12) !important;
          }
          #login-submit-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(8,145,178,0.5) !important;
          }
          #login-submit-btn:active:not(:disabled) {
            transform: translateY(0);
          }
        `}</style>
        <LoginView onLoginSuccess={handleLoginSuccess} />
      </>
    );
  }

  // ── Render: main app ────────────────────────────────────────
  const isAdmin = authState.role === 'admin';

  return (
    <div className="app-container">
      {/* Top bar with user info and admin entry */}
      <div style={{
        position: 'fixed', top: 0, right: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.7rem 1.25rem',
        background: 'rgba(6,11,40,0.55)',
        backdropFilter: 'blur(12px)',
        borderBottomLeftRadius: '1rem',
        border: '1px solid rgba(255,255,255,0.12)',
        borderTop: 'none', borderRight: 'none',
      }}>
        <div style={{ fontSize: '0.8rem', color: 'rgba(186,230,253,0.8)', fontWeight: 500 }}>
          <span style={{ marginRight: '0.4rem', opacity: 0.6 }}>登入者：</span>
          <strong style={{ color: 'white' }}>{authState.username}</strong>
          {isAdmin && (
            <span style={{
              marginLeft: '0.5rem', fontSize: '0.65rem', background: 'rgba(139,92,246,0.3)',
              border: '1px solid rgba(139,92,246,0.5)', color: '#c4b5fd',
              padding: '0.1rem 0.5rem', borderRadius: '999px', fontWeight: 700,
            }}>Admin</span>
          )}
        </div>

        {/* Change Password button (all logged-in users) */}
        <button
          id="change-password-btn"
          onClick={() => setShowChangePassword(true)}
          title="修改密碼"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.4rem 0.85rem', borderRadius: '0.5rem',
            background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.3)',
            color: '#67e8f9', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
            transition: 'all 200ms',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          修改密碼
        </button>

        {isAdmin && (
          <button
            id="admin-panel-btn"
            onClick={() => setShowAdminPanel(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.4rem 0.85rem', borderRadius: '0.5rem',
              background: 'rgba(139,92,246,0.25)', border: '1px solid rgba(139,92,246,0.45)',
              color: '#c4b5fd', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
              transition: 'all 200ms',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/>
              <path d="M19 11h2m-2 4h2M3 11h2m-2 4h2"/>
            </svg>
            管理項目
          </button>
        )}

        <button
          id="logout-btn"
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.4rem 0.85rem', borderRadius: '0.5rem',
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)',
            color: 'rgba(186,230,253,0.8)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
            transition: 'all 200ms',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          登出
        </button>
      </div>

      {/* Change Password Modal */}
      {showChangePassword && (
        <ChangePasswordModal
          authState={authState}
          getAuthHeaders={getAuthHeaders}
          onClose={() => setShowChangePassword(false)}
        />
      )}

      {/* Admin Panel Modal */}
      {showAdminPanel && (
        <AdminPanelLazy
          authState={authState}
          getAuthHeaders={getAuthHeaders}
          onClose={() => setShowAdminPanel(false)}
        />
      )}

      {/* Original app layout */}
      <header className="hero">
        <div className="hero-content animate-fade-in">
          <div className="badge">AI Powered</div>
          <h1 className={activeTab === 'mindMap' ? 'title-mindmap' : 'title-claimchart'}>
            {activeTab === 'claimChart' ? 'Patent Claim Chart Generator' : 'Patent Mind Map Generator'}
          </h1>
          <p>
            {activeTab === 'claimChart'
              ? 'Instantly transform patent documents into presentation-ready claim charts. Upload a PDF or paste a Google Patents URL to begin.'
              : 'AI analyzes patent categories and automatically generates an interactive Patent Mind Map. Upload a patent portfolio Excel file or PDF file to start the analysis.'}
          </p>
        </div>
      </header>

      {/* Fixed Left Navigation */}
      <div
        className="side-navigation"
        onMouseDown={handleMouseDown}
        style={{
          position: 'fixed',
          left: `calc(1rem + ${position.x}px)`,
          top: `calc(50% + ${position.y}px)`,
          transform: 'translateY(-50%)',
          display: 'flex', flexDirection: 'column', gap: '1rem',
          padding: '1rem', zIndex: 100,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)',
          borderRadius: '1rem', border: '1px solid var(--color-border)',
          cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '2px 0 6px', cursor: 'grab', opacity: 0.5 }}>
          {[0, 1].map(r => (
            <div key={r} style={{ display: 'flex', gap: '3px' }}>
              {[0, 1, 2].map(c => <span key={c} style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'white' }} />)}
            </div>
          ))}
        </div>
        <button
          className={activeTab === 'claimChart' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('claimChart')}
          style={{ width: '150px', padding: '1rem', borderRadius: '0.5rem', fontWeight: 'bold' }}
        >
          Claim Chart
        </button>
        <button
          className={activeTab === 'mindMap' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveTab('mindMap')}
          style={{ width: '150px', padding: '1rem', borderRadius: '0.5rem', fontWeight: 'bold', wordWrap: 'break-word', whiteSpace: 'normal', lineHeight: '1.2' }}
        >
          專利類別心智圖
        </button>
      </div>

      <main className="main-content" style={{ marginLeft: 'auto', marginRight: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        <div style={{ width: '100%', display: activeTab === 'claimChart' ? 'flex' : 'none', flexDirection: 'column', alignItems: 'center' }}>
          {appState === 'idle' && (
            <div className="input-section animate-fade-in" style={{ animationDelay: '0.1s', width: '100%', maxWidth: '800px' }}>
              <UploadZone onUpload={(file) => handleProcessStart('file', file)} />
              <div className="divider"><span>OR</span></div>
              <UrlInput onSubmit={(url) => handleProcessStart('url', url)} />
            </div>
          )}
          {appState === 'processing' && (
            <div className="processing-section animate-fade-in" style={{ width: '100%', maxWidth: '800px', display: 'flex', justifyContent: 'center' }}>
              <Loader statusMessage="Extracting claims and figures..." />
            </div>
          )}
          {appState === 'complete' && (
            <div className="result-section animate-fade-in" style={{ width: '100%', maxWidth: '800px', display: 'flex', justifyContent: 'center' }}>
              <ResultCard onReset={handleReset} onDownload={() => {
                if (window.downloadUrl) {
                  const a = document.createElement('a');
                  a.href = window.downloadUrl;
                  a.download = window.downloadFilename || 'claim_chart.pptx';
                  a.click();
                }
              }} />
            </div>
          )}
          {appState === 'error' && (
            <div className="error-section animate-fade-in" style={{ width: '100%', maxWidth: '800px', display: 'flex', justifyContent: 'center' }}>
              <div className="error-card">
                <h3>Processing Failed</h3>
                <p>{errorMessage}</p>
                <button className="btn-secondary" onClick={handleReset}>Try Again</button>
              </div>
            </div>
          )}
        </div>
        <div style={{ width: '100%', display: activeTab === 'mindMap' ? 'flex' : 'none', justifyContent: 'center' }}>
          <MindMapTab authState={authState} getAuthHeaders={getAuthHeaders} />
        </div>
      </main>

      <footer style={{ textAlign: 'center', width: '100%', marginTop: '2rem' }}>
        <p>&copy; {new Date().getFullYear()} Antigravity Patent Solutions. All rights reserved.</p>
      </footer>
    </div>
  );
}

// ── Lazy-loaded Admin Panel (imported inline to keep App.jsx self-contained) ──
import { lazy, Suspense } from 'react';
const AdminPanel = lazy(() => import('./components/AdminPanel'));
function AdminPanelLazy({ authState, getAuthHeaders, onClose }) {
  return (
    <Suspense fallback={
      <div style={{
        position: 'fixed', inset: 0, zIndex: 999, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(6,11,40,0.8)', backdropFilter: 'blur(8px)',
        color: 'white', fontSize: '1rem', fontWeight: 600,
      }}>
        載入管理控制台...
      </div>
    }>
      <AdminPanel authState={authState} getAuthHeaders={getAuthHeaders} onClose={onClose} />
    </Suspense>
  );
}

export default App;
