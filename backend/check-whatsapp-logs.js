const db = require('./db');

(async () => {
  try {
    const result = await db.query(`
      SELECT 
        id,
        phone_number,
        message_type,
        status,
        error_message,
        twilio_sid,
        sent_at
      FROM whatsapp_logs 
      ORDER BY sent_at DESC 
      LIMIT 20
    `);
    
    console.log('\n📋 Last 20 WhatsApp Messages:\n');
    result.rows.forEach((log, i) => {
      console.log(`${i + 1}. ${log.phone_number}`);
      console.log(`   Type: ${log.message_type}`);
      console.log(`   Status: ${log.status}`);
      console.log(`   SID: ${log.twilio_sid}`);
      if (log.error_message) {
        console.log(`   ERROR: ${log.error_message}`);
      }
      console.log(`   Time: ${log.sent_at}\n`);
    });
    
    process.exit(0);
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
