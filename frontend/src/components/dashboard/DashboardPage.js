import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import api from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { formatDate, getDeadlineStatus, timeAgo } from '../../utils/helpers';
import Layout from '../shared/Layout';
import TaskModal from '../shared/TaskModal';

const COLORS = ['#f59e0b','#3b82f6','#10b981','#6b7280','#ef4444'];

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const [statsRes, tasksRes, usersRes] = await Promise.all([
        api.get('/reports/stats'),
        api.get('/tasks?limit=5&status=pending'),
        api.get('/users')
      ]);
      setStats(statsRes.data.stats);
      setTasks(tasksRes.data.tasks);
      setUsers(usersRes.data.users);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { load(); }, []);

  const statCards = stats ? [
    { label: 'Total Tasks', value: stats.total, icon: '📋', color: '#4f46e5', bg: '#ede9fe', cls: 'total' },
    { label: 'Pending', value: stats.pending, icon: '⏳', color: '#d97706', bg: '#fef3c7', cls: 'pending' },
    { label: 'In Progress', value: stats.in_progress, icon: '🔄', color: '#2563eb', bg: '#dbeafe', cls: 'progress' },
    { label: 'Completed', value: stats.completed, icon: '✅', color: '#059669', bg: '#d1fae5', cls: 'done' },
    { label: 'Overdue', value: stats.overdue, icon: '🚨', color: '#dc2626', bg: '#fee2e2', cls: 'overdue' },
    { label: 'Due Soon', value: stats.due_soon, icon: '⚡', color: '#7c3aed', bg: '#ede9fe', cls: 'total' },
  ] : [];

  const pieData = stats ? [
    { name: 'Pending', value: parseInt(stats.pending) },
    { name: 'In Progress', value: parseInt(stats.in_progress) },
    { name: 'Completed', value: parseInt(stats.completed) },
    { name: 'Archived', value: parseInt(stats.archived) },
    { name: 'Overdue', value: parseInt(stats.overdue) },
  ].filter(d => d.value > 0) : [];

  return (
    <Layout title={`Welcome back, ${user?.name?.split(' ')[0]} 👋`}>
      {/* Stats */}
      <div className="stats-grid">
        {statCards.map((s, i) => (
          <div key={i} className={`stat-card ${s.cls}`} onClick={() => navigate('/tasks')}>
            <div className="stat-icon" style={{background: s.bg}}>
              <span style={{fontSize:'22px'}}>{s.icon}</span>
            </div>
            <div className="stat-value" style={{color: s.color}}>{s.value || 0}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:'24px'}}>
        {/* Recent Tasks */}
        <div className="card">
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
                <button className="btn btn-primary btn-sm" style={{marginTop:'12px'}} onClick={() => setShowModal(true)}>Create Task</button>
              </div>
            )}
            {tasks.map(task => {
              const dl = getDeadlineStatus(task);
              return (
                <div key={task.id} className="task-card" style={{marginBottom:'8px'}}
                  onClick={() => navigate('/tasks')}>
                  <div className="task-title">{task.title}</div>
                  <div className="task-meta">
                    {task.assigned_to_name && (
                      <span style={{fontSize:'12px',color:'var(--text-muted)'}}>👤 {task.assigned_to_name}</span>
                    )}
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

        {/* Chart */}
        <div>
          <div className="card" style={{marginBottom:'16px'}}>
            <div className="card-header" style={{padding:'16px 20px'}}>
              <h3 style={{fontSize:'15px'}}>📊 Task Distribution</h3>
            </div>
            <div style={{padding:'16px'}}>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(val, name) => [val, name]} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{textAlign:'center',padding:'40px 0',color:'var(--text-muted)'}}>No data yet</div>
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

          {isAdmin && (
            <div className="card">
              <div className="card-header" style={{padding:'16px 20px'}}>
                <h3 style={{fontSize:'15px'}}>👥 Team Members</h3>
              </div>
              <div style={{padding:'12px'}}>
                {users.filter(u=>u.role==='user').slice(0,5).map(u => (
                  <div key={u.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px',borderRadius:'8px'}}>
                    <div className="avatar" style={{background:u.avatar_color||'#4f46e5',width:'32px',height:'32px',fontSize:'12px'}}>
                      {u.name?.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
                    </div>
                    <div>
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
