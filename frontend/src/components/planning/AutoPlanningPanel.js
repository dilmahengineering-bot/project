import React, { useState, useRef } from 'react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import './AutoPlanningPanel.css';

export default function AutoPlanningPanel({ isOpen, onClose, isAdmin }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const searchTimeoutRef = useRef(null);
  const [mode, setMode] = useState('single'); // 'single' or 'bulk'
  const [formData, setFormData] = useState({
    start_date: new Date().toISOString().split('T')[0],
    preferred_shift: 'day',
    assign_operator: false
  });

  const handleSearch = (q) => {
    setSearchQuery(q);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await api.get('/planning/search-jobs', { params: { q } });
        setSearchResults(res.data.slice(0, 10));
      } catch {
        setSearchResults([]);
      }
    }, 300);
  };

  const handleGetPreview = async () => {
    if (!selectedJob) {
      toast.error('Please select a job card');
      return;
    }

    try {
      setLoading(true);
      const res = await api.get(`/planning/auto-plan/preview/${selectedJob.id}`, {
        params: {
          start_date: formData.start_date,
          preferred_shift: formData.preferred_shift
        }
      });
      setPreview(res.data);
      toast.success('Preview generated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate preview');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (!selectedJob) {
      toast.error('Please select a job card');
      return;
    }

    if (!window.confirm('Generate automatic plan for this job card?\n\nThis will create plan entries for all manufacturing steps.')) {
      return;
    }

    try {
      setLoading(true);
      const res = await api.post(`/planning/auto-plan/job/${selectedJob.id}`, {
        start_date: formData.start_date,
        preferred_shift: formData.preferred_shift,
        assign_operator: formData.assign_operator
      });

      toast.success(`✅ Automatic plan generated!\n${res.data.message}`);
      setPreview(null);
      setSelectedJob(null);
      setSearchQuery('');
      setSearchResults([]);
      onClose?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate plan');
    } finally {
      setLoading(false);
    }
  };

  const handleClearPlan = async () => {
    if (!selectedJob) {
      toast.error('Please select a job card');
      return;
    }

    if (!window.confirm('Delete all existing plan entries for this job?\n\nYou can regenerate them afterward.')) {
      return;
    }

    try {
      setLoading(true);
      const res = await api.delete(`/planning/auto-plan/clear/${selectedJob.id}`);
      toast.success(`✅ Deleted ${res.data.deletedEntries} plan entries`);
      setPreview(null);
      setSelectedJob(null);
      onClose?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to clear plan');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAutoplan = async () => {
    if (!isAdmin) {
      toast.error('Only admins can bulk plan');
      return;
    }

    if (!window.confirm('Auto-plan ALL unscheduled job cards?\n\nThis may take a few moments.')) {
      return;
    }

    try {
      setLoading(true);
      const res = await api.post('/planning/auto-plan/bulk', {
        start_date: formData.start_date,
        preferred_shift: formData.preferred_shift,
        filter: 'none'
      });

      toast.success(`✅ Bulk planning complete!\n${res.data.processedJobs} jobs scheduled`);
      onClose?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to bulk plan');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="panel-overlay" onClick={onClose}>
      <div className="panel-content" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <h3>🤖 Intelligent Auto-Planning</h3>
          <p>Automatically schedule manufacturing steps into the planning board</p>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {/* Mode Selector */}
        <div className="panel-section" style={{ paddingBottom: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`btn ${mode === 'single' ? 'btn-preview' : 'btn-secondary'}`}
              onClick={() => { setMode('single'); setPreview(null); }}
              style={{ flex: 1 }}
              disabled={loading}
            >
              Single Job
            </button>
            {isAdmin && (
              <button
                className={`btn ${mode === 'bulk' ? 'btn-preview' : 'btn-secondary'}`}
                onClick={() => { setMode('bulk'); setPreview(null); }}
                style={{ flex: 1 }}
                disabled={loading}
              >
                Bulk All
              </button>
            )}
          </div>
        </div>

        {/* Single Job Mode */}
        {mode === 'single' && (
          <>
            {/* Job Selection */}
            <div className="panel-section">
              <h4>Select Job Card</h4>
              <div className="form-group">
                <label>Search Job:</label>
                <input
                  type="text"
                  placeholder="Job number, name, or part number..."
                  value={searchQuery}
                  onChange={e => handleSearch(e.target.value)}
                  className="form-control"
                  disabled={loading}
                  autoFocus
                />
              </div>

              {searchResults.length > 0 && !selectedJob && (
                <div className="sequence-list" style={{ marginTop: '12px', maxHeight: '200px' }}>
                  {searchResults.map(job => (
                    <div
                      key={job.id}
                      className="sequence-item"
                      style={{ cursor: 'pointer', paddingLeft: '16px', paddingRight: '16px' }}
                      onClick={() => {
                        setSelectedJob(job);
                        setSearchQuery('');
                        setSearchResults([]);
                        setPreview(null);
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <strong>{job.job_card_number}</strong>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{job.job_name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedJob && (
                <div style={{ marginTop: '12px', padding: '12px', background: '#ecfdf5', borderRadius: '6px', border: '1px solid #86efac' }}>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: '#065f46' }}>
                    ✅ Selected: {selectedJob.job_card_number} — {selectedJob.job_name}
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setSelectedJob(null);
                      setSearchQuery('');
                    }}
                    style={{ marginTop: '8px', width: '100%' }}
                    disabled={loading}
                  >
                    Change Selection
                  </button>
                </div>
              )}
            </div>

            {/* Planning Options */}
            {selectedJob && (
              <div className="panel-section">
                <h4>Planning Parameters</h4>
                <div className="form-group">
                  <label>Start Date:</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label>Shift Preference:</label>
                  <select
                    value={formData.preferred_shift}
                    onChange={e => setFormData({ ...formData, preferred_shift: e.target.value })}
                    disabled={loading}
                  >
                    <option value="day">Day Shift (7 AM - 7 PM)</option>
                    <option value="night">Night Shift (7 PM - 7 AM)</option>
                    <option value="both">Continuous (24h)</option>
                  </select>
                </div>

                <div className="form-group checkbox">
                  <input
                    type="checkbox"
                    id="assign_op"
                    checked={formData.assign_operator}
                    onChange={e => setFormData({ ...formData, assign_operator: e.target.checked })}
                    disabled={loading}
                  />
                  <label htmlFor="assign_op">Assign to current operator</label>
                </div>
              </div>
            )}

            {/* Preview Section */}
            {selectedJob && !preview && (
              <div className="panel-section">
                <button
                  className="btn btn-preview"
                  onClick={handleGetPreview}
                  disabled={loading}
                >
                  👁️ Preview Plan
                </button>
              </div>
            )}

            {preview && (
              <div className="preview-section">
                <div className="preview-header">
                  <h4>📋 Plan Preview</h4>
                  <span className="badge-info">{preview.manufacturingOrders?.length || 0} steps</span>
                </div>

                <div className="preview-stats">
                  <div className="stat-item">
                    <span className="stat-label">Total Hours</span>
                    <span className="stat-value">{(preview.totalMinutes / 60).toFixed(1)}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">End Date</span>
                    <span className="stat-value">{preview.estimatedEndDate?.substring(0, 10) || '—'}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Segments</span>
                    <span className="stat-value">{preview.planSegments?.length || 0}</span>
                  </div>
                </div>

                {preview.manufacturingOrders && preview.manufacturingOrders.length > 0 && (
                  <div className="manufacturing-sequence">
                    <h5>🔧 Manufacturing Sequence</h5>
                    <div className="sequence-list">
                      {preview.manufacturingOrders.map((order, idx) => (
                        <div key={idx} className="sequence-item">
                          <div className="seq-number">{idx + 1}</div>
                          <div className="seq-machine">{order.machine_name}</div>
                          <div className="seq-duration">{order.estimated_duration_minutes} min</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="preview-note">
                  ℹ️ Review the sequence above. Click "Generate Plan" to create plan entries, or adjust parameters and preview again.
                </div>
              </div>
            )}
          </>
        )}

        {/* Bulk Mode */}
        {mode === 'bulk' && (
          <div className="panel-section">
            <h4>Bulk Auto-Planning Settings</h4>
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
              This will automatically schedule all unplanned job cards using the parameters below.
            </p>

            <div className="form-group">
              <label>Start Date (for new jobs):</label>
              <input
                type="date"
                value={formData.start_date}
                onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Shift Preference:</label>
              <select
                value={formData.preferred_shift}
                onChange={e => setFormData({ ...formData, preferred_shift: e.target.value })}
                disabled={loading}
              >
                <option value="day">Day Shift (7 AM - 7 PM)</option>
                <option value="night">Night Shift (7 PM - 7 AM)</option>
                <option value="both">Continuous (24h)</option>
              </select>
            </div>

            <div style={{ marginTop: '16px', padding: '12px', background: '#fef3c7', borderRadius: '6px', border: '1px solid #fcd34d', fontSize: '12px', color: '#78350f' }}>
              ⚠️ This will plan <strong>all unscheduled active jobs</strong> at once. Ensure manufacturing orders are configured for each job.
            </div>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="panel-footer">
          {mode === 'single' && preview && (
            <>
              <button
                className="btn btn-generate"
                onClick={handleGeneratePlan}
                disabled={loading}
              >
                ✅ Generate Plan
              </button>
              {isAdmin && (
                <button
                  className="btn btn-danger"
                  onClick={handleClearPlan}
                  disabled={loading}
                >
                  🗑️ Clear Plan
                </button>
              )}
            </>
          )}

          {mode === 'bulk' && (
            <button
              className="btn btn-generate"
              onClick={handleBulkAutoplan}
              disabled={loading}
            >
              🚀 Plan All Jobs
            </button>
          )}

          {mode === 'single' && preview && (
            <button
              className="btn btn-secondary"
              onClick={() => setPreview(null)}
              disabled={loading}
            >
              ← Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
