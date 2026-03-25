require('dotenv').config();
const db = require('./db');

async function testPersonalizedSummaries() {
  try {
    console.log('\n🧪 Testing Personalized Summaries for Each User\n');
    console.log('==============================================\n');

    // Get all users with phones
    const usersResult = await db.query(
      'SELECT id, name, phone_number FROM users WHERE phone_number IS NOT NULL ORDER BY name'
    );

    if (usersResult.rows.length === 0) {
      console.log('⚠️ No users with phones found');
      process.exit(1);
    }

    for (const user of usersResult.rows) {
      console.log(`👤 ${user.name} (${user.phone_number})`);
      console.log('─'.repeat(50));

      // Get user's tasks
      const tasksResult = await db.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
         FROM tasks 
         WHERE assigned_to = $1`,
        [user.id]
      );

      const taskStats = tasksResult.rows[0] || { total: 0, completed: 0, in_progress: 0, pending: 0 };

      // Get user's CNC jobs
      let cncStats = { total: 0, completed: 0, active: 0, pending: 0 };
      try {
        const cncResult = await db.query(
          `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
           FROM cnc_job_cards 
           WHERE assigned_to = $1`,
          [user.id]
        );
        cncStats = cncResult.rows[0] || cncStats;
      } catch (err) {
        // Table might not exist
      }

      // Build message
      const message = `📊 *Dashboard Summary for ${user.name}*

*📋 Your Tasks:*
Total: ${parseInt(taskStats.total) || 0}
✅ Completed: ${parseInt(taskStats.completed) || 0}
🔄 In Progress: ${parseInt(taskStats.in_progress) || 0}
⏳ Pending: ${parseInt(taskStats.pending) || 0}
Completion Rate: ${taskStats.total > 0 ? Math.round((parseInt(taskStats.completed) / parseInt(taskStats.total)) * 100) : 0}%

*⚙️ CNC Jobs:*
Total: ${parseInt(cncStats.total) || 0}
✅ Completed: ${parseInt(cncStats.completed) || 0}
🟢 Active: ${parseInt(cncStats.active) || 0}
⏳ Pending: ${parseInt(cncStats.pending) || 0}

Have a productive day! 💪`;

      console.log(message);
      console.log('');
    }

    console.log('✅ All users have personalized summaries ready!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testPersonalizedSummaries();
