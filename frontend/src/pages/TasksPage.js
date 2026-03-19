import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import cncJobService from '../services/cncJobService';
import workflowService from '../services/workflowService';
import socketService from '../services/socket';
import { getDeadlineStatus, getStatusBadge, getPriorityBadge, formatDate } from '../utils/helpers';
import Layout from '../components/shared/Layout';
import TaskModal from '../components/shared/TaskModal';
import CNCJobCardModal from '../components/kanban/CNCJobCardModal';
import { useAuth } from '../context/AuthContext';

export default function TasksPage({ adminView = false }) {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('tasks');
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', assigned_to: '', search: '' });

  // CNC Jobs state
  const [cncJobs, setCncJobs] = useState([]);
  const [cncStats, setCncStats] = useState(null);
  const [cncLoading, setCncLoading] = useState(false);
  const [cncFilter, setCncFilter] = useState('active');
  const [cncSearch, setCncSearch] = useState('');
  const [selectedCncJob, setSelectedCncJob] = useState(null);
  const [showCncModal, setShowCncModal] = useState(false);
  const [cncWorkflow, setCncWorkflow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const queryFilters = adminView ? filters : { ...filters, assigned_to: user?.id || '' };
      const params = new URLSearchParams({ page, limit: 20, ...Object.fromEntries(Object.entries(queryFilters).filter(([,v]) => v)) });
      const [tasksRes, usersRes] = await Promise.all([
        api.get('/tasks?' + params),
        api.get('/users')
      ]);
      setTasks(tasksRes.data.tasks);
      setTotal(tasksRes.data.total);
      setUsers(usersRes.data.users);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [page, filters, adminView, user?.id]);

  const loadCncJobs = useCallback(async () => {
    setCncLoading(true);
    try {
      const res = adminView
        ? await cncJobService.getAllJobsAdmin(cncFilter, cncSearch)
        : await cncJobService.getMyJobs(cncFilter, cncSearch);
      setCncJobs(res.data.data || []);
      setCncStats(res.data.stats || null);
    } catch (err) { console.error(err); }
    finally { setCncLoading(false); }
  }, [cncFilter, cncSearch, adminView]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (activeTab === 'cnc') loadCncJobs(); }, [activeTab, loadCncJobs]);

  const openCncJob = async (job) => {
    try {
      if (job.workflow_id) {
        const wfRes = await workflowService.getWorkflow(job.workflow_id);
        setCncWorkflow(wfRes.data);
      }
      setSelectedCncJob(job);
      setShowCncModal(true);
    } catch (err) {
      console.error('Error loading workflow:', err);
      setSelectedCncJob(job);
      setShowCncModal(true);
    }
  };

  // Real-time updates from Socket.io
  useEffect(() => {
    const handleTaskUpdated = (data) => {
      const shouldShow = adminView || data.task.assigned_to === user?.id;
      setTasks(prevTasks => {
        const taskExists = prevTasks.some(t => t.id === data.taskId);
        if (taskExists && shouldShow) return prevTasks.map(t => t.id === data.taskId ? { ...t, ...data.task } : t);
        else if (taskExists && !shouldShow) return prevTasks.filter(t => t.id !== data.taskId);
        else if (!taskExists && shouldShow) return [{ ...data.task }, ...prevTasks];
        return prevTasks;
      });
    };
    const handleTaskCreated = (data) => {
      const shouldShow = adminView || data.task.assigned_to === user?.id;
      if (shouldShow) { setTasks(prevTasks => [data.task, ...prevTasks]); setTotal(prev => prev + 1); }
    };
    const handleTaskDeleted = (data) => { setTasks(prev => prev.filter(t => t.id !== data.taskId)); setTotal(prev => Math.max(0, prev - 1)); };
    const handleTaskCompleted = (data) => {
      const shouldShow = adminView || data.task.assigned_to === user?.id;
      setTasks(prevTasks => {
        const taskExists = prevTasks.some(t => t.id === data.taskId);
        if (taskExists && shouldShow) return prevTasks.map(t => t.id === data.taskId ? { ...t, ...data.task } : t);
        else if (taskExists && !shouldShow) return prevTasks.filter(t => t.id !== data.taskId);
        else if (!taskExists && shouldShow) return [{ ...data.task }, ...prevTasks];
        return prevTasks;
      });
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
  }, [adminView, user?.id]);

  const openNew = () => { setSelected(null); setShowModal(true); };
  const openTask = (t) => { setSelected(t); setShowModal(true); };

  const totalPages = Math.ceil(total / 20);

  const getCncDeadlineInfo = (job) => {
    if (!job.estimate_end_date) return { cls: 'normal', label: 'No deadline' };
    const deadline = new Date(job.estimate_end_date);
    const now = new Date();
    const diffDays = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
    if (job.status === 'completed') return { cls: 'completed', label: 'Completed' };
    if (diffDays < 0) return { cls: 'overdue', label: `${Math.abs(diffDays)}d overdue` };
    if (diffDays <= 3) return { cls: 'warning', label: `${diffDays}d left` };
    return { cls: 'normal', label: deadline.toLocaleDateString() };
  };

  return (
    <Layout title={adminView ? '📋 All Tasks' : '✅ My Tasks'}>
      <div className="page-header-row" style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px',flexWrap:'wrap',gap:'12px'}}>
        <div>
          <h2 style={{fontSize:'20px'}}>{adminView ? 'All Tasks' : 'My Tasks'}</h2>
          <p style={{color:'var(--text-muted)',fontSize:'14px'}}>
            {activeTab === 'tasks' ? `${total} tasks` : `${cncJobs.length} CNC job cards`}
          </p>
        </div>
        <div className="page-header-actions" style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
          {activeTab === 'tasks' && (
            <button className="btn btn-primary" onClick={openNew}>+ New Task</button>
          )}
          {activeTab === 'cnc' && (
            <div style={{display:'flex',gap:'8px'}}>
              <button className="btn btn-ghost" onClick={() => navigate('/cnc-kanban')}>📊 Open Kanban</button>
              {isAdmin && <button className="btn btn-primary" onClick={async () => {
                try {
                  const wfs = await workflowService.getAllWorkflows();
                  if (wfs.data.length > 0) {
                    const detail = await workflowService.getWorkflow(wfs.data[0].id);
                    setCncWorkflow(detail.data);
                  }
                  setSelectedCncJob(null);
                  setShowCncModal(true);
                } catch (err) { console.error(err); }
              }}>+ New CNC Job</button>}
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{display:'flex',gap:'4px',marginBottom:'16px',background:'var(--surface2)',padding:'4px',borderRadius:'var(--radius-sm)',maxWidth:'100%',overflowX:'auto'}}>
          <button
            onClick={() => setActiveTab('tasks')}
            style={{
              padding:'8px 20px',borderRadius:'6px',border:'none',cursor:'pointer',fontWeight:'600',fontSize:'13px',
              background: activeTab === 'tasks' ? 'white' : 'transparent',
              color: activeTab === 'tasks' ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: activeTab === 'tasks' ? 'var(--shadow-sm)' : 'none',
              transition:'all 0.2s'
            }}>
            ✅ Tasks {total > 0 && <span style={{background:'var(--primary-light)',color:'var(--primary)',padding:'1px 8px',borderRadius:'10px',fontSize:'11px',marginLeft:'6px'}}>{total}</span>}
          </button>
          <button
            onClick={() => setActiveTab('cnc')}
            style={{
              padding:'8px 20px',borderRadius:'6px',border:'none',cursor:'pointer',fontWeight:'600',fontSize:'13px',
              background: activeTab === 'cnc' ? 'white' : 'transparent',
              color: activeTab === 'cnc' ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: activeTab === 'cnc' ? 'var(--shadow-sm)' : 'none',
              transition:'all 0.2s'
            }}>
            ⚙️ CNC Jobs {cncStats && parseInt(cncStats.active) > 0 && <span style={{background:'#dbeafe',color:'#2563eb',padding:'1px 8px',borderRadius:'10px',fontSize:'11px',marginLeft:'6px'}}>{cncStats.active}</span>}
          </button>
        </div>

      {/* ============ TASKS TAB ============ */}
      {activeTab === 'tasks' && (
        <>
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
        </>
      )}

      {/* ============ CNC JOBS TAB ============ */}
      {activeTab === 'cnc' && (
        <>
          {/* CNC Stats */}
          {cncStats && (
            <div className="stats-grid" style={{marginBottom:'16px'}}>
              <div className="stat-card" style={{textAlign:'center',padding:'16px'}}>
                <div className="stat-value" style={{color:'var(--primary)'}}>{cncStats.total || 0}</div>
                <div className="stat-label">Total CNC Jobs</div>
              </div>
              <div className="stat-card" style={{textAlign:'center',padding:'16px'}}>
                <div className="stat-value" style={{color:'#3b82f6'}}>{cncStats.active || 0}</div>
                <div className="stat-label">Active</div>
              </div>
              <div className="stat-card" style={{textAlign:'center',padding:'16px'}}>
                <div className="stat-value" style={{color:'var(--success)'}}>{cncStats.completed || 0}</div>
                <div className="stat-label">Completed</div>
              </div>
              <div className="stat-card" style={{textAlign:'center',padding:'16px'}}>
                <div className="stat-value" style={{color:'var(--danger)'}}>{cncStats.overdue || 0}</div>
                <div className="stat-label">Overdue</div>
              </div>
            </div>
          )}

          {/* CNC Filter */}
          <div className="filter-bar" style={{marginBottom:'16px'}}>
            <div className="search-input" style={{flex:1,minWidth:'200px',position:'relative'}}>
              <span className="search-icon" style={{position:'absolute',left:'12px',top:'50%',transform:'translateY(-50%)'}}>🔍</span>
              <input className="form-control" placeholder="Search CNC jobs..." style={{paddingLeft:'38px'}}
                value={cncSearch} onChange={e => setCncSearch(e.target.value)} />
            </div>
            <select className="form-control" style={{width:'auto',minWidth:'140px'}} value={cncFilter} onChange={e => setCncFilter(e.target.value)}>
              <option value="active">Active Jobs</option>
              <option value="completed">Completed Jobs</option>
              <option value="all">All Jobs</option>
            </select>
            <button className="btn btn-ghost" onClick={() => { setCncSearch(''); setCncFilter('active'); }}>Clear</button>
          </div>

          {/* CNC Table */}
          <div className="card">
            <div className="table-wrapper">
              {cncLoading ? (
                <div className="loading-center"><div className="spinner"></div></div>
              ) : cncJobs.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">⚙️</div>
                  <h3>{adminView ? 'No CNC job cards found' : 'No CNC job cards assigned'}</h3>
                  <p>{adminView ? 'No CNC job cards match your filters.' : 'CNC job cards assigned to you will appear here.'}</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Job Card #</th>
                      <th>Part #</th>
                      {adminView && <th>Assigned To</th>}
                      <th>Stage</th>
                      <th>Priority</th>
                      <th>Deadline</th>
                      <th>Workflow</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cncJobs.map(job => {
                      const dl = getCncDeadlineInfo(job);
                      const prColor = job.priority === 'high' ? '#ef4444' : job.priority === 'medium' ? '#f59e0b' : '#6b7280';
                      return (
                        <tr key={job.id} onClick={() => openCncJob(job)} style={{cursor:'pointer'}}>
                          <td>
                            <div style={{fontWeight:'600',fontSize:'14px'}}>{job.job_name}</div>
                            {job.client_name && <div style={{fontSize:'12px',color:'var(--text-muted)',marginTop:'2px'}}>Client: {job.client_name}</div>}
                          </td>
                          <td><span style={{fontSize:'13px',fontFamily:'monospace',color:'var(--primary)'}}>{job.job_card_number}</span></td>
                          <td><span style={{fontSize:'13px'}}>{job.part_number}</span></td>
                          {adminView && (
                            <td>
                              {job.assigned_user ? (
                                <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                                  <div className="avatar" style={{width:'28px',height:'28px',fontSize:'11px',background:'#4f46e5'}}>
                                    {job.assigned_user.split(' ').map(n=>n[0]).join('').slice(0,2)}
                                  </div>
                                  <span style={{fontSize:'13px'}}>{job.assigned_user}</span>
                                </div>
                              ) : <span style={{color:'var(--text-light)',fontSize:'13px'}}>Unassigned</span>}
                            </td>
                          )}
                          <td>
                            <span style={{
                              fontSize:'12px',fontWeight:'600',padding:'3px 10px',borderRadius:'20px',
                              background:'#ede9fe',color:'#6366f1'
                            }}>
                              {job.stage_name || 'Unknown'}
                            </span>
                          </td>
                          <td>
                            <span style={{fontSize:'12px',fontWeight:'600',color:prColor,textTransform:'uppercase'}}>
                              {job.priority}
                            </span>
                          </td>
                          <td>
                            <div className={`deadline-indicator ${dl.cls}`}>
                              <div className="deadline-dot"></div>
                              <span className="deadline-text" style={{fontSize:'12px'}}>{dl.label}</span>
                            </div>
                          </td>
                          <td><span style={{fontSize:'12px',color:'var(--text-muted)'}}>{job.workflow_name}</span></td>
                          <td><button className="btn btn-ghost btn-sm">›</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {showModal && <TaskModal task={selected} users={users} onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); load(); }} />}
      {showCncModal && (
        <CNCJobCardModal
          jobCard={selectedCncJob}
          workflow={cncWorkflow}
          onClose={() => { setShowCncModal(false); setSelectedCncJob(null); setCncWorkflow(null); }}
          onSave={() => { setShowCncModal(false); setSelectedCncJob(null); setCncWorkflow(null); loadCncJobs(); }}
        />
      )}
    </Layout>
  );
}
