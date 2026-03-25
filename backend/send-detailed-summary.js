/**
 * Send detailed dashboard summary to all users
 * More comprehensive version with breakdown details
 */
const db = require('./db');
const whatsappService = require('./services/whatsappServiceWhapi');

async function sendDetailedSummary() {
  try {
    console.log('📊 Fetching detailed dashboard data...\n');

    // Get all users with phone numbers
    const usersResult = await db.query(
      `SELECT id, name, email, phone_number 
       FROM users 
       WHERE phone_number IS NOT NULL 
       AND phone_number != '' 
       AND is_active = true
       LIMIT 5`
    );

    if (usersResult.rows.length === 0) {
      console.log('No users with phone numbers found');
      return;
    }

    console.log(`Found ${usersResult.rows.length} users to notify\n`);

    for (const user of usersResult.rows) {
      try {
        // Get tasks breakdown
        const tasksResult = await db.query(
          `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
           FROM tasks 
           WHERE created_by = $1 OR assigned_to = $1`,
          [user.id]
        );

        const taskStats = tasksResult.rows[0];

        // Get CNC jobs breakdown (if table exists)
        let cncStats = { total: 0, completed: 0, active: 0, pending: 0 };
        try {
          const cncResult = await db.query(
            `SELECT 
              COUNT(*) as total,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
              SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as active,
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
             FROM cnc_jobs 
             LIMIT 10`
          );
          cncStats = cncResult.rows[0] || cncStats;
        } catch (err) {
          // cnc_jobs table might not exist yet
          console.log('(CNC jobs table not available)');
        }

        // Build detailed message
        const message = `📊 *TaskFlow Detailed Dashboard Summary*

👤 User: ${user.name}

*📋 TASKS OVERVIEW*
├ Total Tasks: ${taskStats.total || 0}
├ ✅ Completed: ${taskStats.completed || 0}
├ ⏳ In Progress: ${taskStats.in_progress || 0}
└ ⏰ Pending: ${taskStats.pending || 0}

*🔧 CNC JOBS STATUS*
├ Total Jobs: ${cncStats.total || 0}
├ ✅ Completed: ${cncStats.completed || 0}
├ ⚙️ Active: ${cncStats.active || 0}
└ ⏳ Pending: ${cncStats.pending || 0}

*📈 PERFORMANCE*
├ Completion Rate: ${taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0}%
└ Active Jobs: ${cncStats.active || 0}

⏰ Generated: ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })} UTC

🔗 Log in to dashboard for full details`;

        console.log(`Sending to ${user.name} (${user.phone_number})...`);
        
        const result = await whatsappService.sendWhatsAppMessage(
          user.phone_number,
          message
        );

        if (result.success) {
          console.log(`✅ Sent - ID: ${result.sid}\n`);
          
          // Log to database
          await db.query(
            `INSERT INTO whatsapp_logs 
             (user_id, phone_number, message_type, status, twilio_sid) 
             VALUES ($1, $2, $3, $4, $5)`,
            [user.id, user.phone_number, 'detailed_summary', 'sent', result.sid]
          );
        } else {
          console.log(`❌ Failed: ${result.reason}\n`);
        }

        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Error processing ${user.name}:`, error.message);
      }
    }

    console.log('\n✅ Detailed summaries sent!');
    process.exit(0);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run the function
sendDetailedSummary();
