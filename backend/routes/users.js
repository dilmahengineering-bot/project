const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Get all users (admin sees all, users see active list for task assignment)
router.get('/', authenticate, async (req, res) => {
  try {
    const query = req.user.role === 'admin'
      ? 'SELECT id, name, email, role, avatar_color, is_active, created_at FROM users ORDER BY created_at DESC'
      : 'SELECT id, name, email, role, avatar_color FROM users WHERE is_active = true ORDER BY name';
    const result = await db.query(query);
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

    const hashed = await bcrypt.hash(password, 12);
    const result = await db.query(
      'INSERT INTO users (name, email, password, role, avatar_color) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, avatar_color, created_at',
      [name, email.toLowerCase(), hashed, role, avatar_color]
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
    const { name, email, role, avatar_color, is_active } = req.body;
    const result = await db.query(
      'UPDATE users SET name=$1, email=$2, role=$3, avatar_color=$4, is_active=$5 WHERE id=$6 RETURNING id, name, email, role, avatar_color, is_active',
      [name, email, role, avatar_color, is_active, req.params.id]
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

// Reset password (admin only)
router.put('/:id/reset-password', authenticate, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    const hashed = await bcrypt.hash(newPassword, 12);
    await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, req.params.id]);
    res.json({ message: 'Password reset' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
