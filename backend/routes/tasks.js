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
    const existing = await db.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Task not found' });
    const old = existing.rows[0];

    // LOCKED DEADLINE: Users cannot modify deadline directly
    // They must request an extension instead
    if (deadline && deadline !== old.deadline) {
      return res.status(403).json({ error: 'Deadline is locked. Please request an extension if you need to change it.' });
    }

    const result = await db.query(
      'UPDATE tasks SET title=$1, description=$2, assigned_to=$3, status=$4, priority=$5 WHERE id=$6 RETURNING *',
      [title || old.title, description ?? old.description, assigned_to || old.assigned_to, status || old.status, priority || old.priority, req.params.id]
    );

    if (assigned_to && assigned_to !== old.assigned_to) {
      await logHistory(req.params.id, 'reassigned', req.user.id, `Reassigned task`, old.assigned_to, assigned_to);
    }
    if (status && status !== old.status) {
      await logHistory(req.params.id, 'status_changed', req.user.id, `Status: ${old.status} → ${status}`, old.status, status);
    }

    res.json({ task: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark complete
router.put('/:id/complete', authenticate, async (req, res) => {
  try {
    await db.query('UPDATE tasks SET status = $1 WHERE id = $2', ['completed', req.params.id]);
    await logHistory(req.params.id, 'completed', req.user.id, 'Task marked as completed');
    res.json({ message: 'Task marked complete' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin confirm completion
router.put('/:id/confirm', authenticate, requireAdmin, async (req, res) => {
  try {
    await db.query(
      'UPDATE tasks SET completion_confirmed=true, completion_confirmed_by=$1, completion_confirmed_at=NOW(), status=$2 WHERE id=$3',
      [req.user.id, 'archived', req.params.id]
    );
    await logHistory(req.params.id, 'confirmed', req.user.id, 'Completion confirmed by admin');
    res.json({ message: 'Task confirmed and archived' });
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
      await db.query('UPDATE tasks SET extended_deadline=$1 WHERE id=$2', [ext.rows[0].new_deadline, ext.rows[0].task_id]);
      await logHistory(ext.rows[0].task_id, 'extension_approved', req.user.id, `Extension approved to ${ext.rows[0].new_deadline}`);
    } else {
      await logHistory(ext.rows[0].task_id, 'extension_rejected', req.user.id, 'Extension rejected');
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
    res.json({ message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
