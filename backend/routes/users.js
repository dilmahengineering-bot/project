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

/**
 * Get all users with their phone numbers (admin only)
 */
router.get('/phone-numbers/all', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, email, role, phone_number, phone_verified FROM users ORDER BY name ASC'
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Update user phone number (admin only)
 */
router.post('/:userId/phone-number', authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { phone_number } = req.body;

    if (!phone_number) {
      return res.status(400).json({ error: 'Phone number required' });
    }

    // Validate phone format
    if (!phone_number.startsWith('+')) {
      return res.status(400).json({ error: 'Phone number must start with + (e.g., +1234567890)' });
    }

    // Check if phone already exists
    const existing = await db.query(
      'SELECT id FROM users WHERE phone_number = $1 AND id != $2',
      [phone_number, userId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Phone number already assigned to another user' });
    }

    // Update phone number
    const result = await db.query(
      'UPDATE users SET phone_number = $1, phone_verified = false WHERE id = $2 RETURNING id, name, phone_number',
      [phone_number, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      message: 'Phone number updated', 
      user: result.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Update multiple user phone numbers (admin bulk update)
 */
router.post('/phone-numbers/bulk-update', authenticate, requireAdmin, async (req, res) => {
  try {
    const { updates } = req.body;

    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'Updates array required' });
    }

    const results = [];
    const errors = [];

    for (const update of updates) {
      try {
        const { userId, phone_number } = update;

        if (!phone_number || !phone_number.startsWith('+')) {
          errors.push({ userId, error: 'Invalid phone format' });
          continue;
        }

        const result = await db.query(
          'UPDATE users SET phone_number = $1, phone_verified = false WHERE id = $2 RETURNING id, name, phone_number',
          [phone_number, userId]
        );

        if (result.rows.length > 0) {
          results.push(result.rows[0]);
        } else {
          errors.push({ userId, error: 'User not found' });
        }
      } catch (err) {
        errors.push({ userId: update.userId, error: err.message });
      }
    }

    res.json({ 
      message: 'Bulk update completed',
      updated: results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send manual dashboard summary (admin only)
router.post('/:userId/send-summary', authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user and phone number
    const userResult = await db.query(
      'SELECT id, name, phone_number FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    if (!user.phone_number) {
      return res.status(400).json({ error: 'User does not have a phone number configured' });
    }

    // Get task statistics
    let taskStats = { total: 0, completed: 0, in_progress: 0, pending: 0 };
    try {
      const taskResult = await db.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
        FROM tasks 
        WHERE assigned_to = $1
      `, [userId]);

      if (taskResult.rows[0]) {
        taskStats = {
          total: parseInt(taskResult.rows[0].total) || 0,
          completed: parseInt(taskResult.rows[0].completed) || 0,
          in_progress: parseInt(taskResult.rows[0].in_progress) || 0,
          pending: parseInt(taskResult.rows[0].pending) || 0
        };
      }
    } catch (err) {
      console.error('Error fetching task stats:', err);
    }

    // Get CNC job statistics
    let cncStats = { total: 0, completed: 0, active: 0, pending: 0 };
    try {
      const cncResult = await db.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
        FROM cnc_job_cards 
        WHERE assigned_to = $1
      `, [userId]);

      if (cncResult.rows[0]) {
        cncStats = {
          total: parseInt(cncResult.rows[0].total) || 0,
          completed: parseInt(cncResult.rows[0].completed) || 0,
          active: parseInt(cncResult.rows[0].active) || 0,
          pending: parseInt(cncResult.rows[0].pending) || 0
        };
      }
    } catch (err) {
      console.error('Error fetching CNC stats:', err);
    }

    // Get overdue tasks
    let overdueCount = 0;
    try {
      const overdueResult = await db.query(
        `SELECT COUNT(*) as count FROM tasks 
         WHERE assigned_to = $1 
         AND due_date < NOW() 
         AND status != 'completed'`,
        [userId]
      );
      overdueCount = overdueResult.rows[0]?.count || 0;
    } catch (err) {
      // Column might not exist
    }

    // Get due soon (next 5 days)
    let dueSoonCount = 0;
    try {
      const dueSoonResult = await db.query(
        `SELECT COUNT(*) as count FROM tasks 
         WHERE assigned_to = $1 
         AND due_date >= NOW() 
         AND due_date <= NOW() + INTERVAL '5 days'
         AND status != 'completed'`,
        [userId]
      );
      dueSoonCount = dueSoonResult.rows[0]?.count || 0;
    } catch (err) {
      // Column might not exist
    }

    // Calculate completion rate
    const completionRate = taskStats.total > 0 
      ? Math.round((taskStats.completed / taskStats.total) * 100)
      : 0;

    // Format the summary message
    const summary = {
      userName: user.name,
      timestamp: new Date().toLocaleString(),
      tasks: taskStats,
      cncJobs: cncStats,
      completionRate: completionRate,
      alerts: {
        overdue: overdueCount,
        dueSoon5Days: dueSoonCount
      }
    };

    // Send via WhatsApp
    const whatsappService = require('../services/whatsappServiceWaSender');
    const message = `📊 *TaskFlow Detailed Dashboard Summary*

👤 User: ${user.name}
⏰ Manual Report • ${new Date().toLocaleString()}

📋 *TASKS OVERVIEW*
├ 📊 Total: ${taskStats.total}
├ ✅ Completed: ${taskStats.completed}
├ 🔄 In Progress: ${taskStats.in_progress}
└ ⏰ Pending: ${taskStats.pending}

🔧 *CNC JOBS STATUS*
├ 📊 Total: ${cncStats.total}
├ ✅ Completed: ${cncStats.completed}
├ ⚙️ Active: ${cncStats.active}
└ ⏳ Pending: ${cncStats.pending}

⚠️ *PRIORITY ALERTS*
${overdueCount > 0 ? `├ 🔴 *OVERDUE*: ${overdueCount} task(s) past due!` : '├ ✅ No overdue tasks'}
${dueSoonCount > 0 ? `├ 🟡 *DUE ≤ 5 DAYS*: ${dueSoonCount} task(s)` : '├ ✅ No urgent due dates'}
└ 📌 ${cncStats.active || 0} active CNC job(s)

📈 *PERFORMANCE METRICS*
├ Completion Rate: ${completionRate}%
├ Status: ${completionRate >= 75 ? '🌟' : completionRate >= 50 ? '👍' : '⚡'} ${completionRate >= 75 ? 'Excellent!' : completionRate >= 50 ? 'Good progress' : 'Keep working!'}
└ Efficiency: ${taskStats.in_progress > 0 ? '🔄 Active' : '✨ Ready'}

💡 *QUICK SUMMARY*
${taskStats.pending > 0 ? `• ${taskStats.pending} task(s) awaiting action
` : ''}${overdueCount > 0 ? `• ⚠️ ${overdueCount} overdue - needs attention!
` : ''}${dueSoonCount > 0 ? `• ⏰ ${dueSoonCount} due within 5 days
` : ''}Available: ${cncStats.pending || 0} CNC slot(s) ready

🔗 Log in to dashboard for full details
📱 Reply to confirm receipt`;

    const whatsappResult = await whatsappService.sendWhatsAppMessage(user.phone_number, message);

    // Log the manual send with actual status
    const logStatus = whatsappResult.success ? (whatsappResult.status || 'sent') : 'failed';
    const errorMsg = whatsappResult.success ? null : whatsappResult.reason;
    
    await db.query(`
      INSERT INTO whatsapp_logs (user_id, phone_number, message_type, status, error_message, sent_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [userId, user.phone_number, 'manual_summary', logStatus, errorMsg]);

    if (!whatsappResult.success) {
      throw new Error(whatsappResult.reason);
    }

    res.json({ 
      message: 'Summary sent successfully',
      user: { id: user.id, name: user.name, phone: user.phone_number },
      summary: summary,
      delivery: {
        status: whatsappResult.status,
        messageId: whatsappResult.sid
      }
    });
  } catch (err) {
    console.error('Error sending summary:', err);
    res.status(500).json({ error: 'Failed to send summary: ' + err.message });
  }
});

module.exports = router;
