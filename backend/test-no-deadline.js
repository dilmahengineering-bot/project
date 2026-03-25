require('dotenv').config();
const db = require('./db');

async function testNoDeadline() {
  try {
    // Get users with CNC jobs
    const users = await db.query(`
      SELECT DISTINCT assigned_to, u.name
      FROM cnc_job_cards c
      JOIN users u ON c.assigned_to = u.id
      WHERE c.assigned_to IS NOT NULL
      LIMIT 3
    `);

    console.log('Checking No Deadline counts for users with CNC jobs:\n');
    
    for (const row of users.rows) {
      const userId = row.assigned_to;
      const userName = row.name;
      
      const result = await db.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN estimate_end_date IS NULL THEN 1 ELSE 0 END) as no_deadline,
          SUM(CASE WHEN estimate_end_date IS NOT NULL THEN 1 ELSE 0 END) as with_deadline
        FROM cnc_job_cards 
        WHERE assigned_to = $1
      `, [userId]);
      
      const row2 = result.rows[0];
      console.log(`User: ${userName}`);
      console.log(`  Total: ${row2.total}, No Deadline: ${row2.no_deadline}, With Deadline: ${row2.with_deadline}`);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

testNoDeadline();
