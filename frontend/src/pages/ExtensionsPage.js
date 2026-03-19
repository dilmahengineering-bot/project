import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { formatDate, timeAgo } from '../utils/helpers';
import Layout from '../components/shared/Layout';
import toast from 'react-hot-toast';

export default function ExtensionsPage() {
  const [extensions, setExtensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('tasks');

  const load = async () => {
    try {
      const all = [];

      // Fetch task extensions
      const res = await api.get('/tasks?limit=200');
      await Promise.all(res.data.tasks.map(async t => {
        if (parseInt(t.pending_extensions) > 0) {
          const detail = await api.get('/tasks/' + t.id);
          detail.data.extensions.forEach(ext => {
            all.push({ ...ext, item_title: t.title, item_id: t.id, type: 'task' });
          });
        }
      }));

      // Fetch CNC job extensions
      try {
        const cncRes = await api.get('/cnc-jobs/extensions/all');
        cncRes.data.forEach(ext => {
          all.push({ ...ext, item_title: ext.job_name + ' (' + ext.job_card_number + ')', item_id: ext.job_card_id, type: 'cnc' });
        });
      } catch (err) { console.error('Error loading CNC extensions:', err); }

      setExtensions(all.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handle = async (extId, status, type) => {
    try {
      if (type === 'cnc') {
        await api.put('/cnc-jobs/extensions/' + extId, { approval_status: status });
      } else {
        await api.put('/tasks/extensions/' + extId, { approval_status: status });
      }
      toast.success('Extension ' + status + '!');
      load();
    } catch { toast.error('Error'); }
  };

  const filtered = tab === 'all' ? extensions : extensions.filter(e => e.type === tab);
  const pending = filtered.filter(e => e.approval_status === 'pending');
  const resolved = filtered.filter(e => e.approval_status !== 'pending');

  const allPending = extensions.filter(e => e.approval_status === 'pending');
  const taskPending = extensions.filter(e => e.type === 'task' && e.approval_status === 'pending').length;
  const cncPending = extensions.filter(e => e.type === 'cnc' && e.approval_status === 'pending').length;

  return (
    <Layout title="🕐 Deadline Extensions">
      <div style={{marginBottom:'20px',display:'flex',gap:'16px',flexWrap:'wrap'}}>
        <div className="stat-card" style={{flex:1}}>
          <div style={{fontSize:'28px',fontWeight:'800',color:'var(--warning)'}}>{allPending.length}</div>
          <div style={{fontSize:'13px',color:'var(--text-muted)'}}>Pending Review</div>
        </div>
        <div className="stat-card" style={{flex:1}}>
          <div style={{fontSize:'28px',fontWeight:'800',color:'var(--success)'}}>{extensions.filter(e=>e.approval_status==='approved').length}</div>
          <div style={{fontSize:'13px',color:'var(--text-muted)'}}>Approved</div>
        </div>
        <div className="stat-card" style={{flex:1}}>
          <div style={{fontSize:'28px',fontWeight:'800',color:'var(--danger)'}}>{extensions.filter(e=>e.approval_status==='rejected').length}</div>
          <div style={{fontSize:'13px',color:'var(--text-muted)'}}>Rejected</div>
        </div>
      </div>

      <div style={{display:'flex',gap:'8px',marginBottom:'20px',flexWrap:'wrap'}}>
        {[{key:'all',label:'All'},{key:'tasks',label:'📋 Tasks'},{key:'cnc',label:'🔧 CNC Jobs'}].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`btn ${tab === t.key ? 'btn-primary' : 'btn-ghost'}`} style={{fontSize:'13px'}}>
            {t.label}
            {t.key === 'tasks' && taskPending > 0 && <span style={{marginLeft:'6px',background:'#fef3c7',color:'#d97706',padding:'1px 6px',borderRadius:'10px',fontSize:'11px'}}>{taskPending}</span>}
            {t.key === 'cnc' && cncPending > 0 && <span style={{marginLeft:'6px',background:'#fef3c7',color:'#d97706',padding:'1px 6px',borderRadius:'10px',fontSize:'11px'}}>{cncPending}</span>}
          </button>
        ))}
      </div>

      {pending.length > 0 && (
        <div className="card" style={{marginBottom:'24px'}}>
          <div className="card-header">
            <h3 style={{fontSize:'16px'}}>⏳ Pending Approval ({pending.length})</h3>
          </div>
          <div style={{padding:'8px'}}>
            {pending.map(ext => (
              <div key={ext.id} style={{padding:'16px',margin:'8px',borderRadius:'var(--radius)',border:'2px solid #fef3c7',background:'#fffbeb'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px'}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <span style={{fontSize:'11px',fontWeight:'600',padding:'2px 8px',borderRadius:'10px',
                        background: ext.type === 'cnc' ? '#dbeafe' : '#f3e8ff',
                        color: ext.type === 'cnc' ? '#2563eb' : '#7c3aed'}}>{ext.type === 'cnc' ? '🔧 CNC' : '📋 Task'}</span>
                      <span style={{fontWeight:'700',fontSize:'15px'}}>{ext.item_title}</span>
                    </div>
                    <div style={{fontSize:'13px',color:'var(--text-muted)',marginTop:'2px'}}>Requested by {ext.requested_by_name} · {timeAgo(ext.created_at)}</div>
                  </div>
                  <span className="task-badge badge-pending">Pending</span>
                </div>
                <div style={{display:'flex',gap:'24px',fontSize:'13px',marginBottom:'12px'}}>
                  <div><span style={{color:'var(--text-muted)'}}>From: </span><strong>{formatDate(ext.previous_deadline)}</strong></div>
                  <div>→</div>
                  <div><span style={{color:'var(--text-muted)'}}>To: </span><strong style={{color:'var(--primary)'}}>{formatDate(ext.new_deadline)}</strong></div>
                </div>
                {ext.reason && <div style={{fontSize:'13px',padding:'8px 12px',background:'white',borderRadius:'6px',marginBottom:'12px',color:'var(--text)'}}>{ext.reason}</div>}
                <div style={{display:'flex',gap:'8px'}}>
                  <button className="btn btn-success btn-sm" onClick={() => handle(ext.id,'approved',ext.type)}>✓ Approve</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handle(ext.id,'rejected',ext.type)}>✕ Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><h3 style={{fontSize:'16px'}}>📜 Extension History</h3></div>
        {loading ? <div className="loading-center"><div className="spinner"></div></div> : resolved.length === 0 ? (
          <div className="empty-state"><p>No extension history yet</p></div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Type</th><th>Item</th><th>Requested By</th><th>Previous</th><th>Requested</th><th>Status</th><th>Decided By</th></tr></thead>
              <tbody>
                {resolved.map(ext => (
                  <tr key={ext.id}>
                    <td><span style={{fontSize:'11px',fontWeight:'600',padding:'2px 8px',borderRadius:'10px',
                      background: ext.type === 'cnc' ? '#dbeafe' : '#f3e8ff',
                      color: ext.type === 'cnc' ? '#2563eb' : '#7c3aed'}}>{ext.type === 'cnc' ? 'CNC' : 'Task'}</span></td>
                    <td style={{fontWeight:'600'}}>{ext.item_title}</td>
                    <td>{ext.requested_by_name}</td>
                    <td>{formatDate(ext.previous_deadline)}</td>
                    <td>{formatDate(ext.new_deadline)}</td>
                    <td>
                      <span className={`task-badge ${ext.approval_status==='approved'?'badge-completed':'badge-high'}`}>
                        {ext.approval_status}
                      </span>
                    </td>
                    <td style={{fontSize:'12px',color:'var(--text-muted)'}}>{ext.approved_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
