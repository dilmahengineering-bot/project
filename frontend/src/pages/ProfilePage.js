import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { getInitials, AVATAR_COLORS } from '../utils/helpers';
import Layout from '../components/shared/Layout';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user } = useAuth();
  const [passForm, setPassForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [phoneForm, setPhoneForm] = useState({ phone_number: '', loading: true });
  const [saving, setSaving] = useState(false);
  const [testingSummary, setTestingSummary] = useState(false);

  // Load current phone number
  useEffect(() => {
    loadPhoneNumber();
  }, []);

  const loadPhoneNumber = async () => {
    try {
      const res = await api.get('/whatsapp/phone');
      setPhoneForm(p => ({ ...p, phone_number: res.data.phone_number || '', loading: false }));
    } catch (err) {
      console.error('Error loading phone:', err);
      setPhoneForm(p => ({ ...p, loading: false }));
    }
  };

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

  const handlePhoneUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/whatsapp/phone', { phone_number: phoneForm.phone_number || null });
      toast.success('Phone number updated successfully!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error updating phone');
    } finally {
      setSaving(false);
    }
  };

  const handleTestMessage = async () => {
    setSaving(true);
    try {
      const res = await api.post('/whatsapp/test-message');
      if (res.data.success) {
        toast.success('✅ Test message sent! Check WhatsApp.');
      } else {
        toast.error('❌ Failed to send test message: ' + res.data.reason);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSummary = async () => {
    setTestingSummary(true);
    try {
      const res = await api.post('/whatsapp/test-summary');
      if (res.data.success || res.data.success === undefined) {
        toast.success('✅ Dashboard summary sent! Check WhatsApp.');
      } else {
        toast.error('❌ ' + (res.data.error || res.data.reason || 'Failed to send'));
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setTestingSummary(false);
    }
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

        <div className="card" style={{marginTop:'24px'}}>
          <div className="card-header"><h3 style={{fontSize:'16px'}}>📱 WhatsApp Notifications</h3></div>
          <div style={{padding:'24px'}}>
            <p style={{fontSize:'13px',color:'var(--text-muted)',marginBottom:'16px'}}>
              Get daily task summaries via WhatsApp at 7 AM and 7 PM. Enter your phone number in international format (e.g., +1234567890).
            </p>
            <form onSubmit={handlePhoneUpdate}>
              <div className="form-group">
                <label className="form-label">WhatsApp Phone Number</label>
                <input
                  type="tel"
                  className="form-control"
                  placeholder="+1234567890"
                  value={phoneForm.phone_number}
                  onChange={e => setPhoneForm(p => ({...p, phone_number: e.target.value}))}
                  disabled={phoneForm.loading}
                  title="Format: +country_code + phone_number"
                />
                <small style={{color:'var(--text-muted)',marginTop:'6px',display:'block'}}>
                  💡 Tip: Use international format starting with +
                </small>
              </div>
              <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                <button type="submit" className="btn btn-primary" disabled={saving || phoneForm.loading}>
                  {saving ? 'Saving...' : '💾 Save Phone'}
                </button>
                {phoneForm.phone_number && (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleTestMessage}
                      disabled={saving}
                    >
                      {saving ? 'Sending...' : '📨 Send Test Message'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleTestSummary}
                      disabled={testingSummary}
                    >
                      {testingSummary ? 'Sending...' : '📊 Send Test Summary'}
                    </button>
                  </>
                )}
              </div>
            </form>
            <div style={{marginTop:'16px',padding:'12px',background:'#f0f9ff',border:'1px solid #0284c7',borderRadius:'8px',fontSize:'12px',color:'#0c4a6e'}}>
              <strong>📅 You will receive:</strong><br/>
              • 7:00 AM - Morning dashboard summary<br/>
              • 7:00 PM - Evening dashboard summary<br/>
              • Task updates & reminders (coming soon)
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
