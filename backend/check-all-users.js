const db = require('./db');

(async () => {
  try {
    const result = await db.query(
      'SELECT id, name, email, phone_number FROM users ORDER BY created_at DESC'
    );
    console.log('\n📱 All Users in System:\n');
    result.rows.forEach((u, i) => {
      console.log(`${i+1}. ${u.name}`);
      console.log(`   Email: ${u.email}`);
      console.log(`   Phone: ${u.phone_number || 'NOT SET'}\n`);
    });
    console.log(`\nTotal: ${result.rows.length} users`);
    process.exit(0);
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
