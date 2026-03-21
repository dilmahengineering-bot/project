import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/shared/Layout';
import api from '../utils/api';
import toast from 'react-hot-toast';
import './MachineMasterPage.css';

const MACHINE_TYPES = ['cnc', 'lathe', 'mill', 'drill', 'grinder', 'edm', 'laser', 'other'];
const STATUS_OPTIONS = ['active', 'inactive', 'maintenance'];
const STATUS_COLORS = {
  active: { color: '#10b981', bg: '#ecfdf5', label: 'Active' },
  inactive: { color: '#6b7280', bg: '#f3f4f6', label: 'Inactive' },
  maintenance: { color: '#f59e0b', bg: '#fffbeb', label: 'Maintenance' },
};

export default function MachineMasterPage() {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editMachine, setEditMachine] = useState(null);
  const [form, setForm] = useState({
    machine_name: '', machine_code: '', machine_type: 'cnc', description: '', status: 'active',
  });

  const loadMachines = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/planning/machines');
      setMachines(res.data);
    } catch { toast.error('Failed to load machines'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadMachines(); }, [loadMachines]);

  const openAdd = () => {
    setEditMachine(null);
    setForm({ machine_name: '', machine_code: '', machine_type: 'cnc', description: '', status: 'active' });
    setShowModal(true);
  };

  const openEdit = (m) => {
    setEditMachine(m);
    setForm({ machine_name: m.machine_name, machine_code: m.machine_code, machine_type: m.machine_type, description: m.description || '', status: m.status });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.machine_name.trim() || !form.machine_code.trim()) {
      toast.error('Machine name and code are required');
      return;
    }
    try {
      if (editMachine) {
        await api.put(`/planning/machines/${editMachine.id}`, form);
        toast.success('Machine updated');
      } else {
        await api.post('/planning/machines', form);
        toast.success('Machine created');
      }
      setShowModal(false);
      loadMachines();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save machine');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this machine? All its plan entries will also be removed.')) return;
    try {
      await api.delete(`/planning/machines/${id}`);
      toast.success('Machine deleted');
      loadMachines();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  return (
    <Layout>
      <div className="machine-master-page">
        <div className="machine-master-header">
          <div>
            <h1>🔧 Machine Master</h1>
            <p className="machine-master-subtitle">Manage CNC machines for job planning</p>
          </div>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Machine</button>
        </div>

        {loading ? (
          <div className="planning-loading"><div className="spinner" /><p>Loading machines...</p></div>
        ) : machines.length === 0 ? (
          <div className="machine-empty">
            <p>🖥️ No machines configured yet</p>
            <p>Click "Add Machine" to register your first CNC machine.</p>
          </div>
        ) : (
          <div className="machine-grid">
            {machines.map(m => (
              <div key={m.id} className={`machine-card ${m.status}`}>
                <div className="machine-card-header">
                  <div className="machine-card-icon">🖥️</div>
                  <span className="machine-status-badge" style={{ background: STATUS_COLORS[m.status]?.bg, color: STATUS_COLORS[m.status]?.color }}>
                    {STATUS_COLORS[m.status]?.label}
                  </span>
                </div>
                <h3 className="machine-card-name">{m.machine_name}</h3>
                <div className="machine-card-code">{m.machine_code}</div>
                <div className="machine-card-type">Type: {m.machine_type}</div>
                {m.description && <div className="machine-card-desc">{m.description}</div>}
                <div className="machine-card-actions">
                  <button className="btn btn-sm btn-secondary" onClick={() => openEdit(m)}>✏️ Edit</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(m.id)}>🗑️ Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal planning-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editMachine ? '✏️ Edit Machine' : '➕ Add Machine'}</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Machine Name *</label>
                    <input type="text" className="form-control" value={form.machine_name} onChange={e => setForm(p => ({...p, machine_name: e.target.value}))} placeholder="e.g. CNC Mill #1" />
                  </div>
                  <div className="form-group">
                    <label>Machine Code *</label>
                    <input type="text" className="form-control" value={form.machine_code} onChange={e => setForm(p => ({...p, machine_code: e.target.value}))} placeholder="e.g. CNC-001" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Type</label>
                    <select className="form-control" value={form.machine_type} onChange={e => setForm(p => ({...p, machine_type: e.target.value}))}>
                      {MACHINE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select className="form-control" value={form.status} onChange={e => setForm(p => ({...p, status: e.target.value}))}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_COLORS[s]?.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea className="form-control" rows="3" value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} placeholder="Optional description, specifications..." />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave}>{editMachine ? 'Save Changes' : 'Create Machine'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
