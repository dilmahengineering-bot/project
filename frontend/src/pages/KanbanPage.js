import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import api from '../utils/api';
import cncJobService from '../services/cncJobService';
import socketService from '../services/socket';
import { getDeadlineStatus, getPriorityBadge, getInitials } from '../utils/helpers';
import Layout from '../components/shared/Layout';
import TaskModal from '../components/shared/TaskModal';
import { useAuth } from '../context/AuthContext';

// Calculate age from task creation date
const getTaskAge = (createdAt) => {
  if (!createdAt) return '—';
  try {
    const created = new Date(createdAt);
    if (isNaN(created.getTime())) return '—';
    
    const now = new Date();
    const ageMs = now - created;
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    
    if (ageDays === 0) return '< 1 day';
    if (ageDays === 1) return '1 day';
    return `${ageDays} days`;
  } catch (e) {
    return '—';
  }
};

// Calculate days remaining until deadline
const getDaysRemaining = (deadline) => {
  if (!deadline) return null;
  try {
    const due = new Date(deadline);
    if (isNaN(due.getTime())) return null;
    
    const now = new Date();
    const remainingMs = due - now;
    const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
    
    return remainingDays;
  } catch (e) {
    return null;
  }
};

// Get display text for days remaining
const getDaysRemainingText = (deadline) => {
  const days = getDaysRemaining(deadline);
  if (days === null) return null;
  
  if (days < 0) return `Overdue ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''}`;
  if (days === 0) return 'Due Today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
};

// Get urgency class for days remaining
const getUrgencyClass = (deadline) => {
  const days = getDaysRemaining(deadline);
  if (days === null) return '';
  if (days < 0) return 'overdue';
  if (days === 0) return 'due-today';
  if (days <= 2) return 'urgent';
  if (days <= 5) return 'warning';
  return 'safe';
};

const STATUS_COLUMNS = [
  { id: 'pending', label: '⏳ Pending', color: '#f59e0b', bg: '#fef3c7' },
  { id: 'in_progress', label: '🔄 In Progress', color: '#3b82f6', bg: '#dbeafe' },
  { id: 'completed', label: '✅ Completed', color: '#10b981', bg: '#d1fae5' },
];

const CNC_STATUS_COLUMNS = [
  { id: 'active', label: '🔄 Active', color: '#3b82f6', bg: '#dbeafe' },
  { id: 'completed', label: '✅ Completed', color: '#10b981', bg: '#d1fae5' },
];

