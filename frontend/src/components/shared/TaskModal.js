import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import socketService from '../../services/socket';
import { formatDate, getDeadlineStatus, timeAgo } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function TaskModal({ task, onClose, onSave, users = [] }) {
  const { isAdmin, user } = useAuth();
  const [tab, setTab] = useState('details');
  const [detail, setDetail] = useState(null);
  const [extForm, setExtForm] = useState({ new_deadline: '', reason: '' });
  const [loading, setLoading] = useState(false);
  const isNew = !task?.id;
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    assigned_to: task?.assigned_to || '',
    deadline: task?.deadline ? task.deadline.split('T')[0] : '',
    priority: task?.priority || 'medium',
    status: task?.status || 'pending',
  });

  useEffect(() => {
    if (task?.id) {
      api.get('/tasks/' + task.id).then(res => setDetail(res.data)).catch(() => {});
    }
  }, [task?.id]);

  // Real-time updates for task details
  useEffect(() => {
    if (!task?.id) return;

    const refreshTaskDetail = () => {
      api.get('/tasks/' + task.id).then(res => setDetail(res.data)).catch(() => {});
    };

    const handleTaskUpdated = (data) => {
      if (data.taskId === task.id) {
        refreshTaskDetail();
      }
    };

    const handleExtensionApproved = (data) => {
      if (data.taskId === task.id) {
        refreshTaskDetail();
      }
    };

    const handleExtensionRequested = (data) => {
      if (data.taskId === task.id) {
        refreshTaskDetail();
      }
    };

    socketService.onTaskUpdated(handleTaskUpdated);
    socketService.onExtensionApproved(handleExtensionApproved);
    socketService.onExtensionRequested(handleExtensionRequested);

    return () => {
      socketService.off('task:updated', handleTaskUpdated);
      socketService.off('extension:approved', handleExtensionApproved);
      socketService.off('extension:requested', handleExtensionRequested);
    };
  }, [task?.id]);

  const deadline = detail?.task ? getDeadlineStatus(detail.task) : null;

  // Check if current user has already changed deadline (non-admin only)
  const userDeadlineChangeCount = detail?.history?.filter(h => 
    h.action_type === 'deadline_changed' && h.user_id === user?.id
  ).length || 0;
  const canChangeDeadline = isAdmin || userDeadlineChangeCount === 0;
  const deadlineDisabled = !isNew && !canChangeDeadline;

  const handleSave = async () => {
    if (!form.title || !form.deadline) return toast.error('Title and deadline required');
    setLoading(true);
    try {
      if (isNew) {
        await api.post('/tasks', form);
        toast.success('Task created!');
      } else {
        await api.put('/tasks/' + task.id, form);
        toast.success('Task updated!');
      }
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error saving task');
    } finally { setLoading(false); }
  };

  const handleComplete = async () => {
    try {
      await api.put('/tasks/' + task.id + '/complete');
      toast.success('Task marked complete!');
      onSave();
    } catch { toast.error('Error'); }
  };

  const handleConfirm = async () => {
    try {
      await api.put('/tasks/' + task.id + '/confirm');
      toast.success('Task confirmed and archived!');
      onSave();
    } catch { toast.error('Error'); }
  };

  const handleExtension = async () => {
    if (!extForm.new_deadline) return toast.error('New deadline required');
    try {
      await api.post('/tasks/' + task.id + '/extension', extForm);
      toast.success('Extension requested!');
      setExtForm({ new_deadline: '', reason: '' });
      onSave();
    } catch { toast.error('Error requesting extension'); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await api.delete('/tasks/' + task.id);
      toast.success('Task deleted');
      onSave();
    } catch { toast.error('Error'); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{maxWidth: isNew ? '540px' : '680px'}}>
        <div className="modal-header">
          <div>
            <h3 style={{fontSize:'17px'}}>{isNew ? '✨ New Task' : (form.title || 'Task Details')}</h3>
            {!isNew && deadline && (
              <div className={`deadline-indicator ${deadline.cls}`} style={{marginTop:'4px'}}>
                <div className="deadline-dot"></div>
                <span className="deadline-text">{deadline.label}</span>
              </div>
            )}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        {!isNew && (
          <div style={{display:'flex',borderBottom:'1px solid var(--border)',padding:'0 24px'}}>
            {['details','history','extensions'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{padding:'10px 16px',border:'none',background:'none',cursor:'pointer',fontSize:'13px',fontWeight:'600',
                  color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
                  borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
                  fontFamily:'inherit',textTransform:'capitalize'}}>
                {t === 'extensions' ? '🕐 Extensions' : t === 'history' ? '📜 History' : '📝 Details'}
              </button>
            ))}
          </div>
        )}

        <div className="modal-body">
          {tab === 'details' && (
            <>
              <div className="form-group">
                <label className="form-label">Task Title *</label>
                <input className="form-control" placeholder="Enter task title..." value={form.title} onChange={e => setForm(p=>({...p,title:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-control" placeholder="Task description..." value={form.description || ''} onChange={e => setForm(p=>({...p,description:e.target.value}))} />
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
                <div className="form-group">
                  <label className="form-label">Assigned To</label>
                  <select className="form-control" value={form.assigned_to} onChange={e => setForm(p=>({...p,assigned_to:e.target.value}))}>
                    <option value="">Unassigned</option>
                    {users.filter(u=>u.role!=='admin').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Priority</label>
                  <select className="form-control" value={form.priority} onChange={e => setForm(p=>({...p,priority:e.target.value}))}>
                    <option value="low">🟢 Low</option>
                    <option value="medium">🟡 Medium</option>
                    <option value="high">🔴 High</option>
                  </select>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
                <div className="form-group">
                  <label className="form-label">Deadline * {deadlineDisabled && <span style={{color:'var(--danger)',fontSize:'12px'}}>(Changed once)</span>}</label>
                  <input type="date" className="form-control" value={form.deadline} onChange={e => setForm(p=>({...p,deadline:e.target.value}))} disabled={deadlineDisabled} style={{cursor: deadlineDisabled ? 'not-allowed' : 'pointer', opacity: deadlineDisabled ? 0.6 : 1}} />
                  {deadlineDisabled && (
                    <p style={{fontSize:'12px',color:'var(--warning)',marginTop:'4px'}}>ℹ️ You've already changed this deadline once. Contact admin to change it again.</p>
                  )}
                </div>
                {!isNew && (
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select className="form-control" value={form.status} onChange={e => setForm(p=>({...p,status:e.target.value}))}>
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      {isAdmin && <option value="archived">Archived</option>}
                    </select>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'history' && (
            <div>
              {detail?.history?.length === 0 && <div className="empty-state"><p>No activity yet</p></div>}
              {detail?.history?.map(h => (
                <div key={h.id} className="activity-item">
                  <div className="activity-icon" style={{background:'#ede9fe'}}>📌</div>
                  <div className="activity-content">
                    <div className="activity-text">{h.notes}</div>
                    <div className="activity-time">{h.user_name} · {timeAgo(h.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'extensions' && (
            <div>
              {!isAdmin && task?.status !== 'archived' && (
                <div style={{background:'var(--surface2)',padding:'16px',borderRadius:'var(--radius)',marginBottom:'20px'}}>
                  <h4 style={{fontSize:'14px',marginBottom:'12px'}}>Request Extension</h4>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                    <div>
                      <label className="form-label">New Deadline</label>
                      <input type="date" className="form-control" value={extForm.new_deadline} onChange={e => setExtForm(p=>({...p,new_deadline:e.target.value}))} />
                    </div>
                    <div>
                      <label className="form-label">Reason</label>
                      <input className="form-control" placeholder="Reason..." value={extForm.reason} onChange={e => setExtForm(p=>({...p,reason:e.target.value}))} />
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" style={{marginTop:'12px'}} onClick={handleExtension}>Request Extension</button>
                </div>
              )}
              {detail?.extensions?.map(ext => (
                <div key={ext.id} style={{padding:'12px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',marginBottom:'10px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}>
                    <span style={{fontSize:'13px',fontWeight:'600'}}>{ext.requested_by_name}</span>
                    <span className={`task-badge ${ext.approval_status === 'approved' ? 'badge-completed' : ext.approval_status === 'rejected' ? 'badge-high' : 'badge-pending'}`}>
                      {ext.approval_status}
                    </span>
                  </div>
                  <p style={{fontSize:'12px',color:'var(--text-muted)'}}>
                    {formatDate(ext.previous_deadline)} → {formatDate(ext.new_deadline)}
                  </p>
                  {ext.reason && <p style={{fontSize:'12px',color:'var(--text)',marginTop:'4px'}}>{ext.reason}</p>}
                </div>
              ))}
              {!detail?.extensions?.length && <div className="empty-state"><p>No extension requests</p></div>}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {!isNew && isAdmin && (
            <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
          )}
          {!isNew && !isAdmin && task?.status === 'in_progress' && (
            <button className="btn btn-success" onClick={handleComplete}>✓ Mark Complete</button>
          )}
          {!isNew && isAdmin && task?.status === 'completed' && !task?.completion_confirmed && (
            <button className="btn btn-success" onClick={handleConfirm}>✓ Confirm & Archive</button>
          )}
          <div style={{marginLeft:'auto',display:'flex',gap:'8px'}}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            {tab === 'details' && (
              <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                {loading ? 'Saving...' : (isNew ? '+ Create Task' : 'Save Changes')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
