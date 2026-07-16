import { useState, useEffect, useCallback } from 'react';

const API_BASE = '';

/** 密碼強度計算 */
function getPasswordStrength(pwd) {
  if (!pwd) return { score: 0, label: '', color: 'transparent' };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  if (score <= 1) return { score, label: '弱', color: '#f43f5e' };
  if (score <= 2) return { score, label: '普通', color: '#f59e0b' };
  if (score <= 3) return { score, label: '良好', color: '#3b82f6' };
  return { score, label: '強', color: '#22c55e' };
}

export default function ChangePasswordModal({ authState, getAuthHeaders, onClose }) {
  const [currentPwd, setCurrentPwd]   = useState('');
  const [newPwd, setNewPwd]           = useState('');
  const [confirmPwd, setConfirmPwd]   = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState(false);

  const strength = getPasswordStrength(newPwd);

  // ESC 鍵關閉
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');

    if (!currentPwd || !newPwd || !confirmPwd) {
      setError('請填寫所有欄位。');
      return;
    }
    if (newPwd.length < 6) {
      setError('新密碼長度至少需要 6 個字元。');
      return;
    }
    if (newPwd !== confirmPwd) {
      setError('新密碼與確認密碼不一致，請重新確認。');
      return;
    }
    if (newPwd === currentPwd) {
      setError('新密碼不能與目前密碼相同。');
      return;
    }

    setIsLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          current_password: currentPwd,
          new_password: newPwd,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || '修改密碼失敗，請稍後再試。');
      }

      setSuccess(true);
    } catch (err) {
      setError(err.message || '修改密碼失敗，請稍後再試。');
    } finally {
      setIsLoading(false);
    }
  }, [currentPwd, newPwd, confirmPwd, getAuthHeaders]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(2, 6, 23, 0.75)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          animation: 'cpFadeIn 180ms ease',
        }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-pwd-title"
        style={{
          position: 'fixed', inset: 0, zIndex: 1001,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1rem',
          pointerEvents: 'none',
        }}
      >
        <div style={{
          width: '100%', maxWidth: '420px',
          background: 'rgba(10, 18, 60, 0.85)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '1.5rem',
          overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.07)',
          pointerEvents: 'auto',
          animation: 'cpSlideUp 220ms cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          {/* Top accent bar */}
          <div style={{ height: '3px', background: 'linear-gradient(90deg, #0891b2, #22d3ee, #818cf8)' }} />

          {/* Header */}
          <div style={{ padding: '1.75rem 1.75rem 0.75rem', textAlign: 'center' }}>
            <div style={{
              width: '52px', height: '52px', margin: '0 auto 1rem',
              background: 'linear-gradient(135deg, #0891b2, #1d4ed8)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(8,145,178,0.4)',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                <circle cx="12" cy="16" r="1" fill="white" />
              </svg>
            </div>
            <h2 id="change-pwd-title" style={{
              fontSize: '1.35rem', fontWeight: 800,
              color: 'white', margin: '0 0 0.3rem',
              fontFamily: "'Outfit', system-ui, sans-serif",
            }}>
              修改密碼
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'rgba(186,230,253,0.65)', margin: 0 }}>
              使用者：<strong style={{ color: 'rgba(186,230,253,0.9)' }}>{authState?.username}</strong>
            </p>
          </div>

          {/* Body */}
          {success ? (
            /* Success state */
            <div style={{ padding: '1.5rem 1.75rem 2rem', textAlign: 'center' }}>
              <div style={{
                width: '56px', height: '56px', margin: '0 auto 1.25rem',
                background: 'rgba(34,197,94,0.15)',
                border: '2px solid rgba(34,197,94,0.4)',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p style={{
                color: '#86efac', fontSize: '1rem', fontWeight: 700,
                margin: '0 0 0.5rem',
                fontFamily: "'Outfit', system-ui, sans-serif",
              }}>密碼已成功更新！</p>
              <p style={{ color: 'rgba(186,230,253,0.6)', fontSize: '0.82rem', margin: '0 0 1.5rem' }}>
                您的新密碼已儲存，下次登入時請使用新密碼。
              </p>
              <button
                id="change-pwd-close-success-btn"
                onClick={onClose}
                style={btnStyle}
              >
                關閉
              </button>
            </div>
          ) : (
            /* Form */
            <form onSubmit={handleSubmit} style={{ padding: '0.75rem 1.75rem 1.75rem' }}>
              {/* Current password */}
              <PasswordField
                id="change-pwd-current"
                label="目前密碼"
                value={currentPwd}
                onChange={setCurrentPwd}
                show={showCurrent}
                onToggle={() => setShowCurrent(v => !v)}
                placeholder="請輸入目前的密碼"
                disabled={isLoading}
                autoComplete="current-password"
              />

              {/* New password */}
              <PasswordField
                id="change-pwd-new"
                label="新密碼"
                value={newPwd}
                onChange={setNewPwd}
                show={showNew}
                onToggle={() => setShowNew(v => !v)}
                placeholder="至少 6 個字元"
                disabled={isLoading}
                autoComplete="new-password"
                hint={newPwd && (
                  <StrengthBar strength={strength} />
                )}
              />

              {/* Confirm new password */}
              <PasswordField
                id="change-pwd-confirm"
                label="確認新密碼"
                value={confirmPwd}
                onChange={setConfirmPwd}
                show={showConfirm}
                onToggle={() => setShowConfirm(v => !v)}
                placeholder="再次輸入新密碼"
                disabled={isLoading}
                autoComplete="new-password"
                hint={confirmPwd && newPwd && (
                  <span style={{
                    fontSize: '0.75rem', fontWeight: 600,
                    color: confirmPwd === newPwd ? '#86efac' : '#fda4af',
                  }}>
                    {confirmPwd === newPwd ? '✓ 密碼一致' : '✗ 密碼不一致'}
                  </span>
                )}
              />

              {/* Error */}
              {error && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
                  background: 'rgba(244,63,94,0.12)',
                  border: '1px solid rgba(244,63,94,0.3)',
                  borderRadius: '0.6rem',
                  padding: '0.65rem 0.9rem',
                  color: '#fda4af',
                  fontSize: '0.82rem', fontWeight: 500,
                  lineHeight: 1.5, marginBottom: '0.85rem',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: '1px' }}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {error}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button
                  id="change-pwd-cancel-btn"
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: '0.75rem',
                    color: 'rgba(186,230,253,0.75)',
                    fontSize: '0.9rem', fontWeight: 600,
                    fontFamily: "'Outfit', system-ui, sans-serif",
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 180ms',
                  }}
                >
                  取消
                </button>
                <button
                  id="change-pwd-submit-btn"
                  type="submit"
                  disabled={isLoading}
                  style={{
                    flex: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                    padding: '0.75rem',
                    background: isLoading
                      ? 'rgba(8,145,178,0.5)'
                      : 'linear-gradient(135deg, #0891b2, #1d4ed8)',
                    border: 'none',
                    borderRadius: '0.75rem',
                    color: 'white',
                    fontSize: '0.9rem', fontWeight: 700,
                    fontFamily: "'Outfit', system-ui, sans-serif",
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    boxShadow: isLoading ? 'none' : '0 4px 15px rgba(8,145,178,0.35)',
                    transition: 'all 180ms',
                  }}
                >
                  {isLoading ? (
                    <>
                      <span style={spinnerStyle} />
                      更新中...
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v14a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                      </svg>
                      確認修改
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <style>{`
        @keyframes cpFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cpSlideUp { from { opacity: 0; transform: translateY(20px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
        #change-pwd-cancel-btn:hover:not(:disabled) { background: rgba(255,255,255,0.12) !important; }
        #change-pwd-submit-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(8,145,178,0.45) !important; }
        #change-pwd-close-success-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(8,145,178,0.45) !important; }
        .cp-input:focus { border-color: rgba(34,211,238,0.65) !important; box-shadow: 0 0 0 3px rgba(34,211,238,0.15), 0 0 10px rgba(34,211,238,0.12) !important; background: rgba(255,255,255,0.11) !important; }
      `}</style>
    </>
  );
}

/* ── Sub-components ── */

function PasswordField({ id, label, value, onChange, show, onToggle, placeholder, disabled, autoComplete, hint }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label htmlFor={id} style={{
        display: 'block', marginBottom: '0.4rem',
        fontSize: '0.75rem', fontWeight: 700,
        color: 'rgba(186,230,253,0.8)',
        letterSpacing: '0.06em', textTransform: 'uppercase',
        fontFamily: "'Outfit', system-ui, sans-serif",
      }}>
        {label}
      </label>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span style={{
          position: 'absolute', left: '0.85rem',
          color: 'rgba(34,211,238,0.65)', pointerEvents: 'none', display: 'flex',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <input
          id={id}
          className="cp-input"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          style={{
            width: '100%',
            padding: '0.75rem 2.8rem 0.75rem 2.5rem',
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.16)',
            borderRadius: '0.7rem',
            color: 'white',
            fontSize: '0.9rem',
            fontFamily: "'Outfit', system-ui, sans-serif",
            fontWeight: 500,
            outline: 'none',
            transition: 'all 200ms ease',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          onClick={onToggle}
          tabIndex={-1}
          aria-label={show ? '隱藏密碼' : '顯示密碼'}
          style={{
            position: 'absolute', right: '0.85rem',
            background: 'none', border: 'none',
            color: 'rgba(186,230,253,0.55)', cursor: 'pointer',
            padding: '0.2rem', display: 'flex', alignItems: 'center',
            transition: 'color 150ms',
          }}
        >
          {show ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {hint && <div style={{ marginTop: '0.4rem' }}>{hint}</div>}
    </div>
  );
}

function StrengthBar({ strength }) {
  const segments = 5;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '3px', flex: 1 }}>
        {Array.from({ length: segments }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: '4px', borderRadius: '999px',
            background: i < strength.score ? strength.color : 'rgba(255,255,255,0.12)',
            transition: 'background 200ms',
          }} />
        ))}
      </div>
      {strength.label && (
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: strength.color, minWidth: '2.5rem', textAlign: 'right' }}>
          {strength.label}
        </span>
      )}
    </div>
  );
}

const btnStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '100%', padding: '0.8rem',
  background: 'linear-gradient(135deg, #0891b2, #1d4ed8)',
  border: 'none', borderRadius: '0.75rem',
  color: 'white', fontSize: '0.95rem', fontWeight: 700,
  fontFamily: "'Outfit', system-ui, sans-serif",
  cursor: 'pointer',
  boxShadow: '0 4px 15px rgba(8,145,178,0.35)',
  transition: 'all 200ms ease',
};

const spinnerStyle = {
  width: '14px', height: '14px',
  border: '2px solid rgba(255,255,255,0.3)',
  borderTopColor: 'white',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
  display: 'inline-block',
};
