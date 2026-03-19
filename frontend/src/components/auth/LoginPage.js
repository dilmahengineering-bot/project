import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      toast.success('Welcome back, ' + user.name + '!');
      navigate('/dashboard');
    } catch (err) {
      const errorInfo = err.errorInfo || {};
      const errorMsg = `${errorInfo.title || 'Login Failed'}${errorInfo.message ? ': ' + errorInfo.message : ''}`;
      setError({
        title: errorInfo.title || 'Login Failed',
        message: errorInfo.message || err.message || 'An unexpected error occurred',
        code: errorInfo.code,
        baseURL: errorInfo.baseURL,
      });
      console.error('Login error details:', { errorInfo, fullError: err });
      toast.error(errorMsg, { duration: 5000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Left Panel - Branding */}
      <div className="login-left">
        <div className="login-left-content">
          <div className="login-brand">
            <div className="brand-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div>
              <h1 className="brand-name">Dilmah CNC</h1>
              <p className="brand-subtitle">Precision Manufacturing</p>
            </div>
          </div>

          <div className="login-hero">
            <h2 className="hero-title">
              Streamlining Precision<br />
              <span className="hero-highlight">CNC Manufacturing Workflows</span>
            </h2>
            <p className="hero-description">
              A professional quotation management platform designed for Dilmah CNC Manufacturing operations, 
              enabling accurate multi-part, multi-operation costing with full engineering traceability. The 
              system ensures precision, consistency, and compliance, supporting advanced CNC machining, 
              transparent cost structures, and ISO-aligned approval workflows.
            </p>
          </div>

          <div className="login-features">
            <div className="feature-item">
              <span className="feature-check">✔</span>
              <span>Multi-part quotations</span>
            </div>
            <div className="feature-item">
              <span className="feature-check">✔</span>
              <span>Machine costing</span>
            </div>
            <div className="feature-item">
              <span className="feature-check">✔</span>
              <span>Approval workflows</span>
            </div>
            <div className="feature-item">
              <span className="feature-check">✔</span>
              <span>Real-time calculations</span>
            </div>
          </div>

          <div className="login-footer">
            <p>&copy; 2026 Dilmah Ceylon Tea Company PLC &ndash; CNC Manufacturing &amp; Engineering Innovations. All Rights Reserved.</p>
            <p className="powered-by">Powered by MJF Group Engineering Innovations</p>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="login-right">
        <div className="login-card">
          <h2 className="login-title">Welcome back</h2>
          <p className="login-subtitle">Sign in to your account to continue</p>

          {error && (
            <div className="login-error">
              <div style={{fontWeight:'600',marginBottom:'4px'}}>{typeof error === 'object' ? error.title : 'Error'}</div>
              <div style={{fontSize:'13px',opacity:0.9}}>{typeof error === 'object' ? error.message : error}</div>
              {typeof error === 'object' && error.code && (
                <div style={{marginTop:'6px',fontSize:'11px',fontFamily:'monospace',opacity:0.7}}>[{error.code}]</div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" style={{color:'#374151',fontWeight:'500'}}>Username</label>
              <input
                type="email" className="form-control login-input"
                placeholder="admin"
                value={form.email}
                onChange={e => setForm(p => ({...p, email: e.target.value}))}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" style={{color:'#374151',fontWeight:'500'}}>Password</label>
              <div style={{position:'relative'}}>
                <input
                  type={showPass ? 'text' : 'password'}
                  className="form-control login-input"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(p => ({...p, password: e.target.value}))}
                  required style={{paddingRight:'44px'}}
                />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  style={{position:'absolute',right:'12px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:'18px',color:'#9ca3af',lineHeight:1}}>
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? <><span className="spinner" style={{width:'18px',height:'18px',borderWidth:'2px'}}></span> Signing in...</> : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
