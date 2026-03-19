import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import api from '../utils/api';
import Layout from '../components/shared/Layout';
import toast from 'react-hot-toast';

export default function ReportsPage() {
  const [stats, setStats] = useState(null);
  const [cncStats, setCncStats] = useState(null);
  const [userStats, setUserStats] = useState([]);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ status: '', assigned_to: '', from_date: '', to_date: '' });
  const [downloading, setDownloading] = useState(false);
  const [downloadingUser, setDownloadingUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/reports/stats'),
      api.get('/reports/user-stats'),
      api.get('/users')
    ]).then(([s, us, u]) => {
      setStats(s.data.stats);
      setCncStats(s.data.cnc_stats);
      setUserStats(us.data.user_stats);
      setUsers(u.data.users.filter(u => u.role === 'user'));
    }).catch(() => toast.error('Failed to load report data'))
      .finally(() => setLoading(false));
  }, []);

  const downloadPDF = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([,v]) => v)));
      const token = localStorage.getItem('tf_token');
      const base = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
      const res = await fetch(base + '/reports/pdf?' + params, { headers: { Authorization: 'Bearer ' + token } });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'taskflow-report.pdf'; a.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded!');
    } catch { toast.error('Failed to download report'); }
    finally { setDownloading(false); }
  };

  const taskChartData = stats ? [
    { name: 'Pending', count: parseInt(stats.pending), fill: '#f59e0b' },
    { name: 'In Progress', count: parseInt(stats.in_progress), fill: '#3b82f6' },
    { name: 'Completed', count: parseInt(stats.completed), fill: '#10b981' },
    { name: 'Archived', count: parseInt(stats.archived), fill: '#6b7280' },
    { name: 'Overdue', count: parseInt(stats.overdue), fill: '#ef4444' },
  ] : [];

  const cncChartData = cncStats ? [
    { name: 'Active', value: parseInt(cncStats.active), color: '#3b82f6' },
    { name: 'Completed', value: parseInt(cncStats.completed), color: '#10b981' },
    { name: 'Overdue', value: parseInt(cncStats.overdue), color: '#ef4444' },
    { name: 'No Deadline', value: parseInt(cncStats.no_deadline), color: '#9ca3af' },
  ].filter(d => d.value > 0) : [];

  const downloadUserPDF = async (userId, userName) => {
    setDownloadingUser(userId);
    try {
      const token = localStorage.getItem('tf_token');
      const base = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
      const res = await fetch(base + '/reports/user-pdf/' + userId, { headers: { Authorization: 'Bearer ' + token } });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `user-report-${userName.replace(/\s+/g, '-')}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Report downloaded for ${userName}!`);
    } catch { toast.error('Failed to download user report'); }
    finally { setDownloadingUser(null); }
  };

  const getInitials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  if (loading) {
    return (
      <Layout title="Reports & Analytics">
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
          Loading report data...
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Reports & Analytics">

      {/* ── SECTION 1: Overall Summary ────────────────────────── */}
      <div className="report-section">
        <h2 className="report-section-title">📊 Overall Summary</h2>

        {/* Task Stats */}
        {stats && (
          <>
            <h3 className="report-subsection-title">Tasks Overview</h3>
            <div className="stats-grid" style={{ marginBottom: '24px' }}>
              {[
                { label: 'Total', val: stats.total, color: '#4f46e5', icon: '📋' },
                { label: 'Pending', val: stats.pending, color: '#d97706', icon: '⏳' },
                { label: 'In Progress', val: stats.in_progress, color: '#2563eb', icon: '🔄' },
                { label: 'Completed', val: stats.completed, color: '#059669', icon: '✅' },
                { label: 'Overdue', val: stats.overdue, color: '#dc2626', icon: '🚨' },
                { label: 'Due Soon', val: stats.due_soon, color: '#7c3aed', icon: '⚡' },
              ].map((s, i) => (
                <div key={i} className="stat-card">
                  <div style={{ fontSize: '14px', marginBottom: '4px' }}>{s.icon}</div>
                  <div style={{ fontSize: '28px', fontWeight: '800', color: s.color }}>{s.val || 0}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* CNC Stats */}
        {cncStats && (
          <>
            <h3 className="report-subsection-title">CNC Job Cards Overview</h3>
            <div className="stats-grid" style={{ marginBottom: '24px' }}>
              {[
                { label: 'Total', val: cncStats.total, color: '#4f46e5', icon: '🏭' },
                { label: 'Active', val: cncStats.active, color: '#2563eb', icon: '⚙️' },
                { label: 'Completed', val: cncStats.completed, color: '#059669', icon: '✅' },
                { label: 'Overdue', val: cncStats.overdue, color: '#dc2626', icon: '🚨' },
                { label: 'Due ≤5 Days', val: cncStats.due_soon, color: '#7c3aed', icon: '⚡' },
                { label: 'No Deadline', val: cncStats.no_deadline, color: '#6b7280', icon: '📅' },
              ].map((s, i) => (
                <div key={i} className="stat-card">
                  <div style={{ fontSize: '14px', marginBottom: '4px' }}>{s.icon}</div>
                  <div style={{ fontSize: '28px', fontWeight: '800', color: s.color }}>{s.val || 0}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Charts Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
          {/* Task Bar Chart */}
          <div className="card">
            <div className="card-header"><h3 style={{ fontSize: '15px' }}>Task Status Distribution</h3></div>
            <div style={{ padding: '16px' }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={taskChartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {taskChartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* CNC Pie Chart */}
          <div className="card">
            <div className="card-header"><h3 style={{ fontSize: '15px' }}>CNC Job Status Distribution</h3></div>
            <div style={{ padding: '16px' }}>
              {cncChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={cncChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                      {cncChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>No CNC data</div>
              )}
            </div>
          </div>
        </div>

        {/* Health Metrics */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
            <div className="card">
              <div className="card-header"><h3 style={{ fontSize: '15px' }}>Task Health</h3></div>
              <div style={{ padding: '24px' }}>
                {[
                  { label: 'Completion Rate', value: parseInt(stats.total) > 0 ? Math.round((parseInt(stats.completed) + parseInt(stats.archived)) / parseInt(stats.total) * 100) : 0, color: 'var(--success)' },
                  { label: 'Overdue Rate', value: parseInt(stats.total) > 0 ? Math.round(parseInt(stats.overdue) / parseInt(stats.total) * 100) : 0, color: 'var(--danger)' },
                  { label: 'Active Rate', value: parseInt(stats.total) > 0 ? Math.round(parseInt(stats.in_progress) / parseInt(stats.total) * 100) : 0, color: 'var(--secondary)' },
                ].map((m, i) => (
                  <div key={i} style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600' }}>{m.label}</span>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: m.color }}>{m.value}%</span>
                    </div>
                    <div className="progress-bar"><div className="progress-fill" style={{ width: m.value + '%', background: m.color }}></div></div>
                  </div>
                ))}
              </div>
            </div>
            {cncStats && (
              <div className="card">
                <div className="card-header"><h3 style={{ fontSize: '15px' }}>CNC Health</h3></div>
                <div style={{ padding: '24px' }}>
                  {[
                    { label: 'Completion Rate', value: parseInt(cncStats.total) > 0 ? Math.round(parseInt(cncStats.completed) / parseInt(cncStats.total) * 100) : 0, color: 'var(--success)' },
                    { label: 'Overdue Rate', value: parseInt(cncStats.total) > 0 ? Math.round(parseInt(cncStats.overdue) / parseInt(cncStats.total) * 100) : 0, color: 'var(--danger)' },
                    { label: 'Active Rate', value: parseInt(cncStats.total) > 0 ? Math.round(parseInt(cncStats.active) / parseInt(cncStats.total) * 100) : 0, color: 'var(--secondary)' },
                  ].map((m, i) => (
                    <div key={i} style={{ marginBottom: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600' }}>{m.label}</span>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: m.color }}>{m.value}%</span>
                      </div>
                      <div className="progress-bar"><div className="progress-fill" style={{ width: m.value + '%', background: m.color }}></div></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION 2: Per-User Status ────────────────────────── */}
      <div className="report-section">
        <h2 className="report-section-title">👥 User Performance Breakdown</h2>

        {userStats.length === 0 ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No user data available</div>
        ) : (
          <div className="user-stats-list">
            {userStats.map(user => {
              const taskTotal = user.tasks.total;
              const cncTotal = user.cnc.total;
              const isExpanded = expandedUser === user.id;

              return (
                <div key={user.id} className={`user-stat-card ${isExpanded ? 'expanded' : ''}`}>
                  <div className="user-stat-header" onClick={() => setExpandedUser(isExpanded ? null : user.id)}>
                    <div className="user-stat-left">
                      <div className="user-avatar-sm" style={{ background: user.avatar_color || '#6366f1' }}>
                        {getInitials(user.name)}
                      </div>
                      <div>
                        <div className="user-stat-name">{user.name}</div>
                        <div className="user-stat-email">{user.email}</div>
                      </div>
                    </div>
                    <div className="user-stat-badges">
                      <span className="user-badge task-badge">📋 {taskTotal} Tasks</span>
                      <span className="user-badge cnc-badge">🏭 {cncTotal} CNC Jobs</span>
                      {(user.tasks.overdue + user.cnc.overdue) > 0 && (
                        <span className="user-badge overdue-badge">🚨 {user.tasks.overdue + user.cnc.overdue} Overdue</span>
                      )}
                      <button
                        className="btn-user-report"
                        onClick={(e) => { e.stopPropagation(); downloadUserPDF(user.id, user.name); }}
                        disabled={downloadingUser === user.id}
                      >
                        {downloadingUser === user.id ? '⏳' : '📄'} Report
                      </button>
                      <span className="expand-icon">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="user-stat-detail">
                      <div className="user-detail-grid">
                        {/* Task breakdown */}
                        <div className="detail-section">
                          <h4 className="detail-section-title">📋 Task Status</h4>
                          {taskTotal === 0 ? (
                            <div className="detail-empty">No tasks assigned</div>
                          ) : (
                            <>
                              <div className="detail-bars">
                                {[
                                  { label: 'Pending', val: user.tasks.pending, color: '#f59e0b', total: taskTotal },
                                  { label: 'In Progress', val: user.tasks.in_progress, color: '#3b82f6', total: taskTotal },
                                  { label: 'Completed', val: user.tasks.completed, color: '#10b981', total: taskTotal },
                                  { label: 'Archived', val: user.tasks.archived, color: '#6b7280', total: taskTotal },
                                  { label: 'Overdue', val: user.tasks.overdue, color: '#ef4444', total: taskTotal },
                                ].map((b, i) => (
                                  <div key={i} className="detail-bar-row">
                                    <div className="detail-bar-label">
                                      <span>{b.label}</span>
                                      <span style={{ color: b.color, fontWeight: '700' }}>{b.val}</span>
                                    </div>
                                    <div className="detail-bar-track">
                                      <div className="detail-bar-fill" style={{ width: (b.total > 0 ? (b.val / b.total * 100) : 0) + '%', background: b.color }}></div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="detail-completion">
                                Completion: <strong>{taskTotal > 0 ? Math.round((user.tasks.completed + user.tasks.archived) / taskTotal * 100) : 0}%</strong>
                              </div>
                            </>
                          )}
                        </div>

                        {/* CNC breakdown */}
                        <div className="detail-section">
                          <h4 className="detail-section-title">🏭 CNC Job Status</h4>
                          {cncTotal === 0 ? (
                            <div className="detail-empty">No CNC jobs assigned</div>
                          ) : (
                            <>
                              <div className="detail-bars">
                                {[
                                  { label: 'Active', val: user.cnc.active, color: '#3b82f6', total: cncTotal },
                                  { label: 'Completed', val: user.cnc.completed, color: '#10b981', total: cncTotal },
                                  { label: 'Overdue', val: user.cnc.overdue, color: '#ef4444', total: cncTotal },
                                  { label: 'No Deadline', val: user.cnc.no_deadline, color: '#9ca3af', total: cncTotal },
                                ].map((b, i) => (
                                  <div key={i} className="detail-bar-row">
                                    <div className="detail-bar-label">
                                      <span>{b.label}</span>
                                      <span style={{ color: b.color, fontWeight: '700' }}>{b.val}</span>
                                    </div>
                                    <div className="detail-bar-track">
                                      <div className="detail-bar-fill" style={{ width: (b.total > 0 ? (b.val / b.total * 100) : 0) + '%', background: b.color }}></div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="detail-completion">
                                Completion: <strong>{cncTotal > 0 ? Math.round(user.cnc.completed / cncTotal * 100) : 0}%</strong>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SECTION 3: PDF Download ───────────────────────────── */}
      <div className="report-section">
        <h2 className="report-section-title">📄 Generate PDF Report</h2>
        <div className="card">
          <div style={{ padding: '20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="form-label">Status Filter</label>
              <select className="form-control" style={{ minWidth: '140px' }} value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}>
                <option value="">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="form-label">Assigned To</label>
              <select className="form-control" style={{ minWidth: '160px' }} value={filters.assigned_to} onChange={e => setFilters(p => ({ ...p, assigned_to: e.target.value }))}>
                <option value="">All Users</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">From Date</label>
              <input type="date" className="form-control" value={filters.from_date} onChange={e => setFilters(p => ({ ...p, from_date: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">To Date</label>
              <input type="date" className="form-control" value={filters.to_date} onChange={e => setFilters(p => ({ ...p, to_date: e.target.value }))} />
            </div>
            <button className="btn btn-primary" onClick={downloadPDF} disabled={downloading}>
              {downloading ? '⏳ Generating...' : '⬇ Download PDF'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
