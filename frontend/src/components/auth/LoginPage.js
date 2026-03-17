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
      <div className="login-card">
        <div className="login-logo">
          <div className="icon">📋</div>
          <div>
            <h1 style={{fontSize:'24px',color:'#1e1b4b'}}>TaskFlow</h1>
            <p style={{fontSize:'12px',color:'#6b7280',marginTop:'2px'}}>Team Task Management</p>
          </div>
        </div>
        <h2 style={{fontSize:'20px',marginBottom:'8px',color:'#111827'}}>Sign in to your account</h2>
        <p style={{color:'#6b7280',fontSize:'14px',marginBottom:'28px'}}>Enter your credentials to continue</p>

        {error && (
          <div style={{marginBottom:'16px',padding:'14px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'8px',color:'#991b1b',fontSize:'14px'}}>
            <div style={{fontWeight:'600',marginBottom:'6px'}}>{typeof error === 'object' ? error.title : 'Error'}</div>
            <div style={{color:'#7f1d1d',fontSize:'13px',lineHeight:'1.5'}}>{typeof error === 'object' ? error.message : error}</div>
            {typeof error === 'object' && error.code && (
              <div style={{marginTop:'8px',fontSize:'12px',color:'#b91c1c',fontFamily:'monospace',background:'rgba(0,0,0,0.05)',padding:'6px 8px',borderRadius:'4px'}}>
                [Code: {error.code}]
              </div>
            )}
            {typeof error === 'object' && error.baseURL && (
              <div style={{marginTop:'8px',fontSize:'12px',color:'#7f1d1d',background:'rgba(0,0,0,0.05)',padding:'6px 8px',borderRadius:'4px'}}>
                API URL: <code style={{color:'#b91c1c'}}>{error.baseURL}</code>
              </div>
            )}
            {typeof error === 'object' && error.code === 'INVALID_CREDENTIALS' && (
              <div style={{marginTop:'10px',padding:'8px',background:'#fffbeb',borderRadius:'4px',color:'#92400e',fontSize:'12px'}}>
                <strong>Tip:</strong> Use admin@taskflow.com / Admin@123 for testing
              </div>
            )}
            {typeof error === 'object' && error.code === 'BACKEND_NOT_FOUND' && (
              <div style={{marginTop:'10px',padding:'8px',background:'#fffbeb',borderRadius:'4px',color:'#92400e',fontSize:'12px'}}>
                <strong>Troubleshooting:</strong>
                <div style={{marginTop:'4px'}}>1. Check if backend is running: <code>npm start</code> in /backend folder</div>
                <div>2. Verify backend is listening on port 5000</div>
                <div>3. Check if .env file has correct API_URL</div>
              </div>
            )}
            {typeof error === 'object' && error.code === 'NETWORK_ERROR' && (
              <div style={{marginTop:'10px',padding:'8px',background:'#fffbeb',borderRadius:'4px',color:'#92400e',fontSize:'12px'}}>
                <strong>Troubleshooting:</strong>
                <div style={{marginTop:'4px'}}>1. Check your internet connection</div>
                <div>2. Verify backend server is running</div>
                <div>3. Check if firewall is blocking port 5000</div>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email" className="form-control"
              placeholder="you@company.com"
              value={form.email}
              onChange={e => setForm(p => ({...p, email: e.target.value}))}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{position:'relative'}}>
              <input
                type={showPass ? 'text' : 'password'}
                className="form-control"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(p => ({...p, password: e.target.value}))}
                required style={{paddingRight:'44px'}}
              />
              <button type="button" onClick={() => setShowPass(p => !p)}
                style={{position:'absolute',right:'12px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:'16px',color:'#9ca3af'}}>
                {showPass ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-lg" style={{width:'100%',marginTop:'8px'}} disabled={loading}>
            {loading ? <><span className="spinner" style={{width:'18px',height:'18px',borderWidth:'2px'}}></span> Signing in...</> : 'Sign In'}
          </button>
        </form>

        <div style={{marginTop:'24px',padding:'16px',background:'#f5f3ff',borderRadius:'10px'}}>
          <p style={{fontSize:'12px',color:'#6b7280',marginBottom:'6px',fontWeight:'600'}}>Demo Credentials</p>
          <p style={{fontSize:'12px',color:'#4f46e5'}}>Admin: admin@taskflow.com / Admin@123</p>
        </div>
      </div>
    </div>
  );
}
