require('dotenv').config();
const db = require('./db');

async function listUsers() {
  try {
    const result = await db.query('SELECT id, name, email, phone_number FROM users ORDER BY name');
    console.log('\n📋 All Users in Database:\n');
    result.rows.forEach((user, i) => {
      console.log(`${i + 1}. ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Phone: ${user.phone_number || '(not set)'}`);
      console.log('');
    });
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit(0);
  }
}

listUsers();
