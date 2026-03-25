const db = require('./db');

(async () => {
  try {
    const result = await db.query('SELECT id, email, phone_number FROM users LIMIT 5');
    console.log('Users in database:');
    if (result.rows.length === 0) {
      console.log('  No users found - creating test user');
      // If no users, create one
      const seedResult = await db.query(
        `INSERT INTO users (email, password_hash, name, role, phone_number, is_active) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING id, email, phone_number`,
        ['admin@taskflow.com', 'hashed_password_here', 'Admin User', 'admin', '+94772452955', true]
      );
      console.log('Created user:', seedResult.rows[0]);
    } else {
      result.rows.forEach(u => console.log(`  - ${u.email} (phone: ${u.phone_number})`));
    }
    process.exit(0);
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
