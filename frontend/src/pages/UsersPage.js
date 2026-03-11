import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { getInitials, AVATAR_COLORS, formatDate } from '../utils/helpers';
import Layout from '../components/shared/Layout';
import toast from 'react-hot-toast';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user', avatar_color: '#4f46e5' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await api.get('/users');
    setUsers(res.data.users);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setSelected(null); setForm({ name:'', email:'', password:'', role:'user', avatar_color:'#4f46e5' }); setShowModal(true); };
  const openEdit = (u) => { setSelected(u); setForm({ name:u.name, email:u.email, password:'', role:u.role, avatar_color:u.avatar_color, is_active: u.is_active }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name || !form.email) return toast.error('Name and email required');
    if (!selected && !form.password) return toast.error('Password required for new user');
    setSaving(true);
    try {
      if (selected) {
        await api.put('/users/' + selected.id, form);
        toast.success('User updated!');
      } else {
        await api.post('/users', form);
        toast.success('User created!');
      }
      setShowModal(false); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (u) => {
    if (!window.confirm('Deactivate ' + u.name + '?')) return;
    await api.delete('/users/' + u.id);
    toast.success('User deactivated');
    load();
  };

  return (
    <Layout title="👥 Users Management">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
        <p style={{color:'var(--text-muted)',fontSize:'14px'}}>{users.length} users total</p>
        <button className="btn btn-primary" onClick={openNew}>+ Add User</button>
      </div>

      <div className="card">
        {loading ? <div className="loading-center"><div className="spinner"></div></div> : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))',gap:'16px',padding:'20px'}}>
            {users.map(u => (
              <div key={u.id} style={{border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:'16px',background:'white',opacity:u.is_active?1:0.6}}>
                <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'12px'}}>
                  <div className="avatar" style={{background:u.avatar_color,width:'44px',height:'44px',fontSize:'16px',flexShrink:0}}>
                    {getInitials(u.name)}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:'700',fontSize:'15px'}}>{u.name}</div>
                    <div style={{fontSize:'12px',color:'var(--text-muted)'}}>{u.email}</div>
                  </div>
                  <span className={`task-badge ${u.role==='admin'?'badge-high':'badge-in_progress'}`}>{u.role}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:'11px',color:'var(--text-light)'}}>Joined {formatDate(u.created_at)}</span>
                  <div style={{display:'flex',gap:'6px'}}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u)}>Deactivate</button>
                  </div>
                </div>
                {!u.is_active && <div style={{marginTop:'8px',padding:'4px 8px',background:'#fee2e2',borderRadius:'6px',fontSize:'11px',color:'#991b1b',textAlign:'center'}}>Deactivated</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{selected ? 'Edit User' : 'Add New User'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input className="form-control" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="John Smith" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-control" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="john@company.com" />
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
                <div className="form-group">
                  <label className="form-label">{selected ? 'New Password (leave blank)' : 'Password *'}</label>
                  <input type="password" className="form-control" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} placeholder="••••••••" />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-control" value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Avatar Color</label>
                <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'4px'}}>
                  {AVATAR_COLORS.map(c => (
                    <div key={c} onClick={() => setForm(p=>({...p,avatar_color:c}))}
                      style={{width:'32px',height:'32px',borderRadius:'50%',background:c,cursor:'pointer',border:form.avatar_color===c?'3px solid #1e1b4b':'3px solid transparent',transition:'all 0.15s'}} />
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving?'Saving...':selected?'Save Changes':'Create User'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
