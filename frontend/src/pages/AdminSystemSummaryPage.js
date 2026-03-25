import React, { useState, useEffect } from 'react';
import '../styles/AdminSystemSummary.css';
import api from '../utils/api';

export default function AdminSystemSummaryPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchSystemSummary();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchSystemSummary, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchSystemSummary = async () => {
    try {
      setRefreshing(true);
      const response = await api.get('/admin/system-summary');
      setSummary(response.data);
      setError('');
    } catch (err) {
      setError('Failed to load system summary');
      console.error(err);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-summary-page">
        <div className="loading">Loading system summary...</div>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="admin-summary-page">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="admin-summary-page">
      <div className="summary-header">
        <h1>📊 System Summary</h1>
        <div className="header-controls">
          <span className="last-updated">
            Last updated: {new Date(summary.timestamp).toLocaleTimeString()}
          </span>
          <button 
            onClick={fetchSystemSummary}
            className="btn-refresh"
            disabled={refreshing}
          >
            {refreshing ? '⟳ Refreshing...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="info-message">{error}</div>}

      {/* System Health */}
      <div className="summary-section">
        <h2>🏥 System Health</h2>
        <div className="metrics-grid">
          <div className="metric-card health">
            <div className="metric-label">Database</div>
            <div className="metric-value">
              <span className="status-badge active">✓ Connected</span>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Uptime</div>
            <div className="metric-value">
              {Math.floor(summary.system_health.uptime_seconds / 86400)}d{' '}
              {Math.floor((summary.system_health.uptime_seconds % 86400) / 3600)}h
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Memory Usage</div>
            <div className="metric-value">
              {summary.system_health.memory_usage_mb}/{summary.system_health.memory_limit_mb} MB
            </div>
            <div className="metric-bar">
              <div 
                className="metric-bar-fill"
                style={{
                  width: `${(summary.system_health.memory_usage_mb / summary.system_health.memory_limit_mb) * 100}%`
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* User Statistics */}
      <div className="summary-section">
        <h2>👥 User Statistics</h2>
        <div className="stat-boxes">
          <div className="stat-box blue">
            <div className="stat-icon">👤</div>
            <div className="stat-number">{summary.users.total}</div>
            <div className="stat-label">Total Users</div>
          </div>
          <div className="stat-box green">
            <div className="stat-icon">✓</div>
            <div className="stat-number">{summary.users.active}</div>
            <div className="stat-label">Active Users</div>
          </div>
          <div className="stat-box orange">
            <div className="stat-icon">📱</div>
            <div className="stat-number">{summary.users.with_phone}</div>
            <div className="stat-label">With WhatsApp</div>
          </div>
          <div className="stat-box red">
            <div className="stat-icon">⚠️</div>
            <div className="stat-number">{summary.users.total - summary.users.with_phone}</div>
            <div className="stat-label">Missing Phone</div>
          </div>
        </div>
        <div className="stat-details">
          <span>👨‍💼 Admins: <strong>{summary.users.admins}</strong></span>
          <span>👨‍💻 Users: <strong>{summary.users.users}</strong></span>
          <span>👁️ Guests: <strong>{summary.users.guests}</strong></span>
        </div>
      </div>

      {/* Task Statistics */}
      <div className="summary-section">
        <h2>✅ Task Statistics</h2>
        <div className="stat-boxes">
          <div className="stat-box blue">
            <div className="stat-icon">📋</div>
            <div className="stat-number">{summary.tasks.total}</div>
            <div className="stat-label">Total Tasks</div>
          </div>
          <div className="stat-box green">
            <div className="stat-icon">✅</div>
            <div className="stat-number">{summary.tasks.completed}</div>
            <div className="stat-label">Completed</div>
          </div>
          <div className="stat-box purple">
            <div className="stat-icon">🔄</div>
            <div className="stat-number">{summary.tasks.in_progress}</div>
            <div className="stat-label">In Progress</div>
          </div>
          <div className="stat-box orange">
            <div className="stat-icon">⏳</div>
            <div className="stat-number">{summary.tasks.pending}</div>
            <div className="stat-label">Pending</div>
          </div>
        </div>
        <div className="progress-bar" title={`Completion Rate: ${summary.tasks.completion_rate}%`}>
          <div className="progress-fill" style={{ width: `${summary.tasks.completion_rate}%` }}>
            <span className="progress-label">{summary.tasks.completion_rate}% Complete</span>
          </div>
        </div>
      </div>

      {/* CNC Jobs Statistics */}
      {summary.cnc_jobs.total > 0 && (
        <div className="summary-section">
          <h2>⚙️ CNC Jobs Statistics</h2>
          <div className="stat-boxes">
            <div className="stat-box blue">
              <div className="stat-icon">⚙️</div>
              <div className="stat-number">{summary.cnc_jobs.total}</div>
              <div className="stat-label">Total Jobs</div>
            </div>
            <div className="stat-box green">
              <div className="stat-icon">✅</div>
              <div className="stat-number">{summary.cnc_jobs.completed}</div>
              <div className="stat-label">Completed</div>
            </div>
            <div className="stat-box teal">
              <div className="stat-icon">🟢</div>
              <div className="stat-number">{summary.cnc_jobs.active}</div>
              <div className="stat-label">Active</div>
            </div>
            <div className="stat-box orange">
              <div className="stat-icon">⏳</div>
              <div className="stat-number">{summary.cnc_jobs.pending}</div>
              <div className="stat-label">Pending</div>
            </div>
          </div>
          <div className="stat-details">
            <span>🔴 High Priority: <strong>{summary.cnc_jobs.high_priority}</strong></span>
          </div>
        </div>
      )}

      {/* Workflow Statistics */}
      {summary.workflows.total > 0 && (
        <div className="summary-section">
          <h2>🔧 Workflow Statistics</h2>
          <div className="stat-boxes">
            <div className="stat-box blue">
              <div className="stat-icon">🔧</div>
              <div className="stat-number">{summary.workflows.total}</div>
              <div className="stat-label">Total Workflows</div>
            </div>
            <div className="stat-box green">
              <div className="stat-icon">✓</div>
              <div className="stat-number">{summary.workflows.active}</div>
              <div className="stat-label">Active</div>
            </div>
            <div className="stat-box gray">
              <div className="stat-icon">✕</div>
              <div className="stat-number">{summary.workflows.inactive}</div>
              <div className="stat-label">Inactive</div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Statistics */}
      <div className="summary-section">
        <h2>💬 WhatsApp Notifications (24h)</h2>
        <div className="stat-boxes">
          <div className="stat-box blue">
            <div className="stat-icon">💬</div>
            <div className="stat-number">{summary.whatsapp.total}</div>
            <div className="stat-label">Total Sent</div>
          </div>
          <div className="stat-box green">
            <div className="stat-icon">✓</div>
            <div className="stat-number">{summary.whatsapp.sent}</div>
            <div className="stat-label">Delivered</div>
          </div>
          <div className="stat-box red">
            <div className="stat-icon">✕</div>
            <div className="stat-number">{summary.whatsapp.failed}</div>
            <div className="stat-label">Failed</div>
          </div>
          <div className="stat-box orange">
            <div className="stat-icon">⚠️</div>
            <div className="stat-number">{summary.whatsapp.pending_users}</div>
            <div className="stat-label">Pending Setup</div>
          </div>
        </div>
        <div className="whatsapp-info">
          <p>📋 Automatic summaries sent daily at <strong>7:00 AM</strong> and <strong>7:00 PM UTC</strong></p>
          <p>📱 {summary.whatsapp.pending_users > 0 ? `⚠️ ${summary.whatsapp.pending_users} users need phone numbers configured` : '✓ All users have phone numbers configured'}</p>
        </div>
      </div>

      {/* Priority Tasks */}
      {summary.tasks.high_priority > 0 && (
        <div className="summary-section">
          <h2>🔴 High Priority Tasks</h2>
          <div className="stat-box red wide">
            <div className="stat-icon">🔴</div>
            <div className="stat-number">{summary.tasks.high_priority}</div>
            <div className="stat-label">Require Attention</div>
          </div>
        </div>
      )}

      <div className="summary-footer">
        <p>System Summary Dashboard • Auto-refreshes every 30 seconds</p>
      </div>
    </div>
  );
}
