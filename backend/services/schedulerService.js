const schedule = require('node-schedule');
const db = require('../db');
const whatsappService = require('./whatsappServiceWhapi'); // Using Whapi.Cloud

let scheduledJobs = {};

/**
 * Start scheduler for daily dashboard summaries
 * Sends at 7 AM and 7 PM for each user who has WhatsApp enabled
 */
async function startDashboardScheduler() {
  try {
    console.log('🕐 Starting WhatsApp Dashboard Scheduler...');

    // Schedule 7 AM summary (every day at 7:00 AM)
    scheduledJobs.morning = schedule.scheduleJob('0 7 * * *', async () => {
      console.log('📨 Sending 7 AM dashboard summaries...');
      await sendDailySummariesToAll('morning');
    });

    // Schedule 7 PM summary (every day at 7:00 PM)
    scheduledJobs.evening = schedule.scheduleJob('0 19 * * *', async () => {
      console.log('📨 Sending 7 PM dashboard summaries...');
      await sendDailySummariesToAll('evening');
    });

    console.log('✅ Dashboard scheduler started');
    console.log('   - Morning summary: 7:00 AM');
    console.log('   - Evening summary: 7:00 PM');
  } catch (error) {
    console.error('❌ Error starting dashboard scheduler:', error);
  }
}

/**
 * Send dashboard summary to all users with WhatsApp enabled
 * @param {string} timeOfDay - 'morning' or 'evening'
 */
async function sendDailySummariesToAll(timeOfDay = 'morning') {
  try {
    // Get all active users with phone numbers and WhatsApp enabled
    const usersResult = await db.query(
      `SELECT id, name, email, phone_number 
       FROM users 
       WHERE phone_number IS NOT NULL 
       AND phone_number != '' 
       AND is_active = true
       LIMIT 100`
    );

    if (usersResult.rows.length === 0) {
      console.log('📭 No users with phone numbers found');
      return;
    }

    console.log(`📤 Sending to ${usersResult.rows.length} users...`);

    for (const user of usersResult.rows) {
      try {
        // Fetch user's dashboard summary
        const summary = await getUserDashboardSummary(user.id);
        summary.userName = user.name;
        summary.time = timeOfDay === 'morning' ? '7:00 AM' : '7:00 PM';

        // Send WhatsApp using APPROVED template (bypasses 24-hour window restriction)
        // Template: dashboard_summary | SID: HXcf72251c358f71217ea2b4b34d9af5db
        const templateVariables = {
          1: String(summary.tasksCount || 0),
          2: String(summary.tasksCompleted || 0),
          3: String(summary.cncJobsCount || 0),
          4: String(summary.cncJobsActive || 0),
        };
        await whatsappService.sendWhatsAppTemplate(
          user.phone_number,
          'HXcf72251c358f71217ea2b4b34d9af5db', // ✅ APPROVED template SID
          templateVariables
        );

        // Log the message
        await db.query(
          `INSERT INTO whatsapp_logs 
           (user_id, phone_number, message_type, status, sent_at) 
           VALUES ($1, $2, $3, $4, NOW())`,
          [user.id, user.phone_number, `summary_${timeOfDay}`, 'sent']
        );

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`❌ Error sending to ${user.name} (${user.phone_number}):`, error.message);
      }
    }

    console.log('✅ Daily summaries sent');
  } catch (error) {
    console.error('❌ Error in sendDailySummariesToAll:', error);
  }
}

/**
 * Get dashboard summary for a user
 * @param {string} userId - User ID
 * @returns {Object} - Dashboard summary
 */
async function getUserDashboardSummary(userId) {
  try {
    // Get tasks assigned to user
    const tasksResult = await db.query(
      `SELECT id, status, deadline 
       FROM tasks 
       WHERE assigned_to = $1 OR created_by = $1`,
      [userId]
    );

    const tasks = tasksResult.rows || [];
    const now = new Date();

    const tasksOverdue = tasks.filter(t => t.status !== 'completed' && new Date(t.deadline) < now).length;
    const tasksDueToday = tasks.filter(t => t.status !== 'completed' && new Date(t.deadline).toDateString() === now.toDateString()).length;
    const tasksDueSoon = tasks.filter(t => {
      const daysUntil = (new Date(t.deadline) - now) / (1000 * 60 * 60 * 24);
      return t.status !== 'completed' && daysUntil > 0 && daysUntil <= 5;
    }).length;
    const tasksCompleted = tasks.filter(t => t.status === 'completed').length;

    // Get CNC jobs (if accessible)
    const cncJobsResult = await db.query(
      `SELECT id, status, estimate_end_date 
       FROM cnc_job_cards 
       LIMIT 100`,
      []
    );

    const cncJobs = cncJobsResult.rows || [];
    const cncJobsActive = cncJobs.filter(j => j.status === 'active').length;
    const cncJobsCompleted = cncJobs.filter(j => j.status === 'completed').length;
    const cncJobsOverdue = cncJobs.filter(j => j.status !== 'completed' && new Date(j.estimate_end_date) < now).length;

    return {
      tasksCount: tasks.length,
      tasksOverdue,
      tasksDueToday,
      tasksDueSoon,
      tasksCompleted,
      cncJobsCount: cncJobs.length,
      cncJobsActive,
      cncJobsCompleted,
      cncJobsOverdue,
    };
  } catch (error) {
    console.error('Error getting user dashboard summary:', error);
    return {
      tasksCount: 0,
      tasksOverdue: 0,
      tasksDueToday: 0,
      tasksDueSoon: 0,
      tasksCompleted: 0,
      cncJobsCount: 0,
      cncJobsActive: 0,
      cncJobsCompleted: 0,
      cncJobsOverdue: 0,
    };
  }
}

/**
 * Stop all scheduled jobs
 */
function stopScheduler() {
  try {
    if (scheduledJobs.morning) scheduledJobs.morning.cancel();
    if (scheduledJobs.evening) scheduledJobs.evening.cancel();
    console.log('❌ Dashboard scheduler stopped');
  } catch (error) {
    console.error('Error stopping scheduler:', error);
  }
}

/**
 * Send test dashboard summary (for testing purposes)
 * @param {string} userId - User ID to test
 */
async function sendTestSummary(userId) {
  try {
    const userResult = await db.query(
      'SELECT id, name, phone_number FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return { error: 'User not found' };
    }

    const user = userResult.rows[0];
    if (!user.phone_number) {
      return { error: 'User has no phone number' };
    }

    const summary = await getUserDashboardSummary(userId);
    summary.userName = user.name;
    summary.time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const result = await whatsappService.sendDashboardSummary(user.phone_number, summary);

    // Log the test message
    await db.query(
      `INSERT INTO whatsapp_logs 
       (user_id, phone_number, message_type, status, sent_at) 
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, user.phone_number, 'summary_test', result.success ? 'sent' : 'failed']
    );

    return result;
  } catch (error) {
    console.error('Error sending test summary:', error);
    return { error: error.message };
  }
}

module.exports = {
  startDashboardScheduler,
  stopScheduler,
  sendDailySummariesToAll,
  getUserDashboardSummary,
  sendTestSummary,
};
