const express = require('express');
const db = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Get overall system summary (admin only)
router.get('/system-summary', authenticate, requireAdmin, async (req, res) => {
  try {
    // Get user statistics
    const usersResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
        SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as users,
        SUM(CASE WHEN role = 'guest' THEN 1 ELSE 0 END) as guests,
        SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN phone_number IS NOT NULL THEN 1 ELSE 0 END) as with_phone
      FROM users
    `);

    // Get task statistics
    const tasksResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN priority = 'High' THEN 1 ELSE 0 END) as high_priority
      FROM tasks
    `);

    // Get CNC job statistics
    let cncStatistics = {
      total: 0,
      completed: 0,
      active: 0,
      pending: 0,
      high_priority: 0
    };

    try {
      const cncResult = await db.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN priority = 'High' THEN 1 ELSE 0 END) as high_priority
        FROM cnc_jobs
      `);

      if (cncResult.rows[0]) {
        cncStatistics = {
          total: parseInt(cncResult.rows[0].total) || 0,
          completed: parseInt(cncResult.rows[0].completed) || 0,
          active: parseInt(cncResult.rows[0].active) || 0,
          pending: parseInt(cncResult.rows[0].pending) || 0,
          high_priority: parseInt(cncResult.rows[0].high_priority) || 0
        };
      }
    } catch (err) {
      console.warn('CNC jobs table may not exist:', err.message);
    }

    // Get workflow statistics
    let workflowStatistics = { total: 0, active: 0, inactive: 0 };

    try {
      const workflowResult = await db.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN is_active = false THEN 1 ELSE 0 END) as inactive
        FROM workflows
      `);

      if (workflowResult.rows[0]) {
        workflowStatistics = {
          total: parseInt(workflowResult.rows[0].total) || 0,
          active: parseInt(workflowResult.rows[0].active) || 0,
          inactive: parseInt(workflowResult.rows[0].inactive) || 0
        };
      }
    } catch (err) {
      console.warn('Workflows table may not exist:', err.message);
    }

    // Get WhatsApp notification statistics
    let whatsappStatistics = { total: 0, sent: 0, failed: 0, pending_users: 0 };

    try {
      const whatsappResult = await db.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN status IS NULL OR status != 'sent' THEN 1 ELSE 0 END) as failed
        FROM whatsapp_logs
        WHERE sent_at >= NOW() - INTERVAL '24 hours'
      `);

      if (whatsappResult.rows[0]) {
        whatsappStatistics.total = parseInt(whatsappResult.rows[0].total) || 0;
        whatsappStatistics.sent = parseInt(whatsappResult.rows[0].sent) || 0;
        whatsappStatistics.failed = parseInt(whatsappResult.rows[0].failed) || 0;
      }

      // Count users without phone numbers
      const noPhoneResult = await db.query(`
        SELECT COUNT(*) as pending FROM users WHERE phone_number IS NULL AND role != 'guest'
      `);
      whatsappStatistics.pending_users = parseInt(noPhoneResult.rows[0]?.pending) || 0;
    } catch (err) {
      console.warn('WhatsApp logs table may not exist:', err.message);
    }

    // Get system health metrics
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();

    // Get recent activity
    const recentActivityResult = await db.query(`
      SELECT 
        'task' as type, id, title as name, status, updated_at 
      FROM tasks 
      ORDER BY updated_at DESC 
      LIMIT 5
    `);

    const systemSummary = {
      timestamp: new Date(),
      users: {
        total: parseInt(usersResult.rows[0].total) || 0,
        admins: parseInt(usersResult.rows[0].admins) || 0,
        users: parseInt(usersResult.rows[0].users) || 0,
        guests: parseInt(usersResult.rows[0].guests) || 0,
        active: parseInt(usersResult.rows[0].active) || 0,
        with_phone: parseInt(usersResult.rows[0].with_phone) || 0
      },
      tasks: {
        total: parseInt(tasksResult.rows[0].total) || 0,
        completed: parseInt(tasksResult.rows[0].completed) || 0,
        in_progress: parseInt(tasksResult.rows[0].in_progress) || 0,
        pending: parseInt(tasksResult.rows[0].pending) || 0,
        high_priority: parseInt(tasksResult.rows[0].high_priority) || 0,
        completion_rate: tasksResult.rows[0].total ? 
          Math.round((parseInt(tasksResult.rows[0].completed) / parseInt(tasksResult.rows[0].total)) * 100) : 0
      },
      cnc_jobs: cncStatistics,
      workflows: workflowStatistics,
      whatsapp: whatsappStatistics,
      system_health: {
        uptime_seconds: Math.floor(uptime),
        memory_usage_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        memory_limit_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
        database: 'connected'
      }
    };

    res.json(systemSummary);
  } catch (err) {
    console.error('Error fetching system summary:', err);
    res.status(500).json({ error: 'Failed to fetch system summary: ' + err.message });
  }
});

module.exports = router;
