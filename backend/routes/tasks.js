const express = require('express');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

const logHistory = async (taskId, actionType, userId, notes, oldVal = null, newVal = null) => {
  await db.query(
    'INSERT INTO task_history (task_id, action_type, user_id, notes, old_value, new_value) VALUES ($1,$2,$3,$4,$5,$6)',
    [taskId, actionType, userId, notes, oldVal, newVal]
  );
};

// Helper to broadcast task updates to all connected users
const broadcastTaskUpdate = (req, eventType, taskId, taskData) => {
  const io = req.app.locals.io;
  if (!io) return;
  
  io.emit(`task:${eventType}`, {
    taskId,
    task: taskData,
    updatedBy: req.user.id,
    updatedByName: req.user.name,
    timestamp: new Date()
  });
};

// Get all tasks
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, assigned_to, search, page = 1, limit = 50 } = req.query;
    let where = [];
    let params = [];
    let idx = 1;

    // All users can see all tasks (removed admin-only restriction)
    if (status) { where.push(`t.status = $${idx}`); params.push(status); idx++; }
    if (assigned_to) { where.push(`t.assigned_to = $${idx}`); params.push(assigned_to); idx++; }
    if (search) { where.push(`(t.title ILIKE $${idx} OR t.description ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const offset = (page - 1) * limit;

    const query = `
      SELECT t.*, 
        u1.name as assigned_to_name, u1.avatar_color as assigned_to_color,
        u2.name as created_by_name,
        (SELECT COUNT(*) FROM deadline_extensions de WHERE de.task_id = t.id AND de.approval_status = 'pending') as pending_extensions
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.created_by = u2.id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${idx} OFFSET $${idx+1}
    `;
    params.push(limit, offset);

    const countQuery = `SELECT COUNT(*) FROM tasks t ${whereClause}`;
    const [tasks, count] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, params.slice(0, -2))
    ]);

    res.json({ tasks: tasks.rows, total: parseInt(count.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single task
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT t.*, 
        u1.name as assigned_to_name, u1.avatar_color as assigned_to_color,
        u2.name as created_by_name
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.created_by = u2.id
      WHERE t.id = $1
    `, [req.params.id]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Task not found' });
    
    const history = await db.query(`
      SELECT th.*, u.name as user_name FROM task_history th
      LEFT JOIN users u ON th.user_id = u.id
      WHERE th.task_id = $1 ORDER BY th.created_at DESC
    `, [req.params.id]);

    const extensions = await db.query(`
      SELECT de.*, u1.name as requested_by_name, u2.name as approved_by_name
      FROM deadline_extensions de
      LEFT JOIN users u1 ON de.requested_by = u1.id
      LEFT JOIN users u2 ON de.approved_by = u2.id
      WHERE de.task_id = $1 ORDER BY de.created_at DESC
    `, [req.params.id]);

    res.json({ task: result.rows[0], history: history.rows, extensions: extensions.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create task
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, description, assigned_to, deadline, priority = 'medium' } = req.body;
    if (!title || !deadline) return res.status(400).json({ error: 'Title and deadline required' });

    const result = await db.query(
      'INSERT INTO tasks (title, description, assigned_to, created_by, deadline, priority) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [title, description, assigned_to, req.user.id, deadline, priority]
    );
    const task = result.rows[0];
    await logHistory(task.id, 'created', req.user.id, `Task created: ${title}`);
    
    // Broadcast task creation
    broadcastTaskUpdate(req, 'created', task.id, task);
    
    res.status(201).json({ task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update task
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { title, description, assigned_to, status, deadline, priority } = req.body;
    console.log('DEBUG: Update request for task', req.params.id, { title, description, assigned_to, status, deadline, priority, userRole: req.user.role, userId: req.user.id });
    
    const existing = await db.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Task not found' });
    const old = existing.rows[0];
    console.log('DEBUG: Current task state:', { title: old.title, status: old.status, deadline: old.deadline });

    // PERMISSION LOGIC:
    // - Users can change: title, description, status, priority, assigned_to (UNLIMITED TIMES)
    // - Users can change: deadline (ONCE ONLY per task)
    // - Admins can change: ALL fields (UNLIMITED TIMES)
    
    // Check if user is trying to change deadline
    // Only treat as a deadline change if:
    // 1. A new deadline value is provided
    // 2. It's different from the current deadline
    // 3. The user is NOT an admin
    const deadlineChanged = deadline && String(deadline).trim() !== String(old.deadline).trim();
    console.log('DEBUG: Deadline change check:', { 
      isProvidingDeadline: !!deadline, 
      currentDeadline: old.deadline, 
      newDeadline: deadline,
      deadlineChanged, 
      isAdmin: req.user.role === 'admin'
    });
    
    if (deadlineChanged && req.user.role !== 'admin') {
      // Non-admins can only change deadline ONCE
      // Check if deadline has already been changed by this user
      const deadlineChanges = await db.query(
        `SELECT COUNT(*) as count FROM task_history 
         WHERE task_id = $1 AND action_type = 'deadline_changed' AND user_id = $2`,
        [req.params.id, req.user.id]
      );
      
      const changeCount = parseInt(deadlineChanges.rows[0].count);
      console.log(`DEBUG: User ${req.user.id} deadline changes for task ${req.params.id}: ${changeCount}`);
      
      if (changeCount > 0) {
        console.log('DEBUG: Blocking deadline change - user already changed it once');
        return res.status(403).json({ error: 'You have already changed the deadline once. Contact admin to change it again.' });
      }
    }

    const result = await db.query(
      'UPDATE tasks SET title=$1, description=$2, assigned_to=$3, status=$4, priority=$5, deadline=$6 WHERE id=$7 RETURNING *',
      [title || old.title, description ?? old.description, assigned_to || old.assigned_to, status || old.status, priority || old.priority, deadline || old.deadline, req.params.id]
    );
    console.log('DEBUG: Task updated successfully. New state:', { title: result.rows[0].title, status: result.rows[0].status, deadline: result.rows[0].deadline });

    if (assigned_to && assigned_to !== old.assigned_to) {
      await logHistory(req.params.id, 'reassigned', req.user.id, `Reassigned task`, old.assigned_to, assigned_to);
    }
    if (status && status !== old.status) {
      console.log('DEBUG: Logging status change:', { from: old.status, to: status });
      await logHistory(req.params.id, 'status_changed', req.user.id, `Status: ${old.status} → ${status}`, old.status, status);
    }
    if (deadlineChanged) {
      console.log('DEBUG: Logging deadline change:', { from: old.deadline, to: deadline });
      await logHistory(req.params.id, 'deadline_changed', req.user.id, `Deadline changed`, old.deadline, deadline);
    }

    // Broadcast task update
    broadcastTaskUpdate(req, 'updated', req.params.id, result.rows[0]);
    
    res.json({ task: result.rows[0] });
  } catch (err) {
    console.error('ERROR in task update:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark complete
router.put('/:id/complete', authenticate, async (req, res) => {
  try {
    const result = await db.query('UPDATE tasks SET status = $1 WHERE id = $2 RETURNING *', ['completed', req.params.id]);
    await logHistory(req.params.id, 'completed', req.user.id, 'Task marked as completed');
    
    // Broadcast task completion
    broadcastTaskUpdate(req, 'completed', req.params.id, result.rows[0]);
    
    res.json({ message: 'Task marked complete', task: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin confirm completion
router.put('/:id/confirm', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'UPDATE tasks SET completion_confirmed=true, completion_confirmed_by=$1, completion_confirmed_at=NOW(), status=$2 WHERE id=$3 RETURNING *',
      [req.user.id, 'archived', req.params.id]
    );
    await logHistory(req.params.id, 'confirmed', req.user.id, 'Completion confirmed by admin');
    
    // Broadcast task confirmation
    broadcastTaskUpdate(req, 'confirmed', req.params.id, result.rows[0]);
    
    res.json({ message: 'Task confirmed and archived', task: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Request extension
router.post('/:id/extension', authenticate, async (req, res) => {
  try {
    const { new_deadline, reason } = req.body;
    const task = await db.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!task.rows[0]) return res.status(404).json({ error: 'Task not found' });

    const result = await db.query(
      'INSERT INTO deadline_extensions (task_id, requested_by, previous_deadline, new_deadline, reason) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.id, req.user.id, task.rows[0].extended_deadline || task.rows[0].deadline, new_deadline, reason]
    );
    await logHistory(req.params.id, 'extension_requested', req.user.id, `Extension requested to ${new_deadline}`);
    
    // Broadcast extension request
    const io = req.app.locals.io;
    if (io) {
      io.emit('extension:requested', {
        taskId: req.params.id,
        extension: result.rows[0],
        requestedBy: req.user.name,
        timestamp: new Date()
      });
    }
    
    res.status(201).json({ extension: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: approve/reject extension
router.put('/extensions/:extId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { approval_status } = req.body;
    const ext = await db.query('SELECT * FROM deadline_extensions WHERE id = $1', [req.params.extId]);
    if (!ext.rows[0]) return res.status(404).json({ error: 'Extension not found' });

    await db.query(
      'UPDATE deadline_extensions SET approval_status=$1, approved_by=$2, approved_at=NOW() WHERE id=$3',
      [approval_status, req.user.id, req.params.extId]
    );

    if (approval_status === 'approved') {
      const taskResult = await db.query('UPDATE tasks SET extended_deadline=$1 WHERE id=$2 RETURNING *', [ext.rows[0].new_deadline, ext.rows[0].task_id]);
      await logHistory(ext.rows[0].task_id, 'extension_approved', req.user.id, `Extension approved to ${ext.rows[0].new_deadline}`);
      
      // Broadcast extension approval
      const io = req.app.locals.io;
      if (io) {
        io.emit('extension:approved', {
          taskId: ext.rows[0].task_id,
          newDeadline: ext.rows[0].new_deadline,
          approvedBy: req.user.name,
          task: taskResult.rows[0],
          timestamp: new Date()
        });
      }
    } else {
      await logHistory(ext.rows[0].task_id, 'extension_rejected', req.user.id, 'Extension rejected');
      
      // Broadcast extension rejection
      const io = req.app.locals.io;
      if (io) {
        io.emit('extension:rejected', {
          taskId: ext.rows[0].task_id,
          rejectedBy: req.user.name,
          timestamp: new Date()
        });
      }
    }

    res.json({ message: `Extension ${approval_status}` });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete task (admin)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    
    // Broadcast task deletion
    const io = req.app.locals.io;
    if (io) {
      io.emit('task:deleted', {
        taskId: req.params.id,
        deletedBy: req.user.name,
        timestamp: new Date()
      });
    }
    
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
