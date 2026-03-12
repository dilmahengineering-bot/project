import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import socketService from '../services/socket';
import { getDeadlineStatus, getStatusBadge, getPriorityBadge, formatDate } from '../utils/helpers';
import Layout from '../components/shared/Layout';
import TaskModal from '../components/shared/TaskModal';
import { useAuth } from '../context/AuthContext';

export default function TasksPage({ adminView = false }) {
  const { isAdmin } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', assigned_to: '', search: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20, ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)) });
      const [tasksRes, usersRes] = await Promise.all([
        api.get('/tasks?' + params),
        api.get('/users')
      ]);
      setTasks(tasksRes.data.tasks);
      setTotal(tasksRes.data.total);
      setUsers(usersRes.data.users);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  // Real-time updates from Socket.io
  useEffect(() => {
    const handleTaskUpdated = (data) => {
      setTasks(prevTasks => 
        prevTasks.map(t => t.id === data.taskId ? { ...t, ...data.task } : t)
      );
    };

    const handleTaskCreated = (data) => {
      setTasks(prevTasks => [data.task, ...prevTasks]);
      setTotal(prev => prev + 1);
    };

    const handleTaskDeleted = (data) => {
      setTasks(prevTasks => prevTasks.filter(t => t.id !== data.taskId));
      setTotal(prev => Math.max(0, prev - 1));
    };

    const handleTaskCompleted = (data) => {
      setTasks(prevTasks =>
        prevTasks.map(t => t.id === data.taskId ? { ...t, ...data.task } : t)
      );
    };

    socketService.onTaskUpdated(handleTaskUpdated);
    socketService.onTaskCreated(handleTaskCreated);
    socketService.onTaskDeleted(handleTaskDeleted);
    socketService.onTaskCompleted(handleTaskCompleted);

    return () => {
      socketService.off('task:updated', handleTaskUpdated);
      socketService.off('task:created', handleTaskCreated);
      socketService.off('task:deleted', handleTaskDeleted);
      socketService.off('task:completed', handleTaskCompleted);
    };
  }, []);

  const openNew = () => { setSelected(null); setShowModal(true); };
  const openTask = (t) => { setSelected(t); setShowModal(true); };

  const totalPages = Math.ceil(total / 20);

  return (
    <Layout title={adminView ? '📋 All Tasks' : '✅ My Tasks'}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px',flexWrap:'wrap',gap:'12px'}}>
        <div>
          <h2 style={{fontSize:'20px'}}>{adminView ? 'All Tasks' : 'My Tasks'}</h2>
          <p style={{color:'var(--text-muted)',fontSize:'14px'}}>{total} tasks total</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ New Task</button>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="search-input" style={{flex:1,minWidth:'200px',position:'relative'}}>
          <span className="search-icon" style={{position:'absolute',left:'12px',top:'50%',transform:'translateY(-50%)'}}>🔍</span>
          <input className="form-control" placeholder="Search tasks..." style={{paddingLeft:'38px'}}
            value={filters.search} onChange={e => setFilters(p=>({...p,search:e.target.value}))} />
        </div>
        <select className="form-control" style={{width:'auto',minWidth:'140px'}} value={filters.status} onChange={e => setFilters(p=>({...p,status:e.target.value}))}>
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
        {(isAdmin || adminView) && (
          <select className="form-control" style={{width:'auto',minWidth:'160px'}} value={filters.assigned_to} onChange={e => setFilters(p=>({...p,assigned_to:e.target.value}))}>
            <option value="">All Users</option>
            {users.filter(u=>u.role==='user').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <button className="btn btn-ghost" onClick={() => setFilters({ status:'', assigned_to:'', search:'' })}>Clear</button>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrapper">
          {loading ? (
            <div className="loading-center"><div className="spinner"></div></div>
          ) : tasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <h3>No tasks found</h3>
              <p>Try adjusting your filters or create a new task.</p>
              <button className="btn btn-primary btn-sm" style={{marginTop:'12px'}} onClick={openNew}>+ Create Task</button>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Assigned To</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Deadline</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => {
                  const dl = getDeadlineStatus(task);
                  const st = getStatusBadge(task.status);
                  const pr = getPriorityBadge(task.priority);
                  return (
                    <tr key={task.id} onClick={() => openTask(task)} style={{cursor:'pointer'}}>
                      <td>
                        <div style={{fontWeight:'600',fontSize:'14px'}}>{task.title}</div>
                        {task.description && <div style={{fontSize:'12px',color:'var(--text-muted)',marginTop:'2px'}}>{task.description.slice(0,60)}...</div>}
                      </td>
                      <td>
                        {task.assigned_to_name ? (
                          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                            <div className="avatar" style={{width:'28px',height:'28px',fontSize:'11px',background:task.assigned_to_color||'#4f46e5'}}>
                              {task.assigned_to_name.split(' ').map(n=>n[0]).join('').slice(0,2)}
                            </div>
                            <span style={{fontSize:'13px'}}>{task.assigned_to_name}</span>
                          </div>
                        ) : <span style={{color:'var(--text-light)',fontSize:'13px'}}>Unassigned</span>}
                      </td>
                      <td><span className={`task-badge ${pr.cls}`}>{pr.label}</span></td>
                      <td><span className={`task-badge ${st.cls}`}>{st.label}</span></td>
                      <td>
                        <div className={`deadline-indicator ${dl.cls}`}>
                          <div className="deadline-dot"></div>
                          <span className="deadline-text" style={{fontSize:'12px'}}>{dl.label}</span>
                        </div>
                      </td>
                      <td><button className="btn btn-ghost btn-sm">›</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="pagination" style={{padding:'16px'}}>
            <button className="page-btn" disabled={page===1} onClick={() => setPage(p=>p-1)}>‹</button>
            {Array.from({length: Math.min(totalPages, 7)}, (_, i) => i+1).map(p => (
              <button key={p} className={`page-btn${page===p?' active':''}`} onClick={() => setPage(p)}>{p}</button>
            ))}
            <button className="page-btn" disabled={page===totalPages} onClick={() => setPage(p=>p+1)}>›</button>
          </div>
        )}
      </div>

      {showModal && <TaskModal task={selected} users={users} onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); load(); }} />}
    </Layout>
  );
}