export default function KanbanPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('tasks');
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewBy, setViewBy] = useState('status'); // 'status' or 'user'
  const [reorderMode, setReorderMode] = useState(false);
  const [userOrder, setUserOrder] = useState([]);

  // CNC state
  const [cncJobs, setCncJobs] = useState([]);
  const [cncLoading, setCncLoading] = useState(false);
  const [cncViewBy, setCncViewBy] = useState('stage'); // 'stage', 'status', 'user'
  const [cncStages, setCncStages] = useState([]);
  const [procurementData, setProcurementData] = useState([]);
  const [procurementLoading, setProcurementLoading] = useState(false);

  const load = async () => {
    try {
      const [tasksRes, usersRes] = await Promise.all([
        api.get('/tasks?limit=200'),
        api.get('/users')
      ]);
      setTasks(tasksRes.data.tasks.filter(t => t.status !== 'archived'));
      const usersData = usersRes.data.users.filter(u => u.role === 'user');
      setUsers(usersData);
      setUserOrder(usersData);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const saveUserOrder = async () => {
    try {
      await api.post('/users/kanban-order/update', { users: userOrder });
      await load();
      setReorderMode(false);
    } catch (err) {
      console.error('Failed to save user order:', err);
      load();
    }
  };

  const loadCncJobs = useCallback(async () => {
    setCncLoading(true);
    try {
      const res = isAdmin
        ? await cncJobService.getAllJobsAdmin('all')
        : await cncJobService.getMyJobs('all');
      const jobs = res.data.data || [];
      setCncJobs(jobs);

      // Extract unique stages from job data
      const stageMap = new Map();
      jobs.forEach(j => {
        if (j.current_stage_id && j.stage_name) {
          stageMap.set(j.current_stage_id, j.stage_name);
        }
      });
      setCncStages(Array.from(stageMap.entries()).map(([id, name]) => ({ id, name })));
    } catch (err) { console.error(err); }
    finally { setCncLoading(false); }
  }, [isAdmin]);

  const loadProcurement = useCallback(async () => {
    setProcurementLoading(true);
    try {
      const res = isAdmin
        ? await cncJobService.getAllJobsAdmin('all')
        : await cncJobService.getMyJobs('all');
      const jobs = res.data.data || [];
      
      // Extract procurement data from jobs
      const procItems = [];
      jobs.forEach(job => {
        if (job.material || job.po_number || job.item_code) {
          procItems.push({
            id: job.id,
            job_card_number: job.job_card_number,
            job_name: job.job_name,
            material: job.material || '—',
            item_code: job.item_code || '—',
            quantity: job.quantity || 1,
            po_number: job.po_number || '—',
            pr_number: job.pr_number || '—',
            estimated_delivery_date: job.estimated_delivery_date,
            status: job.status,
            dimension: job.dimension || '—'
          });
        }
      });
      setProcurementData(procItems);
    } catch (err) { console.error(err); }
    finally { setProcurementLoading(false); }
  }, [isAdmin]);

  const onUserReorderDragEnd = (result) => {
    const { destination, source, index } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const items = Array.from(userOrder);
    const [reorderedItem] = items.splice(source.index, 1);
    items.splice(destination.index, 0, reorderedItem);
    setUserOrder(items);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (activeTab === 'cnc') loadCncJobs(); }, [activeTab, loadCncJobs]);
  useEffect(() => { if (activeTab === 'procurement') loadProcurement(); }, [activeTab, loadProcurement]);

  // Real-time updates from Socket.io
  useEffect(() => {
    const handleTaskUpdated = (data) => {
      setTasks(prevTasks =>
        prevTasks.map(t => t.id === data.taskId ? { ...t, ...data.task } : t)
      );
    };

    const handleTaskCreated = (data) => {
      // Only add if not archived
      if (data.task.status !== 'archived') {
        setTasks(prevTasks => [data.task, ...prevTasks]);
      }
    };

    const handleTaskDeleted = (data) => {
      setTasks(prevTasks => prevTasks.filter(t => t.id !== data.taskId));
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

  const onDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) return;

    const task = tasks.find(t => t.id === draggableId);
    if (!task) return;

    let updates = {};
    if (viewBy === 'status') {
      updates.status = destination.droppableId;
    } else {
      updates.assigned_to = destination.droppableId;
    }

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === draggableId ? { ...t, ...updates } : t));

    try {
      // Only send the fields being updated to avoid permission issues
      console.log('DEBUG: Dragging task, sending updates:', updates);
      await api.put('/tasks/' + draggableId, updates);
      console.log('DEBUG: Drag update successful');
    } catch (err) {
      console.error('DEBUG: Drag update failed:', err.response?.status, err.response?.data?.error);
      load(); // Revert on error
    }
  };

  const getTasksFor = (columnId) => {
    if (viewBy === 'status') return tasks.filter(t => t.status === columnId);
    return tasks.filter(t => t.assigned_to === columnId);
  };

  const displayUsers = reorderMode ? userOrder : users;
  const columns = viewBy === 'status'
    ? STATUS_COLUMNS
    : displayUsers.map(u => ({ id: u.id, label: u.name, color: u.avatar_color || '#4f46e5', bg: '#ede9fe', user: u }));

  // CNC columns
  const stageColors = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6'];
  const getCncColumns = () => {
    if (cncViewBy === 'status') return CNC_STATUS_COLUMNS;
    if (cncViewBy === 'user') {
      const userMap = new Map();
      cncJobs.forEach(j => {
        if (j.assigned_to) userMap.set(j.assigned_to, j.assigned_user || 'Unknown');
      });
      return Array.from(userMap.entries()).map(([id, name], i) => ({
        id, label: name, color: stageColors[i % stageColors.length], bg: '#ede9fe', isUser: true
      }));
    }
    // by stage
    return cncStages.map((s, i) => ({
      id: s.id, label: s.name, color: stageColors[i % stageColors.length], bg: '#f0f0ff'
    }));
  };

  const getCncJobsFor = (columnId) => {
    if (cncViewBy === 'status') return cncJobs.filter(j => j.status === columnId);
    if (cncViewBy === 'user') return cncJobs.filter(j => j.assigned_to === columnId);
    return cncJobs.filter(j => j.current_stage_id === columnId);
  };

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

  const getCncLeadTime = (job) => {
    const start = job.job_date ? new Date(job.job_date) : null;
    if (!start) return null;
    const end = job.status === 'completed' && job.updated_at ? new Date(job.updated_at) : new Date();
    const days = Math.floor((end - start) / (1000 * 60 * 60 * 24));
    if (days < 0) return null;
    if (days === 0) return '< 1 day';
    return days === 1 ? '1 day' : days + ' days';
  };

  const getCncDaysRemaining = (job) => {
    if (!job.estimate_end_date || job.status === 'completed') return null;
    const deadline = new Date(job.estimate_end_date);
    return Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24));
  };

  const getCncCardStyle = (job) => {
    const days = getCncDaysRemaining(job);
    if (days === null) return {};
    if (days < 1) return { background: '#fef2f2', borderColor: '#ef4444', boxShadow: '0 0 0 1px #ef4444' };
    if (days <= 5) return { background: '#fefce8', borderColor: '#facc15', boxShadow: '0 0 0 1px #facc15' };
    return {};
  };

  if (loading) return (
    <Layout title="📊 Kanban Board">
      <div className="loading-center"><div className="spinner"></div></div>
    </Layout>
  );

  return (
    <Layout title="📊 Kanban Board">
      {/* Tab bar */}
      <div style={{display:'flex',gap:'4px',marginBottom:'16px',background:'var(--surface2)',padding:'4px',borderRadius:'var(--radius-sm)',width:'fit-content'}}>
        <button
          onClick={() => setActiveTab('tasks')}
          style={{
            padding:'8px 20px',borderRadius:'6px',border:'none',cursor:'pointer',fontWeight:'600',fontSize:'13px',
            background: activeTab === 'tasks' ? 'white' : 'transparent',
            color: activeTab === 'tasks' ? 'var(--primary)' : 'var(--text-muted)',
            boxShadow: activeTab === 'tasks' ? 'var(--shadow-sm)' : 'none',
            transition:'all 0.2s'
          }}>
          ✅ Tasks
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
          ⚙️ CNC Jobs
        </button>
        <button
          onClick={() => setActiveTab('procurement')}
          style={{
            padding:'8px 20px',borderRadius:'6px',border:'none',cursor:'pointer',fontWeight:'600',fontSize:'13px',
            background: activeTab === 'procurement' ? 'white' : 'transparent',
            color: activeTab === 'procurement' ? 'var(--primary)' : 'var(--text-muted)',
            boxShadow: activeTab === 'procurement' ? 'var(--shadow-sm)' : 'none',
            transition:'all 0.2s'
          }}>
          📦 Procurement
        </button>
      </div>

      {/* ============ TASKS TAB ============ */}
      {activeTab === 'tasks' && (
        <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px',flexWrap:'wrap',gap:'12px'}}>
        <div>
          <p style={{color:'var(--text-muted)',fontSize:'14px'}}>{tasks.length} active tasks · Drag to reorganize</p>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          <span style={{fontSize:'13px',color:'var(--text-muted)'}}>Group by:</span>
          <button className={`btn btn-sm${viewBy==='status'?' btn-primary':' btn-ghost'}`} onClick={() => setViewBy('status')}>Status</button>
          <button className={`btn btn-sm${viewBy==='user'?' btn-primary':' btn-ghost'}`} onClick={() => setViewBy('user')}>User</button>
          {isAdmin && viewBy === 'user' && !reorderMode && (
            <button className="btn btn-sm btn-ghost" onClick={() => { setReorderMode(true); setUserOrder([...users]); }} style={{marginLeft:'12px', borderLeft:'1px solid var(--border)', paddingLeft:'12px'}}>↻ Reorder</button>
          )}
          {reorderMode && (
            <>
              <button className="btn btn-sm btn-primary" onClick={saveUserOrder}>✓ Save</button>
              <button className="btn btn-sm btn-ghost" onClick={() => { setReorderMode(false); setUserOrder([...users]); }}>✕ Cancel</button>
            </>
          )}
        </div>
      </div>

      <DragDropContext onDragEnd={reorderMode ? onUserReorderDragEnd : onDragEnd}>
        {reorderMode && viewBy === 'user' && (
          <div style={{marginBottom:'20px',padding:'16px',background:'var(--bg-secondary)',borderRadius:'var(--radius)',border:'2px dashed #d97706'}}>
            <p style={{fontSize:'12px',color:'var(--text-muted)',marginBottom:'12px',fontStyle:'italic'}}>Drag to reorder users:</p>
            <Droppable droppableId="user-reorder" direction="horizontal">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{display:'flex',gap:'12px',flexWrap:'wrap',minHeight:'60px',padding:'8px'}}
                >
                  {userOrder.map((user, index) => (
                    <Draggable key={user.id} draggableId={`user-${user.id}`} index={index}>
                      {(prov, snap) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          {...prov.dragHandleProps}
                          style={{
                            padding:'8px 12px',
                            background:snap.isDragging ? user.avatar_color || '#4f46e5' : 'white',
                            color:snap.isDragging ? 'white' : 'var(--text-primary)',
                            border:`2px solid ${user.avatar_color || '#4f46e5'}`,
                            borderRadius:'6px',
                            cursor:'grab',
                            fontWeight:'500',
                            fontSize:'14px',
                            ...prov.draggableProps.style
                          }}
                        >
                          {user.name}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        )}
        <div className="kanban-board">
          {columns.map(col => {
            const colTasks = getTasksFor(col.id);
            return (
              <div key={col.id} className="kanban-column">
                <div className="kanban-col-header" style={{background: col.bg, borderBottom: `3px solid ${col.color}`}}>
                  <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    {col.user && (
                      <div className="avatar" style={{background: col.color, width:'28px', height:'28px', fontSize:'11px'}}>
                        {getInitials(col.label)}
                      </div>
                    )}
                    <span style={{fontSize:'14px', fontWeight:'700', color: col.color === '#f3f4f6' ? '#6b7280' : col.color}}>
                      {col.label}
                    </span>
                  </div>
                  <span className="col-count" style={{background: col.color, color:'white'}}>{colTasks.length}</span>
                </div>
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`kanban-col-body${snapshot.isDraggingOver ? ' drag-over' : ''}`}
                    >
                      {colTasks.map((task, index) => (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(prov, snap) => {
                            const dl = getDeadlineStatus(task);
                            const pr = getPriorityBadge(task.priority);
                            return (
                              <div
                                ref={prov.innerRef}
                                {...prov.draggableProps}
                                {...prov.dragHandleProps}
                                className={`task-card ${dl.type === 'overdue' ? 'overdue' : dl.type === 'extended' ? 'extended' : task.status}${snap.isDragging ? ' dragging' : ''}`}
                                onClick={() => setSelected(task)}
                                style={{ ...prov.draggableProps.style }}
                              >
                                <div className="task-title">{task.title}</div>
                                <div className="task-meta" style={{marginBottom:'6px'}}>
                                  <span className={`task-badge ${pr.cls}`}>{pr.label}</span>
                                  {viewBy === 'status' && task.assigned_to_name && (
                                    <span style={{fontSize:'11px',color:'var(--text-muted)'}}>👤 {task.assigned_to_name}</span>
                                  )}
                                  {viewBy === 'user' && (
                                    <span className={`task-badge badge-${task.status}`}>{task.status.replace('_',' ')}</span>
                                  )}
                                </div>
                                <div className={`deadline-indicator ${dl.cls}`}>
                                  <div className="deadline-dot"></div>
                                  <span className="deadline-text">{dl.label}</span>
                                </div>

                                {/* Age and Remaining Days Display */}
                                {task.deadline && (
                                  <div className="card-timeline-task">
                                    <div className="timeline-item-task age-item-task">
                                      <span className="timeline-icon-task">📅</span>
                                      <div className="timeline-content-task">
                                        <div className="timeline-label-task">Age</div>
                                        <div className="timeline-value-task">{getTaskAge(task.created_at)}</div>
                                      </div>
                                    </div>
                                    <div className={`timeline-item-task remaining-item-task ${getUrgencyClass(task.deadline)}`}>
                                      <span className="timeline-icon-task">⏱️</span>
                                      <div className="timeline-content-task">
                                        <div className="timeline-label-task">Remaining</div>
                                        <div className="timeline-value-task">{getDaysRemainingText(task.deadline)}</div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          }}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {colTasks.length === 0 && (
                        <div style={{textAlign:'center',padding:'24px',color:'var(--text-light)',fontSize:'13px'}}>
                          Drop tasks here
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {selected && (
        <TaskModal task={selected} users={users} onClose={() => setSelected(null)} onSave={() => { setSelected(null); load(); }} />
      )}
        </>
      )}

      {/* ============ CNC JOBS TAB ============ */}
      {activeTab === 'cnc' && (
        <>
          {/* CNC Summary Stats */}
          {!cncLoading && cncJobs.length > 0 && (() => {
            const active = cncJobs.filter(j => j.status === 'active').length;
            const completed = cncJobs.filter(j => j.status === 'completed').length;
            const overdue = cncJobs.filter(j => {
              if (j.status === 'completed' || !j.estimate_end_date) return false;
              return new Date(j.estimate_end_date) < new Date();
            }).length;
            const dueSoon = cncJobs.filter(j => {
              if (j.status === 'completed' || !j.estimate_end_date) return false;
              const days = Math.ceil((new Date(j.estimate_end_date) - new Date()) / (1000 * 60 * 60 * 24));
              return days >= 0 && days <= 5;
            }).length;
            const noDeadline = cncJobs.filter(j => j.status === 'active' && !j.estimate_end_date).length;
            const cncStats = [
              { label: 'Total', value: cncJobs.length, icon: '📊', color: '#4f46e5', bg: '#ede9fe' },
              { label: 'Active', value: active, icon: '⚙️', color: '#0891b2', bg: '#cffafe' },
              { label: 'Completed', value: completed, icon: '✅', color: '#059669', bg: '#d1fae5' },
              { label: 'Overdue', value: overdue, icon: '🚨', color: '#dc2626', bg: '#fee2e2' },
              { label: 'Due ≤ 5 Days', value: dueSoon, icon: '⚠️', color: '#d97706', bg: '#fef3c7' },
              { label: 'No Deadline', value: noDeadline, icon: '📅', color: '#ea580c', bg: '#ffedd5' },
            ];
            return (
              <div className="stats-grid" style={{marginBottom:'20px'}}>
                {cncStats.map((s, i) => (
                  <div key={i} className="stat-card">
                    <div className="stat-icon" style={{background: s.bg}}>
                      <span style={{fontSize:'22px'}}>{s.icon}</span>
                    </div>
                    <div className="stat-value" style={{color: s.color}}>{s.value}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px',flexWrap:'wrap',gap:'12px'}}>
            <div>
              <p style={{color:'var(--text-muted)',fontSize:'14px'}}>{cncJobs.length} CNC job cards</p>
            </div>
            <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
              <span style={{fontSize:'13px',color:'var(--text-muted)'}}>Group by:</span>
              <button className={`btn btn-sm${cncViewBy==='stage'?' btn-primary':' btn-ghost'}`} onClick={() => setCncViewBy('stage')}>Stage</button>
              <button className={`btn btn-sm${cncViewBy==='status'?' btn-primary':' btn-ghost'}`} onClick={() => setCncViewBy('status')}>Status</button>
              {isAdmin && <button className={`btn btn-sm${cncViewBy==='user'?' btn-primary':' btn-ghost'}`} onClick={() => setCncViewBy('user')}>User</button>}
              <button className="btn btn-sm btn-ghost" onClick={() => navigate('/cnc-kanban')} style={{marginLeft:'8px',borderLeft:'1px solid var(--border)',paddingLeft:'12px'}}>Open CNC Kanban →</button>
            </div>
          </div>

          {cncLoading ? (
            <div className="loading-center"><div className="spinner"></div></div>
          ) : cncJobs.length === 0 ? (
            <div style={{textAlign:'center',padding:'60px 20px',color:'var(--text-muted)'}}>
              <div style={{fontSize:'48px',marginBottom:'12px'}}>⚙️</div>
              <h3 style={{marginBottom:'8px'}}>{isAdmin ? 'No CNC job cards found' : 'No CNC job cards assigned'}</h3>
              <p style={{fontSize:'14px'}}>{isAdmin ? 'Create job cards in the CNC Kanban page.' : 'CNC job cards assigned to you will appear here.'}</p>
              <button className="btn btn-primary btn-sm" style={{marginTop:'12px'}} onClick={() => navigate('/cnc-kanban')}>Go to CNC Kanban</button>
            </div>
          ) : (
            <div className="kanban-board">
              {getCncColumns().map(col => {
                const colJobs = getCncJobsFor(col.id);
                return (
                  <div key={col.id} className="kanban-column">
                    <div className="kanban-col-header" style={{background: col.bg, borderBottom: `3px solid ${col.color}`}}>
                      <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                        {col.isUser && (
                          <div className="avatar" style={{background: col.color, width:'28px', height:'28px', fontSize:'11px'}}>
                            {getInitials(col.label)}
                          </div>
                        )}
                        <span style={{fontSize:'14px', fontWeight:'700', color: col.color}}>
                          {col.label}
                        </span>
                      </div>
                      <span className="col-count" style={{background: col.color, color:'white'}}>{colJobs.length}</span>
                    </div>
                    <div className="kanban-col-body" style={{minHeight:'100px'}}>
                      {colJobs.map(job => {
                        const dl = getCncDeadlineInfo(job);
                        const prColor = job.priority === 'high' ? '#ef4444' : job.priority === 'medium' ? '#f59e0b' : '#6b7280';
                        return (
                          <div
                            key={job.id}
                            className={`task-card ${job.status === 'completed' ? 'completed' : dl.cls === 'overdue' ? 'overdue' : 'in_progress'}`}
                            onClick={() => navigate('/cnc-kanban')}
                            style={{cursor:'pointer', ...getCncCardStyle(job)}}
                          >
                            <div className="task-title">{job.job_name}</div>
                            <div style={{fontSize:'12px',color:'var(--text-muted)',marginTop:'2px',fontFamily:'monospace'}}>{job.job_card_number}</div>
                            <div className="task-meta" style={{marginBottom:'6px',marginTop:'6px'}}>
                              <span style={{fontSize:'12px',fontWeight:'600',color:prColor,textTransform:'uppercase'}}>{job.priority}</span>
                              {cncViewBy !== 'stage' && job.stage_name && (
                                <span style={{fontSize:'11px',fontWeight:'600',padding:'2px 8px',borderRadius:'20px',background:'#ede9fe',color:'#6366f1'}}>{job.stage_name}</span>
                              )}
                              {cncViewBy !== 'user' && job.assigned_user && (
                                <span style={{fontSize:'12px',color:'var(--text-muted)'}}>👤 {job.assigned_user}</span>
                              )}
                            </div>
                            {job.part_number && <div style={{fontSize:'12px',color:'var(--text-muted)'}}>Part: {job.part_number}</div>}
                            {!job.estimate_end_date && (
                              <div style={{padding:'5px 8px',background:'#fff7ed',borderLeft:'3px solid #f97316',borderRadius:'2px',fontSize:'12px',color:'#c2410c',fontWeight:'600',marginTop:'4px'}}>
                                ⚠️ No deadline set
                              </div>
                            )}
                            {getCncLeadTime(job) && (() => {
                              const daysLeft = getCncDaysRemaining(job);
                              const ltStyle = daysLeft !== null && daysLeft < 1
                                ? {padding:'5px 8px',background:'#fee2e2',borderLeft:'3px solid #ef4444',borderRadius:'2px',fontSize:'13px',color:'#991b1b',marginTop:'4px'}
                                : daysLeft !== null && daysLeft <= 5
                                  ? {padding:'5px 8px',background:'#fef9c3',borderLeft:'3px solid #eab308',borderRadius:'2px',fontSize:'13px',color:'#854d0e',marginTop:'4px'}
                                  : {padding:'5px 8px',background:'#eff6ff',borderLeft:'3px solid #3b82f6',borderRadius:'2px',fontSize:'13px',color:'#1e40af',marginTop:'4px'};
                              return (
                                <div style={ltStyle}>
                                  🕐 Lead Time: <strong>{getCncLeadTime(job)}</strong>
                                </div>
                              );
                            })()}
                            <div className={`deadline-indicator ${dl.cls}`}>
                              <div className="deadline-dot"></div>
                              <span className="deadline-text">{dl.label}</span>
                            </div>
                          </div>
                        );
                      })}
                      {colJobs.length === 0 && (
                        <div style={{textAlign:'center',padding:'24px',color:'var(--text-light)',fontSize:'13px'}}>
                          No jobs here
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ============ PROCUREMENT TAB ============ */}
      {activeTab === 'procurement' && (
        <>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px',flexWrap:'wrap',gap:'12px'}}>
            <div>
              <p style={{color:'var(--text-muted)',fontSize:'14px'}}>{procurementData.length} procurement items</p>
            </div>
          </div>

          {procurementLoading ? (
            <div className="loading-center"><div className="spinner"></div></div>
          ) : procurementData.length === 0 ? (
            <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text-muted)',fontSize:'14px'}}>
              📦 No procurement data available
            </div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{
                width:'100%',fontSize:'12px',borderCollapse:'collapse',background:'white',borderRadius:'8px',overflow:'hidden',boxShadow:'var(--shadow-sm)'
              }}>
                <thead>
                  <tr style={{background:'var(--surface2)',borderBottom:'2px solid var(--border)'}}>
                    <th style={{padding:'12px',textAlign:'left',fontWeight:'600',color:'var(--text-muted)',textTransform:'uppercase'}}>Job Card</th>
                    <th style={{padding:'12px',textAlign:'left',fontWeight:'600',color:'var(--text-muted)',textTransform:'uppercase'}}>Material</th>
                    <th style={{padding:'12px',textAlign:'left',fontWeight:'600',color:'var(--text-muted)',textTransform:'uppercase'}}>Item Code</th>
                    <th style={{padding:'12px',textAlign:'left',fontWeight:'600',color:'var(--text-muted)',textTransform:'uppercase'}}>Dimension</th>
                    <th style={{padding:'12px',textAlign:'center',fontWeight:'600',color:'var(--text-muted)',textTransform:'uppercase'}}>Qty</th>
                    <th style={{padding:'12px',textAlign:'left',fontWeight:'600',color:'var(--text-muted)',textTransform:'uppercase'}}>PO Number</th>
                    <th style={{padding:'12px',textAlign:'left',fontWeight:'600',color:'var(--text-muted)',textTransform:'uppercase'}}>PR Number</th>
                    <th style={{padding:'12px',textAlign:'left',fontWeight:'600',color:'var(--text-muted)',textTransform:'uppercase'}}>Est. Delivery</th>
                    <th style={{padding:'12px',textAlign:'center',fontWeight:'600',color:'var(--text-muted)',textTransform:'uppercase'}}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {procurementData.map((item, idx) => {
                    const deliveryDays = item.estimated_delivery_date 
                      ? Math.ceil((new Date(item.estimated_delivery_date) - new Date()) / (1000 * 60 * 60 * 24))
                      : null;
                    const deliveryStatus = deliveryDays === null ? 'no-date' : deliveryDays < 0 ? 'overdue' : deliveryDays <= 3 ? 'urgent' : 'normal';
                    
                    return (
                      <tr key={item.id} style={{
                        borderBottom:'1px solid var(--border)',
                        background: idx % 2 === 0 ? 'white' : 'var(--surface2)',
                        transition:'background 0.2s'
                      }}>
                        <td style={{padding:'12px',fontSize:'12px',fontWeight:'600',color:'var(--primary)',cursor:'pointer'}} onClick={() => navigate('/cnc-kanban')}>
                          {item.job_card_number}
                        </td>
                        <td style={{padding:'12px'}}>{item.material}</td>
                        <td style={{padding:'12px',fontFamily:'monospace',fontSize:'11px'}}>{item.item_code}</td>
                        <td style={{padding:'12px',fontSize:'11px',color:'var(--text-muted)'}}>{item.dimension}</td>
                        <td style={{padding:'12px',textAlign:'center',fontWeight:'600'}}>{item.quantity}</td>
                        <td style={{padding:'12px',fontSize:'11px',fontFamily:'monospace',color:'#0891b2'}}>{item.po_number}</td>
                        <td style={{padding:'12px',fontSize:'11px',fontFamily:'monospace',color:'#7c3aed'}}>{item.pr_number}</td>
                        <td style={{padding:'12px',fontSize:'11px'}}>
                          {item.estimated_delivery_date ? new Date(item.estimated_delivery_date).toLocaleDateString() : '—'}
                          {deliveryDays !== null && (
                            <div style={{fontSize:'10px',color: deliveryStatus === 'overdue' ? '#dc2626' : deliveryStatus === 'urgent' ? '#f59e0b' : 'var(--text-muted)',marginTop:'2px'}}>
                              {deliveryStatus === 'overdue' ? `${Math.abs(deliveryDays)}d overdue` : deliveryStatus === 'urgent' ? `${deliveryDays}d left` : `${deliveryDays}d left`}
                            </div>
                          )}
                        </td>
                        <td style={{padding:'12px',textAlign:'center'}}>
                          <span style={{
                            fontSize:'11px',fontWeight:'600',padding:'4px 8px',borderRadius:'12px',
                            background: item.status === 'completed' ? '#d1fae5' : '#dbeafe',
                            color: item.status === 'completed' ? '#065f46' : '#0c4a6e',
                            textTransform:'uppercase'
                          }}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
