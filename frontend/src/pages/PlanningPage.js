import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/shared/Layout';
import api from '../utils/api';
import toast from 'react-hot-toast';
import './PlanningPage.css';

const STATUSES = {
  planned: { label: 'Planned', color: '#6366f1', bg: '#eef2ff' },
  in_progress: { label: 'In Progress', color: '#f59e0b', bg: '#fffbeb' },
  completed: { label: 'Completed', color: '#10b981', bg: '#ecfdf5' },
  cancelled: { label: 'Cancelled', color: '#ef4444', bg: '#fef2f2' },
};

const PRIORITIES = {
  high: { color: '#ef4444', bg: '#fef2f2' },
  medium: { color: '#f59e0b', bg: '#fffbeb' },
  low: { color: '#10b981', bg: '#ecfdf5' },
};

export default function PlanningPage() {
  const { isAdmin } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [machines, setMachines] = useState([]);
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState({ total_planned: 0, active_machines: 0, completed: 0, in_progress: 0 });
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add job modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMachineId, setAddMachineId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [addForm, setAddForm] = useState({ planned_start_time: '', planned_end_time: '', assigned_to: '', notes: '' });
  const searchTimeoutRef = useRef(null);

  // Edit entry modal
  const [editEntry, setEditEntry] = useState(null);
  const [editForm, setEditForm] = useState({});

  // Drag state
  const [dragEntry, setDragEntry] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [machinesRes, entriesRes, statsRes, usersRes] = await Promise.all([
        api.get('/planning/machines'),
        api.get('/planning/entries', { params: { date: selectedDate } }),
        api.get('/planning/stats', { params: { date: selectedDate } }),
        api.get('/planning/users'),
      ]);
      setMachines(machinesRes.data.filter(m => m.status === 'active'));
      setEntries(entriesRes.data);
      setStats(statsRes.data);
      setUsers(usersRes.data);
    } catch (err) {
      toast.error('Failed to load planning data');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 24h (86400000ms) — or 5 min for practical use
  useEffect(() => {
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Search jobs
  const handleSearch = (q) => {
    setSearchQuery(q);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (q.length < 1) { setSearchResults([]); return; }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await api.get('/planning/search-jobs', { params: { q } });
        setSearchResults(res.data);
      } catch { setSearchResults([]); }
    }, 300);
  };

  // Add entry
  const handleAddEntry = async () => {
    if (!selectedJob || !addMachineId) { toast.error('Select a machine and job card'); return; }
    try {
      await api.post('/planning/entries', {
        machine_id: addMachineId,
        job_card_id: selectedJob.id,
        plan_date: addForm.planned_start_time ? addForm.planned_start_time.substring(0, 10) : selectedDate,
        planned_start_time: addForm.planned_start_time || null,
        planned_end_time: addForm.planned_end_time || null,
        assigned_to: addForm.assigned_to,
        notes: addForm.notes,
      });
      toast.success('Job added to plan');
      setShowAddModal(false);
      resetAddForm();
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add job');
    }
  };

  const resetAddForm = () => {
    setSearchQuery(''); setSearchResults([]); setSelectedJob(null);
    setAddForm({ planned_start_time: '', planned_end_time: '', assigned_to: '', notes: '' });
    setAddMachineId('');
  };

  // Update entry
  const handleUpdateEntry = async () => {
    if (!editEntry) return;
    try {
      await api.put(`/planning/entries/${editEntry.id}`, editForm);
      toast.success('Entry updated');
      setEditEntry(null);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    }
  };

  // Delete entry
  const handleDeleteEntry = async (id) => {
    if (!window.confirm('Remove this job from the plan?')) return;
    try {
      await api.delete(`/planning/entries/${id}`);
      toast.success('Entry removed');
      loadData();
    } catch { toast.error('Failed to remove entry'); }
  };

  // Drag and drop
  const handleDragStart = (e, entry) => {
    setDragEntry(entry);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', entry.id);
  };

  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  const handleDrop = async (e, machineId) => {
    e.preventDefault();
    if (!dragEntry || dragEntry.machine_id === machineId) { setDragEntry(null); return; }
    try {
      await api.put(`/planning/entries/${dragEntry.id}`, { machine_id: machineId });
      toast.success(`Moved to ${machines.find(m => m.id === machineId)?.machine_name}`);
      loadData();
    } catch { toast.error('Failed to move entry'); }
    setDragEntry(null);
  };

  const getEntriesForMachine = (machineId) =>
    entries.filter(e => e.machine_id === machineId).sort((a, b) => a.sort_order - b.sort_order);

  const navigateDate = (offset) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + offset);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const formatDateTime = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts.substring(0, 5); // fallback for old TIME-only values
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatDateShort = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Convert ISO timestamp to datetime-local input format
  const toLocalInput = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const calcDuration = (start, end) => {
    if (!start || !end) return null;
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
    const mins = Math.round((e - s) / 60000);
    if (mins <= 0) return null;
    const days = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (days > 0) return `${days}d ${h}h`;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  if (loading && machines.length === 0) {
    return <Layout><div className="planning-loading"><div className="spinner" /><p>Loading planning dashboard...</p></div></Layout>;
  }

  return (
    <Layout>
      <div className="planning-page">
        {/* Header */}
        <div className="planning-header">
          <div className="planning-title">
            <h1>🗓️ CNC Job Planning</h1>
            <span className="planning-subtitle">Daily Machine Scheduling & Job Assignment</span>
          </div>
          <div className="planning-date-nav">
            <button className="btn btn-icon" onClick={() => navigateDate(-1)}>◀</button>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="date-picker" />
            <button className="btn btn-icon" onClick={() => navigateDate(1)}>▶</button>
            <button className="btn btn-secondary" onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}>Today</button>
          </div>
        </div>

        {/* Date Display */}
        <div className="planning-date-display">{formatDate(selectedDate)}</div>

        {/* Stats */}
        <div className="planning-stats">
          <div className="plan-stat"><span className="stat-value">{stats.total_planned}</span><span className="stat-label">Planned Jobs</span></div>
          <div className="plan-stat"><span className="stat-value">{stats.active_machines}</span><span className="stat-label">Active Machines</span></div>
          <div className="plan-stat progress"><span className="stat-value">{stats.in_progress}</span><span className="stat-label">In Progress</span></div>
          <div className="plan-stat success"><span className="stat-value">{stats.completed}</span><span className="stat-label">Completed</span></div>
        </div>

        {/* Machine Lanes */}
        {machines.length === 0 ? (
          <div className="planning-empty">
            <p>🔧 No machines configured yet.</p>
            {isAdmin && <p>Go to <strong>Machine Master</strong> to add CNC machines.</p>}
          </div>
        ) : (
          <div className="machine-lanes">
            {machines.map(machine => {
              const machineEntries = getEntriesForMachine(machine.id);
              return (
                <div
                  key={machine.id}
                  className={`machine-lane${dragEntry ? ' drop-target' : ''}`}
                  onDragOver={handleDragOver}
                  onDrop={e => handleDrop(e, machine.id)}
                >
                  <div className="machine-lane-header">
                    <div className="machine-info">
                      <span className="machine-name">🖥️ {machine.machine_name}</span>
                      <span className="machine-code">{machine.machine_code}</span>
                    </div>
                    <div className="machine-lane-actions">
                      <span className="entry-count">{machineEntries.length} job{machineEntries.length !== 1 ? 's' : ''}</span>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => { setAddMachineId(machine.id); setShowAddModal(true); }}
                      >+ Add Job</button>
                    </div>
                  </div>
                  <div className="machine-lane-body">
                    {machineEntries.length === 0 ? (
                      <div className="lane-empty">No jobs planned</div>
                    ) : (
                      machineEntries.map(entry => (
                        <div
                          key={entry.id}
                          className={`plan-card ${entry.status}`}
                          draggable
                          onDragStart={e => handleDragStart(e, entry)}
                        >
                          <div className="plan-card-header">
                            <span className="job-number">{entry.job_card_number}</span>
                            <span className="plan-status" style={{ background: STATUSES[entry.status]?.bg, color: STATUSES[entry.status]?.color }}>
                              {STATUSES[entry.status]?.label}
                            </span>
                          </div>
                          <div className="plan-card-title">{entry.job_name}</div>
                          <div className="plan-card-details">
                            {entry.part_number && <span>🔩 {entry.part_number}</span>}
                            {entry.client_name && <span>🏢 {entry.client_name}</span>}
                            {entry.priority && (
                              <span className="priority-badge" style={{ background: PRIORITIES[entry.priority]?.bg, color: PRIORITIES[entry.priority]?.color }}>
                                {entry.priority}
                              </span>
                            )}
                          </div>
                          <div className="plan-card-date">📅 {formatDateShort(entry.planned_start_time || entry.plan_date)}</div>
                          <div className="plan-card-times">
                            <div className="time-row">
                              <span className="time-label">Planned:</span>
                              <span>{formatDateTime(entry.planned_start_time)} – {formatDateTime(entry.planned_end_time)}</span>
                              {calcDuration(entry.planned_start_time, entry.planned_end_time) && (
                                <span className="duration planned">{calcDuration(entry.planned_start_time, entry.planned_end_time)}</span>
                              )}
                            </div>
                            {(entry.actual_start_time || entry.actual_end_time) && (
                              <div className="time-row">
                                <span className="time-label">Actual:</span>
                                <span>{formatDateTime(entry.actual_start_time)} – {formatDateTime(entry.actual_end_time)}</span>
                                {calcDuration(entry.actual_start_time, entry.actual_end_time) && (
                                  <span className="duration actual">{calcDuration(entry.actual_start_time, entry.actual_end_time)}</span>
                                )}
                              </div>
                            )}
                          </div>
                          {entry.assigned_to_name && <div className="plan-card-assignee">👤 {entry.assigned_to_name}</div>}
                          {entry.notes && <div className="plan-card-notes">📝 {entry.notes}</div>}
                          <div className="plan-card-actions">
                            <button className="btn-edit" onClick={() => { setEditEntry(entry); setEditForm({
                              planned_start_time: toLocalInput(entry.planned_start_time),
                              planned_end_time: toLocalInput(entry.planned_end_time),
                              actual_start_time: toLocalInput(entry.actual_start_time),
                              actual_end_time: toLocalInput(entry.actual_end_time),
                              assigned_to: entry.assigned_to || '',
                              status: entry.status,
                              notes: entry.notes || '',
                            }); }}>✏️ Edit</button>
                            <button className="btn-delete" onClick={() => handleDeleteEntry(entry.id)}>🗑️</button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Job Modal */}
        {showAddModal && (
          <div className="modal-overlay" onClick={() => { setShowAddModal(false); resetAddForm(); }}>
            <div className="modal planning-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>➕ Add Job to Plan</h2>
                <button className="modal-close" onClick={() => { setShowAddModal(false); resetAddForm(); }}>✕</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Machine</label>
                  <select value={addMachineId} onChange={e => setAddMachineId(e.target.value)} className="form-control">
                    <option value="">Select machine...</option>
                    {machines.map(m => <option key={m.id} value={m.id}>{m.machine_name} ({m.machine_code})</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Search Job Card</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Enter job card number, name, or part number..."
                    value={searchQuery}
                    onChange={e => handleSearch(e.target.value)}
                    autoFocus
                  />
                  {searchResults.length > 0 && !selectedJob && (
                    <div className="search-results">
                      {searchResults.map(job => (
                        <div key={job.id} className="search-result-item" onClick={() => { setSelectedJob(job); setSearchQuery(job.job_card_number); setSearchResults([]); }}>
                          <strong>{job.job_card_number}</strong> — {job.job_name}
                          <span className="search-meta">{job.part_number} · {job.client_name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedJob && (
                    <div className="selected-job-preview">
                      <div><strong>{selectedJob.job_card_number}</strong> — {selectedJob.job_name}</div>
                      <div className="preview-meta">
                        {selectedJob.part_number && <span>🔩 {selectedJob.part_number}</span>}
                        {selectedJob.client_name && <span>🏢 {selectedJob.client_name}</span>}
                        {selectedJob.quantity && <span>📦 Qty: {selectedJob.quantity}</span>}
                      </div>
                      <button className="btn-clear" onClick={() => { setSelectedJob(null); setSearchQuery(''); }}>✕ Clear</button>
                    </div>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Planned Start (Date & Time)</label>
                    <input type="datetime-local" className="form-control" value={addForm.planned_start_time} onChange={e => setAddForm(p => ({...p, planned_start_time: e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label>Planned End (Date & Time)</label>
                    <input type="datetime-local" className="form-control" value={addForm.planned_end_time} onChange={e => setAddForm(p => ({...p, planned_end_time: e.target.value}))} />
                  </div>
                </div>

                <div className="form-group">
                  <label>Assign To</label>
                  <select value={addForm.assigned_to} onChange={e => setAddForm(p => ({...p, assigned_to: e.target.value}))} className="form-control">
                    <option value="">Unassigned</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea className="form-control" rows="2" value={addForm.notes} onChange={e => setAddForm(p => ({...p, notes: e.target.value}))} placeholder="Optional notes..." />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setShowAddModal(false); resetAddForm(); }}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAddEntry} disabled={!selectedJob || !addMachineId}>Add to Plan</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Entry Modal */}
        {editEntry && (
          <div className="modal-overlay" onClick={() => setEditEntry(null)}>
            <div className="modal planning-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>✏️ Edit Plan Entry</h2>
                <button className="modal-close" onClick={() => setEditEntry(null)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="edit-job-info">
                  <strong>{editEntry.job_card_number}</strong> — {editEntry.job_name}
                  <div className="edit-machine-info">🖥️ {editEntry.machine_name}</div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Planned Start (Date & Time)</label>
                    <input type="datetime-local" className="form-control" value={editForm.planned_start_time} onChange={e => setEditForm(p => ({...p, planned_start_time: e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label>Planned End (Date & Time)</label>
                    <input type="datetime-local" className="form-control" value={editForm.planned_end_time} onChange={e => setEditForm(p => ({...p, planned_end_time: e.target.value}))} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Actual Start (Date & Time)</label>
                    <input type="datetime-local" className="form-control" value={editForm.actual_start_time} onChange={e => setEditForm(p => ({...p, actual_start_time: e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label>Actual End (Date & Time)</label>
                    <input type="datetime-local" className="form-control" value={editForm.actual_end_time} onChange={e => setEditForm(p => ({...p, actual_end_time: e.target.value}))} />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Status</label>
                    <select className="form-control" value={editForm.status} onChange={e => setEditForm(p => ({...p, status: e.target.value}))}>
                      {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Assign To</label>
                    <select className="form-control" value={editForm.assigned_to} onChange={e => setEditForm(p => ({...p, assigned_to: e.target.value}))}>
                      <option value="">Unassigned</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Notes</label>
                  <textarea className="form-control" rows="2" value={editForm.notes} onChange={e => setEditForm(p => ({...p, notes: e.target.value}))} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setEditEntry(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleUpdateEntry}>Save Changes</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
