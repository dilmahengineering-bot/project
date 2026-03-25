require('dotenv').config();
const db = require('./db');
const whatsappService = require('./services/whatsappServiceWhapi');

async function sendDetailedSummaryToAllUsers() {
  try {
    console.log('\n📤 Sending Detailed Dashboard Summaries to All Users\n');
    console.log('='.repeat(60));

    // Get all users with phone numbers
    const usersResult = await db.query(
      'SELECT id, name, phone_number FROM users WHERE phone_number IS NOT NULL ORDER BY name'
    );

    if (usersResult.rows.length === 0) {
      console.log('⚠️ No users with phone numbers found');
      process.exit(1);
    }

    console.log(`Found ${usersResult.rows.length} users with phone numbers\n`);

    let successCount = 0;
    let failCount = 0;
    const results = [];

    for (const user of usersResult.rows) {
      try {
        console.log(`📨 Sending to: ${user.name} (${user.phone_number})`);

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
          // Table might not exist or no jobs assigned
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
          // Table might not have due_date column
        }

        // Get due soon (in next 3 days)
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
          // Table might not have due_date column
        }

        // Build detailed message
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

        // Send via WhatsApp
        const result = await whatsappService.sendWhatsAppMessage(user.phone_number, message);

        // Log to database
        const logStatus = result.success ? (result.status || 'sent') : 'failed';
        const errorMsg = result.success ? null : result.reason;
        
        await db.query(`
          INSERT INTO whatsapp_logs (user_id, phone_number, message_type, status, error_message, sent_at)
          VALUES ($1, $2, $3, $4, $5, NOW())
        `, [user.id, user.phone_number, 'detailed_summary', logStatus, errorMsg]);

        if (result.success) {
          console.log(`   ✅ SUCCESS - Message ID: ${result.sid}`);
          console.log(`   📌 Status: ${result.status}`);
          successCount++;
          results.push({ name: user.name, phone: user.phone_number, status: 'SUCCESS', details: result.status });
        } else {
          console.log(`   ❌ FAILED - ${result.reason}`);
          failCount++;
          results.push({ name: user.name, phone: user.phone_number, status: 'FAILED', error: result.reason });
        }

        console.log('');

      } catch (err) {
        console.log(`   ❌ RUN ERROR - ${err.message}\n`);
        failCount++;
        results.push({ name: user.name, phone: user.phone_number, status: 'ERROR', error: err.message });
      }
    }

    // Summary report
    console.log('='.repeat(60));
    console.log(`\n📊 SUMMARY REPORT\n`);
    console.log(`✅ Success: ${successCount}/${usersResult.rows.length}`);
    console.log(`❌ Failed:  ${failCount}/${usersResult.rows.length}`);
    console.log(`Success Rate: ${Math.round((successCount / usersResult.rows.length) * 100)}%\n`);

    console.log('Detailed Results:');
    results.forEach(r => {
      const icon = r.status === 'SUCCESS' ? '✅' : '❌';
      console.log(`${icon} ${r.name.padEnd(20)} ${r.phone.padEnd(15)} ${r.status}`);
      if (r.error) {
        console.log(`   Error: ${r.error}`);
      }
      if (r.details) {
        console.log(`   Details: ${r.details}`);
      }
    });

    db.end();
    process.exit(successCount === usersResult.rows.length ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    db.end();
    process.exit(1);
  }
}

sendDetailedSummaryToAllUsers();
