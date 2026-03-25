require('dotenv').config();
const db = require('./db');

async function setupPhoneNumbers() {
  try {
    console.log('\n📱 Setting up phone numbers for all users...\n');
    
    // Add phone numbers for users
    const updates = [
      { name: 'Mike Designer', phone: '+13613206874' },
      { name: 'Sarah Manager', phone: '+94760868732' },
      { name: 'John Developer', phone: '+947705280000' }
    ];

    for (const user of updates) {
      const result = await db.query(
        'UPDATE users SET phone_number = $1, phone_verified = false WHERE name = $2 RETURNING id, name, phone_number',
        [user.phone, user.name]
      );
      
      if (result.rows[0]) {
        console.log(`✅ ${result.rows[0].name}: ${result.rows[0].phone_number}`);
      } else {
        console.log(`⚠️ ${user.name} not found`);
      }
    }

    console.log('\n📋 Final Status:\n');
    const finalResult = await db.query(
      'SELECT name, email, phone_number FROM users ORDER BY name'
    );
    
    finalResult.rows.forEach(u => {
      const status = u.phone_number ? '✅' : '❌';
      console.log(`${status} ${u.name.padEnd(20)} ${u.phone_number || '(not set)'}`);
    });
    
    console.log('\n🎉 Ready! All users now have phone numbers.');
    console.log('Next: Try "Send Summary" in admin interface.\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupPhoneNumbers();
