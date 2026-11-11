import { useState, useEffect, useCallback } from 'react';

const API_BASE = '';

const formatDateTime = (val) => {
  if (!val || val === '—') return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch (e) {
    return val;
  }
};

const formatBytes = (bytes) => {
  const num = Number(bytes);
  if (!num || isNaN(num) || num === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(num) / Math.log(k));
  return parseFloat((num / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

function ModalOverlay({ children }) {
  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        {children}
      </div>
    </div>
  );
}

function TabBtn({ label, active, onClick, id }) {
  return (
    <button
      id={id}
      onClick={onClick}
      style={{
        ...s.tabBtn,
        ...(active ? s.tabBtnActive : {}),
      }}
    >
      {label}
    </button>
  );
}

/* ─── 使用者管理頁 ─── */
function UsersTab({ getAuthHeaders }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // { username, role }
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, { headers: getAuthHeaders() });
      if (!res.ok) {
        const d = await res.json();
        setFeedback(`載入失敗：${d.detail || '登入已過期，請重新登入。'}`);
        setUsers([]);
        return;
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch { setFeedback('載入使用者失敗。'); }
    finally { setLoading(false); }
  }, [getAuthHeaders]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const toast = (msg) => { setFeedback(msg); setTimeout(() => setFeedback(''), 3000); };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newUser.username || !newUser.password) return toast('請填寫帳號與密碼。');
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(newUser),
      });
      if (!res.ok) { const d = await res.json(); return toast(d.detail || '建立失敗。'); }
      toast(`✅ 使用者 "${newUser.username}" 已建立。`);
      setNewUser({ username: '', password: '', role: 'user' });
      setShowAddForm(false);
      setShowCreatePassword(false);
      loadUsers();
    } catch { toast('建立失敗。'); }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editTarget) return;
    try {
      const body = {};
      if (editTarget.newPassword) body.password = editTarget.newPassword;
      body.role = editTarget.role;
      body.notes = editTarget.notes ?? '';
      const res = await fetch(`${API_BASE}/api/admin/users/${editTarget.username}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); return toast(d.detail || '更新失敗。'); }
      toast(`✅ 使用者 "${editTarget.username}" 已更新。`);
      setEditTarget(null);
      setShowEditPassword(false);
      loadUsers();
    } catch { toast('更新失敗。'); }
  };

  const handleDelete = async (username) => {
    if (!window.confirm(`確定要刪除使用者「${username}」？`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${username}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) { const d = await res.json(); return toast(d.detail || '刪除失敗。'); }
      toast(`✅ 使用者 "${username}" 已刪除。`);
      loadUsers();
    } catch { toast('刪除失敗。'); }
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={s.sectionTitle}>使用者帳號管理</h3>
        <button id="add-user-btn" style={s.btnGreen} onClick={() => { setShowAddForm(true); setEditTarget(null); setShowCreatePassword(false); }}>
          ＋ 新增使用者
        </button>
      </div>

      {feedback && <div style={s.toast}>{feedback}</div>}

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleCreate} style={s.formCard}>
          <p style={s.formTitle}>新增使用者</p>
          <div style={s.formRow}>
            <input style={s.input} placeholder="帳號" value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '1 1 140px' }}>
              <input
                style={{ ...s.input, width: '100%', paddingRight: '2.5rem' }}
                type={showCreatePassword ? 'text' : 'password'}
                placeholder="密碼"
                value={newUser.password}
                onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => setShowCreatePassword(!showCreatePassword)}
                style={s.eyeBtn}
                tabIndex={-1}
                aria-label={showCreatePassword ? '隱藏密碼' : '顯示密碼'}
              >
                {showCreatePassword ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            <select style={s.select} value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
              <option value="user">一般使用者</option>
              <option value="admin">系統管理者</option>
            </select>
            <button type="submit" style={s.btnBlue}>確認新增</button>
            <button type="button" style={s.btnGhost} onClick={() => { setShowAddForm(false); setShowCreatePassword(false); }}>取消</button>
          </div>
        </form>
      )}

      {/* Edit form */}
      {editTarget && (
        <form onSubmit={handleUpdate} style={s.formCard}>
          <p style={s.formTitle}>修改：{editTarget.username}</p>
          <div style={s.formRow}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '1 1 180px' }}>
              <input
                style={{ ...s.input, width: '100%', paddingRight: '2.5rem' }}
                type={showEditPassword ? 'text' : 'password'}
                placeholder="新密碼（留空不變）"
                value={editTarget.newPassword || ''}
                onChange={e => setEditTarget(p => ({ ...p, newPassword: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => setShowEditPassword(!showEditPassword)}
                style={s.eyeBtn}
                tabIndex={-1}
                aria-label={showEditPassword ? '隱藏密碼' : '顯示密碼'}
              >
                {showEditPassword ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            <select style={s.select} value={editTarget.role} onChange={e => setEditTarget(p => ({ ...p, role: e.target.value }))}>
              <option value="user">一般使用者</option>
              <option value="admin">系統管理者</option>
            </select>
            <button type="submit" style={s.btnBlue}>儲存</button>
            <button type="button" style={s.btnGhost} onClick={() => { setEditTarget(null); setShowEditPassword(false); }}>取消</button>
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: 'rgba(148,163,184,0.9)', marginBottom: '0.35rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>備註</label>
            <textarea
              style={{
                width: '100%',
                minHeight: '72px',
                padding: '0.55rem 0.85rem',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '0.5rem',
                color: 'white',
                fontSize: '0.875rem',
                fontFamily: "'Outfit', system-ui, sans-serif",
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
              placeholder="輸入備註（僅管理者可見）"
              value={editTarget.notes || ''}
              onChange={e => setEditTarget(p => ({ ...p, notes: e.target.value }))}
            />
          </div>
        </form>
      )}

      {/* User table */}
      {loading ? <p style={{ color: 'rgba(186,230,253,0.7)', textAlign: 'center', padding: '2rem' }}>載入中...</p> : (
        <table style={s.table}>
          <thead>
            <tr>
              {['帳號', '角色', '備註', '操作'].map(h => <th key={h} style={s.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.username} style={s.tr}>
                <td style={s.td}><strong style={{ color: 'white' }}>{u.username}</strong></td>
                <td style={s.td}>
                  <span style={{
                    ...s.roleBadge,
                    background: u.role === 'admin' ? 'rgba(139,92,246,0.25)' : 'rgba(34,211,238,0.15)',
                    borderColor: u.role === 'admin' ? 'rgba(139,92,246,0.5)' : 'rgba(34,211,238,0.3)',
                    color: u.role === 'admin' ? '#c4b5fd' : '#67e8f9',
                  }}>
                    {u.role === 'admin' ? '系統管理者' : '一般使用者'}
                  </span>
                </td>
                <td style={{ ...s.td, maxWidth: '220px' }}>
                  <span style={{ fontSize: '0.8rem', color: u.notes ? 'rgba(186,230,253,0.75)' : 'rgba(100,116,139,0.6)', fontStyle: u.notes ? 'normal' : 'italic', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {u.notes || '—'}
                  </span>
                </td>
                <td style={s.td}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button style={s.btnSmallBlue} onClick={() => { setEditTarget({ ...u, newPassword: '', notes: u.notes || '' }); setShowAddForm(false); setShowEditPassword(false); }}>編輯</button>
                    <button style={s.btnSmallRed} onClick={() => handleDelete(u.username)}>刪除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ─── 使用日誌頁 ─── */
function LogsTab({ getAuthHeaders }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/logs`, { headers: getAuthHeaders() });
      if (!res.ok) {
        const d = await res.json();
        setFeedback(`載入失敗：${d.detail || '登入已過期，請重新登入。'}`);
        setLogs([]);
        return;
      }
      const data = await res.json();
      setLogs(data.logs || []);
    } catch { setFeedback('載入日誌失敗。'); }
    finally { setLoading(false); }
  }, [getAuthHeaders]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/logs/download`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'usage_logs.xlsx'; a.click();
      window.URL.revokeObjectURL(url);
    } catch { setFeedback('下載失敗。'); }
    finally { setDownloading(false); }
  };

  const COLS = [
    { key: 'Session ID', label: 'Session ID', short: true },
    { key: 'Username', label: '帳號' },
    { key: 'IP Address', label: 'IP 位址' },
    { key: 'Login Time', label: '登入時間' },
    { key: 'Logout Time', label: '登出/結束時間' },
    { key: 'Duration', label: '使用時長' },
    { key: 'Uploaded Files', label: '上傳檔案' },
    { key: 'Patents Processed', label: '專利件數' },
    { key: 'Excel Downloads', label: 'Excel下載次數' },
    { key: 'Excel Download Size (bytes)', label: 'Excel下載總大小' },
    { key: 'PNG Downloads', label: 'PNG下載次數' },
    { key: 'PNG Download Size (bytes)', label: 'PNG下載總大小' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={s.sectionTitle}>使用者登入日誌</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button id="refresh-logs-btn" style={s.btnGhost} onClick={loadLogs}>↻ 重新整理</button>
          <button id="download-logs-btn" style={s.btnGreen} onClick={handleDownload} disabled={downloading}>
            {downloading ? '下載中...' : '⬇ 下載 Excel'}
          </button>
        </div>
      </div>

      {feedback && <div style={s.toast}>{feedback}</div>}

      {loading ? (
        <p style={{ color: 'rgba(186,230,253,0.7)', textAlign: 'center', padding: '2rem' }}>載入中...</p>
      ) : logs.length === 0 ? (
        <p style={{ color: 'rgba(148,163,184,0.6)', textAlign: 'center', padding: '2rem' }}>尚無使用記錄。</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                {COLS.map(c => <th key={c.key} style={{ ...s.th, fontSize: '0.72rem' }}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {logs.map((row, i) => (
                <tr key={i} style={s.tr}>
                  {COLS.map(c => (
                    <td key={c.key} style={{ ...s.td, fontSize: '0.78rem', ...(c.short ? { maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : {}) }}>
                      {c.key === 'Session ID'
                        ? <span title={row[c.key]}>{String(row[c.key] || '').slice(0, 8)}…</span>
                        : (c.key === 'Login Time' || c.key === 'Logout Time')
                          ? formatDateTime(row[c.key])
                          : (c.key === 'Excel Download Size (bytes)' || c.key === 'PNG Download Size (bytes)')
                            ? `${formatBytes(row[c.key])} (${Number(row[c.key] || 0).toLocaleString()} B)`
                            : String(row[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Admin Panel 主元件 ─── */
export default function AdminPanel({ authState, getAuthHeaders, onClose }) {
  const [activeTab, setActiveTab] = useState('users');

  return (
    <ModalOverlay>
      {/* Header */}
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={s.headerIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
              <circle cx="12" cy="8" r="4" />
              <path d="M6 20v-2a6 6 0 0 1 12 0v2" />
              <path d="M19 11h2m-2 4h2M3 11h2m-2 4h2" />
            </svg>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'white' }}>系統管理控制台</h2>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(186,230,253,0.6)' }}>管理者：{authState?.username}</p>
          </div>
        </div>
        <button id="admin-panel-close-btn" onClick={onClose} style={s.closeBtn} aria-label="關閉">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        <TabBtn id="admin-tab-users" label="👤 使用者管理" active={activeTab === 'users'} onClick={() => setActiveTab('users')} />
        <TabBtn id="admin-tab-logs" label="📋 使用日誌" active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} />
      </div>

      {/* Tab content */}
      <div style={s.body}>
        {activeTab === 'users' && <UsersTab getAuthHeaders={getAuthHeaders} />}
        {activeTab === 'logs' && <LogsTab getAuthHeaders={getAuthHeaders} />}
      </div>
    </ModalOverlay>
  );
}

/* ─── Styles ─── */
const s = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(6,11,40,0.75)', backdropFilter: 'blur(10px)',
  },
  modal: {
    width: 'clamp(432px, 92vw, 1100px)',
    maxHeight: '88vh',
    background: 'rgba(15,23,60,0.96)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '1.25rem',
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
    fontFamily: "'Outfit', system-ui, sans-serif",
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '1.25rem 1.5rem',
    background: 'linear-gradient(90deg, rgba(8,145,178,0.25), rgba(29,78,216,0.2))',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    flexShrink: 0,
  },
  headerIcon: {
    width: '38px', height: '38px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #0891b2, #1d4ed8)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 12px rgba(8,145,178,0.4)',
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '0.5rem', color: 'rgba(186,230,253,0.8)', cursor: 'pointer',
    padding: '0.35rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 150ms',
  },
  tabs: {
    display: 'flex', gap: '0.25rem', padding: '0.75rem 1.5rem',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  tabBtn: {
    padding: '0.5rem 1.1rem', borderRadius: '0.5rem',
    border: '1px solid transparent', background: 'transparent',
    color: 'rgba(148,163,184,0.8)', fontSize: '0.875rem', fontWeight: 600,
    cursor: 'pointer', transition: 'all 150ms', fontFamily: "'Outfit', system-ui, sans-serif",
  },
  tabBtnActive: {
    background: 'rgba(8,145,178,0.2)', border: '1px solid rgba(8,145,178,0.4)',
    color: '#67e8f9',
  },
  body: {
    flex: 1, overflowY: 'auto', padding: '1.5rem',
  },
  sectionTitle: { margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700, color: 'white' },
  table: {
    width: '100%', borderCollapse: 'collapse',
    fontSize: '0.875rem', color: 'rgba(186,230,253,0.85)',
  },
  th: {
    textAlign: 'left', padding: '0.6rem 0.75rem',
    background: 'rgba(255,255,255,0.05)',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    fontWeight: 700, fontSize: '0.78rem',
    color: 'rgba(148,163,184,0.9)', letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  td: {
    padding: '0.7rem 0.75rem',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    color: 'rgba(186,230,253,0.85)',
  },
  tr: { transition: 'background 150ms' },
  roleBadge: {
    display: 'inline-block', padding: '0.15rem 0.6rem',
    borderRadius: '999px', border: '1px solid',
    fontSize: '0.72rem', fontWeight: 700,
  },
  formCard: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '0.75rem', padding: '1rem 1.25rem', marginBottom: '1rem',
  },
  formTitle: { margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 700, color: 'rgba(186,230,253,0.9)' },
  formRow: { display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' },
  input: {
    flex: '1 1 140px', padding: '0.55rem 0.85rem',
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '0.5rem', color: 'white', fontSize: '0.875rem',
    fontFamily: "'Outfit', system-ui, sans-serif", outline: 'none',
  },
  select: {
    padding: '0.55rem 0.85rem',
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '0.5rem', color: 'white', fontSize: '0.875rem',
    fontFamily: "'Outfit', system-ui, sans-serif", outline: 'none', cursor: 'pointer',
  },
  toast: {
    padding: '0.65rem 1rem', borderRadius: '0.5rem', marginBottom: '0.75rem',
    background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.3)',
    color: '#67e8f9', fontSize: '0.875rem', fontWeight: 600,
  },
  btnGreen: {
    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
    padding: '0.5rem 1rem', borderRadius: '0.5rem',
    background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)',
    color: '#6ee7b7', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer',
    fontFamily: "'Outfit', system-ui, sans-serif",
  },
  btnBlue: {
    padding: '0.5rem 1rem', borderRadius: '0.5rem',
    background: 'rgba(8,145,178,0.25)', border: '1px solid rgba(8,145,178,0.45)',
    color: '#67e8f9', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer',
    fontFamily: "'Outfit', system-ui, sans-serif",
  },
  btnGhost: {
    padding: '0.5rem 1rem', borderRadius: '0.5rem',
    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(186,230,253,0.8)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
    fontFamily: "'Outfit', system-ui, sans-serif",
  },
  btnSmallBlue: {
    padding: '0.3rem 0.7rem', borderRadius: '0.4rem',
    background: 'rgba(8,145,178,0.2)', border: '1px solid rgba(8,145,178,0.35)',
    color: '#67e8f9', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
    fontFamily: "'Outfit', system-ui, sans-serif",
  },
  btnSmallRed: {
    padding: '0.3rem 0.7rem', borderRadius: '0.4rem',
    background: 'rgba(244,63,94,0.15)', border: '1px solid rgba(244,63,94,0.35)',
    color: '#fda4af', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
    fontFamily: "'Outfit', system-ui, sans-serif",
  },
  eyeBtn: {
    position: 'absolute',
    right: '0.6rem',
    background: 'none',
    border: 'none',
    color: 'rgba(186,230,253,0.6)',
    cursor: 'pointer',
    padding: '0.2rem',
    display: 'flex',
    alignItems: 'center',
  },
};
