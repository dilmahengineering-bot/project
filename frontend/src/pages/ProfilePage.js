import React, { useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { getInitials, AVATAR_COLORS } from '../utils/helpers';
import Layout from '../components/shared/Layout';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user } = useAuth();
  const [passForm, setPassForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  const handlePassChange = async (e) => {
    e.preventDefault();
    if (passForm.newPassword !== passForm.confirm) return toast.error('Passwords do not match');
    if (passForm.newPassword.length < 6) return toast.error('Password must be at least 6 characters');
    setSaving(true);
    try {
      await api.put('/auth/change-password', { currentPassword: passForm.currentPassword, newPassword: passForm.newPassword });
      toast.success('Password changed successfully!');
      setPassForm({ currentPassword:'', newPassword:'', confirm:'' });
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
    finally { setSaving(false); }
  };

  return (
    <Layout title="⚙️ Profile Settings">
      <div style={{maxWidth:'600px',margin:'0 auto'}}>
        <div className="card" style={{marginBottom:'24px'}}>
          <div className="card-header"><h3 style={{fontSize:'16px'}}>👤 Profile Information</h3></div>
          <div style={{padding:'24px',textAlign:'center'}}>
            <div className="avatar" style={{background:user?.avatar_color||'#4f46e5',width:'72px',height:'72px',fontSize:'24px',margin:'0 auto 16px'}}>
              {getInitials(user?.name)}
            </div>
            <h2 style={{fontSize:'20px'}}>{user?.name}</h2>
            <p style={{color:'var(--text-muted)',fontSize:'14px'}}>{user?.email}</p>
            <span className={`task-badge ${user?.role==='admin'?'badge-high':'badge-in_progress'}`} style={{marginTop:'8px',display:'inline-flex'}}>
              {user?.role}
            </span>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 style={{fontSize:'16px'}}>🔐 Change Password</h3></div>
          <div style={{padding:'24px'}}>
            <form onSubmit={handlePassChange}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input type="password" className="form-control" value={passForm.currentPassword} onChange={e=>setPassForm(p=>({...p,currentPassword:e.target.value}))} required />
              </div>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input type="password" className="form-control" value={passForm.newPassword} onChange={e=>setPassForm(p=>({...p,newPassword:e.target.value}))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input type="password" className="form-control" value={passForm.confirm} onChange={e=>setPassForm(p=>({...p,confirm:e.target.value}))} required />
              </div>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving...':'Update Password'}</button>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
