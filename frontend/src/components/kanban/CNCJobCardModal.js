import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import cncJobService from '../../services/cncJobService';
import api from '../../utils/api';
import { formatDate, timeAgo } from '../../utils/helpers';
import toast from 'react-hot-toast';
import './CNCJobCardModal.css';

export default function CNCJobCardModal({ jobCard, workflow, onClose, onSave, isCompletedRecord = false }) {
  const { user, isAdmin, isGuest } = useAuth();
  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('details');
  const [formData, setFormData] = useState({
    job_name: '',
    job_card_number: '',
    subjob_card_number: '',
    job_date: new Date().toISOString().split('T')[0],
    machine_name: '',
    client_name: '',
    part_number: '',
    manufacturing_type: 'internal',
    quantity: 1,
    estimate_end_date: '',
    assigned_to: '',
    priority: 'medium',
    notes: '',
    material: '',
    drawing_number: '',
    tolerance: '',
    surface_finish: '',
    item_code: '',
    dimension: '',
    pr_number: '',
    po_number: '',
    estimated_delivery_date: '',
    workflow_id: workflow?.id || ''
  });

  const [users, setUsers] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [extForm, setExtForm] = useState({ new_deadline: '', reason: '' });
  const isNew = !jobCard?.id;

  useEffect(() => {
    if (jobCard) {
      setFormData({
        job_name: jobCard.job_name,
        job_card_number: jobCard.job_card_number,
        subjob_card_number: jobCard.subjob_card_number || '',
        job_date: jobCard.job_date?.split('T')[0] || new Date().toISOString().split('T')[0],
        machine_name: jobCard.machine_name || '',
        client_name: jobCard.client_name || '',
        part_number: jobCard.part_number,
        manufacturing_type: jobCard.manufacturing_type,
        quantity: jobCard.quantity,
        estimate_end_date: jobCard.estimate_end_date?.split('T')[0] || '',
        assigned_to: jobCard.assigned_to || '',
        priority: jobCard.priority,
        notes: jobCard.notes || '',
        material: jobCard.material || '',
        drawing_number: jobCard.drawing_number || '',
        tolerance: jobCard.tolerance || '',
        surface_finish: jobCard.surface_finish || '',
        item_code: jobCard.item_code || '',
        dimension: jobCard.dimension || '',
        pr_number: jobCard.pr_number || '',
        po_number: jobCard.po_number || '',
        estimated_delivery_date: jobCard.estimated_delivery_date?.split('T')[0] || '',
        workflow_id: workflow?.id || ''
      });
      loadDetail();
    }
  }, [jobCard, workflow]);

  const loadDetail = async () => {
    if (!jobCard) return;
    try {
      const res = await cncJobService.getJobCard(jobCard.id);
      setDetail(res.data);
      setAttachments(res.data.attachments || []);
    } catch (err) {
      console.error('Error loading job card details:', err);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await api.get('/users');
      setUsers(response.data.users || []);
    } catch (err) {
      console.error('Error loading users:', err);
    }
  };

  // Deadline change permission logic (same as tasks)
  const currentUserId = user?.id ? String(user.id) : null;
  let userDeadlineChangeCount = 0;
  if (currentUserId && detail?.history?.length > 0) {
    userDeadlineChangeCount = detail.history.filter(h =>
      h.action_type === 'deadline_changed' && String(h.user_id || '') === currentUserId
    ).length;
  }
  const canChangeDeadline = isAdmin || userDeadlineChangeCount === 0;
  const deadlineDisabled = !isNew && !canChangeDeadline;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'quantity' ? parseInt(value) : value
    }));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !jobCard) return;

    try {
      setUploadingFile(true);
      await cncJobService.uploadAttachment(jobCard.id, file);
      await loadDetail();
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Failed to upload file');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!window.confirm('Delete this attachment?')) return;
    try {
      await cncJobService.deleteAttachment(attachmentId);
      await loadDetail();
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Failed to delete attachment');
    }
  };

  const handleDownloadReport = async () => {
    if (!jobCard) return;
    try {
      setLoading(true);
      const response = await cncJobService.downloadReport(jobCard.id);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `JobCard-${jobCard.job_card_number}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setSubmitError('Failed to download report');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    try {
      setLoading(true);

      if (!formData.job_name || !formData.job_card_number || !formData.part_number) {
        setSubmitError('Job name, job card number, and part number are required');
        setLoading(false);
        return;
      }

      if (jobCard) {
        const updateData = {
          job_name: formData.job_name,
          machine_name: formData.machine_name,
          client_name: formData.client_name,
          estimate_end_date: formData.estimate_end_date || null,
          assigned_to: formData.assigned_to || null,
          priority: formData.priority,
          notes: formData.notes,
          quantity: formData.quantity,
          material: formData.material || null,
          drawing_number: formData.drawing_number || null,
          tolerance: formData.tolerance || null,
          surface_finish: formData.surface_finish || null,
          item_code: formData.item_code || null,
          dimension: formData.dimension || null,
          pr_number: formData.pr_number || null,
          po_number: formData.po_number || null,
          estimated_delivery_date: formData.estimated_delivery_date || null
        };
        await cncJobService.updateJobCard(jobCard.id, updateData);
      } else {
        await cncJobService.createJobCard({
          ...formData,
          workflow_id: workflow.id,
          estimate_end_date: formData.estimate_end_date || null,
          assigned_to: formData.assigned_to || null
        });
      }

      onSave();
      onClose();
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Failed to save job card');
      console.error('Error saving job card:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (window.confirm('Mark this job card as completed?')) {
      try {
        setLoading(true);
        await cncJobService.completeJobCard(jobCard.id, { notes: 'Marked as completed from modal' });
        onSave();
        onClose();
      } catch (err) {
        setSubmitError(err.response?.data?.error || 'Failed to complete job card');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDelete = async () => {
    if (window.confirm('⚠️ Are you sure you want to DELETE this job card? This action cannot be undone.')) {
      try {
        setLoading(true);
        await cncJobService.deleteJobCard(jobCard.id);
        toast.success('Job card deleted successfully');
        onSave();
        onClose();
      } catch (err) {
        setSubmitError(err.response?.data?.error || 'Failed to delete job card');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleExtension = async () => {
    if (!extForm.new_deadline) return toast.error('New deadline required');
    try {
      await cncJobService.requestExtension(jobCard.id, extForm);
      toast.success('Extension requested!');
      setExtForm({ new_deadline: '', reason: '' });
      loadDetail();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error requesting extension');
    }
  };

  const getFileIcon = (type) => {
    if (!type) return '📄';
    if (type.includes('pdf')) return '📕';
    if (type.includes('image')) return '🖼️';
    if (type.includes('spreadsheet') || type.includes('excel')) return '📊';
    if (type.includes('word') || type.includes('document')) return '📝';
    return '📄';
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isGuest ? 'View Job Card' : jobCard ? 'Edit Job Card' : 'Create New CNC Job Card'}</h2>
          <div className="header-actions">
            {jobCard && (
              <button type="button" className="btn btn-report" onClick={handleDownloadReport} disabled={loading} title="Download PDF Report">
                📥 Report
              </button>
            )}
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        {jobCard && (
          <div className="modal-tabs">
            <button className={`tab ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>📋 Details</button>
            <button className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>📜 History</button>
            <button className={`tab ${activeTab === 'extensions' ? 'active' : ''}`} onClick={() => setActiveTab('extensions')}>
              🕐 Extensions {detail?.extensions?.filter(e => e.approval_status === 'pending').length > 0 && <span className="tab-badge">{detail.extensions.filter(e => e.approval_status === 'pending').length}</span>}
            </button>
            <button className={`tab ${activeTab === 'attachments' ? 'active' : ''}`} onClick={() => setActiveTab('attachments')}>
              📎 Attachments {attachments.length > 0 && <span className="tab-badge">{attachments.length}</span>}
            </button>
          </div>
        )}

        {submitError && (
          <div className="form-error" style={{ margin: '16px 24px 0' }}>
            ✕ {submitError}
          </div>
        )}

        {activeTab === 'details' && (
          <form onSubmit={handleSubmit} className="job-card-form">
            <div className="form-section">
              <h4>Job Information {(!isNew && !isAdmin) || isCompletedRecord ? <span style={{fontSize:'11px',color:'#6b7280',fontWeight:'normal'}}>(🔒 Read-only)</span> : ''}</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Job Name *</label>
                  <input type="text" name="job_name" value={formData.job_name} onChange={handleChange} placeholder="e.g., Shaft Drilling" required disabled={isCompletedRecord || (!isNew && !isAdmin)} />
                </div>
                <div className="form-group">
                  <label>Job Card Number *</label>
                  <input type="text" name="job_card_number" value={formData.job_card_number} onChange={handleChange} placeholder="e.g., JC-2024-001" required disabled={!!jobCard} />
                </div>
                <div className="form-group">
                  <label>Sub Job Card Number</label>
                  <input type="text" name="subjob_card_number" value={formData.subjob_card_number} onChange={handleChange} placeholder="e.g., SJC-001" disabled={isCompletedRecord || (!isNew && !isAdmin)} />
                </div>
                <div className="form-group">
                  <label>Part Number *</label>
                  <input type="text" name="part_number" value={formData.part_number} onChange={handleChange} placeholder="e.g., PN-12345" required disabled={isCompletedRecord || (!isNew && !isAdmin)} />
                </div>
                <div className="form-group">
                  <label>Drawing Number</label>
                  <input type="text" name="drawing_number" value={formData.drawing_number} onChange={handleChange} placeholder="e.g., DWG-2024-001" disabled={isCompletedRecord || (!isNew && !isAdmin)} />
                </div>
                <div className="form-group">
                  <label>Job Date *</label>
                  <input type="date" name="job_date" value={formData.job_date} onChange={handleChange} required disabled={isCompletedRecord || (!isNew && !isAdmin)} />
                </div>
                <div className="form-group">
                  <label>Quantity</label>
                  <input type="number" name="quantity" value={formData.quantity} onChange={handleChange} min="1" disabled={isCompletedRecord || (!isNew && !isAdmin)} />
                </div>
                <div className="form-group">
                  <label>Client Name / Machine Line Name</label>
                  <input type="text" name="client_name" value={formData.client_name} onChange={handleChange} placeholder="e.g., ABC Manufacturing" disabled={isCompletedRecord || (!isNew && !isAdmin)} />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h4>Manufacturing Details</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Machine Name</label>
                  <input type="text" name="machine_name" value={formData.machine_name} onChange={handleChange} placeholder="e.g., CNC-Lathe-01" />
                </div>
                <div className="form-group">
                  <label>Manufacturing Type *</label>
                  <select name="manufacturing_type" value={formData.manufacturing_type} onChange={handleChange}>
                    <option value="internal">🏭 Internal</option>
                    <option value="external">🤝 External</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Tolerance</label>
                  <input type="text" name="tolerance" value={formData.tolerance} onChange={handleChange} placeholder="e.g., ±0.01mm" />
                </div>
                <div className="form-group">
                  <label>Surface Finish</label>
                  <input type="text" name="surface_finish" value={formData.surface_finish} onChange={handleChange} placeholder="e.g., Ra 0.8, Mirror Polish" />
                </div>
                <div className="form-group">
                  <label>Estimate End Date {deadlineDisabled && <span style={{color:'#ef4444',fontSize:'11px'}}>(Changed once)</span>}</label>
                  <input type="date" name="estimate_end_date" value={formData.estimate_end_date} onChange={handleChange} disabled={deadlineDisabled} style={{cursor: deadlineDisabled ? 'not-allowed' : 'pointer', opacity: deadlineDisabled ? 0.6 : 1}} />
                  {deadlineDisabled && (
                    <p style={{fontSize:'11px',color:'#f59e0b',marginTop:'4px'}}>ℹ️ Already changed once. Use Extensions tab to request a new date.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="form-section">
              <h4>📦 Procurement Details</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Material</label>
                  <input type="text" name="material" value={formData.material} onChange={handleChange} placeholder="e.g., SS304, Aluminium 6061" />
                </div>
                <div className="form-group">
                  <label>Item Code</label>
                  <input type="text" name="item_code" value={formData.item_code} onChange={handleChange} placeholder="e.g., ITM-2024-001" />
                </div>
                <div className="form-group">
                  <label>Dimension</label>
                  <input type="text" name="dimension" value={formData.dimension} onChange={handleChange} placeholder="e.g., 100x50x25 mm" />
                </div>
                <div className="form-group">
                  <label>PR Number</label>
                  <input type="text" name="pr_number" value={formData.pr_number} onChange={handleChange} placeholder="e.g., PR-2024-001" />
                </div>
                <div className="form-group">
                  <label>PO Number</label>
                  <input type="text" name="po_number" value={formData.po_number} onChange={handleChange} placeholder="e.g., PO-2024-001" />
                </div>
                <div className="form-group">
                  <label>Estimated Delivery Date</label>
                  <input type="date" name="estimated_delivery_date" value={formData.estimated_delivery_date} onChange={handleChange} />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h4>Assignment & Priority</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Assign To</label>
                  <select name="assigned_to" value={formData.assigned_to} onChange={handleChange}>
                    <option value="">Unassigned</option>
                    {users.filter(u => u.role === 'user').map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Priority</label>
                  <select name="priority" value={formData.priority} onChange={handleChange}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h4>Notes</h4>
              <textarea name="notes" value={formData.notes} onChange={handleChange} placeholder="Add any additional notes..." rows={4} />
            </div>

            <div className="modal-footer">
              <div className="footer-left">
                {isCompletedRecord && (
                  <p style={{ color: '#10b981', fontSize: '12px', margin: 0, fontWeight: '500' }}>{isGuest ? '👁️ Guest view — read-only access' : '✓ This record is archived and cannot be modified'}</p>
                )}
                {jobCard && !isCompletedRecord && isAdmin && (
                  <>
                    <button type="button" className="btn btn-secondary" onClick={handleComplete} disabled={loading} title="Admin only: Mark this job card as completed">
                      ✓ Mark as Completed
                    </button>
                    <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={loading} title="Admin only: Delete this job card" style={{ marginLeft: '8px', backgroundColor: '#ef4444', borderColor: '#dc2626' }}>
                      🗑️ Delete
                    </button>
                  </>
                )}
                {jobCard && !isCompletedRecord && !isAdmin && (
                  <p style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>ℹ️ Only admins can mark job cards as completed</p>
                )}
              </div>
              <div className="footer-right">
                <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
                {!isCompletedRecord && (
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    {loading ? 'Saving...' : jobCard ? 'Update Job Card' : 'Create Job Card'}
                  </button>
                )}
              </div>
            </div>
          </form>
        )}

        {activeTab === 'history' && (
          <div style={{padding:'24px',maxHeight:'60vh',overflowY:'auto'}}>
            {(!detail?.history || detail.history.length === 0) && (
              <div className="empty-attachments"><p>No activity yet</p></div>
            )}
            {detail?.history?.map(h => (
              <div key={h.id} style={{display:'flex',gap:'12px',padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{width:'36px',height:'36px',borderRadius:'50%',background:'#ede9fe',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:'16px'}}>
                  {h.action_type === 'stage_moved' ? '🔄' : h.action_type === 'deadline_changed' ? '📅' : h.action_type === 'reassigned' ? '👤' : h.action_type === 'priority_changed' ? '⚡' : h.action_type === 'created' ? '✨' : h.action_type === 'completed' ? '✅' : h.action_type === 'extension_requested' ? '🕐' : h.action_type === 'extension_approved' ? '✅' : h.action_type === 'extension_rejected' ? '❌' : '📌'}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'13px',color:'var(--text)'}}>{h.notes}</div>
                  {h.old_value && h.new_value && (
                    <div style={{fontSize:'12px',color:'var(--text-muted)',marginTop:'2px'}}>
                      <span style={{textDecoration:'line-through'}}>{h.old_value}</span> → {h.new_value}
                    </div>
                  )}
                  <div style={{fontSize:'12px',color:'var(--text-muted)',marginTop:'4px'}}>{h.user_name} · {timeAgo(h.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'extensions' && (
          <div style={{padding:'24px',maxHeight:'60vh',overflowY:'auto'}}>
            {!isAdmin && !isGuest && (
              <div style={{background:'var(--surface2, #f8fafc)',padding:'16px',borderRadius:'8px',marginBottom:'20px',border:'1px solid var(--border)'}}>
                <h4 style={{fontSize:'14px',marginBottom:'12px'}}>Request Extension</h4>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                  <div>
                    <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'4px'}}>New Deadline</label>
                    <input type="date" className="form-control" value={extForm.new_deadline} onChange={e => setExtForm(p=>({...p,new_deadline:e.target.value}))} style={{width:'100%'}} />
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:'12px',fontWeight:'600',marginBottom:'4px'}}>Reason</label>
                    <input className="form-control" placeholder="Reason for extension..." value={extForm.reason} onChange={e => setExtForm(p=>({...p,reason:e.target.value}))} style={{width:'100%'}} />
                  </div>
                </div>
                <button type="button" className="btn btn-primary" style={{marginTop:'12px',fontSize:'13px',padding:'8px 16px'}} onClick={handleExtension}>Request Extension</button>
              </div>
            )}
            {detail?.extensions?.map(ext => (
              <div key={ext.id} style={{padding:'12px',border:'1px solid var(--border)',borderRadius:'8px',marginBottom:'10px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}>
                  <span style={{fontSize:'13px',fontWeight:'600'}}>{ext.requested_by_name}</span>
                  <span style={{fontSize:'11px',fontWeight:'600',padding:'2px 8px',borderRadius:'10px',
                    background: ext.approval_status === 'approved' ? '#dcfce7' : ext.approval_status === 'rejected' ? '#fee2e2' : '#fef3c7',
                    color: ext.approval_status === 'approved' ? '#16a34a' : ext.approval_status === 'rejected' ? '#dc2626' : '#d97706'}}>
                    {ext.approval_status}
                  </span>
                </div>
                <p style={{fontSize:'12px',color:'var(--text-muted)',margin:'4px 0'}}>
                  {formatDate(ext.previous_deadline)} → {formatDate(ext.new_deadline)}
                </p>
                {ext.reason && <p style={{fontSize:'12px',color:'var(--text)',margin:'4px 0'}}>{ext.reason}</p>}
                <div style={{fontSize:'11px',color:'var(--text-muted)',marginTop:'4px'}}>{timeAgo(ext.created_at)}</div>
                {isAdmin && ext.approval_status === 'pending' && (
                  <div style={{display:'flex',gap:'8px',marginTop:'8px'}}>
                    <button type="button" className="btn btn-primary" style={{fontSize:'12px',padding:'4px 12px'}} onClick={async () => {
                      try { await cncJobService.handleExtension(ext.id, 'approved'); toast.success('Extension approved!'); loadDetail(); } catch { toast.error('Error approving'); }
                    }}>✅ Approve</button>
                    <button type="button" className="btn btn-ghost" style={{fontSize:'12px',padding:'4px 12px',color:'#dc2626'}} onClick={async () => {
                      try { await cncJobService.handleExtension(ext.id, 'rejected'); toast.success('Extension rejected'); loadDetail(); } catch { toast.error('Error rejecting'); }
                    }}>❌ Reject</button>
                  </div>
                )}
              </div>
            ))}
            {(!detail?.extensions || detail.extensions.length === 0) && (
              <div className="empty-attachments"><p>No extension requests</p></div>
            )}
          </div>
        )}

        {activeTab === 'attachments' && (
          <div className="attachments-section">
            {!isCompletedRecord && !isGuest && (
            <div className="attachment-upload">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.step,.stp,.iges,.stl"
              />
              <button
                className="btn btn-primary upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
              >
                {uploadingFile ? '⏳ Uploading...' : '📁 Upload File'}
              </button>
              <span className="upload-hint">PDF, Images, CAD files (DWG, STEP, STL), Documents — Max 10MB</span>
            </div>
            )}

            <div className="attachments-list">
              {attachments.length === 0 ? (
                <div className="empty-attachments">
                  <p>📎 No attachments yet</p>
                  <p className="hint">Upload drawings, specifications, or related documents</p>
                </div>
              ) : (
                attachments.map(att => (
                  <div key={att.id} className="attachment-item">
                    <div className="attachment-icon">{getFileIcon(att.file_type)}</div>
                    <div className="attachment-info">
                      <a
                        href={`http://localhost:5000/uploads/${att.file_name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="attachment-name"
                      >
                        {att.original_name}
                      </a>
                      <span className="attachment-meta">
                        {formatFileSize(att.file_size)} · {att.uploaded_by_name} · {new Date(att.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {!isGuest && <button className="btn-delete-attachment" onClick={() => handleDeleteAttachment(att.id)} title="Delete">🗑️</button>}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
