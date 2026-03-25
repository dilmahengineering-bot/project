const express = require('express');
const router = express.Router();
const db = require('../db');
const whatsappService = require('../services/whatsappServiceWhapi'); // Using Whapi.Cloud
const schedulerService = require('../services/schedulerService');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * Get user's WhatsApp phone number
 */
router.get('/phone', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT phone_number FROM users WHERE id = $1',
      [req.user.id]
    );
    
    const user = result.rows[0] || {};
    res.json({ phone_number: user.phone_number || null });
  } catch (error) {
    console.error('Error fetching phone number:', error);
    res.status(500).json({ error: 'Failed to fetch phone number' });
  }
});

/**
 * Update user's WhatsApp phone number
 */
router.post('/phone', authenticate, async (req, res) => {
  try {
    const { phone_number } = req.body;

    // Validate phone format
    if (phone_number && !phone_number.startsWith('+')) {
      return res.status(400).json({ error: 'Phone number must start with + (e.g., +1234567890)' });
    }

    // Update in database
    await db.query(
      'UPDATE users SET phone_number = $1, phone_verified = false WHERE id = $2',
      [phone_number || null, req.user.id]
    );

    res.json({ success: true, message: 'Phone number updated', phone_number });
  } catch (error) {
    console.error('Error updating phone number:', error);
    res.status(500).json({ error: 'Failed to update phone number' });
  }
});

/**
 * Send test WhatsApp message to user
 */
router.post('/test-message', authenticate, async (req, res) => {
  try {
    const userResult = await db.query(
      'SELECT id, phone_number, name FROM users WHERE id = $1',
      [req.user.id]
    );

    const user = userResult.rows[0];
    if (!user || !user.phone_number) {
      return res.status(400).json({ error: 'No phone number set for your account' });
    }

    // Send using template (works with Whapi.Cloud too)
    const templateVariables = {
      1: '5',    // Total tasks
      2: '3',    // Completed tasks
      3: '2',    // Total CNC jobs
      4: '1',    // Active CNC jobs
    };
    
    const result = await whatsappService.sendWhatsAppTemplate(
      user.phone_number,
      'HXcf72251c358f71217ea2b4b34d9af5db', // Template SID (ignored by Whapi.Cloud)
      templateVariables
    );

    if (result.success) {
      // Log the message
      await db.query(
        `INSERT INTO whatsapp_logs 
         (user_id, phone_number, message_type, status, twilio_sid) 
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.id, user.phone_number, 'test_dashboard', 'sent', result.sid || null]
      );
    }

    res.json(result);
  } catch (error) {
    console.error('Error sending test message:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Send test dashboard summary
 */
router.post('/test-summary', authenticate, async (req, res) => {
  try {
    const result = await schedulerService.sendTestSummary(req.user.id);
    res.json(result);
  } catch (error) {
    console.error('Error sending test summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get WhatsApp message logs for current user
 */
router.get('/logs', authenticate, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;

    const result = await db.query(
      `SELECT id, message_type, status, error_message, sent_at 
       FROM whatsapp_logs 
       WHERE user_id = $1 
       ORDER BY sent_at DESC 
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    res.json({ logs: result.rows });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

/**
 * Admin: Send dashboard summary to specific user
 */
router.post('/admin/send-summary/:userId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await schedulerService.sendTestSummary(userId);
    res.json(result);
  } catch (error) {
    console.error('Error sending summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Admin: Send dashboard summaries to all users
 */
router.post('/admin/send-all-summaries', authenticate, requireAdmin, async (req, res) => {
  try {
    const { timeOfDay = 'morning' } = req.body;

    // Run in background
    schedulerService.sendDailySummariesToAll(timeOfDay);

    res.json({
      success: true,
      message: `Starting to send ${timeOfDay} summaries to all users...`
    });
  } catch (error) {
    console.error('Error initiating summaries:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Admin: Get all WhatsApp logs
 */
router.get('/admin/logs', authenticate, requireAdmin, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;

    const result = await db.query(
      `SELECT l.id, l.user_id, u.name, u.email, l.phone_number, 
              l.message_type, l.status, l.error_message, l.sent_at 
       FROM whatsapp_logs l
       JOIN users u ON l.user_id = u.id
       ORDER BY l.sent_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ logs: result.rows });
  } catch (error) {
    console.error('Error fetching admin logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

module.exports = router;
