import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import './ManufacturingOrders.css';

export default function ManufacturingOrders({ jobCard, isGuest, isAdmin }) {
  console.log('[ManufacturingOrders] Props received:', { jobCard: jobCard?.id, isGuest, isAdmin });
  
  const [orders, setOrders] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    machine_id: '',
    order_sequence: '',
    estimated_duration_minutes: '',
    notes: ''
  });
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
      toast.error('Failed to load manufacturing orders');
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
      toast.error('Failed to load machines');
    }
  };

  const loadOperators = async () => {
    try {
      const res = await api.get('/users');
      const userOperators = (res.data.users || []).filter(u => u.role === 'user');
      setOperators(userOperators);
    } catch (err) {
      console.error('Error loading operators:', err);
    }
  };

  const getNextSequence = () => {
    if (orders.length === 0) return 1;
    return Math.max(...orders.map(o => o.order_sequence)) + 1;
  };

  const handleAddOrder = async (e) => {
    e.preventDefault();
    
    if (!formData.machine_id || formData.order_sequence === '') {
      toast.error('Machine and sequence are required');
      return;
    }

    try {
      const payload = {
        machine_id: formData.machine_id,
        order_sequence: parseInt(formData.order_sequence),
        estimated_duration_minutes: formData.estimated_duration_minutes ? parseInt(formData.estimated_duration_minutes) : null,
        notes: formData.notes
      };

      if (editingId) {
        await api.put(`/cnc-jobs/manufacturing-orders/${editingId}`, payload);
        toast.success('Manufacturing order updated');
      } else {
        await api.post(`/cnc-jobs/${jobCard.id}/manufacturing-orders`, payload);
        toast.success('Manufacturing order added');
      }

      loadOrders();
      resetForm();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save manufacturing order');
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm('Delete this manufacturing order?')) return;

    try {
      await api.delete(`/cnc-jobs/manufacturing-orders/${orderId}`);
      toast.success('Manufacturing order deleted');
      loadOrders();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete manufacturing order');
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
      toast.success('Quality check status updated');
      loadOrders();
    } catch (err) {
      toast.error('Failed to update quality check');
    }
  };

  const resetForm = () => {
    setFormData({
      machine_id: '',
      order_sequence: getNextSequence().toString(),
      estimated_duration_minutes: '',
      notes: ''
    });
    setEditingId(null);
    setShowAddForm(false);
  };

  const handleEditOrder = (order) => {
    setFormData({
      machine_id: order.machine_id,
      order_sequence: order.order_sequence.toString(),
      estimated_duration_minutes: order.estimated_duration_minutes?.toString() || '',
      notes: order.notes || ''
    });
    setEditingId(order.id);
    setShowAddForm(true);
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

  if (loading) {
    return <div className="manufacturing-loading"><div className="spinner" /></div>;
  }

  return (
    <div className="manufacturing-orders-container">
      {/* Summary Card */}
      {orders.length > 0 && (
        <div className="manufacturing-summary">
          <div className="summary-item">
            <span className="summary-label">Total Machines:</span>
            <span className="summary-value">{orders.length}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Est. Total Time:</span>
            <span className="summary-value">{calculateTotalTime()} min</span>
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

      {/* Add/Edit Form */}
      {/* Button always visible, but disabled for guests */}
      <>
        {!showAddForm && (
          <button 
            className="btn btn-primary" 
            onClick={() => {
              if (isGuest) {
                toast.error('Guest users have read-only access');
                return;
              }
              setShowAddForm(true);
            }} 
            style={{ marginBottom: '16px' }}
            title={isGuest ? "Read-only access" : "Add a new manufacturing step"}
          >
            + Add Manufacturing Step
          </button>
        )}

        {showAddForm && !isGuest && (
            <div className="manufacturing-form">
              <h4>{editingId ? 'Edit Manufacturing Step' : 'Add New Manufacturing Step'}</h4>
              <form onSubmit={handleAddOrder}>
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  <div className="form-group">
                    <label>Machine *</label>
                    <select
                      value={formData.machine_id}
                      onChange={(e) => setFormData({ ...formData, machine_id: e.target.value })}
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
                      value={formData.order_sequence}
                      onChange={(e) => setFormData({ ...formData, order_sequence: e.target.value })}
                      placeholder="1, 2, 3..."
                      required
                      min="1"
                    />
                  </div>
                  <div className="form-group">
                    <label>Est. Duration (min)</label>
                    <input
                      type="number"
                      value={formData.estimated_duration_minutes}
                      onChange={(e) => setFormData({ ...formData, estimated_duration_minutes: e.target.value })}
                      placeholder="e.g., 60"
                      min="0"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Add any notes for this step..."
                    rows={2}
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-success">Save</button>
                  <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>
                </div>
              </form>
            </div>
          )}
      </>

      {/* Orders List */}
      {orders.length === 0 ? (
        <div className="manufacturing-empty">
          <p>📋 No manufacturing steps defined yet</p>
          <p>Click "Add Manufacturing Step" to start building the manufacturing route</p>
        </div>
      ) : (
        <div className="manufacturing-list">
          {orders
            .sort((a, b) => a.order_sequence - b.order_sequence)
            .map((order, idx) => (
              <div key={order.id} className={`manufacturing-card status-${order.status}`}>
                <div className="card-header">
                  <div className="card-title">
                    <span className="sequence-badge">{order.order_sequence}</span>
                    <h5>{getMachineName(order.machine_id)}</h5>
                  </div>
                  {!isGuest && (
                    <button
                      className="btn-delete"
                      onClick={() => handleDeleteOrder(order.id)}
                      title="Delete"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="card-content">
                  {/* Timing Info */}
                  {order.estimated_duration_minutes && (
                    <div className="info-row">
                      <span className="label">Est. Time:</span>
                      <span className="value">{order.estimated_duration_minutes} minutes</span>
                    </div>
                  )}

                  {/* Status Section */}
                  <div className="status-section">
                    <div className="status-group">
                      <label>Status:</label>
                      {isGuest ? (
                        <span className="status-badge" style={{ backgroundColor: statusColors[order.status] }}>
                          {order.status.toUpperCase()}
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
                          {order.quality_check_status.toUpperCase()}
                        </span>
                      ) : (
                        <select
                          value={order.quality_check_status}
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

                  {/* Operator Assignment */}
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

                  {/* Notes */}
                  {order.notes && (
                    <div className="notes-row">
                      <span className="label">Notes:</span>
                      <p>{order.notes}</p>
                    </div>
                  )}

                  {/* Edit Button */}
                  {!isGuest && !editingId && (
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleEditOrder(order)}
                      style={{ marginTop: '8px' }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
