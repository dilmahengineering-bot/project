import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import api from '../utils/api';
import socketService from '../services/socket';
import { getDeadlineStatus, getPriorityBadge, getInitials } from '../utils/helpers';
import Layout from '../components/shared/Layout';
import TaskModal from '../components/shared/TaskModal';
import { useAuth } from '../context/AuthContext';

const STATUS_COLUMNS = [
  { id: 'pending', label: '⏳ Pending', color: '#f59e0b', bg: '#fef3c7' },
  { id: 'in_progress', label: '🔄 In Progress', color: '#3b82f6', bg: '#dbeafe' },
  { id: 'completed', label: '✅ Completed', color: '#10b981', bg: '#d1fae5' },
];

export default function KanbanPage() {
  const { isAdmin } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewBy, setViewBy] = useState('status'); // 'status' or 'user'
  const [reorderMode, setReorderMode] = useState(false);
  const [userOrder, setUserOrder] = useState([]);

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
      // Reload from API to confirm save
      await load();
      setReorderMode(false);
    } catch (err) {
      console.error('Failed to save user order:', err);
      // Revert on error
      load();
    }
  };

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

  if (loading) return (
    <Layout title="📊 Kanban Board">
      <div className="loading-center"><div className="spinner"></div></div>
    </Layout>
  );

  return (
    <Layout title="📊 Kanban Board">
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
    </Layout>
  );
}
