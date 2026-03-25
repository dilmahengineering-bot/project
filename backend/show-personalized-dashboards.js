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
              SUM(CASE WHEN estimate_end_date IS NULL THEN 1 ELSE 0 END) as pending
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

        // Get due soon (next 5 days)
        let dueSoonCount = 0;
        try {
          const dueSoonResult = await db.query(
            `SELECT COUNT(*) as count FROM tasks 
             WHERE assigned_to = $1 
             AND due_date >= NOW() 
             AND due_date <= NOW() + INTERVAL '5 days'
             AND status != 'completed'`,
            [user.id]
          );
          dueSoonCount = dueSoonResult.rows[0]?.count || 0;
        } catch (err) {
          // Column might not exist
        }

        // Get overdue CNC jobs
        let cncOverdueCount = 0;
        try {
          const cncOverdueResult = await db.query(
            `SELECT COUNT(*) as count FROM cnc_job_cards 
             WHERE assigned_to = $1 
             AND estimate_end_date < NOW() 
             AND status != 'completed'`,
            [user.id]
          );
          cncOverdueCount = cncOverdueResult.rows[0]?.count || 0;
        } catch (err) {
          // Column might not exist
        }

        // Get CNC jobs due soon (next 5 days)
        let cncDueSoonCount = 0;
        try {
          const cncDueSoonResult = await db.query(
            `SELECT COUNT(*) as count FROM cnc_job_cards 
             WHERE assigned_to = $1 
             AND estimate_end_date >= NOW() 
             AND estimate_end_date <= NOW() + INTERVAL '5 days'
             AND status != 'completed'`,
            [user.id]
          );
          cncDueSoonCount = cncDueSoonResult.rows[0]?.count || 0;
        } catch (err) {
          // Column might not exist
        }

        // Display dashboard
        console.log(`\n   📊 TASKS OVERVIEW:`);
        console.log(`      Total Tasks: ${parseInt(taskStats.total) || 0}`);
        console.log(`      Pending: ${parseInt(taskStats.pending) || 0}`);
        console.log(`      In Progress: ${parseInt(taskStats.in_progress) || 0}`);
        console.log(`      Completed: ${parseInt(taskStats.completed) || 0}`);
        console.log(`      🔴 Overdue: ${overdueCount || 0}`);
        console.log(`      🟡 Due ≤ 5 Days: ${dueSoonCount || 0}`);

        console.log(`\n   🔧 CNC MANUFACTURING OVERVIEW:`);
        console.log(`      Active CNC Jobs: ${parseInt(cncStats.active) || 0}`);
        console.log(`      Completed: ${parseInt(cncStats.completed) || 0}`);
        console.log(`      🔴 Overdue: ${cncOverdueCount || 0}`);
        console.log(`      🟡 Due ≤ 5 Days: ${cncDueSoonCount || 0}`);
        console.log(`      No Deadline: ${parseInt(cncStats.pending) || 0}`);

        // Show what message will say
        const message = `📊 *TaskFlow Detailed Dashboard Summary*

👤 User: ${user.name}
⏰ Manual Report • ${new Date().toLocaleString()}

📊 TASKS OVERVIEW
├ Total Tasks: ${parseInt(taskStats.total) || 0}
├ Pending: ${parseInt(taskStats.pending) || 0}
├ In Progress: ${parseInt(taskStats.in_progress) || 0}
├ Completed: ${parseInt(taskStats.completed) || 0}
├ 🔴 Overdue: ${overdueCount || 0}
└ 🟡 Due ≤ 5 Days: ${dueSoonCount || 0}

🔧 CNC MANUFACTURING OVERVIEW
├ Active CNC Jobs: ${parseInt(cncStats.active) || 0}
├ Completed: ${parseInt(cncStats.completed) || 0}
├ 🔴 Overdue: ${cncOverdueCount || 0}
├ 🟡 Due ≤ 5 Days: ${cncDueSoonCount || 0}
└ No Deadline: ${parseInt(cncStats.pending) || 0}`;

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
