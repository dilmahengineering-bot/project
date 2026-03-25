require('dotenv').config();
const db = require('./db');

async function showPersonalizedDashboards() {
  try {
    console.log('\n📊 PERSONALIZED DASHBOARD SUMMARIES FOR ALL USERS\n');
    console.log('='.repeat(70));

    // Get all users with phones
    const usersResult = await db.query(
      'SELECT id, name, email, phone_number FROM users WHERE phone_number IS NOT NULL ORDER BY name'
    );

    if (usersResult.rows.length === 0) {
      console.log('⚠️ No users with phones found');
      process.exit(1);
    }

    for (const user of usersResult.rows) {
      console.log(`\n👤 ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Phone: ${user.phone_number}`);
      console.log('   ' + '─'.repeat(50));

      try {
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

        const taskStats = tasksResult.rows[0] || { 
          total: 0, completed: 0, in_progress: 0, pending: 0 
        };
        
        const completionRate = taskStats.total > 0 
          ? Math.round((parseInt(taskStats.completed) / parseInt(taskStats.total)) * 100)
          : 0;

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

        // Get overdue tasks
        let overdueCount = 0;
        try {
          const overdueResult = await db.query(
            `SELECT COUNT(*) as count FROM tasks 
             WHERE assigned_to = $1 
             AND due_date < NOW() 
             AND status != 'completed'`,
            [user.id]
          );
          overdueCount = overdueResult.rows[0]?.count || 0;
        } catch (err) {
          // Column might not exist
        }

        // Get due soon (next 3 days)
        let dueSoonCount = 0;
        try {
          const dueSoonResult = await db.query(
            `SELECT COUNT(*) as count FROM tasks 
             WHERE assigned_to = $1 
             AND due_date >= NOW() 
             AND due_date <= NOW() + INTERVAL '3 days'
             AND status != 'completed'`,
            [user.id]
          );
          dueSoonCount = dueSoonResult.rows[0]?.count || 0;
        } catch (err) {
          // Column might not exist
        }

        // Display dashboard
        console.log(`\n   ⚠️ URGENT ALERTS:`);
        if (overdueCount > 0) {
          console.log(`      🔴 OVERDUE: ${overdueCount} task(s) past due date!`);
        } else {
          console.log(`      ✅ No overdue tasks`);
        }
        
        if (dueSoonCount > 0) {
          console.log(`      🟡 DUE SOON: ${dueSoonCount} task(s) due in next 3 days`);
        } else {
          console.log(`      ✅ No tasks due soon`);
        }

        console.log(`\n   📋 TASKS:`);
        console.log(`      Total: ${parseInt(taskStats.total) || 0}`);
        console.log(`      ✅ Completed: ${parseInt(taskStats.completed) || 0}`);
        console.log(`      🔄 In Progress: ${parseInt(taskStats.in_progress) || 0}`);
        console.log(`      ⏳ Pending: ${parseInt(taskStats.pending) || 0}`);
        console.log(`      📈 Completion Rate: ${completionRate}%`);

        console.log(`\n   ⚙️ CNC JOBS:`);
        console.log(`      Total: ${parseInt(cncStats.total) || 0}`);
        console.log(`      ✅ Completed: ${parseInt(cncStats.completed) || 0}`);
        console.log(`      🟢 Active: ${parseInt(cncStats.active) || 0}`);
        console.log(`      ⏳ Pending: ${parseInt(cncStats.pending) || 0}`);

        console.log(`\n   📈 PERFORMANCE:`);
        if (completionRate >= 75) {
          console.log(`      🌟 Excellent task completion!`);
        } else if (completionRate >= 50) {
          console.log(`      👍 Good progress on tasks`);
        } else {
          console.log(`      ⚡ Keep working on tasks!`);
        }

        // Show what message will say
        const message = `📊 *Detailed Dashboard Summary for ${user.name}*
${new Date().toLocaleString()}

*⚠️ URGENT ALERTS:*
${overdueCount > 0 ? `🔴 OVERDUE: ${overdueCount} task(s) past due date!` : '✅ No overdue tasks'}
${dueSoonCount > 0 ? `🟡 DUE SOON: ${dueSoonCount} task(s) due in next 3 days` : '✅ No tasks due soon'}

*📋 Your Tasks:*
Total: ${parseInt(taskStats.total) || 0}
✅ Completed: ${parseInt(taskStats.completed) || 0}
🔄 In Progress: ${parseInt(taskStats.in_progress) || 0}
⏳ Pending: ${parseInt(taskStats.pending) || 0}
Completion Rate: ${completionRate}%

*⚙️ CNC Jobs:*
Total: ${parseInt(cncStats.total) || 0}
✅ Completed: ${parseInt(cncStats.completed) || 0}
🟢 Active: ${parseInt(cncStats.active) || 0}
⏳ Pending: ${parseInt(cncStats.pending) || 0}

*📈 Performance Summary:*
${completionRate >= 75 ? '🌟 Excellent task completion!' : completionRate >= 50 ? '👍 Good progress on tasks' : '⚡ Keep working on tasks!'}

Have a productive day! 💪`;

        console.log(`\n   📱 WHATSAPP MESSAGE PREVIEW:`);
        console.log(`   ${'-'.repeat(50)}`);
        message.split('\n').forEach(line => {
          console.log(`      ${line}`);
        });
        console.log(`   ${'-'.repeat(50)}`);

      } catch (err) {
        console.log(`   ❌ Error fetching data: ${err.message}`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log(`\n✅ All ${usersResult.rows.length} users have personalized dashboards ready!`);
    console.log('\n💡 These summaries will be sent:');
    console.log(`   - Automatically at 7:00 AM UTC`);
    console.log(`   - Automatically at 7:00 PM UTC`);
    console.log(`   - Manually via Admin panel "Send Summary" button\n`);

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

showPersonalizedDashboards();
