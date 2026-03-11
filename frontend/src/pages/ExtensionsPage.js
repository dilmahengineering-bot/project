import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { formatDate, timeAgo } from '../utils/helpers';
import Layout from '../components/shared/Layout';
import toast from 'react-hot-toast';

export default function ExtensionsPage() {
  const [extensions, setExtensions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    // Fetch all tasks with pending extensions then get their extensions
    try {
      const res = await api.get('/tasks?limit=200');
      const all = [];
      await Promise.all(res.data.tasks.map(async t => {
        if (parseInt(t.pending_extensions) > 0) {
          const detail = await api.get('/tasks/' + t.id);
          detail.data.extensions.forEach(ext => {
            all.push({ ...ext, task_title: t.title, task_id: t.id });
          });
        }
      }));
      setExtensions(all.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handle = async (extId, status) => {
    try {
      await api.put('/tasks/extensions/' + extId, { approval_status: status });
      toast.success('Extension ' + status + '!');
      load();
    } catch { toast.error('Error'); }
  };

  const pending = extensions.filter(e => e.approval_status === 'pending');
  const resolved = extensions.filter(e => e.approval_status !== 'pending');

  return (
    <Layout title="🕐 Deadline Extensions">
      <div style={{marginBottom:'20px',display:'flex',gap:'16px'}}>
        <div className="stat-card" style={{flex:1}}>
          <div style={{fontSize:'28px',fontWeight:'800',color:'var(--warning)'}}>{pending.length}</div>
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
                    <div style={{fontWeight:'700',fontSize:'15px'}}>{ext.task_title}</div>
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
                  <button className="btn btn-success btn-sm" onClick={() => handle(ext.id,'approved')}>✓ Approve</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handle(ext.id,'rejected')}>✕ Reject</button>
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
              <thead><tr><th>Task</th><th>Requested By</th><th>Previous</th><th>Requested</th><th>Status</th><th>Decided By</th></tr></thead>
              <tbody>
                {resolved.map(ext => (
                  <tr key={ext.id}>
                    <td style={{fontWeight:'600'}}>{ext.task_title}</td>
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
