const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Get all users (admin sees all, users see active list for task assignment)
router.get('/', authenticate, async (req, res) => {
  try {
    // For user role, ensure they have kanban_order set
    if (req.user.role !== 'admin') {
      await db.query(`
        UPDATE users 
        SET kanban_order = (SELECT COUNT(*) FROM users u2 WHERE u2.role = 'user' AND u2.created_at <= users.created_at) - 1
        WHERE role = 'user' AND kanban_order = 0
      `);
    }
    
    const query = req.user.role === 'admin'
      ? 'SELECT id, name, email, role, avatar_color, is_active, kanban_order, created_at FROM users ORDER BY created_at DESC'
      : 'SELECT id, name, email, role, avatar_color, kanban_order FROM users WHERE is_active = true AND role = $1 ORDER BY kanban_order ASC, name';
    const params = req.user.role === 'admin' ? [] : ['user'];
    const result = await db.query(query, params);
    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create user (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role = 'user', avatar_color = '#6366f1' } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });

    const exists = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (exists.rows[0]) return res.status(400).json({ error: 'Email already exists' });

    // Get next kanban_order for user role
    const orderResult = await db.query(
      'SELECT COALESCE(MAX(kanban_order), 0) + 1 as next_order FROM users WHERE role = $1',
      [role]
    );
    const nextOrder = orderResult.rows[0].next_order;

    const hashed = await bcrypt.hash(password, 12);
    const result = await db.query(
      'INSERT INTO users (name, email, password, role, avatar_color, kanban_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, role, avatar_color, kanban_order, created_at',
      [name, email.toLowerCase(), hashed, role, avatar_color, nextOrder]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user (admin only)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, email, role, avatar_color, is_active, kanban_order } = req.body;
    const result = await db.query(
      'UPDATE users SET name=$1, email=$2, role=$3, avatar_color=$4, is_active=$5, kanban_order=$6 WHERE id=$7 RETURNING id, name, email, role, avatar_color, is_active, kanban_order',
      [name, email, role, avatar_color, is_active, kanban_order, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'User deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset password (admin only) - resets to default: Admin@123
router.put('/:id/reset-password', authenticate, requireAdmin, async (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot reset your own password from here' });
    const user = await db.query('SELECT id, name FROM users WHERE id = $1', [req.params.id]);
    if (!user.rows[0]) return res.status(404).json({ error: 'User not found' });
    const defaultPassword = 'Admin@123';
    const hashed = await bcrypt.hash(defaultPassword, 12);
    await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, req.params.id]);
    res.json({ message: `Password reset to default for ${user.rows[0].name}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update kanban order (admin only)
router.post('/kanban-order/update', authenticate, requireAdmin, async (req, res) => {
  try {
    const { users } = req.body;
    if (!Array.isArray(users)) return res.status(400).json({ error: 'Users array required' });

    // Update kanban_order for all users
    for (let i = 0; i < users.length; i++) {
      await db.query('UPDATE users SET kanban_order = $1 WHERE id = $2', [i, users[i].id]);
    }

    res.json({ message: 'Kanban order updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
