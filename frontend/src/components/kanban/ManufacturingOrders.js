import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import './ManufacturingOrders.css';

export default function ManufacturingOrders({ jobCard, isGuest, isAdmin }) {
  const [orders, setOrders] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    machine_id: '',
    order_sequence: '',
    estimated_duration_minutes: '',
    notes: ''
  });
  // Multi-row add support
  const [addRows, setAddRows] = useState([]);
  const [operators, setOperators] = useState([]);

  const statusColors = {
    pending: '#f59e0b',
    in_progress: '#3b82f6',
    completed: '#10b981',
    skipped: '#6b7280'
  };

  const qualityColors = {
    pending: '#d1d5db',
    passed: '#10b981',
    failed: '#ef4444',
    rework: '#f59e0b'
  };

  useEffect(() => {
    if (jobCard) {
      loadOrders();
      loadMachines();
      loadOperators();
    }
  }, [jobCard]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/cnc-jobs/${jobCard.id}/manufacturing-orders`);
      setOrders(res.data.data || []);
    } catch (err) {
      console.error('Error loading orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMachines = async () => {
    try {
      const res = await api.get('/planning/machines');
      const activeMachines = (res.data || []).filter(m => m.status === 'active');
      setMachines(activeMachines);
    } catch (err) {
      console.error('Error loading machines:', err);
    }
  };

  const loadOperators = async () => {
    try {
      const res = await api.get('/users');
      const userOperators = (res.data.users || []).filter(u => u.role !== 'guest');
      setOperators(userOperators);
    } catch (err) {
      console.error('Error loading operators:', err);
    }
  };

  const getNextSequence = () => {
    const existingMax = orders.length > 0 ? Math.max(...orders.map(o => o.order_sequence)) : 0;
    const addRowMax = addRows.length > 0 ? Math.max(...addRows.map(r => parseInt(r.order_sequence) || 0)) : 0;
    return Math.max(existingMax, addRowMax) + 1;
  };

  const createEmptyRow = (seq) => ({
    machine_id: '',
    order_sequence: seq.toString(),
    estimated_duration_minutes: '',
    notes: '',
    _key: Date.now() + Math.random() // unique key for React
  });

  const handleOpenAddForm = () => {
    if (isGuest) {
      toast.error('Guest users have read-only access');
      return;
    }
    const nextSeq = orders.length > 0 ? Math.max(...orders.map(o => o.order_sequence)) + 1 : 1;
    setAddRows([createEmptyRow(nextSeq)]);
    setShowAddForm(true);
    setEditingId(null);
  };

  const handleAddRow = () => {
    const nextSeq = getNextSequence();
    setAddRows([...addRows, createEmptyRow(nextSeq)]);
  };

  const handleRemoveRow = (index) => {
    if (addRows.length === 1) return;
    setAddRows(addRows.filter((_, i) => i !== index));
  };

  const handleRowChange = (index, field, value) => {
    const updated = [...addRows];
    updated[index] = { ...updated[index], [field]: value };
    setAddRows(updated);
  };

  const handleSaveAll = async (e) => {
    e.preventDefault();
    
    // Validate all rows
    const invalid = addRows.find(r => !r.machine_id || r.order_sequence === '');
    if (invalid) {
      toast.error('Each step needs a machine and sequence number');
      return;
    }

    setSaving(true);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < addRows.length; i++) {
      const row = addRows[i];
      try {
        await api.post(`/cnc-jobs/${jobCard.id}/manufacturing-orders`, {
          machine_id: row.machine_id,
          order_sequence: parseInt(row.order_sequence),
          estimated_duration_minutes: row.estimated_duration_minutes ? Math.round(parseFloat(row.estimated_duration_minutes) * 60) : null,
          notes: row.notes
        });
        successCount++;
      } catch (err) {
        errorCount++;
        const errMsg = err.response?.data?.error || err.message;
        console.error('Error saving step:', err.response?.status, errMsg);
        toast.error(`Step ${i + 1} failed: ${errMsg}`);
      }
    }

    setSaving(false);

    if (successCount > 0) {
      toast.success(`${successCount} manufacturing step${successCount > 1 ? 's' : ''} added`);
      loadOrders();
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} step${errorCount > 1 ? 's' : ''} failed to save`);
    }
    
    setShowAddForm(false);
    setAddRows([]);
  };

  const handleEditOrder = (order) => {
    setEditFormData({
      machine_id: order.machine_id,
      order_sequence: order.order_sequence.toString(),
      estimated_duration_minutes: order.estimated_duration_minutes ? (order.estimated_duration_minutes / 60).toString() : '',
      notes: order.notes || ''
    });
    setEditingId(order.id);
    setShowAddForm(false);
  };

  const handleUpdateOrder = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/cnc-jobs/manufacturing-orders/${editingId}`, {
        machine_id: editFormData.machine_id,
        order_sequence: parseInt(editFormData.order_sequence),
        estimated_duration_minutes: editFormData.estimated_duration_minutes ? Math.round(parseFloat(editFormData.estimated_duration_minutes) * 60) : null,
        notes: editFormData.notes
      });
      toast.success('Manufacturing step updated');
      loadOrders();
      setEditingId(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm('Delete this manufacturing step?')) return;
    try {
      await api.delete(`/cnc-jobs/manufacturing-orders/${orderId}`);
      toast.success('Manufacturing step deleted');
      loadOrders();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await api.put(`/cnc-jobs/manufacturing-orders/${orderId}`, { status: newStatus });
      toast.success('Status updated');
      loadOrders();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const handleQualityCheck = async (orderId, newStatus) => {
    try {
      await api.put(`/cnc-jobs/manufacturing-orders/${orderId}`, { quality_check_status: newStatus });
      toast.success('Quality check updated');
      loadOrders();
    } catch (err) {
      toast.error('Failed to update quality check');
    }
  };

  const getMachineName = (machineId) => {
    const machine = machines.find(m => m.id === machineId);
    return machine ? `${machine.machine_name} (${machine.machine_code})` : 'Unknown Machine';
  };

  const getOperatorName = (operatorId) => {
    if (!operatorId) return '-';
    const operator = operators.find(o => o.id === operatorId);
    return operator ? operator.name : 'Unknown';
  };

  const calculateTotalTime = () => {
    return orders.reduce((sum, order) => sum + (order.estimated_duration_minutes || 0), 0);
  };

  const formatDuration = (minutes) => {
    if (!minutes) return '0h';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  if (loading) {
    return <div className="manufacturing-loading"><div className="spinner" /></div>;
  }

  return (
    <div className="manufacturing-orders-container">
      {/* Summary Card */}
      {orders.length > 0 && (
        <div className="manufacturing-summary">
          <div className="summary-item">
            <span className="summary-label">Total Steps:</span>
            <span className="summary-value">{orders.length}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Est. Total Time:</span>
            <span className="summary-value">{formatDuration(calculateTotalTime())}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Completed:</span>
            <span className="summary-value">{orders.filter(o => o.status === 'completed').length}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">In Progress:</span>
            <span className="summary-value">{orders.filter(o => o.status === 'in_progress').length}</span>
          </div>
        </div>
      )}

      {/* Add Button */}
      {!showAddForm && !editingId && (
        <button 
          className="btn btn-primary" 
          onClick={handleOpenAddForm} 
          style={{ marginBottom: '16px' }}
        >
          + Add Manufacturing Step{machines.length > 1 ? 's' : ''}
        </button>
      )}

      {/* Multi-row Add Form */}
      {showAddForm && (
        <div className="manufacturing-form">
          <h4>Add Manufacturing Steps</h4>
          <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 12px' }}>
            Add one or more machines to the manufacturing sequence
          </p>
          <form onSubmit={handleSaveAll}>
            {addRows.map((row, idx) => (
              <div key={row._key} className="multi-row" style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '8px', padding: '8px', background: '#f9fafb', borderRadius: '6px' }}>
                <div className="form-group" style={{ flex: 2, margin: 0 }}>
                  {idx === 0 && <label>Machine *</label>}
                  <select
                    value={row.machine_id}
                    onChange={(e) => handleRowChange(idx, 'machine_id', e.target.value)}
                    required
                  >
                    <option value="">Select Machine</option>
                    {machines.map(m => (
                      <option key={m.id} value={m.id}>{m.machine_name} ({m.machine_code})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 0.7, margin: 0 }}>
                  {idx === 0 && <label>Seq #</label>}
                  <input
                    type="number"
                    value={row.order_sequence}
                    onChange={(e) => handleRowChange(idx, 'order_sequence', e.target.value)}
                    required
                    min="1"
                  />
                </div>
                <div className="form-group" style={{ flex: 0.7, margin: 0 }}>
                  {idx === 0 && <label>Duration (hrs)</label>}
                  <input
                    type="number"
                    value={row.estimated_duration_minutes}
                    onChange={(e) => handleRowChange(idx, 'estimated_duration_minutes', e.target.value)}
                    placeholder="hrs"
                    min="0"
                    step="0.25"
                  />
                </div>
                <div className="form-group" style={{ flex: 1.5, margin: 0 }}>
                  {idx === 0 && <label>Notes</label>}
                  <input
                    type="text"
                    value={row.notes}
                    onChange={(e) => handleRowChange(idx, 'notes', e.target.value)}
                    placeholder="Notes..."
                  />
                </div>
                {addRows.length > 1 && (
                  <button 
                    type="button" 
                    onClick={() => handleRemoveRow(idx)} 
                    style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer', height: '36px' }}
                    title="Remove row"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <div className="form-actions" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button 
                type="button" 
                onClick={handleAddRow} 
                className="btn btn-secondary"
                style={{ fontSize: '13px' }}
              >
                + Add Another Machine
              </button>
              <div style={{ flex: 1 }} />
              <button type="submit" className="btn btn-success" disabled={saving}>
                {saving ? 'Saving...' : `Save ${addRows.length > 1 ? `(${addRows.length} steps)` : ''}`}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => { setShowAddForm(false); setAddRows([]); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Form (single item) */}
      {editingId && (
        <div className="manufacturing-form">
          <h4>Edit Manufacturing Step</h4>
          <form onSubmit={handleUpdateOrder}>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div className="form-group">
                <label>Machine *</label>
                <select
                  value={editFormData.machine_id}
                  onChange={(e) => setEditFormData({ ...editFormData, machine_id: e.target.value })}
                  required
                >
                  <option value="">Select Machine</option>
                  {machines.map(m => (
                    <option key={m.id} value={m.id}>{m.machine_name} ({m.machine_code})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Sequence # *</label>
                <input
                  type="number"
                  value={editFormData.order_sequence}
                  onChange={(e) => setEditFormData({ ...editFormData, order_sequence: e.target.value })}
                  required
                  min="1"
                />
              </div>
              <div className="form-group">
                <label>Est. Duration (hrs)</label>
                <input
                  type="number"
                  value={editFormData.estimated_duration_minutes}
                  onChange={(e) => setEditFormData({ ...editFormData, estimated_duration_minutes: e.target.value })}
                  min="0"
                  step="0.25"
                />
              </div>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea
                value={editFormData.notes}
                onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                rows={2}
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-success">Update</button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingId(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Orders List */}
      {orders.length === 0 && !showAddForm ? (
        <div className="manufacturing-empty">
          <p>📋 No manufacturing steps defined yet</p>
          <p>Click the button above to add machines to the manufacturing route</p>
        </div>
      ) : (
        <div className="manufacturing-list">
          {orders
            .sort((a, b) => a.order_sequence - b.order_sequence)
            .map((order) => (
              <div key={order.id} className={`manufacturing-card status-${order.status}`}>
                <div className="card-header">
                  <div className="card-title">
                    <span className="sequence-badge">{order.order_sequence}</span>
                    <h5>{getMachineName(order.machine_id)}</h5>
                  </div>
                  {!isGuest && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        className="btn-edit-small"
                        onClick={() => handleEditOrder(order)}
                        title="Edit"
                        style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        ✎
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDeleteOrder(order.id)}
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                <div className="card-content">
                  {order.estimated_duration_minutes && (
                    <div className="info-row">
                      <span className="label">Est. Time:</span>
                      <span className="value">{formatDuration(order.estimated_duration_minutes)}</span>
                    </div>
                  )}

                  <div className="status-section">
                    <div className="status-group">
                      <label>Status:</label>
                      {isGuest ? (
                        <span className="status-badge" style={{ backgroundColor: statusColors[order.status] }}>
                          {order.status.replace('_', ' ').toUpperCase()}
                        </span>
                      ) : (
                        <select
                          value={order.status}
                          onChange={(e) => handleStatusChange(order.id, e.target.value)}
                          className="status-select"
                        >
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="completed">Completed</option>
                          <option value="skipped">Skipped</option>
                        </select>
                      )}
                    </div>

                    <div className="status-group">
                      <label>Quality:</label>
                      {isGuest ? (
                        <span className="quality-badge" style={{ backgroundColor: qualityColors[order.quality_check_status] }}>
                          {(order.quality_check_status || 'pending').toUpperCase()}
                        </span>
                      ) : (
                        <select
                          value={order.quality_check_status || 'pending'}
                          onChange={(e) => handleQualityCheck(order.id, e.target.value)}
                          className="quality-select"
                        >
                          <option value="pending">Pending</option>
                          <option value="passed">✓ Passed</option>
                          <option value="failed">✕ Failed</option>
                          <option value="rework">Rework</option>
                        </select>
                      )}
                    </div>
                  </div>

                  <div className="operator-row">
                    <span className="label">Operator:</span>
                    {isGuest ? (
                      <span className="value">{getOperatorName(order.assigned_operator)}</span>
                    ) : (
                      <select
                        value={order.assigned_operator || ''}
                        onChange={(e) => api.put(`/cnc-jobs/manufacturing-orders/${order.id}`, { assigned_operator: e.target.value || null }).then(() => {
                          toast.success('Operator assigned');
                          loadOrders();
                        }).catch(() => toast.error('Failed to assign operator'))}
                        className="operator-select"
                      >
                        <option value="">Unassigned</option>
                        {operators.map(op => (
                          <option key={op.id} value={op.id}>{op.name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {order.notes && (
                    <div className="notes-row">
                      <span className="label">Notes:</span>
                      <p>{order.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
