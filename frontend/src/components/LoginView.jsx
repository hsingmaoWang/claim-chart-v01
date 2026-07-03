import { useState } from 'react';

const API_BASE = '';

export default function LoginView({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('請輸入帳號與密碼。');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || '帳號或密碼錯誤，請重新嘗試。');
      }

      const data = await response.json();
      // Persist session data to localStorage
      localStorage.setItem('ag_token', data.token);
      localStorage.setItem('ag_session_id', data.session_id);
      localStorage.setItem('ag_username', data.username);
      localStorage.setItem('ag_role', data.role);

      onLoginSuccess({
        token: data.token,
        session_id: data.session_id,
        username: data.username,
        role: data.role,
      });
    } catch (err) {
      setError(err.message || '登入失敗，請稍後再試。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      {/* Full-screen background image */}
      <div style={styles.bgLayer} />

      {/* Dark gradient overlay to improve text legibility */}
      <div style={styles.overlay} />

      {/* Left brand area */}
      <div style={styles.brandArea}>
        <div style={styles.brandBadge}>AI Powered</div>
        <h1 style={styles.brandTitle}>Patent Analyzer</h1>
        <p style={styles.brandSubtitle}>
          智慧專利分析平台<br />
          Claim Chart · 分類心智圖 · 全域知識圖譜
        </p>
        <div style={styles.brandFeatures}>
          {['AI 自動擷取獨立請求項', '互動式專利分類心智圖', 'Correlation Heatmap 分析', '一鍵匯出 Excel / PNG'].map((f, i) => (
            <div key={i} style={styles.featureItem}>
              <span style={styles.featureIcon}>✦</span>
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right glassmorphism login card */}
      <div style={styles.cardWrapper}>
        <div style={styles.card}>
          {/* Card header glow bar */}
          <div style={styles.cardTopBar} />

          <div style={styles.cardHeader}>
            <div style={styles.logoCircle}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
              </svg>
            </div>
            <h2 style={styles.cardTitle}>歡迎登入</h2>
            <p style={styles.cardSubtitle}>請輸入您的帳號與密碼</p>
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            {/* Username field */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>帳號</label>
              <div style={styles.inputWrapper}>
                <span style={styles.inputIcon}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </span>
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="請輸入帳號"
                  style={styles.input}
                  autoComplete="username"
                  autoFocus
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Password field */}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>密碼</label>
              <div style={styles.inputWrapper}>
                <span style={styles.inputIcon}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="請輸入密碼"
                  style={{ ...styles.input, paddingRight: '3rem' }}
                  autoComplete="current-password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={styles.eyeBtn}
                  tabIndex={-1}
                  aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div style={styles.errorBox}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              id="login-submit-btn"
              type="submit"
              disabled={isLoading}
              style={{
                ...styles.submitBtn,
                opacity: isLoading ? 0.7 : 1,
                cursor: isLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {isLoading ? (
                <>
                  <span style={styles.spinner} />
                  驗證中...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                  </svg>
                  登入系統
                </>
              )}
            </button>
          </form>

          <div style={styles.cardFooter}>
            © {new Date().getFullYear()} Antigravity Patent Solutions
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Inline styles ─── */
const styles = {
  page: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'stretch',
    fontFamily: "'Outfit', system-ui, sans-serif",
    overflow: 'hidden',
  },
  bgLayer: {
    position: 'absolute',
    inset: 0,
    backgroundImage: "url('/images/login-bg.png')",
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    zIndex: 0,
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(110deg, rgba(6,11,40,0.72) 0%, rgba(6,20,60,0.55) 55%, rgba(6,11,40,0.85) 100%)',
    zIndex: 1,
  },
  brandArea: {
    flex: 1,
    position: 'relative',
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '4rem 5rem',
    color: 'white',
  },
  brandBadge: {
    display: 'inline-block',
    background: 'rgba(34,211,238,0.25)',
    border: '1px solid rgba(34,211,238,0.45)',
    color: '#67e8f9',
    padding: '0.35rem 1rem',
    borderRadius: '999px',
    fontSize: '0.72rem',
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom: '1.5rem',
    width: 'fit-content',
  },
  brandTitle: {
    fontSize: 'clamp(2.8rem, 5vw, 4.5rem)',
    fontWeight: 900,
    lineHeight: 1.05,
    margin: '0 0 1.25rem',
    background: 'linear-gradient(110deg, #ffffff 0%, #bae6fd 50%, #67e8f9 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    filter: 'drop-shadow(0 0 20px rgba(103,232,249,0.35))',
  },
  brandSubtitle: {
    fontSize: '1.1rem',
    color: 'rgba(186,230,253,0.85)',
    fontWeight: 400,
    lineHeight: 1.8,
    marginBottom: '2.5rem',
  },
  brandFeatures: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem',
  },
  featureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    fontSize: '0.95rem',
    color: 'rgba(224,242,254,0.9)',
    fontWeight: 500,
  },
  featureIcon: {
    color: '#22d3ee',
    fontSize: '0.7rem',
  },
  cardWrapper: {
    width: '440px',
    flexShrink: 0,
    position: 'relative',
    zIndex: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    background: 'rgba(6, 11, 40, 0.55)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderLeft: '1px solid rgba(255,255,255,0.1)',
  },
  card: {
    width: '100%',
    maxWidth: '380px',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: '1.5rem',
    overflow: 'hidden',
    boxShadow: '0 25px 60px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.1)',
    position: 'relative',
  },
  cardTopBar: {
    height: '3px',
    background: 'linear-gradient(90deg, #0891b2, #22d3ee, #818cf8)',
  },
  cardHeader: {
    padding: '2rem 2rem 1rem',
    textAlign: 'center',
  },
  logoCircle: {
    width: '58px',
    height: '58px',
    background: 'linear-gradient(135deg, #0891b2, #1d4ed8)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 1.25rem',
    boxShadow: '0 0 20px rgba(8,145,178,0.4)',
  },
  cardTitle: {
    fontSize: '1.6rem',
    fontWeight: 800,
    color: 'white',
    margin: '0 0 0.35rem',
    letterSpacing: '-0.01em',
  },
  cardSubtitle: {
    fontSize: '0.875rem',
    color: 'rgba(186,230,253,0.7)',
    fontWeight: 400,
    margin: 0,
  },
  form: {
    padding: '1.5rem 2rem 1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.1rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.45rem',
  },
  label: {
    fontSize: '0.8rem',
    fontWeight: 700,
    color: 'rgba(186,230,253,0.85)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: '0.9rem',
    color: 'rgba(34,211,238,0.7)',
    pointerEvents: 'none',
    display: 'flex',
  },
  input: {
    width: '100%',
    padding: '0.8rem 0.9rem 0.8rem 2.6rem',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: '0.75rem',
    color: 'white',
    fontSize: '0.95rem',
    fontFamily: "'Outfit', system-ui, sans-serif",
    fontWeight: 500,
    outline: 'none',
    transition: 'all 200ms ease',
  },
  eyeBtn: {
    position: 'absolute',
    right: '0.9rem',
    background: 'none',
    border: 'none',
    color: 'rgba(186,230,253,0.6)',
    cursor: 'pointer',
    padding: '0.2rem',
    display: 'flex',
    alignItems: 'center',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: 'rgba(244,63,94,0.15)',
    border: '1px solid rgba(244,63,94,0.35)',
    borderRadius: '0.6rem',
    padding: '0.65rem 0.9rem',
    color: '#fda4af',
    fontSize: '0.875rem',
    fontWeight: 500,
    lineHeight: 1.4,
  },
  submitBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.6rem',
    padding: '0.9rem',
    background: 'linear-gradient(135deg, #0891b2, #1d4ed8)',
    color: 'white',
    border: 'none',
    borderRadius: '0.75rem',
    fontSize: '1rem',
    fontWeight: 700,
    fontFamily: "'Outfit', system-ui, sans-serif",
    letterSpacing: '0.02em',
    boxShadow: '0 4px 15px rgba(8,145,178,0.4)',
    transition: 'all 200ms ease',
    marginTop: '0.4rem',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: 'white',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    display: 'inline-block',
  },
  cardFooter: {
    textAlign: 'center',
    padding: '1rem 2rem 1.5rem',
    fontSize: '0.75rem',
    color: 'rgba(148,163,184,0.6)',
    fontWeight: 400,
  },
};
