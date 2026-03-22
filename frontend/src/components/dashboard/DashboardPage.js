import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../utils/api';
import cncJobService from '../../services/cncJobService';
import { useAuth } from '../../context/AuthContext';
import { formatDate, getDeadlineStatus, timeAgo } from '../../utils/helpers';
import Layout from '../shared/Layout';
import TaskModal from '../shared/TaskModal';
import SystemStatusCard from './SystemStatusCard';

const COLORS = ['#f59e0b','#3b82f6','#10b981','#6b7280','#ef4444'];
const CNC_COLORS = ['#0891b2','#10b981','#ef4444','#f59e0b'];

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [cncSt, setCncSt] = useState(null);
  const [pendingExt, setPendingExt] = useState(0);
  const [cncPendingExt, setCncPendingExt] = useState(0);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [cncJobs, setCncJobs] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const [statsRes, tasksRes, usersRes, cncRes] = await Promise.all([
        api.get('/reports/stats'),
        api.get('/tasks?limit=5&status=pending'),
        api.get('/users'),
        isAdmin ? cncJobService.getAllJobsAdmin('active') : cncJobService.getMyJobs('active')
      ]);
      setStats(statsRes.data.stats);
      setCncSt(statsRes.data.cnc_stats);
      setPendingExt(statsRes.data.pending_extensions || 0);
      setCncPendingExt(statsRes.data.cnc_pending_extensions || 0);
      setTasks(tasksRes.data.tasks);
      setUsers(usersRes.data.users);
      setCncJobs((cncRes.data.data || []).slice(0, 6));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { load(); }, []);

  const getLeadTime = (card) => {
    const start = card.job_date ? new Date(card.job_date) : null;
    if (!start) return null;
    const end = card.status === 'completed' && card.updated_at ? new Date(card.updated_at) : new Date();
    const days = Math.floor((end - start) / (1000 * 60 * 60 * 24));
    if (days < 0) return null;
    if (days === 0) return '< 1 day';
    return days === 1 ? '1 day' : days + ' days';
  };

  const getDaysRemaining = (card) => {
    if (!card.estimate_end_date || card.status === 'completed') return null;
    return Math.ceil((new Date(card.estimate_end_date) - new Date()) / (1000 * 60 * 60 * 24));
  };

  const getCncCardBorder = (job) => {
    const days = getDaysRemaining(job);
    if (days === null && !job.estimate_end_date) return '#f97316';
    if (days !== null && days < 1) return '#ef4444';
    if (days !== null && days <= 5) return '#eab308';
    return '#0891b2';
  };

  const getCncCardBg = (job) => {
    const days = getDaysRemaining(job);
    if (days !== null && days < 1) return '#fef2f2';
    if (days !== null && days <= 5) return '#fefce8';
    return 'var(--surface)';
  };

  // Task stat cards
  const taskStatCards = stats ? [
    { label: 'Total Tasks', value: stats.total, icon: '📋', color: '#4f46e5', bg: '#ede9fe' },
    { label: 'Pending', value: stats.pending, icon: '⏳', color: '#d97706', bg: '#fef3c7' },
    { label: 'In Progress', value: stats.in_progress, icon: '🔄', color: '#2563eb', bg: '#dbeafe' },
    { label: 'Completed', value: stats.completed, icon: '✅', color: '#059669', bg: '#d1fae5' },
    { label: 'Overdue', value: stats.overdue, icon: '🚨', color: '#dc2626', bg: '#fee2e2' },
    { label: 'Due Soon', value: stats.due_soon, icon: '⏰', color: '#ea580c', bg: '#ffedd5' },
  ] : [];

  // CNC stat cards
  const cncStatCards = cncSt ? [
    { label: 'Active CNC Jobs', value: cncSt.active, icon: '⚙️', color: '#0891b2', bg: '#cffafe' },
    { label: 'Completed', value: cncSt.completed, icon: '✅', color: '#059669', bg: '#d1fae5' },
    { label: 'Overdue', value: cncSt.overdue, icon: '🚨', color: '#dc2626', bg: '#fee2e2' },
    { label: 'Due ≤ 5 Days', value: cncSt.due_soon, icon: '⚠️', color: '#d97706', bg: '#fef3c7' },
    { label: 'No Deadline', value: cncSt.no_deadline, icon: '📅', color: '#ea580c', bg: '#ffedd5' },
  ] : [];

  const pieData = stats ? [
    { name: 'Pending', value: parseInt(stats.pending) },
    { name: 'In Progress', value: parseInt(stats.in_progress) },
    { name: 'Completed', value: parseInt(stats.completed) },
    { name: 'Archived', value: parseInt(stats.archived) },
    { name: 'Overdue', value: parseInt(stats.overdue) },
  ].filter(d => d.value > 0) : [];

  const cncPieData = cncSt ? [
    { name: 'Active', value: parseInt(cncSt.active) },
    { name: 'Completed', value: parseInt(cncSt.completed) },
    { name: 'Overdue', value: parseInt(cncSt.overdue) },
    { name: 'Due Soon', value: parseInt(cncSt.due_soon) },
  ].filter(d => d.value > 0) : [];

  // Alert banners
  const alerts = [];
  if (stats && parseInt(stats.overdue) > 0) alerts.push({ msg: `${stats.overdue} task(s) are overdue!`, color: '#dc2626', bg: '#fef2f2', icon: '🚨', to: '/tasks' });
  if (cncSt && parseInt(cncSt.overdue) > 0) alerts.push({ msg: `${cncSt.overdue} CNC job(s) are overdue!`, color: '#dc2626', bg: '#fef2f2', icon: '🔴', to: '/cnc-kanban' });
  if (cncSt && parseInt(cncSt.no_deadline) > 0) alerts.push({ msg: `${cncSt.no_deadline} CNC job(s) have no deadline set`, color: '#ea580c', bg: '#fff7ed', icon: '⚠️', to: '/cnc-kanban' });
  if (isAdmin && pendingExt > 0) alerts.push({ msg: `${pendingExt} task extension(s) pending approval`, color: '#d97706', bg: '#fffbeb', icon: '🕐', to: '/extensions' });
  if (isAdmin && cncPendingExt > 0) alerts.push({ msg: `${cncPendingExt} CNC extension(s) pending approval`, color: '#d97706', bg: '#fffbeb', icon: '🕐', to: '/extensions' });

  return (
    <Layout title={`Welcome back, ${user?.name?.split(' ')[0]} 👋`}>
      {/* Alert Banners */}
      {alerts.length > 0 && (
        <div style={{display:'flex',flexDirection:'column',gap:'8px',marginBottom:'20px'}}>
          {alerts.map((a, i) => (
            <div key={i} onClick={() => navigate(a.to)} style={{display:'flex',alignItems:'center',gap:'10px',padding:'12px 16px',borderRadius:'8px',background:a.bg,border:`1px solid ${a.color}20`,cursor:'pointer',transition:'transform 0.2s'}}>
              <span style={{fontSize:'18px'}}>{a.icon}</span>
              <span style={{fontSize:'13px',fontWeight:'600',color:a.color,flex:1}}>{a.msg}</span>
              <span style={{fontSize:'12px',color:a.color,opacity:0.7}}>View →</span>
            </div>
          ))}
        </div>
      )}

      {/* Task Stats */}
      <h3 style={{fontSize:'14px',color:'var(--text-muted)',fontWeight:'600',marginBottom:'12px',textTransform:'uppercase',letterSpacing:'0.5px'}}>📋 Tasks Overview</h3>
      <div className="stats-grid" style={{marginBottom:'24px'}}>
        {taskStatCards.map((s, i) => (
          <div key={i} className="stat-card" onClick={() => navigate('/tasks')} style={{cursor:'pointer'}}>
            <div className="stat-icon" style={{background: s.bg}}>
              <span style={{fontSize:'22px'}}>{s.icon}</span>
            </div>
            <div className="stat-value" style={{color: s.color}}>{s.value || 0}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* CNC Stats */}
      <h3 style={{fontSize:'14px',color:'var(--text-muted)',fontWeight:'600',marginBottom:'12px',textTransform:'uppercase',letterSpacing:'0.5px'}}>⚙️ CNC Manufacturing Overview</h3>
      <div className="stats-grid" style={{marginBottom:'24px'}}>
        {cncStatCards.map((s, i) => (
          <div key={i} className="stat-card" onClick={() => navigate('/cnc-kanban')} style={{cursor:'pointer'}}>
            <div className="stat-icon" style={{background: s.bg}}>
              <span style={{fontSize:'22px'}}>{s.icon}</span>
            </div>
            <div className="stat-value" style={{color: s.color}}>{s.value || 0}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid" style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:'24px'}}>
        {/* Left Column */}
        <div>
          {/* Recent Pending Tasks */}
          <div className="card" style={{marginBottom:'24px'}}>
            <div className="card-header">
              <h3 style={{fontSize:'16px'}}>📋 Recent Pending Tasks</h3>
              <div style={{display:'flex',gap:'8px'}}>
                <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ New Task</button>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate('/tasks')}>View All</button>
              </div>
            </div>
            <div style={{padding:'8px'}}>
              {tasks.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">✅</div>
                  <h3>All caught up!</h3>
                  <p>No pending tasks right now.</p>
                </div>
              )}
              {tasks.map(task => {
                const dl = getDeadlineStatus(task);
                return (
                  <div key={task.id} className="task-card" style={{marginBottom:'8px',cursor:'pointer'}} onClick={() => navigate('/tasks')}>
                    <div className="task-title">{task.title}</div>
                    <div className="task-meta">
                      {task.assigned_to_name && <span style={{fontSize:'12px',color:'var(--text-muted)'}}>👤 {task.assigned_to_name}</span>}
                      <span className={`task-badge badge-${task.priority}`}>{task.priority}</span>
                    </div>
                    <div className={`deadline-indicator ${dl.cls}`}>
                      <div className="deadline-dot"></div>
                      <span className="deadline-text">{dl.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CNC Job Cards */}
          <div className="card">
            <div className="card-header">
              <h3 style={{fontSize:'16px'}}>⚙️ {isAdmin ? 'CNC Job Cards' : 'My CNC Job Cards'}</h3>
              <div style={{display:'flex',gap:'8px'}}>
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/cnc-kanban')}>Open Kanban</button>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/kanban')}>Board View</button>
              </div>
            </div>
            <div style={{padding:'8px'}}>
              {cncJobs.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">⚙️</div>
                  <h3>No active CNC jobs</h3>
                  <p>{isAdmin ? 'Create job cards in the CNC Kanban.' : 'CNC jobs assigned to you will appear here.'}</p>
                </div>
              )}
              {cncJobs.map(job => {
                const borderColor = getCncCardBorder(job);
                const bgColor = getCncCardBg(job);
                const leadTime = getLeadTime(job);
                const daysLeft = getDaysRemaining(job);
                return (
                  <div key={job.id} className="task-card" style={{marginBottom:'8px',cursor:'pointer',borderLeft:`3px solid ${borderColor}`,background:bgColor}} onClick={() => navigate('/cnc-kanban')}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <div className="task-title" style={{fontSize:'14px'}}>{job.job_name}</div>
                      <span style={{fontSize:'10px',fontWeight:'700',textTransform:'uppercase',padding:'2px 8px',borderRadius:'10px',
                        background: job.priority === 'high' ? '#fee2e2' : job.priority === 'medium' ? '#fef3c7' : '#f3f4f6',
                        color: job.priority === 'high' ? '#dc2626' : job.priority === 'medium' ? '#d97706' : '#6b7280'
                      }}>{job.priority}</span>
                    </div>
                    <div className="task-meta" style={{gap:'8px',marginTop:'4px'}}>
                      <span style={{fontSize:'12px',color:'var(--text-muted)',fontFamily:'monospace'}}>{job.job_card_number}</span>
                      <span style={{fontSize:'12px',color:'var(--text-muted)'}}>Part: {job.part_number}</span>
                      {job.stage_name && (
                        <span style={{fontSize:'11px',fontWeight:'600',padding:'1px 8px',borderRadius:'10px',background:'#ede9fe',color:'#6366f1'}}>{job.stage_name}</span>
                      )}
                      {job.assigned_user && <span style={{fontSize:'12px',color:'var(--text-muted)'}}>👤 {job.assigned_user}</span>}
                    </div>
                    <div style={{display:'flex',gap:'12px',alignItems:'center',marginTop:'6px',flexWrap:'wrap'}}>
                      {leadTime && (
                        <span style={{fontSize:'12px',fontWeight:'600',color: daysLeft !== null && daysLeft < 1 ? '#991b1b' : daysLeft !== null && daysLeft <= 5 ? '#854d0e' : '#1e40af'}}>
                          🕐 Lead: {leadTime}
                        </span>
                      )}
                      {job.estimate_end_date ? (
                        <span style={{fontSize:'12px',color: daysLeft !== null && daysLeft < 1 ? '#dc2626' : daysLeft !== null && daysLeft <= 5 ? '#d97706' : 'var(--text-muted)',fontWeight: daysLeft !== null && daysLeft <= 5 ? '600' : '400'}}>
                          {daysLeft !== null && daysLeft < 1 ? `⚠️ ${Math.abs(Math.floor(daysLeft))}d overdue` : daysLeft !== null && daysLeft <= 5 ? `⏰ ${daysLeft}d left` : `📅 Due: ${new Date(job.estimate_end_date).toLocaleDateString()}`}
                        </span>
                      ) : (
                        <span style={{fontSize:'12px',color:'#ea580c',fontWeight:'600'}}>⚠️ No deadline</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column - Charts & Team */}
        <div>
          {/* System Status Card */}
          <SystemStatusCard />
          {/* Task Distribution */}
          <div className="card" style={{marginBottom:'16px'}}>
            <div className="card-header" style={{padding:'16px 20px'}}>
              <h3 style={{fontSize:'15px'}}>📊 Task Distribution</h3>
            </div>
            <div style={{padding:'16px'}}>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(val, name) => [val, name]} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{textAlign:'center',padding:'30px 0',color:'var(--text-muted)',fontSize:'13px'}}>No task data</div>
              )}
              <div style={{display:'flex',flexWrap:'wrap',gap:'8px',justifyContent:'center',marginTop:'8px'}}>
                {pieData.map((d, i) => (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'11px'}}>
                    <div style={{width:'8px',height:'8px',borderRadius:'50%',background:COLORS[i]}}></div>
                    <span>{d.name}: {d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CNC Distribution */}
          {cncPieData.length > 0 && (
            <div className="card" style={{marginBottom:'16px'}}>
              <div className="card-header" style={{padding:'16px 20px'}}>
                <h3 style={{fontSize:'15px'}}>⚙️ CNC Job Status</h3>
              </div>
              <div style={{padding:'16px'}}>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={cncPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                      {cncPieData.map((_, i) => <Cell key={i} fill={CNC_COLORS[i % CNC_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(val, name) => [val, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{display:'flex',flexWrap:'wrap',gap:'8px',justifyContent:'center',marginTop:'8px'}}>
                  {cncPieData.map((d, i) => (
                    <div key={i} style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'11px'}}>
                      <div style={{width:'8px',height:'8px',borderRadius:'50%',background:CNC_COLORS[i]}}></div>
                      <span>{d.name}: {d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Team Members (Admin) */}
          {isAdmin && (
            <div className="card">
              <div className="card-header" style={{padding:'16px 20px'}}>
                <h3 style={{fontSize:'15px'}}>👥 Team Members</h3>
              </div>
              <div style={{padding:'12px'}}>
                {users.filter(u=>u.role==='user').slice(0,6).map(u => (
                  <div key={u.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px',borderRadius:'8px'}}>
                    <div className="avatar" style={{background:u.avatar_color||'#4f46e5',width:'32px',height:'32px',fontSize:'12px'}}>
                      {u.name?.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'13px',fontWeight:'600'}}>{u.name}</div>
                      <div style={{fontSize:'11px',color:'var(--text-muted)'}}>{u.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showModal && <TaskModal task={null} users={users} onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); load(); }} />}
    </Layout>
  );
}
